// Generated from byos.openapi.yaml by npm run generate.
import type { CallToolRequestOptions, CallToolResult, Client, Tool } from '@modelcontextprotocol/client';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import type { components } from './openapi.js';

type StructuredResult<Output> = CallToolResult & (
  | { isError?: false; structuredContent: Output }
  | { isError: true }
);

export interface ByosInputs {
  "sandbox_status": components["schemas"]["Target"];
  "sandbox_exec": components["schemas"]["ExecInput"];
  "sandbox_read_file": components["schemas"]["ReadInput"];
  "sandbox_write_file": components["schemas"]["WriteInput"];
}

export interface ByosResults {
  "sandbox_status": StructuredResult<components["schemas"]["StatusResult"]>;
  "sandbox_exec": StructuredResult<components["schemas"]["ExecResult"]>;
  "sandbox_read_file": StructuredResult<components["schemas"]["ReadResult"]>;
  "sandbox_write_file": StructuredResult<components["schemas"]["WriteResult"]>;
}

export type ByosToolName = keyof ByosInputs;
export type ByosAnonymousToolName = "sandbox_status" | "sandbox_exec" | "sandbox_read_file" | "sandbox_write_file";
type CallArgs<Args> = {} extends Args
  ? [args?: Args, options?: CallToolRequestOptions]
  : [args: Args, options?: CallToolRequestOptions];

export type ByosClient = {
  [K in ByosToolName]: (...params: CallArgs<ByosInputs[K]>) => Promise<ByosResults[K]>;
};
export type ByosHandlers = {
  [K in ByosToolName]: (args: ByosInputs[K], context: ServerContext) => ByosResults[K] | Promise<ByosResults[K]>;
};

export function listByosTools(authenticated?: boolean): Tool[];
export function createByosClient(client: Pick<Client, 'callTool'>): ByosClient;
export function registerByosTools(server: McpServer, handlers: Pick<ByosHandlers, ByosAnonymousToolName>, authenticated?: false): void;
export function registerByosTools(server: McpServer, handlers: ByosHandlers, authenticated: boolean): void;
