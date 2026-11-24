import { ModalClient } from 'modal';

const OUTPUT_LIMIT = 1024 * 1024;
const PUBLIC_API = /^https:\/\/api\.modal2?\.com(?::443)?\/?$/;

async function withAbort(signal, operation) {
  if (!signal) return operation();
  signal.throwIfAborted();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation(), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function collect(stream, chunks, limit, name, signal) {
  let size = 0;
  return stream.pipeTo(new WritableStream({
    write(chunk) {
      size += chunk.byteLength;
      if (size > limit) throw new Error(`Modal ${name} exceeded the ${limit}-byte limit.`);
      chunks.push(Buffer.from(chunk));
    },
  }), { signal });
}

async function run(sandbox, argv, { cwd, stdin, timeoutSeconds = 30, signal }, stdoutLimit = OUTPUT_LIMIT) {
  const timeoutMs = timeoutSeconds * 1000;
  const deadline = new AbortController();
  const stop = new AbortController();
  const active = AbortSignal.any([deadline.signal, stop.signal, ...(signal ? [signal] : [])]);
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const out = [];
  const err = [];
  let exitCode = null;
  let timedOut = false;
  try {
    exitCode = await withAbort(active, async () => {
      const proc = await sandbox.exec(argv, { mode: 'binary', workdir: cwd, timeoutMs });
      // pipeTo cancels the SDK's read streams on disconnect or output overflow.
      // The SDK's process timeout remains in force on the remote machine.
      const input = async () => {
        try {
          if (stdin && !active.aborted) await proc.stdin.writeText(stdin);
          await proc.stdin.close();
        } catch (error) {
          // As in Modal's own file writer, a short-lived process may exit
          // before its stdin RPC completes (FAILED_PRECONDITION or ABORTED).
          if (![9, 10].includes(error.code) || await proc._poll() === null) throw error;
        }
      };
      const [code] = await Promise.all([
        proc.wait(),
        collect(proc.stdout, out, stdoutLimit, 'stdout', active),
        collect(proc.stderr, err, OUTPUT_LIMIT, 'stderr', active),
        input(),
      ]);
      return code;
    });
  } catch (error) {
    signal?.throwIfAborted();
    // The pinned SDK may reach the exec's own deadline before the local timer.
    const sdkDeadline = /^Deadline exceeded while (waiting for|streaming stdio for) exec /.test(error.message);
    if (!deadline.signal.aborted && !sdkDeadline) throw error;
    timedOut = true;
  } finally {
    clearTimeout(timer);
    stop.abort();
  }
  return { stdout: Buffer.concat(out), stderr: Buffer.concat(err), exitCode, timedOut };
}

export async function connectSandbox({ id, env, signal }) {
  signal?.throwIfAborted();
  if (typeof id !== 'string' || !id.trim()) throw new Error('Modal requires an existing sandbox ID.');
  const tokenId = env?.MODAL_TOKEN_ID?.trim();
  const tokenSecret = env?.MODAL_TOKEN_SECRET?.trim();
  if (!tokenId || !tokenSecret) throw new Error('Modal requires both MODAL_TOKEN_ID and MODAL_TOKEN_SECRET from the caller.');
  const client = new ModalClient({ tokenId, tokenSecret, logLevel: 'error' });
  let sandbox;
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    try {
      sandbox?.detach();
    } finally {
      client.close();
    }
  }
  try {
    // 0.11.2 reads the server URL from the host's environment or profile even
    // with explicit tokens. Check the effective endpoints before the first RPC.
    if (!client.profile.serverUrl.split(',').every(url => PUBLIC_API.test(url.trim()))) {
      throw new Error('The Modal provider requires the public Modal API endpoints.');
    }
    await withAbort(signal, async () => {
      const attached = await client.sandboxes.fromId(id);
      if (closed) attached.detach();
      else sandbox = attached;
    });
  } catch (error) {
    close();
    throw error;
  }
  return {
    async status({ signal } = {}) {
      const code = await withAbort(signal, () => sandbox.poll());
      return { state: code === null ? 'running' : 'stopped' };
    },
    async exec({ command, ...options }) {
      const result = await run(sandbox, ['/bin/sh', '-lc', command], options);
      return { ...result, stdout: result.stdout.toString('utf8'), stderr: result.stderr.toString('utf8') };
    },
    async readFile({ path, maxBytes = 20000, signal }) {
      // Modal's filesystem.readBytes() downloads the entire file. Read one
      // extra byte remotely to detect truncation even for a very large file.
      const result = await run(sandbox, ['head', '-c', String(maxBytes + 1), path], { signal }, maxBytes + 1);
      if (result.timedOut) throw new Error('Modal file read timed out.');
      if (result.exitCode !== 0) throw new Error(`Modal file read failed (exit ${result.exitCode}): ${result.stderr.toString('utf8').trim()}`);
      const truncated = result.stdout.length > maxBytes;
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      const text = decoder.decode(result.stdout.subarray(0, maxBytes), { stream: truncated });
      if (truncated) decoder.decode(result.stdout.subarray(maxBytes), { stream: true });
      return { text, bytes: Buffer.byteLength(text), truncated };
    },
    async writeFile({ path, text, signal }) {
      await withAbort(signal, () => sandbox.filesystem.writeText(text, path));
      return { bytes: Buffer.byteLength(text) };
    },
    close,
  };
}
