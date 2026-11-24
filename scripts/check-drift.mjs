import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { parse } from 'yaml';
import { createMlInternClient, listMlInternTools } from '../generated/tools.mjs';
import { byName, chatPresetUrl, differences, listWireTools } from './drift.mjs';

const chatSource = 'https://raw.githubusercontent.com/huggingface/chat-ui/main/src/lib/server/mlAssistant.ts';
const modelConfig = 'hf://models/google-bert/bert-base-uncased@86b5e0934494bd15c9632b12f734a8a67f723594/config.json';

function compare(label, expected, actual) {
  const changes = differences(expected, actual);
  if (changes.length) {
    console.error(`DRIFT ${label}\n  ${changes.join('\n  ')}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`OK ${label}`);
  return true;
}

async function readConfig(client, label, signal) {
  const result = await createMlInternClient(client).hf_fs({
    operations: [{ cmd: 'cat', args: [modelConfig] }],
  }, { signal });
  const entry = result.structuredContent?.results?.[0];
  if (result.isError || entry?.status !== 'success') throw new Error(`${label} could not read ${modelConfig}`);
  if (JSON.parse(entry.result.content).num_hidden_layers !== 12) throw new Error(`${label} returned unexpected BERT config contents`);
  return result.structuredContent;
}

async function main() {
  const contract = parse(await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8'));
  const publicUrl = new URL('/mcp', contract.servers[0].url);
  publicUrl.searchParams.set('bouquet', contract['x-mcp-source'].preset);
  const expectedChatUrl = new URL(publicUrl);
  expectedChatUrl.searchParams.set('login', '');
  expectedChatUrl.searchParams.sort();
  const signal = AbortSignal.timeout(45_000);

  const response = await fetch(chatSource, { signal });
  if (!response.ok) throw new Error(`HuggingChat preset source returned HTTP ${response.status}`);
  const chatUrl = chatPresetUrl(await response.text());
  chatUrl.searchParams.sort();
  compare('HuggingChat ML Intern preset URL', expectedChatUrl.href, chatUrl.href);

  const identity = { name: 'ml-intern-drift', version: '1' };
  const hosted = new Client(identity);
  const local = new Client(identity);
  try {
    await hosted.connect(new StreamableHTTPClientTransport(publicUrl), { signal });
    compare('hosted MCP version against the OpenAPI pin', contract.info.version, hosted.getServerVersion().version);
    const publicTools = listMlInternTools(false);
    const hostedMatches = compare(`live public tools (${publicTools.length})`,
      byName(publicTools), byName(await listWireTools(hosted, signal)));

    const server = fileURLToPath(new URL('../server.mjs', import.meta.url));
    await local.connect(new StdioClientTransport({
      command: process.execPath, args: [server, '--public-files'], env: { LOG_LEVEL: 'silent' },
    }), { signal });
    const localMatches = compare('Codex public-files stdio tools',
      byName(publicTools.filter(t => t.name === 'hf_fs')), byName(await listWireTools(local, signal)));
    if (hostedMatches && localMatches) {
      const [liveResult, localResult] = await Promise.all([
        readConfig(hosted, 'Hosted MCP', signal), readConfig(local, 'Local MCP', signal),
      ]);
      compare('public BERT config read over HTTP and stdio', liveResult, localResult);
    }
  } finally {
    await Promise.all([hosted.close(), local.close()]);
  }
}

main().catch(error => {
  const message = error.data?.status ? `Hub MCP returned HTTP ${error.data.status}` : error.message;
  console.error(`Drift check incomplete: ${message}`);
  process.exitCode = 2;
});
