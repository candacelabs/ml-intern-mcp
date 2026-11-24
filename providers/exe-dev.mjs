import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { ExeAPIError, exedev, quote } from '@exedev/sdk';

const requestLimit = 64 * 1024;
const streamLimit = 1024 * 1024;
const fileLimit = 100000;

function requestFits(vm, command) {
  return Buffer.byteLength(`ssh ${quote(vm.name)} ${quote(command)}`) <= requestLimit;
}

function ssh(vm, script, options) {
  // A path containing many quotes can grow when both shell layers quote it.
  // Base64 preserves the script bytes and has a predictable wire size.
  if (!requestFits(vm, script)) {
    script = `printf %s ${Buffer.from(script).toString('base64')} | base64 -d | /bin/sh`;
  }
  if (!requestFits(vm, script)) throw new Error('exe.dev command exceeds the 64 KiB request limit.');
  return vm.ssh(script, options);
}

async function checked(vm, script, signal, operation) {
  const result = await ssh(vm, script, { signal, maxOutputBytes: 8192 });
  if (result.exitCode !== 0) throw new Error(`exe.dev ${operation} failed on the VM (exit ${result.exitCode}).`);
  return result;
}

async function withStaging(vm, parent, signal, use) {
  // Leave any symlinks and ".." in the user's path for the guest to resolve.
  const directory = `${parent}${parent.endsWith('/') ? '' : '/'}.ml-intern-${randomUUID()}`;
  // An exclusive mkdir must succeed before we touch or remove anything at this path.
  await checked(vm, `mkdir -m 700 -- ${quote(directory)}`, signal, 'creating a temporary directory');
  try {
    return await use(directory);
  } finally {
    // A cancelled request may already have sent data to the VM.
    await checked(vm, `rm -rf -- ${quote(directory)}`, AbortSignal.timeout(3000), 'temporary cleanup').catch(() => {});
  }
}

async function upload(vm, path, data, signal) {
  // The HTTP API has no stdin. Append bounded chunks to a new file inside our
  // private directory, keeping every HTTP request below the provider limit.
  const chunkSize = 16 * 1024;
  for (let start = 0; start === 0 || start < data.length; start += chunkSize) {
    const encoded = data.subarray(start, start + chunkSize).toString('base64');
    await checked(vm, `printf %s ${quote(encoded)} | base64 -d >> ${quote(path)}`, signal, 'upload');
  }
}

function captureStream(limit) {
  const chunks = [];
  let size = 0;
  return {
    append(chunk) {
      size += chunk.length;
      if (size > limit) throw new Error('exe.dev command output exceeded 1 MiB on a stream. Redirect large output to a sandbox file.');
      chunks.push(chunk);
    },
    buffer: () => Buffer.concat(chunks),
  };
}

async function execute(vm, { command, cwd, stdin, timeoutSeconds, signal }) {
  const marker = `\nml-intern-${randomUUID()}:`;
  const stdout = captureStream(streamLimit);
  const stderr = captureStream(streamLimit + marker.length + 4);
  // An exit of 124 or 137 from the user's shell is ordinary command data.
  // Only timeout(1) returns its status without this wrapper's completion record.
  const wrapper = `cwd=$1 input=$2 marker=$3; shift 3
if [ -n "$cwd" ]; then cd "$cwd"; fi && "$@" < "$input"
printf '%s%d\\n' "$marker" "$?" >&2`;
  const script = (argv, input) => ['timeout', '-k', '1s', `${timeoutSeconds}s`, '/bin/sh', '-c', wrapper, 'sh',
    cwd ?? '', input, marker, ...argv].map(quote).join(' ');
  const shell = ['/bin/sh', '-c', command];
  async function run(commandLine) {
    const deadline = AbortSignal.timeout((timeoutSeconds + 3) * 1000);
    try {
      return await ssh(vm, commandLine, {
        signal: AbortSignal.any([signal, deadline]), capture: false, onStdoutBytes: stdout.append, onStderrBytes: stderr.append,
      });
    } catch (error) {
      signal.throwIfAborted();
      if (!deadline.aborted) throw error;
      return null;
    }
  }
  const inline = script(shell, '/dev/null');
  let result;
  if (!stdin && requestFits(vm, inline)) {
    result = await run(inline);
  } else {
    const setup = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
    result = await withStaging(vm, '/tmp', setup, async directory => {
      const input = stdin ? `${directory}/stdin` : '/dev/null';
      if (stdin) await upload(vm, input, Buffer.from(stdin), setup);
      let commandLine = script(shell, input);
      if (!requestFits(vm, commandLine)) {
        const file = `${directory}/command`;
        await upload(vm, file, Buffer.from(command), setup);
        // Preserve the exact script (including trailing newlines) and sh -c's
        // normal $0 and positional parameters when the command must be staged.
        const load = 'code=$(cat "$1" && printf .) || exit; exec /bin/sh -c "${code%.}"';
        commandLine = script(['/bin/sh', '-c', load, 'sh', file], input);
      }
      return run(commandLine);
    });
  }
  let errorBytes = stderr.buffer();
  let exitCode = null;
  const timedOut = !result || result.exitCode === 124 || result.exitCode === 137;
  const index = errorBytes.lastIndexOf(marker);
  const status = index < 0 ? null : /^(\d{1,3})\n/.exec(errorBytes.subarray(index + marker.length, index + marker.length + 4).toString('ascii'));
  if (status) {
    errorBytes = Buffer.concat([errorBytes.subarray(0, index), errorBytes.subarray(index + marker.length + status[0].length)]);
  }
  if (!timedOut) {
    if (result.exitCode !== 0 || !status) throw new Error('exe.dev did not report a command exit status. Check that GNU timeout is installed on the VM.');
    exitCode = Number(status[1]);
  }
  if (errorBytes.length > streamLimit) throw new Error('exe.dev command output exceeded 1 MiB on stderr. Redirect large output to a sandbox file.');
  return { stdout: stdout.buffer().toString('utf8'), stderr: errorBytes.toString('utf8'), exitCode, timedOut };
}

