import assert from 'node:assert/strict';
import test from 'node:test';
import './fixtures/hub.mjs';
import { connectSandbox } from '../providers/hf.mjs';

const fixtureFetch = globalThis.fetch;
const jobId = 'existing-sandbox';
const id = 'hfsb2:intern-fixture:' + jobId;
const jobPath = '/api/jobs/intern-fixture/' + jobId;
const origin = 'https://' + jobId + '--49983.hf.jobs';
const env = { HF_TOKEN: 'test-credential' };

// Filter the transport before the existing fixture so the pinned SDK still
// resolves handles, authenticates to the Hub and parses actual RPC responses.
function intercept(t, handler) {
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    return await handler(request, url) ?? fixtureFetch(input, init);
  });
}

async function replaceJob(request, edit) {
  const original = await fixtureFetch(request);
  assert.equal(original.status, 200);
  const job = await original.json();
  edit(job);
  return Response.json(job);
}

function events(...records) {
  return new Response(records.map(record => JSON.stringify(record)).join('\n') + '\n', {
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

test('HF attaches by qualified handle, checks health, executes, and closes locally', async t => {
  const requests = [];
  intercept(t, (request, url) => { requests.push(request.method + ' ' + url.pathname); });
  const sandbox = await connectSandbox({ id, env });
  assert.deepEqual(await sandbox.status(), { state: 'running' });
  assert.deepEqual(await sandbox.exec({ command: 'printf ml-intern-ok' }), {
    stdout: 'ml-intern-ok', stderr: '', exitCode: 0, timedOut: false,
  });
  await sandbox.close();
  await assert.rejects(sandbox.status(), /closed/);
  assert.deepEqual(requests, [
    'GET ' + jobPath, 'GET /api/whoami-v2', 'GET /health',
    'GET ' + jobPath, 'GET /api/whoami-v2', 'POST /v1/exec',
  ]);
});

test('HF preserves byte-exact file paths and text through the provider RPC', async t => {
  const path = '/tmp/fixture-ψ & ?.txt';
  const text = '\uFEFFA🦊é\n';
  const requestedLengths = [];
  intercept(t, (request, url) => {
    if (url.pathname === '/v1/files/read') {
      assert.equal(url.searchParams.get('path'), path);
      assert.equal(url.searchParams.get('offset'), '0');
      requestedLengths.push(url.searchParams.get('length'));
    }
  });
  const sandbox = await connectSandbox({ id: 'intern-fixture/' + jobId, env });
  t.after(() => sandbox.close());
  assert.deepEqual(await sandbox.writeFile({ path, text }), { bytes: 11 });
  assert.deepEqual(await sandbox.readFile({ path }), { text, bytes: 11, truncated: false });
  assert.deepEqual(await sandbox.readFile({ path, maxBytes: 6 }), { text: '\uFEFFA', bytes: 4, truncated: true });
  assert.deepEqual(await sandbox.readFile({ path, maxBytes: 11 }), { text, bytes: 11, truncated: false });
  assert.deepEqual(await sandbox.writeFile({ path, text: '' }), { bytes: 0 });
  assert.deepEqual(await sandbox.readFile({ path }), { text: '', bytes: 0, truncated: false });
  assert.deepEqual(requestedLengths, ['20001', '7', '12', '20001']);
});

test('HF forwards shell, cwd, stdin and timeout and preserves failed exits and timeouts', async t => {
  const opts = { command: 'cat >&2; exit 17', cwd: '/tmp/path with spaces', stdin: 'π\n', timeoutSeconds: 2 };
  let calls = 0;
  intercept(t, async (request, url) => {
    if (url.pathname !== '/v1/exec') return;
    const body = await request.json();
    assert.deepEqual(body, {
      cmd: ['/bin/sh', '-lc', opts.command], shell: false, cwd: opts.cwd, stdin: opts.stdin, timeout: 2,
    });
    if (++calls === 1) return events({ event: 'stdout', data: 'out' }, { event: 'stderr', data: 'π\n' },
      { event: 'exit', exit_code: 17 });
    return events({ event: 'stdout', data: 'partial' }, { event: 'exit', timed_out: true, exit_code: null });
  });
  const sandbox = await connectSandbox({ id, env });
  t.after(() => sandbox.close());
  assert.deepEqual(await sandbox.exec(opts), { stdout: 'out', stderr: 'π\n', exitCode: 17, timedOut: false });
  assert.deepEqual(await sandbox.exec(opts), { stdout: 'partial', stderr: '', exitCode: null, timedOut: true });
});

test('HF requires a caller credential and checks job authorization independently on every call', async t => {
  const savedToken = process.env.HF_TOKEN;
  process.env.HF_TOKEN = 'ambient-fixture-value';
  t.after(() => {
    if (savedToken === undefined) delete process.env.HF_TOKEN;
    else process.env.HF_TOKEN = savedToken;
  });
  await assert.rejects(connectSandbox({ id, env: {} }), /HF_TOKEN/);
  await assert.rejects(connectSandbox({ id: 'bare-job-id', env }), /namespace/);
  const first = await connectSandbox({ id, env });
  const second = await connectSandbox({ id, env: { HF_TOKEN: 'second-credential' } });
  t.after(() => first.close());
  t.after(() => second.close());
  assert.deepEqual(await first.status(), { state: 'running' });
  await assert.rejects(second.status(), /403|access denied|forbidden/i);
});

test('HF maps terminal and pending stages without probing a sandbox and accepts a dedicated Jobs origin', async t => {
  let stage = 'COMPLETED';
  let probes = 0;
  intercept(t, (request, url) => {
    if (url.pathname === jobPath) return replaceJob(request, job => {
      job.status = { stage, exposeUrls: [origin] };
      job.labels['hf-sandbox-mode'] = 'dedicated';
    });
    if (url.origin === origin) probes++;
  });
  const sandbox = await connectSandbox({ id, env });
  t.after(() => sandbox.close());
  assert.deepEqual(await sandbox.status(), { state: 'stopped' });
  await assert.rejects(sandbox.exec({ command: 'pwd' }), /not running/);
  stage = 'SCHEDULING';
  assert.deepEqual(await sandbox.status(), { state: 'unknown' });
  assert.equal(probes, 0);
  stage = 'RUNNING';
  assert.deepEqual(await sandbox.status(), { state: 'running' });
  assert.equal(probes, 1);
});

test('HF verifies dedicated job identity, sandbox credentials and the job-specific HTTPS origin', async t => {
  let alter;
  intercept(t, (request, url) => {
    if (url.pathname === '/api/whoami-v2') return;
    assert.equal(url.pathname, jobPath); // no RPC to the mismatched origin or job
    return replaceJob(request, alter);
  });
  const sandbox = await connectSandbox({ id, env });
  t.after(() => sandbox.close());
  for (alter of [
    job => { job.id = 'other'; },
    job => { delete job.labels['hf-sandbox']; },
    job => { job.labels['hf-sandbox-mode'] = 'pool'; },
    job => { job.labels['hf-sandbox-pool'] = 'pool-host'; },
    job => { job.labels['hf-sandbox-nonce'] = 'invalid'; },
    job => { job.status.exposeUrls = ['https://other--49983.hf.jobs']; },
    job => { job.status.expose_urls = ['https://example.org/' + jobId]; },
  ]) await assert.rejects(sandbox.status(), /dedicated sandbox|expected HTTPS Jobs origin/);
});

test('HF attaches to organization jobs the caller created and withholds credentials from other readable workloads', async t => {
  let creator = { id: 'user-id', name: 'intern-fixture' };
  let probes = 0;
  intercept(t, (request, url) => {
    if (url.pathname === jobPath) return replaceJob(request, job => {
      job.owner = { id: 'org-id', name: 'intern-fixture', type: 'org' };
      job.createdBy = creator;
    });
    if (url.origin === origin) probes++;
  });
  const sandbox = await connectSandbox({ id, env });
  t.after(() => sandbox.close());
  assert.deepEqual(await sandbox.status(), { state: 'running' });
  creator = { id: 'teammate-id', name: 'teammate' };
  await assert.rejects(sandbox.status(), /owner or creator/);
  creator = undefined;
  await assert.rejects(sandbox.status(), /Organization jobs require a matching creator/);
  assert.equal(probes, 1);
});

test('HF rejects RPC redirects before forwarding either credential', async t => {
  const hosts = [];
  intercept(t, (request, url) => {
    hosts.push(url.origin);
    if (url.pathname === '/health') return new Response(null, {
      status: 307, headers: { location: 'https://example.org/health' },
    });
  });
  const sandbox = await connectSandbox({ id, env });
  t.after(() => sandbox.close());
  await assert.rejects(sandbox.status(), /redirect/i);
  assert.deepEqual(hosts, ['https://huggingface.co', 'https://huggingface.co', origin]);
});

test('HF reports oversized output, dropped connections and file RPC failures', async t => {
  let next;
  intercept(t, (request, url) => {
    if (url.origin === origin) return next();
  });
  const sandbox = await connectSandbox({ id, env });
  t.after(() => sandbox.close());
  for (const data of ['a'.repeat(1024 * 1024 + 1), '🦊'.repeat(256 * 1024 + 1)]) {
    next = () => events({ event: 'stderr', data }, { event: 'exit', exit_code: 0 });
    await assert.rejects(sandbox.exec({ command: 'test' }), /1 MiB/);
  }
  next = () => events({ event: 'stdout', data: 'partial' });
  await assert.rejects(sandbox.exec({ command: 'test' }), /connection lost/);
  next = () => new Response('PRIVATE RESPONSE TEXT', { status: 404 });
  await assert.rejects(sandbox.readFile({ path: '/missing' }), { message: 'Hugging Face sandbox /v1/files/read returned HTTP 404.' });
});

for (const path of ['/api/whoami-v2', '/v1/exec']) {
  test('HF aborts an in-flight ' + path + ' request on caller cancellation', async t => {
    const { promise: started, resolve } = Promise.withResolvers();
    intercept(t, (request, url) => {
      if (url.pathname !== path) return;
      resolve();
      return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    });
    const sandbox = await connectSandbox({ id, env });
    t.after(() => sandbox.close());
    const controller = new AbortController();
    const pending = sandbox.exec({ command: 'sleep 30', signal: controller.signal });
    await started;
    controller.abort();
    await assert.rejects(pending, /abort|cancel/i);
  });
}
