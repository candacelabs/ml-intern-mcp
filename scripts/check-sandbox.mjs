import { parseArgs } from 'node:util';
import { createMlInternClient } from '../generated/tools.mjs';
import { openSandboxClient } from '../lib/sandbox-client.mjs';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    url: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  const usage = 'Usage: npm run check:sandbox -- [--url URL] NAMESPACE/JOB_ID';
  if (values.help) return console.log(usage);
  if (positionals.length !== 1 || !positionals[0].trim()) throw new Error(usage);
  const [handle] = positionals;
  const options = { signal: AbortSignal.timeout(60_000) };
  const client = await openSandboxClient({ provider: 'hf', url: values.url, ...options });
  try {
    const catalog = await client.listTools(undefined, options);
    const names = new Set(catalog.tools.map(tool => tool.name));
    const missing = ['hf_sandbox', 'hf_sandbox_exec', 'hf_sandbox_fs'].filter(name => !names.has(name));
    if (missing.length) throw new Error(`This connection lacks ${missing.join(', ')}. Use the full endpoint with the sandbox owner's credential.`);
    const tools = createMlInternClient(client);
    const status = await tools.hf_sandbox({ cmd: 'status', args: [handle] }, options);
    if (status.isError || status.structuredContent?.health?.ok !== true) {
      throw new Error('Sandbox status failed. Check the handle, running Job, and original Hub credential.');
    }
    console.log('OK sandbox health', status.structuredContent.handle);
    const command = await tools.hf_sandbox_exec({ cmd: 'exec', args: [handle, 'printf ml-intern-ok'] }, options);
    if (command.isError || command.structuredContent?.returncode !== 0 || command.structuredContent.stdout !== 'ml-intern-ok') {
      throw new Error('Sandbox command failed to return the expected output.');
    }
    console.log('OK sandbox shell command');
    const root = await tools.hf_sandbox_fs({ cmd: 'stat', args: [handle, '/'] }, options);
    if (root.isError || root.structuredContent?.exists !== true || root.structuredContent.type !== 'dir') {
      throw new Error('Sandbox filesystem check failed for /.');
    }
    console.log('OK sandbox filesystem');
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error('check:sandbox:', error.message);
  process.exitCode = 1;
});
