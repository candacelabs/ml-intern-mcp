import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { connectSandbox } from '../providers/exe-dev.mjs';

const shell = promisify(execFile);
const id = 'fixture-vm';
const env = { EXE_TOKEN: 'fixture-api-key' };

function commandResponse(code, stdout = Buffer.alloc(0), stderr = Buffer.alloc(0)) {
  const frames = [];
  for (const [name, bytes] of Object.entries({ stdout, stderr })) {
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      frames.push(JSON.stringify({ [name]: bytes.subarray(offset, offset + 16384).toString('base64') }));
    }
  }
  frames.push(JSON.stringify({ exit_code: code }));
  return new Response(frames.join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
}

// Exercise the pinned SDK's real HTTP serialization and NDJSON parser, and run
// the generated guest commands using only these tests' files and fixture inputs.
async function fixture(t, intercept = () => {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ml-intern-exe-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://exe.dev/exec');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${env.EXE_TOKEN}`);
    assert.ok(Buffer.byteLength(options.body) <= 64 * 1024);
    requests.push(options.body);
    const { body } = options;
    if (body === `ls ${id}`) {
      return intercept('ls', options) ?? Response.json({ vms: [{
        vm_name: id, ssh_dest: `${id}.exe.xyz`, https_url: `https://${id}.exe.xyz`, status: 'running',
      }] });
    }
    const prefix = `ssh ${id} `;
    assert.ok(body.startsWith(prefix), 'unexpected operation against fixture VM');
    const word = body.slice(prefix.length);
    const command = word.startsWith("'") ? word.slice(1, -1).replaceAll(`'"'"'`, "'") : word;
    const overridden = intercept(command, options);
    if (overridden !== undefined) return overridden;
    try {
      const result = await shell('/bin/sh', ['-c', command], {
        cwd: directory, env: { PATH: '/usr/bin:/bin' }, signal: options.signal, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024,
      });
      return commandResponse(0, result.stdout, result.stderr);
    } catch (error) {
      if (!Number.isInteger(error.code)) throw error;
      return commandResponse(error.code, error.stdout, error.stderr);
    }
  });
  const vm = await connectSandbox({ id, env });
  t.after(() => vm.close());
  return { directory, requests, vm };
}

test('exe.dev uses explicit caller credentials and a VM name', async () => {
  await assert.rejects(connectSandbox({ id, env: {} }), /EXE_TOKEN/);
  for (const invalid of ['ssh://example', 'fixture-vm.exe.xyz', 'fixture -L 22', '-rf', '*']) {
    await assert.rejects(connectSandbox({ id: invalid, env }), /VM name/);
  }
});

test('exe.dev queries one VM, and probes SSH with a command-scoped key', async t => {
  let mode = 'running';
  const { vm, requests } = await fixture(t, command => {
    if (command === 'ls') {
      if (mode === 'scoped' || mode === 'unavailable') return new Response('denied', { status: 403 });
      if (mode === 'expired') return new Response('fixture-api-key', { status: 401 });
      if (mode === 'paused') return Response.json({ vms: [{ vm_name: id, ssh_dest: id, https_url: 'https://example.test', status: 'paused' }] });
    }
    if (mode === 'unavailable') return new Response('VM unavailable', { status: 422 });
  });
  assert.deepEqual(await vm.status(), { state: 'running' });
  assert.deepEqual(requests, [`ls ${id}`]);
  mode = 'paused';
  assert.deepEqual(await vm.status(), { state: 'stopped' });
  mode = 'scoped';
  assert.deepEqual(await vm.status(), { state: 'running' });
  assert.equal(requests.at(-1), `ssh ${id} true`);
  mode = 'unavailable';
  assert.deepEqual(await vm.status(), { state: 'unknown' });
  mode = 'expired';
  await assert.rejects(vm.status(), error => /401/.test(error.message) && !error.message.includes(env.EXE_TOKEN));
});

