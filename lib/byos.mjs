import { registerByosTools } from '../generated/byos/tools.mjs';
import { providerCredentials } from './provider-credentials.mjs';

const providers = {
  hf: () => import('../providers/hf.mjs'),
  'exe.dev': () => import('../providers/exe-dev.mjs'),
  modal: () => import('../providers/modal.mjs'),
};

export function addSandboxTools(server, supplied, loaders = providers) {
  const methods = {
    sandbox_status: 'status', sandbox_exec: 'exec', sandbox_read_file: 'readFile', sandbox_write_file: 'writeFile',
  };
  const handlers = {};
  for (const [tool, method] of Object.entries(methods)) {
    handlers[tool] = async ({ provider, sandboxId, ...args }, ctx) => {
      const signal = ctx.mcpReq.signal;
      let env;
      try {
        env = providerCredentials(provider, supplied);
        if (sandboxId !== sandboxId.trim() || /[\x00-\x1f\x7f]/.test(sandboxId)) throw new Error('Invalid sandbox ID.');
        for (const path of [args.path, args.cwd]) {
          if (path?.includes('\0')) throw new Error('Sandbox paths cannot contain a NUL character.');
        }
        if (args.command?.includes('\0')) throw new Error('A shell command cannot contain a NUL character.');
        for (const value of [args.text, args.stdin]) {
          if (value !== undefined && Buffer.byteLength(value) > 100000) throw new Error('Text input exceeds 100000 UTF-8 bytes.');
        }
        if (method === 'exec') args.timeoutSeconds ??= 30;
        if (method === 'readFile') args.maxBytes ??= 20000;
        signal.throwIfAborted();
        const { connectSandbox } = await loaders[provider]();
        const sandbox = await connectSandbox({ id: sandboxId, env, signal });
        try {
          signal.throwIfAborted();
          const result = await sandbox[method]({ ...args, signal });
          if (method === 'exec' && [result.stdout, result.stderr].some(value => Buffer.byteLength(value) > 1048576)) {
            throw new Error('Command output exceeded 1 MiB on a stream.');
          }
          if (method === 'readFile' && (result.bytes !== Buffer.byteLength(result.text) || result.bytes > args.maxBytes)) {
            throw new Error('The provider returned inconsistent file length.');
          }
          if (method === 'writeFile' && result.bytes !== Buffer.byteLength(args.text)) throw new Error('The provider reported an incomplete write.');
          const content = { provider, sandboxId, ...result };
          return { structuredContent: content, content: [{ type: 'text', text: JSON.stringify(content) }] };
        } finally {
          await sandbox.close();
        }
      } catch (error) {
        let message = error instanceof Error ? error.message : 'Sandbox operation failed.';
        for (const secret of Object.values(env ?? {})) message = message.replaceAll(secret, '[redacted]');
        return { isError: true, content: [{ type: 'text', text: message.slice(0, 2048) }] };
      }
    };
  }
  registerByosTools(server, handlers);
}
