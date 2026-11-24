# ML Intern MCP

Use HuggingChat’s ML Intern tools from GitHub Copilot or Codex to read papers, inspect model checkpoints and datasets, and run Hugging Face Jobs.

**Bring your own sandbox (BYOS).** Run commands and work with files on an existing Hugging Face sandbox, exe.dev VM, or Modal Sandbox. You control its lifetime and cost. Disconnecting leaves it running.

## Install

Run the command for your client in a macOS or Linux terminal. It downloads the server and a private runtime, then registers it with the client. The second line opens a chat and asks it to read a public model config. The expected answer is **12 layers**.

**GitHub Copilot CLI**

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- copilot
copilot -i 'Use ML Intern to read google-bert/bert-base-uncased/config.json. How many transformer layers does it have?'
```

**GitHub Copilot in VS Code**

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- vscode
code chat --mode agent 'Use ML Intern to read google-bert/bert-base-uncased/config.json. How many transformer layers does it have?'
```

**Codex**

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- codex
codex 'Use ML Intern to read google-bert/bert-base-uncased/config.json. How many transformer layers does it have?'
```

<details>
<summary>Missing a client command?</summary>

| Client | Check | Install |
| --- | --- | --- |
| Copilot CLI | `copilot --version` | `curl -fsSL https://gh.io/copilot-install \| bash` |
| Codex | `codex --version` | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` |
| VS Code on macOS with Homebrew | `code --version` | `brew install --cask visual-studio-code` |
| VS Code on Linux with Snap | `code --version` | `sudo snap install --classic code` |

If a freshly installed CLI is outside this shell’s path, use `export PATH="$HOME/.local/bin:$PATH"`. For an existing macOS VS Code app, use `export PATH="/Applications/Visual Studio Code.app/Contents/Resources/app/bin:$PATH"`. The CLI sign-in commands are `copilot login` and `codex login`. [Copilot installation](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli) · [Codex installation](https://github.com/openai/codex#installing-and-running-codex-cli) · [VS Code on Linux](https://code.visualstudio.com/docs/setup/linux)

</details>

## Work with an existing sandbox

This example connects Copilot to an existing exe.dev VM. In Bash or Zsh, the first prompt reads your token without displaying it. The installer saves the variable name, and Copilot passes its value when starting the server.

```sh
printf 'exe.dev token: '; IFS= read -rs EXE_TOKEN; printf '\n'; export EXE_TOKEN
printf 'VM name: '; IFS= read -r EXE_VM
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- copilot exe.dev
copilot -i "Use ML Intern to run pwd on my exe.dev VM named $EXE_VM."
```

| Installer argument | Existing sandbox | Credentials |
| --- | --- | --- |
| `hf` | Dedicated Hugging Face sandbox Job you own or created, identified by `NAMESPACE/JOB_ID` | Its original `HF_TOKEN` |
| `exe.dev` | VM name, such as `my-research-vm` | `EXE_TOKEN` with `ssh <vm-name>` permission |
| `modal` | Modal Sandbox ID beginning with `sb-` | `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` |

<details>
<summary>Hugging Face, Modal, or multiple providers</summary>

These Bash/Zsh examples register the client and launch it with the credentials for that provider.

**Hugging Face with Copilot CLI**

```sh
printf 'Original HF sandbox token: '; IFS= read -rs HF_TOKEN; printf '\n'; export HF_TOKEN
printf 'Namespace/job ID: '; IFS= read -r HF_SANDBOX_ID
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- copilot hf
copilot -i "Check the status of my Hugging Face sandbox $HF_SANDBOX_ID."
```

**Modal with Codex**

```sh
printf 'Modal token ID: '; IFS= read -r MODAL_TOKEN_ID; export MODAL_TOKEN_ID
printf 'Modal token secret: '; IFS= read -rs MODAL_TOKEN_SECRET; printf '\n'; export MODAL_TOKEN_SECRET
printf 'Modal sandbox ID: '; IFS= read -r MODAL_SANDBOX_ID
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- codex modal
codex "Check the status of my Modal sandbox $MODAL_SANDBOX_ID."
```

One registration can forward multiple providers’ credentials.

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- copilot hf exe.dev modal
```

For an existing Hugging Face app connection in Codex, this companion adds public reads while the connected app handles identity and Jobs.

```sh
curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- codex public-files
```

[Provider examples and client settings](examples/README.md)

</details>

**Public preview.** All three providers passed fixture tests. Live sandbox execution still needs verification.

<details>
<summary>Installation details and shared HTTP servers</summary>

The installer supports Apple Silicon and Intel Macs, and x64 and ARM64 Linux with glibc. It also supports x64 Linux with musl. It verifies the downloads and installs under `$XDG_DATA_HOME/ml-intern-mcp`, defaulting to `~/.local/share/ml-intern-mcp`. The same install command upgrades the client’s registration. For another stdio client, the standalone installer prints the executable path. These commands display its version and run it in BYOS mode.

```sh
ml_intern=$(curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- standalone)
"$ml_intern" --version
"$ml_intern" --byos
```

