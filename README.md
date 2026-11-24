# ML Intern MCP

A standalone stdio MCP server for Codex and other MCP clients. It runs the same Hub tool handlers that HuggingChat selects with the `intern` preset. The client supplies the model and the agent loop. Cloud Jobs and sandboxes run on Hugging Face. [HuggingChat preset](https://github.com/huggingface/chat-ui/blob/7fc0f672685331f11317a448f24c1c66b64894c6/src/lib/server/mlAssistant.ts) · [Hub tool selection](https://github.com/huggingface/hf-mcp-server/blob/df77feaa49795d7fd11dc472f4fa067e7bd2f542/packages/app/src/shared/bouquet-presets.ts)

## Contract and generated bindings

[openapi.yaml](openapi.yaml) describes the hosted `POST /mcp` JSON-RPC protocol and the equivalent stdio messages. Its `x-mcp-tools` section identifies each tool's input, structured output when available, and anonymous visibility. It also records the argument schemas for 15 Jobs operations.

Use Node 22.14 or newer to install dependencies, generate client and server stubs from the YAML, and run the contract tests.

```sh
npm ci
npm run generate
npm test
```

Pass a connected MCP SDK client to the generated JavaScript binding. TypeScript declarations ship alongside it. [Generated bindings](generated/)

```js
import { createMlInternClient } from './generated/tools.mjs';

const hub = createMlInternClient(client);
const result = await hub.hf_fs({
  operations: [{ cmd: 'cat', args: ['hf://models/google-bert/bert-base-uncased/config.json'] }],
});
```

The local server uses the generated tool catalog to select the pinned Hugging Face implementations. Other implementations can supply handlers to `registerMlInternTools`. To compare the YAML with the pinned upstream package, run `npm run capture -- --check`. To refresh the snapshot after updating the dependency, run `npm run capture`, review the YAML diff, and regenerate.

## Use with Codex

Register the server and the workflow skill from the checkout after installing dependencies.

```sh
codex mcp add ml_intern -- "$(command -v node)" "$PWD/server.mjs"
mkdir -p "$HOME/.agents/skills"
ln -s "$PWD/skills/ml-intern" "$HOME/.agents/skills/ml-intern"
```

Open a new Codex session and ask **“Use $ml-intern to read the BERT paper and verify its base configuration against the checkpoint.”** Codex discovers the registered tools through `tools/list` and sends the selected name and arguments via `tools/call`. The skill guides selection when other Hub integrations are also installed.

| Access | Tools available |
| --- | --- |
| Public | `hf_whoami`, `hf_fs`, `hub_repo_details` |
| With a Hub credential | All public tools plus `hf_fs_write`, `create_repo`, `hf_jobs`, `hf_sandbox`, `hf_sandbox_exec`, `hf_sandbox_fs` |

Run `hf auth login` and reconnect to load the authenticated catalog. The server reads the active CLI credential at startup. Alternatively, supply `HF_TOKEN` to the server process. For Codex, add `env_vars = ["HF_TOKEN"]` under `[mcp_servers.ml_intern]` to pass the variable by name. Hub permissions determine which operations your credential can perform.

HuggingChat implements its per-conversation spend limit, background poller, and dashboard in the web app. This server exposes the underlying Hub tools. In Codex, a paid run uses the chosen account, hardware, and timeout. [HuggingChat ML Intern architecture](https://huggingface.co/docs/chat-ui/ml-intern/local-development)

The contract and bindings contain tool and protocol definitions from Hugging Face and the MCP TypeScript SDK. Their accompanying licenses are in [notices/](notices/).
