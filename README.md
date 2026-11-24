# ML Intern MCP

Use HuggingChat’s ML Intern tools from GitHub Copilot or Codex to read papers, inspect model checkpoints and datasets, and run Hugging Face Jobs.

**Bring your own sandbox (BYOS).** Run commands and work with files on an existing Hugging Face sandbox, exe.dev VM, or Modal Sandbox. You control its lifetime and cost. Disconnecting leaves it running.

## Install

Run the command for your client in a macOS or Linux terminal. It downloads the server and a private runtime, then registers it with the client. You’ll need the client’s shell command on your path (`copilot`, `code`, or `codex`).

**GitHub Copilot CLI**

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- copilot
```

**GitHub Copilot in VS Code**

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- vscode
```

**Codex**

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- codex
```

Open a new chat and try **“Use ML Intern to read the config for `google-bert/bert-base-uncased`. How many transformer layers does it have?”** The public checkpoint has 12 layers and needs no provider credential.

## Work with an existing sandbox

For sandbox access, add the provider name to the install command. For example, to connect Copilot CLI to exe.dev, export `EXE_TOKEN` and run the following command.

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- copilot exe.dev
```

Launch the client with the credential in its environment, then ask **“On my exe.dev VM `my-research-vm`, run `pwd`.”** Substitute your VM name. The installer registers environment variable names so the client supplies their values when starting the server.

| Installer argument | Existing sandbox | Credentials |
| --- | --- | --- |
| `hf` | Dedicated Hugging Face sandbox Job you own or created, identified by `NAMESPACE/JOB_ID` | Its original `HF_TOKEN` |
| `exe.dev` | VM name, such as `my-research-vm` | `EXE_TOKEN` with `ssh <vm-name>` permission |
| `modal` | Modal Sandbox ID beginning with `sb-` | `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` |

You can include multiple provider names. To use an existing Hugging Face app connection in Codex for identity and Jobs, pass `codex public-files` to install the companion for public reads. [Provider examples and client settings](examples/README.md)

**Public preview.** All three providers passed fixture tests. Live sandbox execution still needs verification.

<details>
<summary>Installation details and shared HTTP servers</summary>

