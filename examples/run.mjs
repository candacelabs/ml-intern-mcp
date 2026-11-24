import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createByosClient } from '../generated/byos/tools.mjs';
import { openSandboxClient } from '../lib/sandbox-client.mjs';

export async function runExample(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    url: { type: 'string' }, 'read-path': { type: 'string' }, 'write-path': { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  const usage = 'ml-intern-mcp example <hf|exe.dev|modal> <existing-sandbox-id> [--url URL] [--read-path /path] [--write-path /scratch-file]';
  if (values.help) return console.log(usage);
  const [provider, sandboxId] = positionals;
  const files = { hf: 'hf.json', 'exe.dev': 'exe-dev.json', modal: 'modal.json' };
  if (positionals.length !== 2 || !Object.hasOwn(files, provider) || !sandboxId.trim()) throw new Error(usage);
  const example = JSON.parse(await readFile(new URL(files[provider], import.meta.url), 'utf8'));
  const options = { signal: AbortSignal.timeout(90_000) };
  const client = await openSandboxClient({ provider, url: values.url, byos: true, ...options });
  try {
    const tools = createByosClient(client);
    const calls = [...example.calls];
    if (values['write-path']) {
      for (const call of example.fileCalls) calls.push({ ...call, arguments: { ...call.arguments, path: values['write-path'] } });
    }
    if (values['read-path']) calls.push({ name: 'sandbox_read_file', arguments: { provider, path: values['read-path'], maxBytes: 256 } });
    for (const call of calls) {
      const result = await tools[call.name]({ ...call.arguments, sandboxId }, options);
      if (result.isError || !result.structuredContent) throw new Error(result.content[0]?.text ?? 'Missing structured result.');
      console.log(JSON.stringify(result.structuredContent));
      if (call.name === 'sandbox_status' && result.structuredContent.state !== 'running') throw new Error('Sandbox is not running.');
      if (call.name === 'sandbox_exec' && (result.structuredContent.exitCode !== 0 || result.structuredContent.stdout !== 'ml-intern-ok')) {
        throw new Error('The command did not return the expected output.');
      }
      if (call.name === 'sandbox_read_file' && call.arguments.path === values['write-path'] &&
          result.structuredContent.text !== example.fileCalls[0].arguments.text) throw new Error('File read-back did not match the example write.');
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runExample(process.argv.slice(2)).catch(error => {
    console.error('BYOS example:', error.message);
    process.exitCode = 1;
  });
}
