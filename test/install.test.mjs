import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const register = fileURLToPath(new URL('../lib/register-client.mjs', import.meta.url));
const installer = fileURLToPath(new URL('../scripts/install.sh', import.meta.url));

test('adding a provider to a managed Copilot entry preserves other servers, tool filters and existing providers', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ml-intern-copilot-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const command = join(dir, 'server with spaces');
  const entry = { command, args: ['--byos'], tools: ['sandbox_status'], env: { HF_TOKEN: '${HF_TOKEN}' } };
  const other = { command: '/another/server' };
  const file = join(dir, 'mcp-config.json');
  await writeFile(file, JSON.stringify({ mcpServers: { 'ml-intern': entry, existing: other } }));
  const cli = '#!' + process.execPath + '\n' + `
    const data = JSON.parse(require('node:fs').readFileSync(process.env.COPILOT_HOME + '/mcp-config.json'));
    console.log(JSON.stringify({ 'ml-intern': { ...data.mcpServers['ml-intern'], source: 'user' } }));
  `;
  await writeFile(join(dir, 'copilot'), cli, { mode: 0o700 });
  const env = { ...process.env, PATH: dir, COPILOT_HOME: dir, EXE_TOKEN: 'example-value-must-not-be-saved' };
  for (let i = 0; i < 2; i++) await exec(process.execPath, [register, 'copilot', command, 'exe.dev'], { env });
  const config = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(config.mcpServers, { existing: other, 'ml-intern': { ...entry, env: { ...entry.env, EXE_TOKEN: '${EXE_TOKEN}' } } });
});

test('the shell installer rejects a corrupt download before installing a server', { skip: !['darwin', 'linux'].includes(process.platform) }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ml-intern-checksum-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'curl'), '#!/bin/sh\nfor last do :; done\nprintf "corrupt" > "$last"\n', { mode: 0o700 });
  const env = { ...process.env, XDG_DATA_HOME: dir, PATH: bin + ':/usr/bin:/bin' };
  await assert.rejects(exec('sh', [installer, 'standalone'], { env }), error => error.stderr.includes('Server checksum mismatch.'));
  await assert.rejects(readFile(join(dir, 'ml-intern-mcp/current/ml-intern-mcp')), { code: 'ENOENT' });
});
