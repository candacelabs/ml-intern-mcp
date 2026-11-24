# Bring your own sandbox

Each JSON file contains complete MCP tool-call arguments for one provider and the structured results a successful call would return. IDs and results in the files are examples. The runner substitutes the existing sandbox ID you pass on the command line.

| Provider | Request and response examples | What to supply |
| --- | --- | --- |
| Hugging Face | [hf.json](hf.json) | A dedicated Job running HF’s `sbx-server`, and its original `HF_TOKEN`. The adapter uses the public HF Jobs proxy. [Provider guide](https://huggingface.co/docs/huggingface_hub/guides/sandbox) |
| exe.dev | [exe-dev.json](exe-dev.json) | An existing VM name and `EXE_TOKEN` with `ssh <vm-name>` permission. Metadata access with `ls` is optional. The adapter uses the exe.dev HTTPS API. [Provider guide](https://exe.dev/docs/https-api-run-on-vm) |
| Modal | [modal.json](modal.json) | An existing `sb-…` ID and its workspace’s `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`. The adapter connects through the public Modal JavaScript SDK. [Provider guide](https://modal.com/docs/sdk/js/latest) |

For Hugging Face, combine the Job namespace with the existing Python `Sandbox.id`, for example `example-team/0123456789abcdef01234567`. For exe.dev, use the VM name. For Modal, copy the existing JavaScript `Sandbox.sandboxId` or Python `Sandbox.object_id`. [Hugging Face sandbox lifecycle](https://huggingface.co/docs/huggingface_hub/guides/sandbox#lifecycle) · [Referencing a Modal Sandbox](https://modal.com/docs/guide/sandboxes#referencing-sandboxes-from-other-code)

These scripts are for a development checkout. To install the server into your client, use the [shell installer](../README.md#install). From the repository root, choose one command. Supply credentials through the environment or your secret manager.

```sh
node examples/run.mjs hf "$HF_SANDBOX_ID"
node examples/run.mjs exe.dev "$EXE_VM"
node examples/run.mjs modal "$MODAL_SANDBOX_ID"
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

A team running its own HTTPS endpoint can register its URL directly. Replace the example domain with your server’s address. For a local source checkout, `npm run start:http` listens at `http://127.0.0.1:8787/mcp`.

```sh
copilot mcp add --transport http ml-intern https://mcp.example.com/mcp
codex mcp add ml_intern_byos --url https://mcp.example.com/mcp
```

For sandbox calls, add the headers for your chosen provider. The example profiles forward environment variables for an existing exe.dev VM in Copilot CLI and VS Code. The Codex example lists mappings for all three providers. [Copilot CLI configuration](copilot-http.json) · [VS Code configuration](vscode-http.json) · [Codex configuration](codex.toml)

For Copilot CLI, merge the `mcpServers` entry into `~/.copilot/mcp-config.json`. For VS Code, merge the `servers` entry into `.vscode/mcp.json` or your user MCP configuration. Use `~/.codex/config.toml` for Codex. [GitHub Copilot CLI documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) · [VS Code MCP configuration](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)

To run a provider example through the endpoint, append `--url URL`. The runner forwards the chosen provider’s credentials and an optional `ML_INTERN_PROXY_TOKEN` for your gateway.

## File examples

Add `--read-path /path/to/file` to print a bounded UTF-8 prefix of an existing file. To exercise the `fileCalls` pair, pass `--write-path` with a scratch path you own. The runner replaces that file with `hello\n`, reads it back, and checks the contents. The six bytes remain in the sandbox.

```sh
node examples/run.mjs modal "$MODAL_SANDBOX_ID" --write-path /tmp/ml-intern-example.txt
```

The portable API operates on existing sandboxes and exposes status, command execution, UTF-8 reads, and UTF-8 writes. Each tool takes a `provider` and `sandboxId`. Provider errors set MCP `isError`. A completed shell command returns its own `exitCode` and `timedOut` fields. [Full input/output spec](../byos.openapi.yaml) · [TypeScript client declarations](../generated/byos/tools.d.mts)

## Runtime requirements

- **Hugging Face** accepts `namespace/job-id` or `hfsb2:namespace:job-id` for dedicated sandboxes on the public HF Jobs proxy. The workload receives the original Hub token. Before contacting it, the adapter checks the caller’s Hub user ID against the Job’s owner and creator. For a Job in an organization, the caller must be its recorded creator. [Hugging Face sandbox authentication](https://huggingface.co/docs/huggingface_hub/concepts/sandbox#authentication-is-stateless)
- **exe.dev** uses `/bin/sh` and GNU coreutils in the guest, including `timeout`, `base64`, `head`, and `mv`. Commands with stdin can use temporary files in `/tmp`. File writes stage in the destination’s existing writable parent directory. A VM-scoped key can prove readiness by executing `true` when it cannot read control-plane status.
- **Modal** uses `/bin/sh` for commands and `head -c` for bounded file reads. The SDK supplies the filesystem write operation. Disconnecting releases the local handle. A command already submitted can continue until its provider deadline, and an in-flight write can finish.