The installer supports Apple Silicon and Intel Macs, and x64 and ARM64 Linux with glibc. It also supports x64 Linux with musl. It verifies the downloads and installs under `$XDG_DATA_HOME/ml-intern-mcp`, defaulting to `~/.local/share/ml-intern-mcp`. Re-run the command to upgrade. Use `standalone` for another stdio client. The installer prints the absolute server path to use with the argument `--byos`. [Installer source](scripts/install.sh) · [Release downloads](https://github.com/candacelabs/ml-intern-mcp/releases)

If your team already hosts the server, connect directly to its HTTPS endpoint. [Shared endpoint examples for Copilot and Codex](examples/README.md#connect-to-a-shared-server)

</details>

## Sandbox tools

Every call takes a `provider` and `sandboxId` and returns both in the result. Files persist between calls in the same running sandbox. Each command starts a fresh shell.

| Tool | What you supply | What you get back |
| --- | --- | --- |
| `sandbox_status` | Just the provider and ID | `state` (`running`, `stopped`, or `unknown`) |
| `sandbox_exec` | A `command`, optionally `cwd`, `stdin`, and `timeoutSeconds` | `stdout`, `stderr`, `exitCode`, and `timedOut` |
| `sandbox_read_file` | An absolute `path`, optionally `maxBytes` | UTF-8 `text`, byte count, and `truncated` |
| `sandbox_write_file` | An absolute `path` and UTF-8 `text` | Number of `bytes` written |

<details>
<summary>Example command, response, and limits</summary>

Send these parameters to MCP’s `tools/call` method.

```json
{
  "name": "sandbox_exec",
  "arguments": {
    "provider": "exe.dev",
    "sandboxId": "my-research-vm",
    "command": "printf ml-intern-ok",
    "timeoutSeconds": 10
  }
}
```

A successful response has this `structuredContent`.

```json
{
  "provider": "exe.dev",
  "sandboxId": "my-research-vm",
  "stdout": "ml-intern-ok",
  "stderr": "",
  "exitCode": 0,
  "timedOut": false
}
```

- Commands have a 30-second default timeout, a 55-second maximum, and a 1 MiB limit on each output stream. A nonzero exit code is part of the result. Provider failures return MCP tool errors.
- Reads default to 20,000 bytes. Each file call can transfer up to 100,000 UTF-8 bytes. To try a write, give the runner `--write-path` and a scratch path you own. It replaces that file with `hello\n` and reads it back.

[Sandbox input and output schemas](byos.openapi.yaml)

</details>

## Deployment and development

<details>
<summary>Server modes and Hugging Face tools</summary>

| Mode | Tools available |
| --- | --- |
| Default, anonymous | `hf_fs`, `hub_repo_details`, `hf_whoami` |
| Default, verified Hub credential | The public tools plus `hf_fs_write`, `create_repo`, `hf_jobs`, `hf_sandbox`, `hf_sandbox_exec`, and `hf_sandbox_fs` |
| `--public-files` | `hf_fs` for public file and paper reads |
| `--byos` | The caller’s Hub tools plus the four sandbox tools above |

The server uses stdio by default. Add `--http` for Streamable HTTP. `npm run start:http` enables both HTTP and BYOS. To try the sandbox example over HTTP, append `--url http://127.0.0.1:8787/mcp` to the runner command.

To pair the Hugging Face app with public file reads over HTTP, start `node server.mjs --http --public-files` and register it with `codex mcp add ml_intern --url http://127.0.0.1:8787/mcp`.

</details>

<details>
<summary>Deploy a shared HTTP endpoint</summary>

Run the server behind an authenticated TLS reverse proxy. Use the proxy’s HTTPS URL in the Codex configuration.

```sh
node server.mjs --http --byos --host 127.0.0.1 --port 8787 \
  --public-origin https://mcp.example.com
```

- **Networking.** Preserve `Host`, `Origin`, and streaming responses. The listener checks the host and browser origin. If the proxy runs in another container, bind to a private interface and restrict access to the backend port.
- **Credentials.** The proxy handles gateway access via `Authorization`. Each adapter receives its provider’s credentials from the current request. Exclude credential headers from proxy logs. If the proxy injects credentials, overwrite incoming values with the authenticated caller’s values. The example runner accepts a gateway token via `ML_INTERN_PROXY_TOKEN`.
- **Health and shutdown.** `GET /healthz` checks the listener. Run a provider example to check sandbox connectivity. On SIGTERM, the listener stops accepting connections and gives active requests up to 15 seconds to finish.

</details>

<details>
<summary>Contracts, generated clients, and verification</summary>

The server runs Hugging Face’s pinned `intern` handlers. Both transports use the same generated tool definitions. Pass a connected MCP SDK client to `createMlInternClient` for Hub tools or `createByosClient` for sandbox tools. [Hub contract](openapi.yaml) · [Sandbox contract](byos.openapi.yaml) · [Generated clients](generated/)

For development or to run the scripts in `examples/`, clone the repository and install Node.js 22.14 or newer.

```sh
git clone https://github.com/candacelabs/ml-intern-mcp.git
cd ml-intern-mcp
npm ci
```

Run `scripts/build-release.sh OUTPUT_DIRECTORY` on a Linux build host to produce the portable server archive, installer, and checksums.

| Command | Checks |
| --- | --- |
| `npm test` | Generated bindings and types, stdio and HTTP, caller isolation, provider fixtures, and runnable examples |
| `npm run check:drift` | HuggingChat’s current preset, live public tool schemas and a pinned BERT file, plus nine tool schemas and 15 Jobs operations from the pinned package |
| `npm run check:sandbox -- HANDLE` | Health, shell, and root directory metadata on your existing sandbox via Hugging Face’s native tools |
| `node examples/run.mjs PROVIDER ID` | Your provider’s status and command execution on an existing sandbox |

**Verification for v0.3.0.** All three providers passed status, command, read, and write checks through HTTP using fixtures. Codex read a live public BERT checkpoint from a clean install. Execution on live provider sandboxes remains unverified.

After changing the upstream pin, run `npm run capture`, review the OpenAPI diff, run `npm run generate`, then rerun the checks. [HuggingChat preset](https://github.com/huggingface/chat-ui/blob/7fc0f672685331f11317a448f24c1c66b64894c6/src/lib/server/mlAssistant.ts) · [Upstream Hub tools](https://github.com/huggingface/hf-mcp-server/blob/df77feaa49795d7fd11dc472f4fa067e7bd2f542/packages/app/src/shared/bouquet-presets.ts) · [License notices](notices/)

</details>

## License

The project’s original code is licensed under Apache 2.0. Third-party components retain their own licenses. [Project license](LICENSE) · [Upstream notices](notices/)
