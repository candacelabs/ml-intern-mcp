import { parseArgs } from 'node:util';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { listMlInternTools } from './generated/tools.mjs';

// The upstream logger chooses its output at import time. stdout belongs to MCP.
process.env.TRANSPORT = 'STDIO';
process.env.LOG_LEVEL ??= 'warn';
delete process.env.LOGGING_DATASET_ID;

// Keep the upstream file handler (batched results, attachments, cancellation)
// while giving Codex a public-only catalog and accurate discovery instructions.
async function publicFilesServer(upstream) {
  const client = new Client({ name: 'public-files', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await upstream.connect(serverTransport);
  await client.connect(clientTransport);
  const server = new McpServer({ name: 'ml-intern-public-files', version: '1' }, {
    instructions: 'Read public Hugging Face Hub files. Use the connected Hugging Face app for account identity, Jobs, and authorized Hub operations.',
  });
  const { tools } = await client.listTools();
  const file = tools.find(tool => tool.name === 'hf_fs');
  if (file) {
    const { name, inputSchema, outputSchema, ...metadata } = file;
    server.registerTool(name, {
      ...metadata, inputSchema: fromJsonSchema(inputSchema), outputSchema: fromJsonSchema(outputSchema),
    }, (args, ctx) => client.callTool({ name, arguments: args }, {
      toolDefinition: file, signal: ctx.mcpReq.signal,
    }));
  }
  server.server.onclose = () => { void client.close(); };
  return server;
}

async function main() {
  const { values } = parseArgs({ options: { 'public-files': { type: 'boolean', default: false } } });
  const publicFiles = values['public-files'];
  if (publicFiles) {
    delete process.env.HF_TOKEN;
    delete process.env.DEFAULT_HF_TOKEN;
  }
  const token = process.env.HF_TOKEN?.trim() || process.env.DEFAULT_HF_TOKEN?.trim();
  if (token) process.env.DEFAULT_HF_TOKEN = token;

  const { createServerFactory } = await import('@llmindset/hf-mcp-server/dist/server/mcp-server.js');
  const { McpApiClient } = await import('@llmindset/hf-mcp-server/dist/server/utils/mcp-api-client.js');

  // The Hub factory always supplies whoami, and enables its write handler via
  // the "hf_files" feature flag. The other selection IDs are the MCP wire names.
  const builtInTools = publicFiles ? ['hf_fs'] : listMlInternTools(Boolean(token))
    .map((tool) => tool.name)
    .filter((name) => name !== 'hf_whoami')
    .map((name) => name === 'hf_fs_write' ? 'hf_files' : name);
  const makeServer = createServerFactory(new McpApiClient({ type: 'static' }));
  const { server: upstream } = await makeServer(null, { builtInTools, spaceTools: [] }, true);
  const server = publicFiles ? await publicFilesServer(upstream) : upstream;
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error('ml-intern-mcp:', error.message);
  process.exitCode = 1;
});
