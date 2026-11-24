// Loaded only in the test server process. No request reaches Hugging Face.
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';

dns.lookup = async (hostname) => {
  assert.equal(hostname, 'huggingface.co');
  return [{ address: '93.184.216.34', family: 4 }];
};
syncBuiltinESMExports();

const owner = { id: 'user-id', name: 'intern-fixture', type: 'user' };
let job;

globalThis.fetch = async (url, init) => {
  const request = new Request(url, init);
  const { origin, pathname } = new URL(request.url);
  assert.equal(origin, 'https://huggingface.co');
  assert.equal(request.headers.get('authorization'), 'Bearer test-credential');
  if (request.method === 'GET' && pathname === '/api/whoami-v2') {
    return Response.json({ ...owner, orgs: [], auth: { type: 'access_token' } });
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
