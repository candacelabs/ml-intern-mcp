import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMlInternClient, listMlInternTools } from '../generated/tools.mjs';

const server = fileURLToPath(new URL('../server.mjs', import.meta.url));
const fixture = new URL('./fixtures/hub.mjs', import.meta.url).href;
const probe = fileURLToPath(new URL('../scripts/check-sandbox.mjs', import.meta.url));

async function listen(t, ...args) {
  const child = spawn(process.execPath, ['--import', fixture, server, '--http', '--port', '0', ...args], {
    env: { LOG_LEVEL: 'silent', HF_TOKEN: 'test-credential', DEFAULT_HF_TOKEN: 'test-credential' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exited = once(child, 'exit');
  t.after(async () => {
    child.kill('SIGTERM');
    await exited;
  });
  const lines = createInterface({ input: child.stderr });
  const [line] = await once(lines, 'line', { signal: AbortSignal.timeout(8000) });
  const match = /^ml-intern-mcp listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)$/.exec(line);
  assert.ok(match, line);
  return new URL(match[1]);
}

async function connect(t, url, headers = {}) {
  const client = new Client({ name: 'http-test', version: '1' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
  return { client, tools: createMlInternClient(client) };
}

test('HTTP isolates simultaneous Hub identities and reuses an existing sandbox across clients', async t => {
  const url = await listen(t);
  const [owner, second, guest] = await Promise.all([
    connect(t, url, { 'X-HF-Token': 'test-credential' }),
    connect(t, url, { 'X-HF-Token': 'second-credential' }),
    connect(t, url, { Authorization: 'Bearer gateway-only' }),
  ]);
  const accounts = await Promise.all([owner, second, guest].map(c => c.tools.hf_whoami({})));
  assert.deepEqual(accounts.map(r => r.structuredContent.account?.name ?? r.structuredContent.status),
    ['intern-fixture', 'second-fixture', 'anonymous']);
  const { tools: publicCatalog } = await guest.client.listTools();
  const sort = tools => tools.toSorted((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(sort(publicCatalog), sort(listMlInternTools(false)));
  assert.deepEqual((await owner.client.listTools()).tools.map(x => x.name).sort(), listMlInternTools(true).map(x => x.name).sort());

  const handle = 'intern-fixture/existing-sandbox';
  const path = '/tmp/ml-intern-fixture.txt';
  const written = await owner.tools.hf_sandbox_fs({ cmd: 'write', args: [handle, path, '--text', 'same sandbox'] });
  assert.equal(written.isError ?? false, false, JSON.stringify(written.content));
  const resumed = await connect(t, url, { 'X-HF-Token': 'test-credential' });
  const read = await resumed.tools.hf_sandbox_fs({ cmd: 'cat', args: [handle, path] });
  assert.equal(read.structuredContent.content, 'same sandbox');
  const denied = await second.tools.hf_sandbox_fs({ cmd: 'cat', args: [handle, path] });
  assert.equal(denied.isError, true);

  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--url', url.href, handle], {
    env: { HF_TOKEN: 'test-credential' }, timeout: 10_000,
  });
  assert.match(stdout, /OK sandbox health hfsb2:intern-fixture:existing-sandbox\nOK sandbox shell command\nOK sandbox filesystem/);
});

test('HTTP rejects invalid credentials and origins, and supports public-files mode', async t => {
  const url = await listen(t);
  const health = await fetch(new URL('/healthz', url));
  assert.deepEqual(await health.json(), { status: 'ok' });
  const invalid = await fetch(url, { method: 'POST', headers: { 'X-HF-Token': 'invalid' } });
  assert.equal(invalid.status, 403);
  assert.equal((await fetch(url, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await fetch(new URL('/unknown', url))).status, 404);
  const strict = await fetch(new URL('?login&bouquet=intern', url), { method: 'POST' });
  assert.equal(strict.status, 403);
  const publicUrl = await listen(t, '--public-files');
  const { client } = await connect(t, publicUrl, { 'X-HF-Token': 'invalid' });
  assert.deepEqual((await client.listTools()).tools, listMlInternTools(false).filter(tool => tool.name === 'hf_fs'));
});
