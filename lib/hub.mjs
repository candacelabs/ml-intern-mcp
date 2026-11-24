import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { createServerFactory } from '@llmindset/hf-mcp-server/dist/server/mcp-server.js';
import { McpApiClient } from '@llmindset/hf-mcp-server/dist/server/utils/mcp-api-client.js';
import { listMlInternTools } from '../generated/tools.mjs';
import pkg from '../package.json' with { type: 'json' };

export { fetchHfWhoami } from '@llmindset/hf-mcp-server/dist/server/utils/hf-whoami-client.js';

const makeUpstream = createServerFactory(new McpApiClient({ type: 'static' }));

async function publicFilesServer(upstream) {
  const client = new Client({ name: 'public-files', version: pkg.version });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await upstream.connect(serverTransport);
    await client.connect(clientTransport);
    const server = new McpServer({ name: 'ml-intern-public-files', version: pkg.version }, {
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
  } catch (error) {
    await client.close();
    await upstream.close();
    throw error;
  }
}

export async function createHubServer({ publicFiles, token, user }) {
  // Passing a headers object (including for anonymous calls) disables the
  // upstream factory's process-wide default credential.
  const headers = token && !publicFiles ? { authorization: 'Bearer ' + token } : {};
  const builtInTools = publicFiles ? ['hf_fs'] : listMlInternTools(Boolean(token))
    .map(tool => tool.name)
    .filter(name => name !== 'hf_whoami')
    .map(name => name === 'hf_fs_write' ? 'hf_files' : name);
  const context = user && !publicFiles ? { isAuthenticated: true, authenticatedUser: user } : undefined;
  const { server } = await makeUpstream(headers, { builtInTools, spaceTools: [] }, true, context);
  return publicFiles ? publicFilesServer(server) : server;
}
