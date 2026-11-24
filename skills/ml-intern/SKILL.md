---
name: ml-intern
description: Use HuggingChat's ML Intern Hub tools from Codex for paper reproductions, model and dataset inspection, training runs, evaluations, and requested Hub artifacts.
---

Use the connected Hugging Face app for identity, Jobs, private Hub data, and other account operations it advertises. Use its `hf_whoami` for account questions and its `hf_jobs` for the entire job lifecycle. The local `ml_intern.hf_fs` tool supplements the app with public file and paper reads.

- For a paper, read its methods and check the linked model, dataset, and published metric. The Hub filesystem exposes paper metadata and full text. For example, `hf_fs` takes `{"operations":[{"cmd":"cat","args":["hf://papers/1810.04805/paper.md","--max-bytes","5000"]}]}`. For batched reads, check each entry in `structuredContent.results`.
- For a model or dataset, use the connected app's `hub_repo_details` for the card, splits, or a row preview. Use `hf_fs` to read a public config, file, or revision.
- Keep training and evaluation scripts in the workspace. Match the paper's split, baseline, and metric when reproducing a result. Smoke-test a small sample before scaling. With local compute requested, execute the script locally.
- Consult the connected app's `hf_jobs` with `{"operation":"uv","args":{"help":true}}` for submission arguments. Use the user's compute budget and an explicit hardware flavor and timeout. Account for the full timeout and any earlier submissions when working within a stated limit.
- For a Bring Your Own Sandbox (BYOS) request, use the configured MCP that advertises `sandbox_status`, `sandbox_exec`, `sandbox_read_file`, and `sandbox_write_file`. Supply the user's `provider` (`hf`, `exe.dev`, or `modal`) and existing `sandboxId` on each call. Check `structuredContent.state` before running a command. Preserve command exit codes and timeouts. The owner controls the sandbox lifecycle. A full Hugging Face preset also exposes its native `hf_sandbox*` tools for dedicated HF Jobs.
- For repository writes, use the authorized connection that advertises `hf_fs_write` or `create_repo`. If a requested tool is unavailable, say which capability is missing.
- Record the job ID from submission. Inspect that ID and its logs when checking progress or recovering an interrupted task. Confirm the terminal status and read back requested outputs or checkpoints. Report the observed metric, revision, and location of the artifact.
