import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModalClient, Sandbox, SandboxService } from 'modal';
import { connectSandbox } from '../providers/modal.mjs';

const id = 'sb-1234567890abcdefghijkl';
const env = { MODAL_TOKEN_ID: 'test-modal-id', MODAL_TOKEN_SECRET: 'test-modal-secret' };

function stream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Buffer.from(chunk));
      controller.close();
    },
  });
}

function result(stdout = [], stderr = [], code = 0) {
  return {
    stdout: stream(stdout), stderr: stream(stderr), wait: async () => code,
    stdin: { writeText: async () => {}, close: async () => {} },
  };
}

async function attach(t, implementation) {
  t.mock.method(SandboxService.prototype, 'fromId', async providedId => {
    assert.equal(providedId, id);
    return { detach() {}, ...implementation };
  });
  const adapter = await connectSandbox({ id, env });
  t.after(() => adapter.close());
  return adapter;
}

test('Modal attaches and detaches using the actual SDK with explicit credentials, without provisioning a sandbox', async t => {
  // fromId constructs a local handle. The first operation such as poll performs the RPC.
  const fromId = t.mock.method(SandboxService.prototype, 'fromId');
  const detach = t.mock.method(Sandbox.prototype, 'detach');
  const close = t.mock.method(ModalClient.prototype, 'close');
  t.mock.method(SandboxService.prototype, 'create', () => assert.fail('unexpected provision'));
  t.mock.method(Sandbox.prototype, 'terminate', () => assert.fail('unexpected termination'));
  const adapter = await connectSandbox({ id, env });
  adapter.close();
  adapter.close();
  assert.deepEqual(fromId.mock.calls[0].arguments, [id]);
  assert.equal(detach.mock.callCount(), 1);
  assert.equal(close.mock.callCount(), 1);
  assert.equal(close.mock.calls[0].this.profile.tokenId, env.MODAL_TOKEN_ID);
  assert.equal(close.mock.calls[0].this.profile.tokenSecret, env.MODAL_TOKEN_SECRET);
  for (const incomplete of [{}, { MODAL_TOKEN_ID: 'id' }, { MODAL_TOKEN_SECRET: 'secret' }]) {
    await assert.rejects(connectSandbox({ id, env: incomplete }), /both MODAL_TOKEN_ID and MODAL_TOKEN_SECRET/);
  }
  assert.equal(fromId.mock.callCount(), 1);
});

test('Modal rejects ambient endpoint overrides before attaching or sending credentials', async t => {
  const original = process.env.MODAL_SERVER_URL;
  t.after(() => {
    if (original === undefined) delete process.env.MODAL_SERVER_URL;
    else process.env.MODAL_SERVER_URL = original;
  });
  const attach = t.mock.method(SandboxService.prototype, 'fromId', () => assert.fail('unexpected attachment'));
  const close = t.mock.method(ModalClient.prototype, 'close');
  process.env.MODAL_SERVER_URL = 'https://api.modal.com:443,https://alternate.invalid';
  await assert.rejects(connectSandbox({ id, env }), /public Modal API/);
  assert.equal(attach.mock.callCount(), 0);
  assert.equal(close.mock.callCount(), 1);
});

