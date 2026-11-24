import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import * as mcp from '@modelcontextprotocol/core';
import * as hf from '@llmindset/hf-mcp';
import { stringify } from 'yaml';
import { z } from 'zod';

const { values } = parseArgs({ options: {
  check: { type: 'boolean' },
  'compare-hosted': { type: 'string' }, // A saved anonymous tools/list array or JSON-RPC reply.
} });
const target = new URL('../openapi.yaml', import.meta.url);
const require = createRequire(import.meta.url);
const version = require('@llmindset/hf-mcp-server/package.json').version;
const fixtureName = 'offline-contract-fixture';
const fixture = { id: 'fixture', name: fixtureName, type: 'user', orgs: [], auth: { type: 'access_token' } };

// Discovery runs offline in this process. Never consult an account, even on a logged-in host.
for (const key of ['HF_TOKEN', 'DEFAULT_HF_TOKEN', 'DISABLE_TOOLS', 'PROXY_TOOLS_CSV', 'LOGGING_DATASET_ID']) {
  delete process.env[key];
}
process.env.TRANSPORT = 'STDIO';
process.env.LOG_LEVEL = 'silent';
let fetchAttempted = false;
globalThis.fetch = async () => {
  fetchAttempted = true;
  throw new Error('Contract capture attempted network access');
};
const { BOUQUETS } = await import('@llmindset/hf-mcp-server/dist/shared/bouquet-presets.js');
const { createServerFactory } = await import('@llmindset/hf-mcp-server/dist/server/mcp-server.js');
const { McpApiClient } = await import('@llmindset/hf-mcp-server/dist/server/utils/mcp-api-client.js');
const makeServer = createServerFactory(new McpApiClient({ type: 'static' }));

