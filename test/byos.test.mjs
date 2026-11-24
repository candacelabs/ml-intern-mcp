import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { addSandboxTools } from '../lib/byos.mjs';
import { providerHeaders } from '../lib/provider-credentials.mjs';
import { createByosClient, listByosTools } from '../generated/byos/tools.mjs';

test('provider examples obey the generated MCP contract and receive only their own credentials', async t => {
  const cases = { hf: 'hf.json', 'exe.dev': 'exe-dev.json', modal: 'modal.json' };
  const credentials = { HF_TOKEN: 'fixture-hf', EXE_TOKEN: 'fixture-exe', MODAL_TOKEN_ID: 'fixture-id', MODAL_TOKEN_SECRET: 'fixture-secret' };
  const closed = [];
  const storedFiles = new Map();
  const loaders = {};
  for (const provider of Object.keys(cases)) {
    loaders[provider] = async () => ({
      async connectSandbox({ id, env }) {
        assert.deepEqual(Object.keys(env).sort(), Object.keys(providerHeaders[provider]).sort());
        return {
          status: async () => ({ state: 'running' }),
          exec: async args => {
            assert.ok(args.signal instanceof AbortSignal);
            if (args.command === 'bad') throw new Error('provider error ' + Object.values(env)[0]);
            return { stdout: 'ml-intern-ok', stderr: '', exitCode: 0, timedOut: false };
          },
          readFile: async ({ path, maxBytes }) => {
            assert.equal(maxBytes, path === '/work/text' ? 20000 : 256);
            const text = storedFiles.get(JSON.stringify([provider, id, path]));
            return { text, bytes: Buffer.byteLength(text), truncated: false };
          },
          writeFile: async ({ path, text }) => {
            storedFiles.set(JSON.stringify([provider, id, path]), text);
            return { bytes: Buffer.byteLength(text) };
          },
          close: async () => { closed.push([provider, id]); },
        };
      },
    });
  }
  const server = new McpServer({ name: 'portable-test', version: '1' });
  addSandboxTools(server, credentials, loaders);
  const client = new Client({ name: 'portable-client', version: '1' });
  const [consumer, producer] = InMemoryTransport.createLinkedPair();
  await server.connect(producer);
  t.after(() => client.close());
  await client.connect(consumer);
  const tools = createByosClient(client);
  const wire = (await client.listTools()).tools;
  assert.deepEqual(wire.map(t => t.name).sort(), listByosTools().map(t => t.name).sort());
  for (const [provider, file] of Object.entries(cases)) {
    const example = JSON.parse(await readFile(new URL('../examples/' + file, import.meta.url), 'utf8'));
    assert.deepEqual(example.credentialEnvironment, Object.keys(providerHeaders[provider]));
    const expected = [...example.illustrativeResults, ...example.illustrativeFileResults];
    for (const [i, call] of [...example.calls, ...example.fileCalls].entries()) {
      const result = await tools[call.name](call.arguments);
      assert.equal(result.isError ?? false, false, JSON.stringify(result.content));
      assert.deepEqual(result.structuredContent, expected[i]);
    }
    const target = { provider, sandboxId: example.calls[0].arguments.sandboxId };
    const write = await tools.sandbox_write_file({ ...target, path: '/work/text', text: 'é' });
    assert.equal(write.structuredContent.bytes, 2);
    assert.equal((await tools.sandbox_read_file({ ...target, path: '/work/text' })).structuredContent.bytes, 2);
    const failed = await tools.sandbox_exec({ ...target, command: 'bad' });
    assert.equal(failed.isError, true);
    assert.equal(failed.content[0].text, 'provider error [redacted]');
  }
  assert.equal(closed.length, 21);
  const target = { provider: 'hf', sandboxId: 'test/job' };
  assert.equal((await tools.sandbox_write_file({ ...target, path: '/x', text: 'π'.repeat(50001) })).isError, true);
  assert.equal((await tools.sandbox_exec({ ...target, command: 'hi', timeoutSeconds: 56 })).isError, true);
  assert.equal(closed.length, 21);
});
