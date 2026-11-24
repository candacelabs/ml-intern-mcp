# ML Intern MCP

Use HuggingChat’s ML Intern tools from Codex to read papers, inspect model checkpoints and datasets, and run Hugging Face Jobs. Codex handles the conversation. This server supplies the tools.

**Bring your own sandbox (BYOS).** Run commands and work with files on an existing Hugging Face sandbox, exe.dev VM, or Modal Sandbox. You control its lifetime and cost. Disconnecting leaves it running.

## Get started

You’ll need Node.js 22.14 or newer.

```sh
git clone https://github.com/candacelabs/ml-intern-mcp.git
cd ml-intern-mcp
npm ci --omit=dev
```

From this checkout, you can [try your sandbox](#work-with-an-existing-sandbox) or [connect Codex](#connect-codex).

## Work with an existing sandbox

**Public preview.** All three providers have passed fixture tests. Live sandbox execution still needs verification.

Choose your provider and export its credentials in your shell. Each provider example shows the requests and results.

| Provider | Sandbox to use | Credentials |
| --- | --- | --- |
| [Hugging Face](examples/hf.json) | A dedicated sandbox Job you own or created, identified by `NAMESPACE/JOB_ID` | Its original `HF_TOKEN` |
| [exe.dev](examples/exe-dev.json) | A VM name, such as `my-research-vm` | `EXE_TOKEN` with permission to run `ssh <vm-name>` |
| [Modal](examples/modal.json) | A Sandbox ID beginning with `sb-` | Its workspace’s `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` |

Run the line for your provider, replacing the quoted value with your own sandbox ID.

```sh
node examples/run.mjs hf "NAMESPACE/JOB_ID"
node examples/run.mjs exe.dev "my-research-vm"
node examples/run.mjs modal "sb-YOUR-SANDBOX-ID"
```

The runner checks that the sandbox is running, then runs `printf ml-intern-ok`. Look for `ml-intern-ok` in stdout and an exit code of `0`. [Finding your ID and trying file operations](examples/README.md)

## Connect Codex

**To use your sandbox**, start the server from the checkout and leave it running.

```sh
npm run start:http
```

Copy the server entry from [examples/codex.toml](examples/codex.toml) into `~/.codex/config.toml`. Keep the credential mappings for the providers you use. Start a new Codex session with those variables exported and try a request like this one, substituting your VM name.

> On my exe.dev VM `my-research-vm`, run `pwd` and tell me which directory it returned.

<details>
<summary>Codex configuration for the local server</summary>

```toml
[mcp_servers.ml_intern_byos]
url = "http://127.0.0.1:8787/mcp"

[mcp_servers.ml_intern_byos.env_http_headers]
"X-HF-Token" = "HF_TOKEN"
"X-Exe-Token" = "EXE_TOKEN"
"X-Modal-Token-Id" = "MODAL_TOKEN_ID"
"X-Modal-Token-Secret" = "MODAL_TOKEN_SECRET"
```

</details>

**Already using the Hugging Face app in Codex?** Your app connection handles account identity and Jobs. Add this server for public file and paper reads. Codex starts it when needed.

```sh
codex mcp add ml_intern -- "$(command -v node)" "$PWD/server.mjs" --public-files
```

In a new Codex session, try **“Read the config for `google-bert/bert-base-uncased`. How many transformer layers does it have?”** The checkpoint has 12.

<details>
<summary>Install the optional ML Intern skill for Codex</summary>

From the checkout, link the skill so Codex can use its instructions for choosing Hub tools and reproducing papers.

```sh
mkdir -p "$HOME/.agents/skills"
test -e "$HOME/.agents/skills/ml-intern" || ln -s "$PWD/skills/ml-intern" "$HOME/.agents/skills/ml-intern"
```

In a new session, try **“Use $ml-intern to check my Hugging Face account and read the BERT checkpoint config.”**

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

Install development dependencies with `npm ci`.

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
