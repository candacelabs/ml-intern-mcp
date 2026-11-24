import { createHmac } from 'node:crypto';
import { hubFetch, normalizeSandboxHealth, parseSandboxExecResponse, parseSandboxHandle } from '@llmindset/hf-mcp';
import { fetchWithProfile, NETWORK_FETCH_PROFILES } from '@llmindset/hf-mcp/network';

const jobPort = 49983;
const outputLimit = 1024 * 1024;
const stopped = new Set(['COMPLETED', 'CANCELED', 'ERROR', 'DELETED']);
const jobsProxy = { ...NETWORK_FETCH_PROFILES.externalHttps(), maxRedirects: 0 };

async function readPrefix(response, limit) {
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body ?? []) {
    const prefix = chunk.subarray(0, limit - length);
    chunks.push(prefix);
    length += prefix.length;
    if (length === limit) break;
  }
  return Buffer.concat(chunks, length);
}

// The upstream exec parser retains a bounded tail, but first buffers up to a
// newline. Bound individual JSON records too (a character can be escaped as \uXXXX).
function boundedExecResponse(response) {
  if (!response.body) throw new Error('Hugging Face sandbox returned an empty command response.');
  const wireLimit = 6 * outputLimit + 4096;
  let pending = 0;
  const checked = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start);
        const end = newline < 0 ? chunk.length : newline;
        pending += end - start;
        if (pending > wireLimit) throw new Error('Hugging Face sandbox command output exceeds 1 MiB per stream.');
        if (newline < 0) break;
        pending = 0;
        start = newline + 1;
      }
      controller.enqueue(chunk);
    },
  }));
  return new Response(checked);
}

export async function connectSandbox({ id, env }) {
  const token = env?.HF_TOKEN?.trim();
  if (!token) throw new Error('The Hugging Face sandbox requires its owner’s HF_TOKEN.');
  const handle = parseSandboxHandle(id);
  const jobPath = '/api/jobs/' + encodeURIComponent(handle.namespace) + '/' + encodeURIComponent(handle.jobId);
  const origin = new URL(`https://${handle.jobId}--${jobPort}.hf.jobs`).origin;
  const closed = new AbortController();

  async function resolveJob(signal) {
    const active = signal ? AbortSignal.any([closed.signal, signal]) : closed.signal;
    active.throwIfAborted();
    const context = { hfToken: token, signal: active };
    const [{ data: job }, { data: principal }] = await Promise.all([
      hubFetch({ path: jobPath, subject: 'Hugging Face sandbox job' }, context),
      hubFetch({ path: '/api/whoami-v2', subject: 'Hugging Face sandbox caller' }, context),
    ]);
    const labels = job?.labels;
    const nonce = labels?.['hf-sandbox-nonce'];
    const mode = labels?.['hf-sandbox-mode'];
    if (job?.id !== handle.jobId || labels?.['hf-sandbox'] !== '1' || labels['hf-sandbox-pool'] !== undefined ||
        (mode !== undefined && mode !== 'dedicated') || typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) {
      throw new Error('The specified Hugging Face job is not a dedicated sandbox.');
    }
    // Namespace readers can inspect the Job. Its owner or creator must match
    // the caller before the Jobs proxy receives their bearer for this workload.
    if (!principal?.id || (job.owner?.id !== principal.id && job.createdBy?.id !== principal.id)) {
      throw new Error('Hugging Face could not verify the caller as the sandbox owner or creator. Organization jobs require a matching creator.');
    }
    const urls = job.status?.exposeUrls ?? job.status?.expose_urls;
    if (urls != null && (!Array.isArray(urls) || (urls.length && !urls.some(url => url === origin || url === origin + '/')))) {
      throw new Error('Hugging Face did not advertise the expected HTTPS Jobs origin for this sandbox.');
    }
    return { stage: job.status?.stage, nonce, signal: active };
  }

  async function rpc(job, path, init = {}, timeoutMs = 30_000) {
    if (job.stage !== 'RUNNING') throw new Error('The Hugging Face sandbox job is not running.');
    // The per-job capability is derived exactly as in huggingface_hub. Never
    // transmit either credential to a URL from tool input or a redirect.
    const key = createHmac('sha256', token).update('hf-sandbox:' + job.nonce).digest('hex');
    const { response } = await fetchWithProfile(origin + path, jobsProxy, {
      timeoutMs,
      requestInit: { ...init, signal: job.signal, headers: {
        ...init.headers, Authorization: 'Bearer ' + token, 'X-Sandbox-Token': key,
      } },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Hugging Face sandbox ${path.split('?')[0]} returned HTTP ${response.status}.`);
    }
    return response;
  }

  return {
    async status({ signal } = {}) {
      const job = await resolveJob(signal);
      if (stopped.has(job.stage)) return { state: 'stopped' };
      if (job.stage !== 'RUNNING') return { state: 'unknown' };
      const health = await readPrefix(await rpc(job, '/health'), 65_537);
      if (health.length > 65_536) throw new Error('Hugging Face sandbox health response is too large.');
      return { state: normalizeSandboxHealth(JSON.parse(health.toString('utf8'))).ok ? 'running' : 'unknown' };
    },
    async exec({ command, cwd, stdin, timeoutSeconds = 30, signal }) {
      const job = await resolveJob(signal);
      const response = await rpc(job, '/v1/exec', {
        method: 'POST', headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: ['/bin/sh', '-lc', command], shell: false, cwd, stdin, timeout: timeoutSeconds }),
      }, (timeoutSeconds + 5) * 1000);
      const result = await parseSandboxExecResponse(boundedExecResponse(response), {
        maxOutputChars: outputLimit, redact: value => value,
      });
      if (result.stdout_dropped || result.stderr_dropped ||
          Buffer.byteLength(result.stdout) > outputLimit || Buffer.byteLength(result.stderr) > outputLimit) {
        throw new Error('Hugging Face sandbox command output exceeds 1 MiB per stream.');
      }
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.returncode, timedOut: result.timed_out };
    },
    async readFile({ path, maxBytes = 20_000, signal }) {
      const job = await resolveJob(signal);
      const query = new URLSearchParams({ path, offset: '0', length: String(maxBytes + 1) });
      const response = await rpc(job, '/v1/files/read?' + query);
      const data = await readPrefix(response, maxBytes + 1);
      const truncated = data.length > maxBytes;
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      const text = decoder.decode(data.subarray(0, maxBytes), { stream: truncated });
      return { text, bytes: Buffer.byteLength(text), truncated };
    },
    async writeFile({ path, text, signal }) {
      const job = await resolveJob(signal);
      const data = Buffer.from(text, 'utf8');
      const response = await rpc(job, '/v1/files/write?' + new URLSearchParams({ path }), { method: 'PUT', body: data });
      await response.body?.cancel();
      return { bytes: data.length };
    },
    close() { closed.abort(new Error('The Hugging Face sandbox connection is closed.')); },
  };
}
