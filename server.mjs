#!/usr/bin/env node
import { parseArgs } from 'node:util';
import pkg from './package.json' with { type: 'json' };
import { allProviderHeaders } from './lib/provider-credentials.mjs';

const help = `ml-intern-mcp [--byos | --public-files] [--http [--host HOST] [--port PORT] [--public-origin URL]]

  example           Check an existing sandbox. Run example --help for arguments.
  Default           Serve the ML Intern tools over stdio.
  --public-files    Expose only public Hub file reads for use alongside the Codex HF app.
  --byos            Add tools for existing Hugging Face, exe.dev and Modal sandboxes.
  --http            Serve Streamable HTTP at /mcp (default 127.0.0.1:8787).
  --host            Address to listen on. Use --public-origin for non-loopback binds.
  --port            TCP port (0 selects an available port).
  --public-origin   External HTTPS origin of your reverse proxy.
  --version, -v     Print the package version.
  --help, -h        Show this help.

Stdio uses the hosting process's provider credentials. HTTP uses per-request
X-HF-Token, X-Exe-Token, or X-Modal-Token-Id and X-Modal-Token-Secret headers.
Public file mode uses anonymous access.`;

async function main() {
  if (process.argv[2] === 'example') {
    const { runExample } = await import('./examples/run.mjs');
    return runExample(process.argv.slice(3));
  }
  const { values } = parseArgs({ options: {
    http: { type: 'boolean' }, byos: { type: 'boolean' }, 'public-files': { type: 'boolean' },
    host: { type: 'string' }, port: { type: 'string' }, 'public-origin': { type: 'string' },
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
  } });
  if (values.help || values.version) {
    console.log(values.help ? help : pkg.version);
    return;
  }
  if (!values.http && [values.host, values.port, values['public-origin']].some(v => v !== undefined)) {
    throw new Error('--host, --port and --public-origin require --http');
  }

  const publicFiles = values['public-files'] ?? false;
  if (publicFiles && values.byos) throw new Error('Choose --byos or --public-files.');
  const token = !values.http && !publicFiles
    ? process.env.HF_TOKEN?.trim() || process.env.DEFAULT_HF_TOKEN?.trim() : undefined;
  let sandboxCredentials;
  if (values.byos && !values.http) {
    sandboxCredentials = Object.fromEntries(Object.keys(allProviderHeaders).map(key => [key, process.env[key]?.trim()]));
    sandboxCredentials.HF_TOKEN = token;
  }
  // Set stdout-safe upstream logging before importing any Hub modules.
  process.env.TRANSPORT = 'STDIO';
  process.env.LOG_LEVEL ??= 'warn';
  delete process.env.LOGGING_DATASET_ID;
  for (const key of Object.keys(allProviderHeaders)) delete process.env[key];
  delete process.env.DEFAULT_HF_TOKEN;

  if (values.http) {
    const { startHttp } = await import('./lib/http.mjs');
    await startHttp({ host: values.host, port: values.port, publicOrigin: values['public-origin'], publicFiles, byos: values.byos });
  } else {
    const { createHubServer, fetchHfWhoami } = await import('./lib/hub.mjs');
    const { StdioServerTransport } = await import('@modelcontextprotocol/server/stdio');
    const user = token ? await fetchHfWhoami(token) : undefined;
    const server = await createHubServer({ publicFiles, token, user, sandboxCredentials });
    await server.connect(new StdioServerTransport());
  }
}

main().catch(error => {
  console.error('ml-intern-mcp:', error.message);
  process.exitCode = 1;
});