test('Modal honors connection cancellation and detaches a late SDK handle', async t => {
  const pending = Promise.withResolvers();
  const detached = Promise.withResolvers();
  const fromId = t.mock.method(SandboxService.prototype, 'fromId', () => pending.promise);
  const close = t.mock.method(ModalClient.prototype, 'close');
  const controller = new AbortController();
  const connection = connectSandbox({ id, env, signal: controller.signal });
  controller.abort();
  await assert.rejects(connection, { name: 'AbortError' });
  pending.resolve({ detach: () => detached.resolve() });
  await detached.promise;
  await assert.rejects(connectSandbox({ id, env, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fromId.mock.callCount(), 1);
  assert.equal(close.mock.callCount(), 1);
});

test('Modal reports state, forwards shell input and preserves a nonzero exit including 124', async t => {
  let exit = null;
  let written;
  let closed = false;
  const adapter = await attach(t, {
    poll: async () => exit,
    async exec(argv, options) {
      assert.deepEqual(argv, ['/bin/sh', '-lc', 'cat; exit 124']);
      assert.deepEqual(options, { mode: 'binary', workdir: '/workspace/my dir', timeoutMs: 3000 });
      return {
        ...result(['a', 'β'], ['message'], 124),
        stdin: { async writeText(value) { written = value; }, async close() { closed = true; } },
      };
    },
  });
  assert.deepEqual(await adapter.status({}), { state: 'running' });
  assert.deepEqual(await adapter.exec({ command: 'cat; exit 124', cwd: '/workspace/my dir', stdin: 'payload', timeoutSeconds: 3 }),
    { stdout: 'aβ', stderr: 'message', exitCode: 124, timedOut: false });
  assert.equal(written, 'payload');
  assert.ok(closed);
  exit = 0;
  assert.deepEqual(await adapter.status({}), { state: 'stopped' });
});

test('Modal bounds file reads on the remote side and preserves complete UTF-8 characters', async t => {
  const path = "/tmp/file name'; dollar$.txt";
  let data = Buffer.from('unused');
  const adapter = await attach(t, {
    async exec(argv) {
      assert.equal(argv[0], 'head');
      assert.equal(argv[1], '-c');
      assert.equal(argv[3], path);
      assert.equal(argv.length, 4);
      return result([data.subarray(0, Number(argv[2]))]);
    },
    filesystem: { async writeText(text, remotePath) {
      assert.equal(remotePath, path);
      data = Buffer.from(text);
    } },
  });
  assert.deepEqual(await adapter.writeFile({ path, text: 'a€b' }), { bytes: 5 });
  assert.deepEqual(await adapter.readFile({ path, maxBytes: 3 }), { text: 'a', bytes: 1, truncated: true });
  assert.deepEqual(await adapter.readFile({ path, maxBytes: 5 }), { text: 'a€b', bytes: 5, truncated: false });
  data = Buffer.from([0xff]);
  await assert.rejects(adapter.readFile({ path, maxBytes: 5 }), /encoded data|encoding/i);
  data = Buffer.from([0x61, 0xc3, 0x28]);
  await assert.rejects(adapter.readFile({ path, maxBytes: 2 }), /encoded data|encoding/i);
});

test('Modal returns the exit status when a quick command exits before the stdin RPC', async t => {
  let polled = 17;
  const closed = Object.assign(new Error('Input already closed'), { code: 9 });
  const adapter = await attach(t, { async exec() {
    return { ...result(['done'], [], 17), _poll: async () => polled, stdin: { close: async () => { throw closed; } } };
  } });
  assert.deepEqual(await adapter.exec({ command: 'exit 17' }), { exitCode: 17, stdout: 'done', stderr: '', timedOut: false });
  polled = null;
  await assert.rejects(adapter.exec({ command: 'slow' }), closed);
});

test('Modal local timeout preserves partial output and cancels the stream', async t => {
  const canceled = Promise.withResolvers();
  const adapter = await attach(t, { async exec() {
    return {
      ...result(),
      stdout: new ReadableStream({
        start(controller) { controller.enqueue(Buffer.from('partial')); },
        cancel() { canceled.resolve(); },
      }),
      wait: () => new Promise(() => {}),
    };
  } });
  const outcome = await adapter.exec({ command: 'slow', timeoutSeconds: 1 });
  assert.deepEqual(outcome, { exitCode: null, stdout: 'partial', stderr: '', timedOut: true });
  await canceled.promise;
});

test('Modal enforces per-stream output limits and cancels a caller wait without terminating the sandbox', async t => {
  let calls = 0;
  let canceled = false;
  const started = Promise.withResolvers();
  const adapter = await attach(t, {
    async exec(argv) {
      calls++;
      if (argv[2] === 'stdout') return result([Buffer.alloc(1024 * 1024), Buffer.from('x')]);
      if (argv[2] === 'stderr') return result([], [Buffer.alloc(1024 * 1024 + 1)]);
      if (argv[2] === 'sdk-timeout') return {
        ...result(), wait: async () => { throw new Error('Deadline exceeded while waiting for exec example'); },
      };
      return {
        ...result(), stdout: new ReadableStream({ pull() { started.resolve(); }, cancel() { canceled = true; } }),
        wait: () => new Promise(() => {}),
      };
    },
  });
  await assert.rejects(adapter.exec({ command: 'stdout' }), /stdout exceeded/);
  await assert.rejects(adapter.exec({ command: 'stderr' }), /stderr exceeded/);
  assert.deepEqual(await adapter.exec({ command: 'sdk-timeout' }), { exitCode: null, stdout: '', stderr: '', timedOut: true });
  const controller = new AbortController();
  const pending = adapter.exec({ command: 'slow', signal: controller.signal });
  await started.promise;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(canceled);
  await assert.rejects(adapter.exec({ command: 'unused', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 4);
});
