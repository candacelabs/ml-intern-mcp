import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { providerCredentials, providerHeaders } from './provider-credentials.mjs';

// Send only the selected provider's credentials when several are present on the client.
export async function openSandboxClient({ provider, url, byos, signal }) {
  if (!Object.hasOwn(providerHeaders, provider)) throw new Error('Choose hf, exe.dev or modal.');
  const env = {};
  for (const key of Object.keys(providerHeaders[provider])) {
    const value = process.env[key]?.trim() || (key === 'HF_TOKEN' && process.env.DEFAULT_HF_TOKEN?.trim());
    if (value) env[key] = value;
  }
  let transport;
  if (url) {
    const endpoint = new URL(url);
    const local = endpoint.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname);
    if ((!local && endpoint.protocol !== 'https:') || endpoint.username || endpoint.password) throw new Error('Use HTTPS or loopback HTTP for the MCP URL.');
    const headers = Object.fromEntries(Object.entries(env).map(([key, value]) => [providerHeaders[provider][key], value]));
    if (process.env.ML_INTERN_PROXY_TOKEN) headers.Authorization = 'Bearer ' + process.env.ML_INTERN_PROXY_TOKEN;
    transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers }, fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }),
    });
  } else {
    const server = fileURLToPath(new URL('../server.mjs', import.meta.url));
    transport = new StdioClientTransport({
      command: process.execPath, args: byos ? [server, '--byos'] : [server], env: providerCredentials(provider, env),
    });
  }
  const client = new Client({ name: 'ml-intern-sandbox-client', version: '1' });
  try {
    await client.connect(transport, { signal });
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}
