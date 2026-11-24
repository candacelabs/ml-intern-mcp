# Bring your own sandbox

Each JSON file contains complete MCP tool-call arguments for one provider and the structured results a successful call would return. IDs and results in the files are examples. The runner substitutes the existing sandbox ID you pass on the command line.

| Provider | Request and response examples | What to supply |
| --- | --- | --- |
| Hugging Face | [hf.json](hf.json) | A dedicated Job running HF’s `sbx-server`, and its original `HF_TOKEN`. The adapter uses the public HF Jobs proxy. [Provider guide](https://huggingface.co/docs/huggingface_hub/guides/sandbox) |
| exe.dev | [exe-dev.json](exe-dev.json) | An existing VM name and `EXE_TOKEN` with `ssh <vm-name>` permission. Metadata access with `ls` is optional. The adapter uses the exe.dev HTTPS API. [Provider guide](https://exe.dev/docs/https-api-run-on-vm) |
| Modal | [modal.json](modal.json) | An existing `sb-…` ID and its workspace’s `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`. The adapter connects through the public Modal JavaScript SDK. [Provider guide](https://modal.com/docs/sdk/js/latest) |

From the repository root, choose one command. Supply credentials through the environment or your secret manager.

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

To use a shared server, start `npm run start:http` and append `--url http://127.0.0.1:8787/mcp` to the example command. For a remote deployment use its HTTPS URL. The runner forwards only the chosen provider’s credentials and an optional `ML_INTERN_PROXY_TOKEN` for your gateway. To use the same endpoint from Codex, add the relevant entries to `~/.codex/config.toml`. [Codex configuration](codex.toml)

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
