import type { Client } from '@modelcontextprotocol/client';
import { callMlInternJob, createMlInternClient } from '../generated/tools.mjs';
import { createByosClient } from '../generated/byos/tools.mjs';

declare const client: Client;
const hub = createMlInternClient(client);
void hub.hf_whoami();
void hub.hf_fs({ operations: [{ cmd: 'cat', args: ['hf://README.md'] }] });
void callMlInternJob(hub, 'uv', { script: 'print(42)', flavor: 'cpu-basic', timeout: '2m' });
// @ts-expect-error A uv submission needs the script to run.
void callMlInternJob(hub, 'uv', { flavor: 'cpu-basic' });
// @ts-expect-error Filesystem reads require an operations array.
void hub.hf_fs({});
const sandbox = createByosClient(client);
void sandbox.sandbox_exec({ provider: 'exe.dev', sandboxId: 'research', command: 'pwd' });
void sandbox.sandbox_read_file({ provider: 'modal', sandboxId: 'sb-example', path: '/work/result' });
// @ts-expect-error Every portable operation requires an existing sandbox ID.
void sandbox.sandbox_status({ provider: 'hf' });
