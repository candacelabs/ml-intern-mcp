---
name: ml-intern
description: Use HuggingChat's ML Intern Hub tools from Codex for paper reproductions, model and dataset inspection, training runs, evaluations, and requested Hub artifacts.
---

Use the local `ml_intern` MCP server. Codex owns the conversation, the scripts in the user's workspace, and the experiment.

- For a paper, read its methods and check the linked model, dataset, and published metric. The Hub filesystem exposes paper metadata and full text. For example, `hf_fs` takes `{"operations":[{"cmd":"cat","args":["hf://papers/1810.04805/paper.md","--max-bytes","5000"]}]}`. For batched reads, check each entry in `structuredContent.results`.
- For a model or dataset, use `hub_repo_details` for the card, splits, or a row preview. Use `hf_fs` to read the exact config, code, or revision the experiment depends on.
- Keep training and evaluation scripts in the workspace. Match the paper's split, baseline, and metric when reproducing a result. Smoke-test a small sample before scaling. With local compute requested, execute the script locally.
- For Hub compute, `hf_whoami` reports the identity used by this server. A local `hf auth login` followed by an MCP reload enables the authenticated catalog. Consult `hf_jobs` with `{"operation":"uv","args":{"help":true}}` for the installed submission schema. Use the user's compute budget and an explicit hardware flavor and timeout. HuggingChat's conversation budget lives in its web app. Account for the full timeout and any earlier submissions when working within a stated limit.
- Record the job ID from submission. Inspect that ID and its logs when checking progress or recovering an interrupted task. Confirm the terminal status and read back requested outputs or checkpoints. Report the observed metric, revision, and location of the artifact.