test('exe.dev executes in the requested directory with exact stdin, stdout, stderr and nonzero exit', async t => {
  const { vm, directory } = await fixture(t);
  const cwd = join(directory, "guest's folder\nwith `quotes` $(false)");
  await mkdir(cwd);
  const stdin = "\uFEFF~'&\n$(echo bad)\u0000☕\n";
  const result = await vm.exec({ cwd, stdin, command: 'pwd; cat; printf error >&2; exit 124' });
  assert.deepEqual(result, { stdout: `${cwd}\n${stdin}`, stderr: 'error', exitCode: 124, timedOut: false });
  assert.deepEqual(await vm.exec({ command: 'exit 137' }), { stdout: '', stderr: '', exitCode: 137, timedOut: false });
  // Enough quotation marks to cross the API's 64 KiB limit if sent inline.
  assert.deepEqual(await vm.exec({ command: '# ' + "'".repeat(15000) + '\nprintf ok' }), { stdout: 'ok', stderr: '', exitCode: 0, timedOut: false });
});

test('exe.dev returns a real guest timeout and enforces the output limit per stream', async t => {
  const { vm } = await fixture(t);
  assert.deepEqual(await vm.exec({ command: 'printf started; sleep 3', timeoutSeconds: 1 }),
    { stdout: 'started', stderr: '', exitCode: null, timedOut: true });
  const exact = await vm.exec({ command: 'head -c 1048576 /dev/zero; head -c 1048576 /dev/zero >&2' });
  assert.equal(exact.stdout.length, 1048576);
  assert.equal(exact.stderr.length, 1048576);
  for (const redirect of ['', ' >&2']) {
    await assert.rejects(vm.exec({ command: 'head -c 1048577 /dev/zero' + redirect }), /exceeded 1 MiB/);
  }
});

test('exe.dev reads UTF-8 at byte boundaries, writes 100000 bytes, and preserves the old file if transfer fails', async t => {
  let failUpload = false;
  let uploads = 0;
  const { vm, directory } = await fixture(t, command => {
    if (command.startsWith('printf %s ') && command.includes('base64 -d >>')) {
      uploads++;
      if (failUpload && uploads === 2) return commandResponse(3);
    }
  });
  const path = join(directory, "file's 'name\n$(false)");
  const awkward = '\uFEFFa☕\u0000\n';
  assert.deepEqual(await vm.writeFile({ path, text: awkward }), { bytes: 9 });
  await chmod(path, 0o640);
  assert.deepEqual(await vm.readFile({ path, maxBytes: 5 }), { text: '\uFEFFa', bytes: 4, truncated: true });
  assert.deepEqual(await vm.readFile({ path, maxBytes: 9 }), { text: awkward, bytes: 9, truncated: false });
  const large = randomBytes(75000).toString('base64');
  assert.deepEqual(await vm.writeFile({ path, text: large }), { bytes: 100000 });
  assert.deepEqual(await vm.readFile({ path, maxBytes: 100000 }), { text: large, bytes: 100000, truncated: false });
  assert.equal((await stat(path)).mode & 0o777, 0o640);
  failUpload = true;
  uploads = 0;
  await assert.rejects(vm.writeFile({ path, text: 'a'.repeat(100000) }), /upload failed/);
  assert.equal(await readFile(path, 'utf8'), large);
  assert.deepEqual(await readdir(directory), [path.slice(directory.length + 1)]);
  await writeFile(path, Buffer.from([0xff]));
  await assert.rejects(vm.readFile({ path }), /encoded data/);
  await writeFile(path, Buffer.from([0xe2, 0x82]));
  await assert.rejects(vm.readFile({ path }), /encoded data/);
  await assert.rejects(vm.readFile({ path: join(directory, 'missing') }), /file read failed/);
  await assert.rejects(vm.writeFile({ path: directory, text: '' }), /file replacement failed/);
});

test('exe.dev propagates cancellation and close releases only local callers', async t => {
  const started = Promise.withResolvers();
  const { vm, requests } = await fixture(t, (command, options) => {
    started.resolve();
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  });
  const cancel = new AbortController();
  const pending = vm.exec({ command: 'true', signal: cancel.signal });
  await started.promise;
  cancel.abort(new Error('fixture cancelled'));
  await assert.rejects(pending, /fixture cancelled/);
  vm.close();
  await assert.rejects(vm.status(), { name: 'AbortError' });
  assert.equal(requests.length, 1);
});
