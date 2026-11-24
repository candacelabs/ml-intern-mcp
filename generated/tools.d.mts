// Generated from openapi.yaml by npm run generate.
import type { CallToolRequestOptions, CallToolResult, Client, Tool } from '@modelcontextprotocol/client';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import type { components } from './openapi.js';

type StructuredResult<Output> = CallToolResult & (
  | { isError?: false; structuredContent: Output }
  | { isError: true }
);

export interface MlInternInputs {
  "create_repo": components["schemas"]["CreateRepoInput"];
  "hf_fs": components["schemas"]["HfFsInput"];
  "hf_fs_write": components["schemas"]["HfFsWriteInput"];
  "hf_jobs": components["schemas"]["HfJobsInput"];
  "hf_sandbox": components["schemas"]["HfSandboxInput"];
  "hf_sandbox_exec": components["schemas"]["HfSandboxExecInput"];
  "hf_sandbox_fs": components["schemas"]["HfSandboxFsInput"];
  "hf_whoami": components["schemas"]["HfWhoamiInput"];
  "hub_repo_details": components["schemas"]["HubRepoDetailsInput"];
}

export interface MlInternResults {
  "create_repo": StructuredResult<components["schemas"]["CreateRepoOutput"]>;
  "hf_fs": StructuredResult<components["schemas"]["HfFsOutput"]>;
  "hf_fs_write": StructuredResult<components["schemas"]["HfFsWriteOutput"]>;
  "hf_jobs": StructuredResult<components["schemas"]["HfJobsOutput"]>;
  "hf_sandbox": StructuredResult<components["schemas"]["HfSandboxOutput"]>;
  "hf_sandbox_exec": StructuredResult<components["schemas"]["HfSandboxExecOutput"]>;
  "hf_sandbox_fs": StructuredResult<components["schemas"]["HfSandboxFsOutput"]>;
  "hf_whoami": StructuredResult<components["schemas"]["HfWhoamiOutput"]>;
  "hub_repo_details": CallToolResult;
}

export type MlInternToolName = keyof MlInternInputs;
export type MlInternAnonymousToolName = "hf_fs" | "hf_whoami" | "hub_repo_details";
type CallArgs<Args> = {} extends Args
  ? [args?: Args, options?: CallToolRequestOptions]
  : [args: Args, options?: CallToolRequestOptions];

export type MlInternClient = {
  [K in MlInternToolName]: (...params: CallArgs<MlInternInputs[K]>) => Promise<MlInternResults[K]>;
};
export type MlInternHandlers = {
  [K in MlInternToolName]: (args: MlInternInputs[K], context: ServerContext) => MlInternResults[K] | Promise<MlInternResults[K]>;
};

export function listMlInternTools(authenticated?: boolean): Tool[];
export function createMlInternClient(client: Pick<Client, 'callTool'>): MlInternClient;
export function registerMlInternTools(server: McpServer, handlers: Pick<MlInternHandlers, MlInternAnonymousToolName>, authenticated?: false): void;
export function registerMlInternTools(server: McpServer, handlers: MlInternHandlers, authenticated: boolean): void;

export interface MlInternJobArgs {
  "run": components["schemas"]["HfJobsRunArgs"];
  "uv": components["schemas"]["HfJobsUvArgs"];
  "ps": components["schemas"]["HfJobsPsArgs"];
  "logs": components["schemas"]["HfJobsLogsArgs"];
  "inspect": components["schemas"]["HfJobsInspectArgs"];
  "cancel": components["schemas"]["HfJobsCancelArgs"];
  "update-labels": components["schemas"]["HfJobsUpdateLabelsArgs"];
  "scheduled update-labels": components["schemas"]["HfJobsScheduledUpdateLabelsArgs"];
  "scheduled run": components["schemas"]["HfJobsScheduledRunArgs"];
  "scheduled uv": components["schemas"]["HfJobsScheduledUvArgs"];
  "scheduled ps": components["schemas"]["HfJobsScheduledPsArgs"];
  "scheduled inspect": components["schemas"]["HfJobsScheduledInspectArgs"];
  "scheduled delete": components["schemas"]["HfJobsScheduledDeleteArgs"];
  "scheduled suspend": components["schemas"]["HfJobsScheduledSuspendArgs"];
  "scheduled resume": components["schemas"]["HfJobsScheduledResumeArgs"];
}
export function callMlInternJob<K extends keyof MlInternJobArgs>(
  tools: Pick<MlInternClient, 'hf_jobs'>, operation: K, ...params: CallArgs<MlInternJobArgs[NoInfer<K>]>
): Promise<MlInternResults['hf_jobs']>;