async function discover(authenticated) {
  if (authenticated) process.env.DEFAULT_HF_TOKEN = 'offline-noncredential';
  const context = authenticated ? { authenticatedUser: fixture } : undefined;
  const { server } = await makeServer(null, BOUQUETS.intern, true, context);
  const client = new Client({ name: 'contract-capture', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = [];
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    // In-memory transport also carries undefined optional fields which JSON omits on the wire.
    return JSON.parse(JSON.stringify(tools)).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  } finally {
    await client.close();
    await server.close();
    delete process.env.DEFAULT_HF_TOKEN;
  }
}

const publicTools = await discover(false);
const fullTools = await discover(true);
assert.equal(fetchAttempted, false);
if (values['compare-hosted']) {
  const snapshot = JSON.parse(await readFile(values['compare-hosted'], 'utf8'));
  const tools = Array.isArray(snapshot) ? snapshot : snapshot.result.tools;
  assert.deepEqual(publicTools, tools.sort((a, b) => a.name.localeCompare(b.name, 'en')));
}
const anonymousNames = new Set(publicTools.map(tool => tool.name));
for (const tool of publicTools) assert.deepEqual(fullTools.find(other => other.name === tool.name), tool);
for (const tool of fullTools) {
  if (['hf_sandbox', 'hf_sandbox_exec', 'hf_sandbox_fs'].includes(tool.name)) {
    const field = tool.inputSchema.properties.args;
    const hint = ` Bare job ids default to namespace ${fixtureName}.`;
    assert.ok(field.description.endsWith(hint));
    field.description = field.description.slice(0, -hint.length);
  }
}
assert.ok(!JSON.stringify(fullTools).includes(fixtureName));

const dialect = 'https://json-schema.org/draft/2020-12/schema';
const schemas = {};
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const pascal = name => name.split(/[_ -]+/).map(part => part[0].toUpperCase() + part.slice(1)).join('');
const toSchema = (validator, io) => z.toJSONSchema(validator, { target: 'draft-2020-12', io });

// A local JSON pointer in a standalone schema refers to that schema's root.
// Embedding the schema in OpenAPI moves its root into components/schemas.
function addSchema(name, schema) {
  const copy = structuredClone(schema);
  function relocate(value) {
    if (!value || typeof value !== 'object') return;
    const pointer = value.$ref;
    if (typeof pointer === 'string' && (pointer === '#' || pointer.startsWith('#/'))) {
      value.$ref = ref(name).$ref + pointer.slice(1);
    }
    Object.values(value).forEach(relocate);
  }
  relocate(copy);
  schemas[name] = copy;
  return ref(name);
}

const manifest = {};
const requests = [];
const resultByTool = {};
for (const { name, inputSchema, outputSchema, ...metadata } of fullTools) {
  const prefix = pascal(name);
  const input = addSchema(prefix + 'Input', inputSchema);
  const entry = { anonymous: anonymousNames.has(name), ...metadata, inputSchema: input };
  resultByTool[name] = ref('CallToolResult');
  if (outputSchema) {
    const output = addSchema(prefix + 'Output', outputSchema);
    entry.outputSchema = output;
    schemas[prefix + 'CallResult'] = {
      allOf: [ref('CallToolResult'), { anyOf: [
        { properties: { structuredContent: output }, required: ['structuredContent'] },
        { properties: { isError: { const: true } }, required: ['isError'] },
      ] }],
    };
    resultByTool[name] = ref(prefix + 'CallResult');
  }
  manifest[name] = entry;
  requests.push({
    type: 'object',
    properties: { name: { type: 'string', const: name }, arguments: input },
    required: inputSchema.required?.length ? ['name', 'arguments'] : ['name'],
  });
}

// The outer hf_jobs schema deliberately accepts an open argument record. Its
// dispatch layer picks one of these public @llmindset/hf-mcp Zod validators.
const jobsValidators = {
  run: hf.runArgsSchema, uv: hf.uvArgsSchema, ps: hf.psArgsSchema, logs: hf.logsArgsSchema,
  inspect: hf.inspectArgsSchema, cancel: hf.cancelArgsSchema, 'update-labels': hf.updateLabelsArgsSchema,
  'scheduled update-labels': hf.scheduledUpdateLabelsArgsSchema, 'scheduled run': hf.scheduledRunArgsSchema,
  'scheduled uv': hf.scheduledUvArgsSchema, 'scheduled ps': hf.scheduledPsArgsSchema,
  'scheduled inspect': hf.scheduledJobArgsSchema, 'scheduled delete': hf.scheduledJobArgsSchema,
  'scheduled suspend': hf.scheduledJobArgsSchema, 'scheduled resume': hf.scheduledJobArgsSchema,
};
assert.deepEqual(Object.keys(jobsValidators), hf.HF_JOBS_OPERATIONS);
manifest.hf_jobs.operations = {};
for (const [name, validator] of Object.entries(jobsValidators)) {
  manifest.hf_jobs.operations[name] = addSchema('HfJobs' + pascal(name) + 'Args', toSchema(validator, 'input'));
}

addSchema('RequestId', toSchema(mcp.RequestIdSchema, 'input'));
const resultNames = ['InitializeResult', 'ListToolsResult', 'CallToolResult', 'EmptyResult'];
for (const name of resultNames) addSchema(name, toSchema(mcp[name + 'Schema'], 'output'));
addSchema('JsonRpcError', toSchema(mcp.JSONRPCErrorResponseSchema, 'output'));
// An HTTP transport error may precede parsing the request ID.
schemas.JsonRpcError.properties.id = { anyOf: [ref('RequestId'), { type: 'null' }] };
const methods = ['InitializeRequest', 'InitializedNotification', 'PingRequest', 'ListToolsRequest',
  'CallToolRequest', 'CancelledNotification'];
for (const name of methods) {
  addSchema(name, toSchema(mcp[name + 'Schema'], 'input'));
  const schema = schemas[name];
  schema.properties.jsonrpc = { type: 'string', const: '2.0' };
  schema.required.push('jsonrpc');
  if (name.endsWith('Request')) {
    schema.properties.id = ref('RequestId');
    schema.required.push('id');
  }
  schema.additionalProperties = false;
}

// In these SDK envelopes the recursive definition accepts every JSON value.
// Inline the equivalent empty schema so TypeScript generators keep the field
// optionality and don't interpret a schema's $defs as required object data.
for (const name of ['InitializeRequest', 'InitializeResult', 'ListToolsResult']) {
  const schema = schemas[name];
  const pointer = ref(name).$ref + '/$defs/__schema0';
  const recursive = { $ref: pointer };
  assert.deepEqual(schema.$defs, { __schema0: { anyOf: [
    { type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' },
    { type: 'object', propertyNames: { type: 'string' }, additionalProperties: recursive },
    { type: 'array', items: recursive },
  ] } });
  delete schema.$defs;
  function inlineJsonValue(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref === pointer) delete value.$ref;
    Object.values(value).forEach(inlineJsonValue);
  }
  inlineJsonValue(schema);
}
schemas.CallToolRequest.properties.params = {
  allOf: [schemas.CallToolRequest.properties.params, { oneOf: requests }],
};
schemas.McpClientMessage = { oneOf: methods.map(ref) };
schemas.McpSuccess = {
  type: 'object', properties: {
    jsonrpc: { type: 'string', const: '2.0' }, id: ref('RequestId'),
    result: { anyOf: [ref('InitializeResult'), ref('ListToolsResult'), ref('EmptyResult'), ...Object.values(resultByTool)] },
  }, required: ['jsonrpc', 'id', 'result'], additionalProperties: false,
};
schemas.McpResponse = { oneOf: [ref('McpSuccess'), ref('JsonRpcError')] };

const string = { type: 'string' };
const document = {
  openapi: '3.1.0', jsonSchemaDialect: dialect,
  info: {
    title: 'HuggingChat ML Intern MCP tools', version,
    description: 'JSON-RPC tool discovery and invocation for the Hub intern preset. Match a reply to its request ID to select its result schema. Each tool exposes MCP content blocks. Tools declaring outputSchema also return structuredContent on success. The Jobs operation schemas describe dispatch inputs. Additional upstream runtime refinements run when a command is executed.',
  },
  servers: [{ url: 'https://huggingface.co' }],
  'x-mcp-source': {
    preset: 'intern', npm: `@llmindset/hf-mcp-server@${version}`,
    huggingChat: 'https://github.com/huggingface/chat-ui/blob/7fc0f672685331f11317a448f24c1c66b64894c6/src/lib/server/mlAssistant.ts',
    capture: 'tools/list over two in-memory SDK sessions using the published preset. One session is anonymous. One has a synthetic verified identity. Discovery uses zero network requests. The authenticated account hint in three sandbox argument descriptions is omitted.',
  },
  'x-mcp-stdio': {
    framing: 'One UTF-8 JSON-RPC message per line on stdin and stdout.',
    description: 'Local stdio uses the same initialize, tools/list and tools/call messages and tool schemas. Credentials come from the server process. Query parameters, HTTP headers, status codes and the hosted HTTP skills resource extension are transport-specific.',
  },
  'x-mcp-tools': manifest,
  'x-mcp-result-by-tool': resultByTool,
  paths: { '/mcp': { post: {
    operationId: 'postMcpMessage', summary: 'Send an ML Intern MCP request or notification',
    description: 'Send Accept: application/json, text/event-stream. The bouquet selects intern. Anonymous access exposes the three tools marked anonymous. HuggingChat also sets the login query marker, which requires a bearer credential at initialization. A signed-in account can discover the other tools. Hub permissions govern individual actions.',
    security: [{}, { HuggingFaceBearer: [] }],
    parameters: [
      { in: 'query', name: 'bouquet', required: true, schema: { type: 'string', const: 'intern' } },
      { in: 'query', name: 'login', allowEmptyValue: true, schema: string,
        description: 'Presence of this marker requires authentication, as in ?login&bouquet=intern.' },
      { in: 'header', name: 'MCP-Protocol-Version', schema: string,
        description: 'Send the negotiated version on requests after initialization.' },
      { in: 'header', name: 'Mcp-Session-Id', schema: string,
        description: 'When initialization supplies a session ID, send it on subsequent requests.' },
    ],
    requestBody: { required: true, content: { 'application/json': { schema: ref('McpClientMessage') } } },
    responses: {
      200: {
        description: 'JSON-RPC response on this JSON-mode endpoint. Its ID correlates it with the request.',
        headers: { 'Mcp-Session-Id': { description: 'May be returned during initialization.', schema: string } },
        content: { 'application/json': { schema: ref('McpResponse') } },
      },
      202: { description: 'Notification accepted.' },
      400: { description: 'Invalid MCP request or unsupported protocol version.' },
      401: { description: 'Authentication required or rejected.',
        headers: { 'WWW-Authenticate': { schema: string } } },
      403: { description: 'Access denied.' },
      406: { description: 'The Accept header must include both application/json and text/event-stream.',
        content: { 'application/json': { schema: ref('JsonRpcError') } } },
    },
  } } },
  components: { securitySchemes: { HuggingFaceBearer: { type: 'http', scheme: 'bearer' } }, schemas },
};
const yaml = '# Snapshot generated by scripts/capture-contract.mjs.\n' +
  stringify(document, { aliasDuplicateObjects: false, lineWidth: 110 });
if (values.check) {
  assert.equal((await readFile(target, 'utf8')) === yaml, true, 'openapi.yaml differs from the pinned upstream contract');
} else {
  await writeFile(target, yaml);
}
