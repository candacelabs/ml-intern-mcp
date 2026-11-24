# ML Intern MCP

Use HuggingChat’s ML Intern Hub tools from Codex or another MCP client. Read papers and checkpoints, inspect datasets, run Hub Jobs, and work inside a sandbox across multiple tool calls. Your client supplies the model and agent loop. This server runs Hugging Face’s pinned `intern` tool handlers. [HuggingChat preset](https://github.com/huggingface/chat-ui/blob/7fc0f672685331f11317a448f24c1c66b64894c6/src/lib/server/mlAssistant.ts) · [Hub tools](https://github.com/huggingface/hf-mcp-server/blob/df77feaa49795d7fd11dc472f4fa067e7bd2f542/packages/app/src/shared/bouquet-presets.ts)

**BYOS means Bring Your Own Sandbox.** Point the same four MCP tools at an existing **Hugging Face sandbox, exe.dev VM, or Modal Sandbox**. You choose the provider and sandbox ID on each call. The provider owns the runtime and permissions, and you control its lifetime and billing. Closing the MCP client leaves the sandbox running. [Runnable examples](examples/)

## Run the server

With Node.js 22.14 or newer installed, clone the private repository and install its locked runtime dependencies.

```sh
git clone git@github.com:candacelabs/ml-intern-mcp.git
cd ml-intern-mcp
npm ci --omit=dev
npm run start:http
```

This starts `node server.mjs --http --byos` at `http://127.0.0.1:8787/mcp`. Check the listener with `curl -fsS http://127.0.0.1:8787/healthz`. For **stdio**, configure the absolute paths to `node` and `server.mjs` followed by `--byos`. Run `node server.mjs --help` for listener options.

| Server mode | Tools advertised |
| --- | --- |
| `--public-files`, on either transport | `hf_fs` for public files and papers |
| Full server, anonymous caller | `hf_fs`, `hub_repo_details`, `hf_whoami` |
| Full server, verified Hub credential | All three public tools plus `hf_fs_write`, `create_repo`, `hf_jobs`, `hf_sandbox`, `hf_sandbox_exec`, `hf_sandbox_fs` |
| `--byos`, on either transport | The Hub tools available to the caller, plus `sandbox_status`, `sandbox_exec`, `sandbox_read_file`, and `sandbox_write_file` |

## Work with an existing sandbox

Use your own ID and credential for the provider you choose. The JSON examples include request arguments and illustrative results for all four tools.

| Provider | Which sandbox | Stdio environment | HTTP headers | Example |
| --- | --- | --- | --- | --- |
| `hf` | Dedicated HF Job running `sbx-server`. Use `NAMESPACE/JOB_ID` or `hfsb2:NAMESPACE:JOB_ID` with the original token. The caller must own the Job or be its recorded creator. | `HF_TOKEN` | `X-HF-Token` | [Hugging Face](examples/hf.json) |
| `exe.dev` | Existing exe.dev VM name, such as `my-research-vm`. The API token needs permission to run `ssh <vm-name>` through exe.dev’s HTTPS API. | `EXE_TOKEN` | `X-Exe-Token` | [exe.dev](examples/exe-dev.json) |
| `modal` | Existing Modal Sandbox object ID starting with `sb-`. Use credentials for its workspace. | `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | `X-Modal-Token-Id`, `X-Modal-Token-Secret` | [Modal](examples/modal.json) |

From the checkout, run **one** of the following against the shared endpoint. Set the ID variable on that line to your existing sandbox.

```sh
node examples/run.mjs hf "$HF_SANDBOX_ID" --url http://127.0.0.1:8787/mcp
node examples/run.mjs exe.dev "$EXE_VM" --url http://127.0.0.1:8787/mcp
node examples/run.mjs modal "$MODAL_SANDBOX_ID" --url http://127.0.0.1:8787/mcp
```

The runner checks status and runs `printf ml-intern-ok`. Omit `--url` to use stdio. Add `--read-path /path` to inspect a UTF-8 file. With `--write-path /tmp/my-scratch-file`, the runner writes `hello\n` to that path and reads it back. An existing file at the write path is replaced.

Every tool takes `provider` and `sandboxId` and echoes both in its structured result.

| Tool | Additional inputs | Result fields |
| --- | --- | --- |
| `sandbox_status` | — | `state` (`running`, `stopped`, or `unknown`) |
| `sandbox_exec` | `command`, optional `cwd`, `stdin`, `timeoutSeconds` | `stdout`, `stderr`, `exitCode`, `timedOut` |
| `sandbox_read_file` | Absolute `path`, optional `maxBytes` | `text`, `bytes`, `truncated` |
| `sandbox_write_file` | Absolute `path`, UTF-8 `text` | `bytes` |

For example, send these parameters to MCP’s `tools/call` for an existing exe.dev VM.

```json
{"name":"sandbox_exec","arguments":{"provider":"exe.dev","sandboxId":"my-research-vm","command":"printf ml-intern-ok"}}
```

On success, the response’s `structuredContent` contains the command output and exit status.

```json
{"provider":"exe.dev","sandboxId":"my-research-vm","stdout":"ml-intern-ok","stderr":"","exitCode":0,"timedOut":false}
```

Each exec call starts a shell. Files persist between calls in the same running sandbox. Pass `cwd` when a command needs a particular working directory. The timeout defaults to 30 seconds and can be set up to 55. Each output stream is limited to 1 MiB. File reads default to 20,000 bytes, and a read or write can transfer up to 100,000 UTF-8 bytes per call. Provider failures return MCP tool errors. A command’s nonzero exit code is a normal result. [Input and output schemas](byos.openapi.yaml) · [Provider prerequisites and examples](examples/README.md)

## Connect Codex

**Using your existing Hugging Face app connection.** Start the HTTP server with `node server.mjs --http --public-files`. In another shell in the same checkout, register the endpoint and link the skill.

```sh
codex mcp add ml_intern --url http://127.0.0.1:8787/mcp
mkdir -p "$HOME/.agents/skills"
test -e "$HOME/.agents/skills/ml-intern" || ln -s "$PWD/skills/ml-intern" "$HOME/.agents/skills/ml-intern"
```

In a new Codex session, ask **“Use $ml-intern to check my Hugging Face account and read the BERT checkpoint config.”** The skill routes identity and Jobs to your connected app and the public file read to this server. For the same pairing over stdio, register `codex mcp add ml_intern -- "$(command -v node)" "$PWD/server.mjs" --public-files`.

**Connecting to a BYOS server.** Start the service with `--byos`. In `~/.codex/config.toml`, add the endpoint and the environment-to-header mappings for the providers you use. A client calling only exe.dev or Modal can omit the Hugging Face mapping. For a shared deployment, replace the loopback URL with its HTTPS endpoint. [Example Codex configuration](examples/codex.toml)

```toml
[mcp_servers.ml_intern_byos]
url = "http://127.0.0.1:8787/mcp"
[mcp_servers.ml_intern_byos.env_http_headers]
"X-HF-Token" = "HF_TOKEN"
"X-Exe-Token" = "EXE_TOKEN"
"X-Modal-Token-Id" = "MODAL_TOKEN_ID"
"X-Modal-Token-Secret" = "MODAL_TOKEN_SECRET"
```

## Deploy a shared endpoint

Run the server behind your authenticated TLS reverse proxy. Set the public origin to the address clients use, and configure the proxy to preserve `Host`, `Origin`, and streaming responses.

```sh
node server.mjs --http --byos --host 127.0.0.1 --port 8787 --public-origin https://mcp.example.com
```

For a proxy in another container, bind the server to its private network interface and restrict direct access to the backend port. The listener checks the host and browser origin. Your proxy owns gateway access and the `Authorization` header. Provider credentials come from the current HTTP request. Each adapter receives only its own credentials. Exclude these headers from proxy logs. A proxy injecting credentials must overwrite incoming values with the authenticated caller’s credentials. The example runner reads an optional gateway bearer token from `ML_INTERN_PROXY_TOKEN`.

`GET /healthz` reports listener health. The sandbox probe checks provider connectivity. SIGTERM stops accepting new connections and gives active HTTP requests up to 15 seconds to drain. The sandbox remains under its owner’s control when the MCP process stops.

## Contract and verification

`openapi.yaml` describes the upstream Hub preset and Jobs operations. `byos.openapi.yaml` defines the four portable tools and their provider credential headers. Both transports use the same generated tool definitions. Pass a connected MCP SDK client to `createMlInternClient` for the Hub or `createByosClient` for a sandbox. [Hub contract](openapi.yaml) · [BYOS contract](byos.openapi.yaml) · [Generated bindings](generated/)

From a development checkout, install the full dependency set with `npm ci`.

| Command | What it checks |
| --- | --- |
| `npm test` | Generated bindings and types, actual stdio and HTTP clients, caller isolation, all provider adapters against fixtures, and the example requests and results |
| `npm run check:drift` | HuggingChat’s current preset, live public schemas and a pinned BERT file read, plus all nine tool schemas and 15 Jobs operations from the pinned package using an offline identity |
| `node examples/run.mjs PROVIDER ID` | An existing sandbox on any of the three providers, using the operator’s credential |
| `npm run check:sandbox -- HANDLE` | Hugging Face’s native `hf_sandbox*` tool path, including health, command execution, and root directory metadata |

**Verified for v0.3.0.** All three runnable examples passed their four operations through the HTTP server against provider fixtures. Codex discovered the tools in a clean package install, read a live public BERT checkpoint, and ran the exe.dev example command against a fixture. Live sandbox execution still needs a check with an operator-owned ID and its credential.

After updating the upstream pin, run `npm run capture`, review the OpenAPI diff, then run `npm run generate` and the checks above. [Upstream licenses](notices/)
