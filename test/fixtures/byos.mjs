// Preload in the test server only. All provider traffic terminates in these fixtures.
import './hub.mjs';
import assert from 'node:assert/strict';
import { ModalClient, Sandbox, SandboxFilesystem } from 'modal';

const scratch = '/tmp/ml-intern-example.txt';
const files = new Map();
const hubFetch = globalThis.fetch;

function exeOutput(stdout = '', stderr = '') {
  const records = [
    { stdout: Buffer.from(stdout).toString('base64') },
    { stderr: Buffer.from(stderr).toString('base64') },
    { exit_code: 0 },
  ];
  return new Response(records.map(record => JSON.stringify(record)).join('\n') + '\n', {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

globalThis.fetch = async (url, init) => {
  if (url !== 'https://exe.dev/exec') return hubFetch(url, init);
  assert.equal(init.headers.Authorization, 'Bearer fixture-exe');
  if (init.body === 'ls fixture-vm') {
    return Response.json({ vms: [{ vm_name: 'fixture-vm', ssh_dest: 'fixture-vm.exe.xyz', https_url: 'https://fixture-vm.exe.xyz', status: 'running' }] });
  }
  const prefix = "ssh fixture-vm '";
  assert.ok(init.body.startsWith(prefix) && init.body.endsWith("'"));
  const command = init.body.slice(prefix.length, -1).replaceAll(`'"'"'`, "'");
  if (command.startsWith('timeout -k 1s 10s') && command.includes('printf ml-intern-ok')) {
    const [marker] = command.match(/\nml-intern-[\da-f-]+:/);
    return exeOutput('ml-intern-ok', marker + '0\n');
  }
  if (command.startsWith('mkdir -m 700') || command.startsWith('rm -rf --')) return exeOutput();
  const upload = /^printf %s (\S+) \| base64 -d >> (\/tmp\/\.ml-intern-[\da-f-]+\/new)$/.exec(command);
  if (upload) {
    files.set(upload[2], Buffer.from(upload[1], 'base64'));
    return exeOutput();
  }
  if (command.startsWith('target=' + scratch + '; staged=')) {
    const staged = command.split('\n', 1)[0].split('; staged=')[1];
    assert.ok(files.has(staged));
    files.set('exe-file', files.get(staged));
    return exeOutput();
  }
  assert.equal(command, 'timeout -k 1s 30s head -c 257 -- ' + scratch);
  return exeOutput(files.get('exe-file'));
};

// Keep the actual SDK's credential configuration, fromId and detach. Replace
// remote operations with the two commands and one file in the documented example.
const closeModal = ModalClient.prototype.close;
ModalClient.prototype.close = function () {
  assert.equal(this.profile.tokenId, 'fixture-modal-id');
  assert.equal(this.profile.tokenSecret, 'fixture-modal-secret');
  return closeModal.call(this);
};
Sandbox.prototype.poll = async function () {
  assert.equal(this.sandboxId, 'sb-1234567890abcdefghijkl');
  return null;
};
Sandbox.prototype.exec = async function (argv) {
  let stdout;
  if (argv[0] === 'head') {
    assert.deepEqual(argv, ['head', '-c', '257', scratch]);
    stdout = files.get('modal-file');
  } else {
    assert.deepEqual(argv, ['/bin/sh', '-lc', 'printf ml-intern-ok']);
    stdout = 'ml-intern-ok';
  }
  return { stdout: new Response(stdout).body, stderr: new Response('').body, wait: async () => 0, stdin: { close: async () => {} } };
};
SandboxFilesystem.prototype.writeText = async function (text, path) {
  assert.equal(path, scratch);
  files.set('modal-file', text);
};
