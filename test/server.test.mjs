import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createByosClient, listByosTools } from '../generated/byos/tools.mjs';
import { callMlInternJob, createMlInternClient, listMlInternTools } from '../generated/tools.mjs';

async function connect(t, authenticated, args = [], env = {}) {
  const home = await mkdtemp(join(tmpdir(), 'ml-intern-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  // A credential lookup through the CLI would fail startup in this environment.
  await writeFile(join(home, 'hf'), '#!/bin/sh\nexit 17\n', { mode: 0o700 });
  const server = fileURLToPath(new URL('../server.mjs', import.meta.url));
  const fixture = new URL(args.includes('--byos') ? './fixtures/byos.mjs' : './fixtures/hub.mjs', import.meta.url).href;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', fixture, server, ...args],
    env: {
      HOME: home, PATH: home, HF_HOME: home, LOG_LEVEL: 'silent',
      ...(authenticated && { HF_TOKEN: 'test-credential', DEFAULT_HF_TOKEN: 'test-credential' }),
      ...env,
    },
  });
  const client = new Client({ name: 'contract-test', version: '1' });
  t.after(() => client.close());
  await client.connect(transport);
  return { client, tools: createMlInternClient(client) };
}

test('anonymous stdio discovery and calls agree with the generated contract', async (t) => {
  const { client, tools } = await connect(t, false);
  const { tools: actual } = await client.listTools();
  const byName = (a, b) => a.name.localeCompare(b.name);
  assert.deepEqual(actual.toSorted(byName), listMlInternTools(false).toSorted(byName));
  const who = await tools.hf_whoami({});
  assert.equal(who.structuredContent.status, 'anonymous');
  await assert.rejects(tools.hf_jobs({ operation: 'ps' }));
});

test('stdio can run a portable sandbox command with just the selected provider’s credential', async t => {
  const { client, tools } = await connect(t, false, ['--byos'], { EXE_TOKEN: 'fixture-exe' });
  const names = (await client.listTools()).tools.map(tool => tool.name).sort();
  assert.deepEqual(names, [...listMlInternTools(false), ...listByosTools()].map(tool => tool.name).sort());
  assert.equal((await tools.hf_whoami({})).structuredContent.status, 'anonymous');
  const byos = createByosClient(client);
  const target = { provider: 'exe.dev', sandboxId: 'fixture-vm' };
  const result = await byos.sandbox_exec({ ...target, command: 'printf ml-intern-ok', timeoutSeconds: 10 });
  assert.deepEqual(result.structuredContent, { ...target, stdout: 'ml-intern-ok', stderr: '', exitCode: 0, timedOut: false });
});

test('Codex public-files mode exposes a public read and leaves identity and Jobs to the app', async (t) => {
  const { client, tools } = await connect(t, true, ['--public-files']);
  const catalog = await client.listTools();
  assert.deepEqual(catalog.tools, listMlInternTools(false).filter(t => t.name === 'hf_fs'));
  assert.match(client.getInstructions(), /connected Hugging Face app/);
  await assert.rejects(tools.hf_whoami({}));
  await assert.rejects(tools.hf_jobs({ operation: 'ps' }));
  const read = await tools.hf_fs({ operations: [{ cmd: 'cat', args: ['hf://README.md'] }] });
  assert.equal(read.structuredContent.results[0].status, 'success');
});

test('authenticated generated stubs submit and find a job through the Hub handler', async (t) => {
  const { client, tools } = await connect(t, true);
  const { tools: actual } = await client.listTools();
  assert.deepEqual(actual.map(t => t.name).sort(), listMlInternTools(true).map(t => t.name).sort());
  const who = await tools.hf_whoami({});
  assert.equal(who.structuredContent.account.name, 'intern-fixture');
  assert.equal(who.structuredContent.status, 'authenticated');
  const submitted = await callMlInternJob(tools, 'run', {
    image: 'python:3.12', command: ['python', '-V'],
    flavor: 'cpu-basic', timeout: '2m', detach: true,
  });
  assert.equal(submitted.isError ?? false, false, JSON.stringify(submitted.content));
  assert.equal(submitted.structuredContent.outcome.job.id, 'fixture-job');
  const listing = await callMlInternJob(tools, 'ps', { all: true });
  assert.equal(listing.structuredContent.outcome.jobs[0].id, 'fixture-job');
  const invalid = await tools.hf_jobs({ operation: 'run', args: { flavor: 'cpu-basic' } });
  assert.equal(invalid.isError, true);
  assert.equal(invalid.structuredContent.outcome.code, 'validation');
});

test('stdio uses an existing BYOS handle for status, shell commands, and filesystem access', async t => {
  const { tools } = await connect(t, true);
  const handle = 'hfsb2:intern-fixture:existing-sandbox';
  const status = await tools.hf_sandbox({ cmd: 'status', args: [handle] });
  assert.equal(status.structuredContent.health.ok, true);
  assert.equal(status.structuredContent.handle, handle);
  const exec = await tools.hf_sandbox_exec({ cmd: 'exec', args: [handle, 'printf ml-intern-ok'] });
  assert.equal(exec.structuredContent.returncode, 0);
  assert.equal(exec.structuredContent.stdout, 'ml-intern-ok');
  const root = await tools.hf_sandbox_fs({ cmd: 'stat', args: [handle, '/'] });
  assert.equal(root.structuredContent.type, 'dir');
});
