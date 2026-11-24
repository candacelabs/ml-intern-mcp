// Generated from byos.openapi.yaml by npm run generate.
export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @enum {string} */
        Provider: "hf" | "exe.dev" | "modal";
        /** @description Hugging Face namespace/job ID or canonical handle, exe.dev VM name, or Modal sandbox ID. */
        SandboxId: string;
        /** @description Absolute POSIX path inside the sandbox. */
        Path: string;
        Target: {
            provider: components["schemas"]["Provider"];
            sandboxId: components["schemas"]["SandboxId"];
        };
        StatusResult: {
            provider: components["schemas"]["Provider"];
            sandboxId: components["schemas"]["SandboxId"];
            /** @enum {string} */
            state: "running" | "stopped" | "unknown";
        };
        ExecInput: {
            provider: components["schemas"]["Provider"];
            sandboxId: components["schemas"]["SandboxId"];
            command: string;
            cwd?: components["schemas"]["Path"];
            stdin?: string;
            /** @default 30 */
            timeoutSeconds?: number;
        };
        ExecResult: {
            provider: components["schemas"]["Provider"];
            sandboxId: components["schemas"]["SandboxId"];
            /** @description UTF-8 standard output */
            stdout: string;
            /** @description UTF-8 standard error */
            stderr: string;
            exitCode: number | null;
            timedOut: boolean;
        };
        ReadInput: {
            provider: components["schemas"]["Provider"];
            sandboxId: components["schemas"]["SandboxId"];
            path: components["schemas"]["Path"];
            /** @default 20000 */
            maxBytes?: number;
        };
        ReadResult: {
            provider: components["schemas"]["Provider"];
            sandboxId: components["schemas"]["SandboxId"];
            text: string;
            /** @description Number of UTF-8 bytes of text. */
            bytes: number;
            truncated: boolean;
        };
        WriteInput: {
            provider: components["schemas"]["Provider"];
            sandboxId: components["schemas"]["SandboxId"];
            path: components["schemas"]["Path"];
            text: string;
        };
        WriteResult: {
            provider: components["schemas"]["Provider"];
            sandboxId: components["schemas"]["SandboxId"];
            /** @description Number of UTF-8 bytes of text. */
            bytes: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
