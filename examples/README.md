# Bring your own sandbox

Each JSON file contains complete MCP tool-call arguments for one provider and the structured results a successful call would return. IDs and results in the files are examples. The runner substitutes the existing sandbox ID you pass on the command line.

| Provider | Request and response examples | What to supply |
| --- | --- | --- |
| Hugging Face | [hf.json](hf.json) | A dedicated Job running HF’s `sbx-server`, and its original `HF_TOKEN`. The adapter uses the public HF Jobs proxy. [Provider guide](https://huggingface.co/docs/huggingface_hub/guides/sandbox) |
| exe.dev | [exe-dev.json](exe-dev.json) | An existing VM name and `EXE_TOKEN` with `ssh <vm-name>` permission. Metadata access with `ls` is optional. The adapter uses the exe.dev HTTPS API. [Provider guide](https://exe.dev/docs/https-api-run-on-vm) |
| Modal | [modal.json](modal.json) | An existing `sb-…` ID and its workspace’s `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`. The adapter connects through the public Modal JavaScript SDK. [Provider guide](https://modal.com/docs/sdk/js/latest) |

## Run an example

Install the runner and capture its path. This works from any directory.

```sh
ml_intern=$(curl -fsSL https://github.com/candacelabs/ml-intern-mcp/releases/latest/download/install.sh | sh -s -- standalone)
```

Choose one provider. These Bash/Zsh commands prompt for the existing ID and credential, then check status and run a command. Secret prompts disable terminal echo.

**Hugging Face** accepts the owning namespace and the existing Python `Sandbox.id`, for example `example-team/0123456789abcdef01234567`.

```sh
printf 'Original HF sandbox token: '; IFS= read -rs HF_TOKEN; printf '\n'; export HF_TOKEN
printf 'Namespace/job ID: '; IFS= read -r HF_SANDBOX_ID
"$ml_intern" example hf "$HF_SANDBOX_ID"
```

**exe.dev** uses the VM name.

```sh
printf 'exe.dev token: '; IFS= read -rs EXE_TOKEN; printf '\n'; export EXE_TOKEN
printf 'VM name: '; IFS= read -r EXE_VM
"$ml_intern" example exe.dev "$EXE_VM"
```

**Modal** accepts the existing JavaScript `Sandbox.sandboxId` or Python `Sandbox.object_id`.

```sh
printf 'Modal token ID: '; IFS= read -r MODAL_TOKEN_ID; export MODAL_TOKEN_ID
printf 'Modal token secret: '; IFS= read -rs MODAL_TOKEN_SECRET; printf '\n'; export MODAL_TOKEN_SECRET
printf 'Modal sandbox ID: '; IFS= read -r MODAL_SANDBOX_ID
"$ml_intern" example modal "$MODAL_SANDBOX_ID"
```

By default the runner starts an MCP subprocess and issues `sandbox_status` and `sandbox_exec` from the `calls` array. It prints a JSON object per result. Here is illustrative output for the exe.dev example.

```jsonl
{"provider":"exe.dev","sandboxId":"my-research-vm","state":"running"}
{"provider":"exe.dev","sandboxId":"my-research-vm","stdout":"ml-intern-ok","stderr":"","exitCode":0,"timedOut":false}
```

## Optional Codex skill

The shell installer includes the ML Intern skill for choosing Hub tools and reproducing papers. To enable it after installing the server, link it into the Codex skills directory.

```sh
mkdir -p "$HOME/.agents/skills"
test -e "$HOME/.agents/skills/ml-intern" || ln -s "${XDG_DATA_HOME:-$HOME/.local/share}/ml-intern-mcp/current/app/skills/ml-intern" "$HOME/.agents/skills/ml-intern"
```

## Connect to a shared server

These are alternative registration commands for your team’s existing HTTPS endpoint. The Copilot examples forward the exe.dev credential from the client’s environment.

```sh
printf 'MCP endpoint URL: '; IFS= read -r MCP_URL
copilot mcp add --transport http --header 'X-Exe-Token: ${EXE_TOKEN}' ml-intern-remote "$MCP_URL"
```

```sh
printf 'MCP endpoint URL: '; IFS= read -r MCP_URL
code --add-mcp "$(printf '{"name":"ml-intern-remote","type":"http","url":"%s","headers":{"X-Exe-Token":"${env:EXE_TOKEN}"}}' "$MCP_URL")"
```

```sh
printf 'MCP endpoint URL: '; IFS= read -r MCP_URL
codex mcp add ml_intern_remote --url "$MCP_URL"
```

The configuration files show the header mappings for credentialed calls. [Copilot CLI profile](copilot-http.json) · [VS Code profile](vscode-http.json) · [Codex profile](codex.toml) · [GitHub Copilot CLI documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) · [VS Code MCP configuration](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)

With the exe.dev example variables above, this checks the same sandbox through the shared endpoint. If your gateway needs a bearer token, set it in Bash or Zsh with `printf 'Gateway token: '; IFS= read -rs ML_INTERN_PROXY_TOKEN; printf '\n'; export ML_INTERN_PROXY_TOKEN`.

```sh
"$ml_intern" example exe.dev "$EXE_VM" --url "$MCP_URL"
```

## File examples

The first command reads a bounded UTF-8 prefix from an existing file. The second **replaces** the scratch file with six bytes (`hello\n`), reads it back, and checks the result.

```sh
"$ml_intern" example modal "$MODAL_SANDBOX_ID" --read-path /etc/os-release
"$ml_intern" example modal "$MODAL_SANDBOX_ID" --write-path /tmp/ml-intern-example.txt
```

The portable API operates on existing sandboxes and exposes status, command execution, UTF-8 reads, and UTF-8 writes. Each tool takes a `provider` and `sandboxId`. Provider errors set MCP `isError`. A completed shell command returns its own `exitCode` and `timedOut` fields. [Full input/output spec](../byos.openapi.yaml) · [TypeScript client declarations](../generated/byos/tools.d.mts)

## Runtime requirements

- **Hugging Face** accepts `namespace/job-id` or `hfsb2:namespace:job-id` for dedicated sandboxes on the public HF Jobs proxy. The workload receives the original Hub token. Before contacting it, the adapter checks the caller’s Hub user ID against the Job’s owner and creator. For a Job in an organization, the caller must be its recorded creator. [Hugging Face sandbox authentication](https://huggingface.co/docs/huggingface_hub/concepts/sandbox#authentication-is-stateless)
- **exe.dev** uses `/bin/sh` and GNU coreutils in the guest, including `timeout`, `base64`, `head`, and `mv`. Commands with stdin can use temporary files in `/tmp`. File writes stage in the destination’s existing writable parent directory. A VM-scoped key can prove readiness by executing `true` when it cannot read control-plane status.
- **Modal** uses `/bin/sh` for commands and `head -c` for bounded file reads. The SDK supplies the filesystem write operation. Disconnecting releases the local handle. A command already submitted can continue until its provider deadline, and an in-flight write can finish.
