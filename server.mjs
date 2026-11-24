import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { listMlInternTools } from './generated/tools.mjs';

// The upstream logger chooses its output at import time. stdout belongs to MCP.
process.env.TRANSPORT = 'STDIO';
process.env.LOG_LEVEL ??= 'warn';
delete process.env.LOGGING_DATASET_ID;

async function hubToken() {
  const explicit = process.env.HF_TOKEN?.trim() || process.env.DEFAULT_HF_TOKEN?.trim();
  if (explicit) return explicit;

  // Let the HF CLI resolve its active account and refresh browser logins. Capture
  // the credential in memory only. Never log the child process error or stdout.
  try {
    const { stdout } = await promisify(execFile)('hf', ['auth', 'token'], {
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    if (error.code === 1 && /not logged in/i.test(error.stderr + error.stdout)) return undefined;
    throw new Error('Could not read the Hugging Face login. Check hf auth whoami or set HF_TOKEN.');
  }
}

async function main() {
  const token = await hubToken();
  if (token) process.env.DEFAULT_HF_TOKEN = token;

  const { createServerFactory } = await import('@llmindset/hf-mcp-server/dist/server/mcp-server.js');
  const { McpApiClient } = await import('@llmindset/hf-mcp-server/dist/server/utils/mcp-api-client.js');

  // The Hub factory always supplies whoami, and enables its write handler via
  // the "hf_files" feature flag. The other selection IDs are the MCP wire names.
  const builtInTools = listMlInternTools(Boolean(token))
    .map((tool) => tool.name)
    .filter((name) => name !== 'hf_whoami')
    .map((name) => name === 'hf_fs_write' ? 'hf_files' : name);
  const makeServer = createServerFactory(new McpApiClient({ type: 'static' }));
  const { server } = await makeServer(null, { builtInTools, spaceTools: [] }, true);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error('ml-intern-mcp:', error.message);
  process.exitCode = 1;
});
