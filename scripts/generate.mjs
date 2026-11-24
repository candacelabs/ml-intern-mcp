import { mkdir, readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import { parse } from 'yaml';

const root = new URL('../', import.meta.url);
const componentPrefix = '#/components/schemas/';

function componentName(reference, schemas) {
  const ref = reference?.$ref;
  const name = ref?.startsWith(componentPrefix) && ref.slice(componentPrefix.length);
  if (!name || !Object.hasOwn(schemas, name)) {
    throw new Error(`Expected a reference to a schema component, got ${JSON.stringify(reference)}`);
  }
  return name;
}

// An MCP schema is a document in its own right. Rebase references to its root,
// and carry any referenced sibling components into local $defs, including cycles.
function standalone(reference, schemas) {
  const root = componentName(reference, schemas);
  const locations = new Map([[root, '#']]);
  const reserved = new Set(Object.keys(schemas[root].$defs ?? {}));
  const dependencies = new Map();

  function copy(name) {
    return JSON.parse(JSON.stringify(schemas[name], (key, value) => {
      if (key !== '$ref' || typeof value !== 'string' || !value.startsWith(componentPrefix)) return value;
      const [target, ...pointer] = value.slice(componentPrefix.length).split('/');
      if (!Object.hasOwn(schemas, target)) throw new Error(`Unknown schema reference ${value}`);
      if (!locations.has(target)) {
        let alias = target;
        while (reserved.has(alias)) alias = '_' + alias;
        reserved.add(alias);
        locations.set(target, '#/$defs/' + alias);
        dependencies.set(alias, copy(target));
      }
      return [locations.get(target), ...pointer].join('/');
    }));
  }

  const schema = copy(root);
  if (dependencies.size) schema.$defs = { ...schema.$defs, ...Object.fromEntries(dependencies) };
  return schema;
}

function makeBindings(contract, prefix, header) {
  const runtime = `${header}import { fromJsonSchema } from '@modelcontextprotocol/server';
import catalog from './catalog.json' with { type: 'json' };

export function list${prefix}Tools(authenticated = false) {
  const tools = authenticated ? catalog.tools : catalog.tools.filter(tool => catalog.anonymous.includes(tool.name));
  return structuredClone(tools);
}

export function create${prefix}Client(client) {
  return Object.fromEntries(catalog.tools.map(tool => [
    tool.name,
    (args = {}, options) => client.callTool(
      { name: tool.name, arguments: args },
      { toolDefinition: tool, ...options },
    ),
  ]));
}

export function register${prefix}Tools(server, handlers, authenticated = false) {
  const tools = list${prefix}Tools(authenticated);
  for (const { name } of tools) {
    if (typeof handlers[name] !== 'function') throw new Error('Missing handler for ' + name);
  }
  for (const { name, inputSchema, outputSchema, ...metadata } of tools) {
    server.registerTool(name, {
      ...metadata,
      inputSchema: fromJsonSchema(inputSchema),
      ...(outputSchema && { outputSchema: fromJsonSchema(outputSchema) }),
    }, handlers[name]);
  }
}
`;

  const schemas = contract.components.schemas;
  const entries = Object.entries(contract['x-mcp-tools']);
  const tools = [];
  const anonymousNames = [];
  const inputs = [];
  const results = [];
  const tsType = ref => `components["schemas"][${JSON.stringify(componentName(ref, schemas))}]`;

  for (const [name, { anonymous, inputSchema, outputSchema, operations, ...metadata }] of entries) {
    if (typeof anonymous !== 'boolean') throw new Error(`Missing anonymous flag on ${name}`);
    if (anonymous) anonymousNames.push(name);
    tools.push({
      name, ...metadata, inputSchema: standalone(inputSchema, schemas),
      ...(outputSchema && { outputSchema: standalone(outputSchema, schemas) }),
    });
    inputs.push(`  ${JSON.stringify(name)}: ${tsType(inputSchema)};`);
    results.push(`  ${JSON.stringify(name)}: ${outputSchema ? `StructuredResult<${tsType(outputSchema)}>` : 'CallToolResult'};`);
  }

  const operations = contract['x-mcp-tools'].hf_jobs?.operations;
  const jobTypes = Object.entries(operations ?? {}).map(([name, ref]) => `  ${JSON.stringify(name)}: ${tsType(ref)};`);
  const declarations = `${header}import type { CallToolRequestOptions, CallToolResult, Client, Tool } from '@modelcontextprotocol/client';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import type { components } from './openapi.js';

type StructuredResult<Output> = CallToolResult & (
  | { isError?: false; structuredContent: Output }
  | { isError: true }
);

export interface ${prefix}Inputs {
${inputs.join('\n')}
}

export interface ${prefix}Results {
${results.join('\n')}
}

export type ${prefix}ToolName = keyof ${prefix}Inputs;
export type ${prefix}AnonymousToolName = ${anonymousNames.map(name => JSON.stringify(name)).join(' | ') || 'never'};
type CallArgs<Args> = {} extends Args
  ? [args?: Args, options?: CallToolRequestOptions]
  : [args: Args, options?: CallToolRequestOptions];

export type ${prefix}Client = {
  [K in ${prefix}ToolName]: (...params: CallArgs<${prefix}Inputs[K]>) => Promise<${prefix}Results[K]>;
};
export type ${prefix}Handlers = {
  [K in ${prefix}ToolName]: (args: ${prefix}Inputs[K], context: ServerContext) => ${prefix}Results[K] | Promise<${prefix}Results[K]>;
};

export function list${prefix}Tools(authenticated?: boolean): Tool[];
export function create${prefix}Client(client: Pick<Client, 'callTool'>): ${prefix}Client;
export function register${prefix}Tools(server: McpServer, handlers: Pick<${prefix}Handlers, ${prefix}AnonymousToolName>, authenticated?: false): void;
export function register${prefix}Tools(server: McpServer, handlers: ${prefix}Handlers, authenticated: boolean): void;
`;

  const jobHelper = `
export function callMlInternJob(tools, operation, args = {}, options) {
  return tools.hf_jobs({ operation, args }, options);
}
`;
  const jobDeclarations = `
export interface MlInternJobArgs {
${jobTypes.join('\n')}
}
export function callMlInternJob<K extends keyof MlInternJobArgs>(
  tools: Pick<MlInternClient, 'hf_jobs'>, operation: K, ...params: CallArgs<MlInternJobArgs[NoInfer<K>]>
): Promise<MlInternResults['hf_jobs']>;
`;

  return {
    'catalog.json': JSON.stringify({ anonymous: anonymousNames, tools }, null, 2) + '\n',
    'tools.mjs': runtime + (operations ? jobHelper : ''),
    'tools.d.mts': declarations + (operations ? jobDeclarations : ''),
  };
}

const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: node scripts/generate.mjs [--check]');
const check = args[0] === '--check';
const stale = [];
for (const [spec, folder, prefix] of [
  ['openapi.yaml', 'generated/', 'MlIntern'],
  ['byos.openapi.yaml', 'generated/byos/', 'Byos'],
]) {
  const header = `// Generated from ${spec} by npm run generate.\n`;
  const contract = parse(await readFile(new URL(spec, root), 'utf8'));
  const files = makeBindings(contract, prefix, header);
  if (contract['x-byos-credential-headers']) {
    files['credential-headers.json'] = JSON.stringify(contract['x-byos-credential-headers'], null, 2) + '\n';
  }
  const ast = await openapiTS(contract, { emptyObjectsUnknown: true, defaultNonNullable: false });
  files['openapi.d.ts'] = header + astToString(ast);
  const destination = new URL(folder, root);
  if (!check) await mkdir(destination, { recursive: true });
  for (const [name, expected] of Object.entries(files)) {
    const path = new URL(name, destination);
    let actual;
    try {
      actual = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (actual === expected) continue;
    if (check) stale.push(folder + name);
    else await writeFile(path, expected);
  }
}
if (stale.length) throw new Error(`Generated files differ: ${stale.join(', ')}. Run npm run generate.`);
