import type { Client } from '@modelcontextprotocol/client';
import { callMlInternJob, createMlInternClient } from '../generated/tools.mjs';

declare const client: Client;
const hub = createMlInternClient(client);
void hub.hf_whoami();
void hub.hf_fs({ operations: [{ cmd: 'cat', args: ['hf://README.md'] }] });
void callMlInternJob(hub, 'uv', { script: 'print(42)', flavor: 'cpu-basic', timeout: '2m' });
// @ts-expect-error A uv submission needs the script to run.
void callMlInternJob(hub, 'uv', { flavor: 'cpu-basic' });
// @ts-expect-error Filesystem reads require an operations array.
void hub.hf_fs({});
