// Loaded only in the test server process. No request reaches Hugging Face.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';

dns.lookup = async (hostname) => {
  assert.ok(['huggingface.co', 'existing-sandbox--49983.hf.jobs'].includes(hostname));
  return [{ address: '93.184.216.34', family: 4 }];
};
syncBuiltinESMExports();

const owner = { id: 'user-id', name: 'intern-fixture', type: 'user' };
const second = { id: 'second-id', name: 'second-fixture', type: 'user' };
const nonce = '1234567890abcdef1234567890abcdef';
const sandboxKey = createHmac('sha256', 'test-credential').update('hf-sandbox:' + nonce).digest('hex');
const files = new Map();
let job;

async function sandboxRequest(request, path, file) {
  if (request.headers.get('authorization') !== 'Bearer test-credential' || request.headers.get('x-sandbox-token') !== sandboxKey) {
    return new Response(null, { status: 403 });
  }
  if (path === '/health') return Response.json({ ok: true });
  if (path === '/v1/exec' && request.method === 'POST') {
    const { cmd } = await request.json();
    assert.deepEqual(cmd, ['/bin/sh', '-lc', 'printf ml-intern-ok']);
    const events = [{ event: 'stdout', data: 'ml-intern-ok' }, { event: 'exit', exit_code: 0 }];
    return new Response(events.map(event => JSON.stringify(event)).join('\n') + '\n', {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }
  if (path === '/v1/files/write' && request.method === 'PUT') {
    files.set(file, Buffer.from(await request.arrayBuffer()));
    return new Response(null, { status: 204 });
  }
  if (path === '/v1/files/stat') {
    if (file !== '/' && !files.has(file)) return new Response(null, { status: 404 });
    return Response.json({ path: file, type: file === '/' ? 'dir' : 'file', size: files.get(file)?.length ?? 0 });
  }
  if (path === '/v1/files/read' && files.has(file)) return new Response(files.get(file));
  throw new Error('Unexpected sandbox fixture request: ' + path);
}

globalThis.fetch = async (url, init) => {
  const request = new Request(url, init);
  const { origin, pathname, searchParams } = new URL(request.url);
  if (origin === 'https://existing-sandbox--49983.hf.jobs') return sandboxRequest(request, pathname, searchParams.get('path'));
  assert.equal(origin, 'https://huggingface.co');
  const authorized = { 'Bearer test-credential': owner, 'Bearer second-credential': second }[request.headers.get('authorization')];
  if (!authorized) return new Response(null, { status: 401 });
  if (request.method === 'GET' && pathname === '/api/whoami-v2') {
    return Response.json({ ...authorized, orgs: [], auth: { type: 'access_token' } });
  }
  if (authorized !== owner) return new Response(null, { status: 403 });
  if (request.method === 'GET' && pathname === '/api/jobs/intern-fixture/existing-sandbox') {
    return Response.json({ id: 'existing-sandbox', owner, labels: { 'hf-sandbox': '1', 'hf-sandbox-nonce': nonce },
      status: { stage: 'RUNNING' }, createdAt: '2026-01-01T00:00:00Z' });
  }
  if (request.method === 'POST' && pathname === '/api/jobs/intern-fixture') {
    const spec = await request.json();
    assert.equal(spec.dockerImage, 'python:3.12');
    assert.deepEqual(spec.command, ['python', '-V']);
    assert.equal(spec.flavor, 'cpu-basic');
    assert.equal(spec.timeoutSeconds, 120);
    job = {
      id: 'fixture-job', owner, ...spec,
      createdAt: '2026-01-01T00:00:00Z', status: { stage: 'RUNNING' },
    };
    return Response.json(job);
  }
  if (request.method === 'GET' && pathname === '/api/jobs/intern-fixture') {
    return Response.json(job ? [job] : []);
  }
  throw new Error('Unexpected fixture request: ' + request.method + ' ' + pathname);
};