export async function connectSandbox({ id, env }) {
  const token = env?.EXE_TOKEN?.trim();
  if (!token) throw new Error('exe.dev requires EXE_TOKEN from the caller.');
  const vm = exedev({
    token,
    baseURL: 'https://exe.dev',
    fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }),
  }).vm(id);
  const connection = new AbortController();
  async function run(signal, operation) {
    const active = signal ? AbortSignal.any([connection.signal, signal]) : connection.signal;
    active.throwIfAborted();
    try {
      return await operation(active);
    } catch (error) {
      if (error instanceof ExeAPIError) {
        const hint = error.status === 401 || error.status === 403 ? ' Check the caller’s exe.dev API key and its VM permissions.' : '';
        throw new Error(`exe.dev rejected ${error.operation} (HTTP ${error.status}).${hint}`);
      }
      throw error;
    }
  }
  return {
    status({ signal } = {}) {
      return run(signal, async active => {
        const bounded = AbortSignal.any([active, AbortSignal.timeout(15000)]);
        try {
          await vm.refresh({ signal: bounded });
          const state = vm.info.status;
          if (state === 'running') return { state };
          return { state: ['paused', 'stopped'].includes(state) ? 'stopped' : 'unknown' };
        } catch (error) {
          if (!(error instanceof ExeAPIError) || error.status !== 403) throw error;
        }
        // A token restricted to "ssh <name>" cannot list VM metadata.
        try {
          const probe = await ssh(vm, 'true', { signal: bounded, maxOutputBytes: 1024 });
          return { state: probe.exitCode === 0 ? 'running' : 'unknown' };
        } catch (error) {
          if (error instanceof ExeAPIError && error.status === 422) return { state: 'unknown' };
          throw error;
        }
      });
    },
    exec({ command, cwd, stdin, timeoutSeconds = 30, signal }) {
      if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 55) throw new Error('exe.dev timeoutSeconds must be from 1 to 55.');
      return run(signal, active => execute(vm, { command, cwd, stdin, timeoutSeconds, signal: active }));
    },
    readFile({ path, maxBytes = 20000, signal }) {
      if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > fileLimit) throw new Error('exe.dev maxBytes must be from 1 to 100000.');
      return run(signal, async active => {
        const result = await ssh(vm, `timeout -k 1s 30s head -c ${maxBytes + 1} -- ${quote(path)}`, {
          signal: AbortSignal.any([active, AbortSignal.timeout(33000)]), maxOutputBytes: maxBytes + 1 + 8192,
        });
        if (result.exitCode !== 0) throw new Error(`exe.dev file read failed on the VM (exit ${result.exitCode}).`);
        const truncated = result.stdoutBytes.length > maxBytes;
        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
        const text = decoder.decode(result.stdoutBytes.subarray(0, maxBytes), { stream: truncated });
        return { text, bytes: Buffer.byteLength(text), truncated };
      });
    },
    writeFile({ path, text, signal }) {
      const data = Buffer.from(text);
      if (data.length > fileLimit) throw new Error('exe.dev file writes are limited to 100000 UTF-8 bytes.');
      return run(signal, active => {
        const bounded = AbortSignal.any([active, AbortSignal.timeout(55000)]);
        return withStaging(vm, posix.dirname(path), bounded, async directory => {
          const staged = `${directory}/new`;
          await upload(vm, staged, data, bounded);
          // A rename in the target directory leaves the previous file intact if
          // transfer fails. GNU mv -T also rejects replacing a directory.
          const replace = `target=${quote(path)}; staged=${quote(staged)}\nif [ -f "$target" ]; then chmod --reference="$target" -- "$staged" || exit; fi\nmv -fT -- "$staged" "$target"`;
          await checked(vm, replace, bounded, 'file replacement');
          return { bytes: data.length };
        });
      });
    },
    close() { connection.abort(); },
  };
}
