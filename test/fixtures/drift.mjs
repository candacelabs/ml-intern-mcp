import assert from 'node:assert/strict';
import { listMlInternTools } from '../../generated/tools.mjs';

// Emulate only the public upstream requests made by the drift CLI.
globalThis.fetch = async (url, init) => {
  const req = new Request(url, init);
  if (req.url.startsWith('https://raw.githubusercontent.com/huggingface/chat-ui/')) {
    return new Response('export const ML_ASSISTANT_MCP_SERVERS = [{ name: "Hugging Face", url: "https://huggingface.co/mcp?login&bouquet=intern" }];');
  }
  assert.equal(req.url, 'https://huggingface.co/mcp?bouquet=intern');
  assert.equal(req.headers.has('authorization'), false);
  if (process.env.DRIFT_FIXTURE === 'unavailable') return new Response(null, { status: 503 });
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const { id, method, params } = await req.json();
  const reply = result => Response.json({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') return reply({
    protocolVersion: params.protocolVersion,
    serverInfo: { name: 'fixture', version: 'fixture-release' }, capabilities: { tools: {} },
  });
  if (method === 'notifications/initialized') return new Response(null, { status: 202 });
  assert.equal(method, 'tools/list');
  const tools = listMlInternTools(false);
  tools.find(tool => tool.name === 'hf_fs').newWireField = true;
  return reply({ tools });
};
