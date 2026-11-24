import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { callMlInternJob, createMlInternClient, listMlInternTools } from '../generated/tools.mjs';

async function connect(t, authenticated) {
  const home = await mkdtemp(join(tmpdir(), 'ml-intern-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const server = fileURLToPath(new URL('../server.mjs', import.meta.url));
  const fixture = new URL('./fixtures/hub.mjs', import.meta.url).href;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', fixture, server],
    env: {
      HOME: home, PATH: home, HF_HOME: home, LOG_LEVEL: 'silent',
      ...(authenticated && { HF_TOKEN: 'test-credential' }),
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