For an existing shared MCP endpoint, this registers its HTTPS URL with Copilot CLI.

```sh
printf 'MCP endpoint URL: '; IFS= read -r MCP_URL
copilot mcp add --transport http ml-intern-remote "$MCP_URL"
```

[Shared endpoint examples for Copilot and Codex](examples/README.md#connect-to-a-shared-server) · [Installer source](scripts/install.sh) · [Release downloads](https://github.com/candacelabs/ml-intern-mcp/releases)

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

The example runner sends a `tools/call` request like this one.

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
- Reads default to 20,000 bytes. Each file call can transfer up to 100,000 UTF-8 bytes. The following command writes `hello\n` to the scratch file and reads it back. It **replaces** any existing file at that path. It uses the exe.dev token and VM name from the example above.

```sh
ml_intern="${XDG_DATA_HOME:-$HOME/.local/share}/ml-intern-mcp/current/ml-intern-mcp"
"$ml_intern" example exe.dev "$EXE_VM" --write-path /tmp/ml-intern-example.txt
```

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

The standalone executable serves stdio by default. This starts Streamable HTTP with BYOS on loopback.

```sh
ml_intern="${XDG_DATA_HOME:-$HOME/.local/share}/ml-intern-mcp/current/ml-intern-mcp"
"$ml_intern" --http --byos
```

In another terminal, these commands check listener health and probe an existing sandbox. The probe uses the same `EXE_TOKEN` and `EXE_VM` as the exe.dev example above.

```sh
curl -fsS http://127.0.0.1:8787/healthz
"${XDG_DATA_HOME:-$HOME/.local/share}/ml-intern-mcp/current/ml-intern-mcp" example exe.dev "$EXE_VM" --url http://127.0.0.1:8787/mcp
```

</details>

<details>
<summary>Serve an existing authenticated HTTPS gateway</summary>

On the gateway host, this starts the backend for a public HTTPS origin. The origin is the scheme and hostname clients use, such as `https://mcp.example.com`.

```sh
printf 'Public HTTPS origin: '; IFS= read -r MCP_ORIGIN
"${XDG_DATA_HOME:-$HOME/.local/share}/ml-intern-mcp/current/ml-intern-mcp" --http --byos \
  --host 127.0.0.1 --port 8787 --public-origin "$MCP_ORIGIN"
```

The gateway supplies TLS and authentication, preserves `Host`, `Origin`, and streaming responses, and keeps credential headers out of logs. Gateway `Authorization` and per-caller provider headers serve different purposes. A gateway that injects credentials must overwrite client-supplied values. The MCP listener checks host and browser origin and drains active requests for up to 15 seconds on SIGTERM. [Client connection commands](examples/README.md#connect-to-a-shared-server)

</details>

<details>
<summary>Contracts, generated clients, and verification</summary>

The server runs Hugging Face’s pinned `intern` handlers. Both transports use the same generated tool definitions. The generated client factories are `createMlInternClient` for Hub tools and `createByosClient` for sandbox tools. [Hub contract](openapi.yaml) · [Sandbox contract](byos.openapi.yaml) · [Generated clients](generated/)

Source development uses Git and Node.js 22.14 or newer. With the nvm version manager, the command for the Node 22 development toolchain is `nvm install 22`.

```sh
git clone https://github.com/candacelabs/ml-intern-mcp.git
cd ml-intern-mcp
npm ci
```

A Linux maintainer can build the release assets with `scripts/build-release.sh ./dist`.

| Command | Checks |
| --- | --- |
| `npm test` | Generated bindings and types, stdio and HTTP, caller isolation, provider fixtures, and runnable examples |
| `npm run check:drift` | HuggingChat’s current preset, live public tool schemas and a pinned BERT file, plus nine tool schemas and 15 Jobs operations from the pinned package |
| `npm run check:sandbox -- "$HF_SANDBOX_ID"` | Health, shell, and root directory metadata on your existing sandbox via Hugging Face’s native tools |
| `node examples/run.mjs exe.dev "$EXE_VM"` | Your provider’s status and command execution on an existing sandbox |

**Verification for v0.3.0.** All three providers passed status, command, read, and write checks through HTTP using fixtures. Codex read a live public BERT checkpoint from a clean install. Execution on live provider sandboxes remains unverified.

After a pin change, these commands capture the schemas, show the changes, regenerate the clients, and verify the result.

```sh
npm run capture
git diff -- openapi.yaml byos.openapi.yaml
npm run generate && npm test && npm run check:drift
```

[HuggingChat preset](https://github.com/huggingface/chat-ui/blob/7fc0f672685331f11317a448f24c1c66b64894c6/src/lib/server/mlAssistant.ts) · [Upstream Hub tools](https://github.com/huggingface/hf-mcp-server/blob/df77feaa49795d7fd11dc472f4fa067e7bd2f542/packages/app/src/shared/bouquet-presets.ts) · [License notices](notices/)

</details>

## License

The project’s original code is licensed under Apache 2.0. Third-party components retain their own licenses. [Project license](LICENSE) · [Upstream notices](notices/)
