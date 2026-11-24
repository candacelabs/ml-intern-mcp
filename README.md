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

## Drift checks

Run `npm run check:drift` after `npm ci` to compare this checkout with the current upstream contract.

- The live check reads the Hub MCP URL registered by HuggingChat, lists every page of the public `intern` catalog, and compares all tool fields with the generated OpenAPI catalog. A mismatch prints the affected tool and field as a JSON Pointer.
- The checker starts the Codex `--public-files` server, verifies its advertised tool, and compares a public BERT config read with the hosted response at the same immutable model revision.
- The signed-in catalog uses the pinned upstream package and a synthetic identity offline. This covers all nine tools and 15 Jobs operation schemas. A change to the hosted server version also fails the check so changes confined to signed-in tools get reviewed.

The check runs without a Hugging Face credential. It exits nonzero on drift or when an upstream service is unavailable. Review the reported difference before updating the pin or regenerating bindings.

## Use with Codex

Use the Hugging Face app already connected to Codex for account identity, Jobs and other account operations. Register the local server alongside it for public file and paper reads.

```sh
codex mcp add ml_intern -- "$(command -v node)" "$PWD/server.mjs" --public-files
mkdir -p "$HOME/.agents/skills"
ln -s "$PWD/skills/ml-intern" "$HOME/.agents/skills/ml-intern"
```

Open a new Codex session and ask **“Use $ml-intern to check which Hugging Face account I’m using and read the BERT checkpoint configuration.”** Codex routes the identity query to the connected app's `hf_whoami` and the public file read to the local `hf_fs`. The public-files process uses anonymous Hub access. The app authorizes its own calls with the existing connection. Its advertised tools determine which account operations Codex can use.

## Standalone MCP clients

Running `node server.mjs` directly exposes the upstream preset. Independent MCP hosts can supply a Hub credential to their server process using `HF_TOKEN`. The tool catalog follows the credential available to that process.

| Access | Tools available |
| --- | --- |
| Public | `hf_whoami`, `hf_fs`, `hub_repo_details` |
| With a Hub credential | All public tools plus `hf_fs_write`, `create_repo`, `hf_jobs`, `hf_sandbox`, `hf_sandbox_exec`, `hf_sandbox_fs` |

HuggingChat implements its per-conversation spend limit, background poller, and dashboard in the web app. This server exposes the underlying Hub tools. In Codex, a paid run uses the chosen account, hardware, and timeout. [HuggingChat ML Intern architecture](https://huggingface.co/docs/chat-ui/ml-intern/local-development)

The contract and bindings contain tool and protocol definitions from Hugging Face and the MCP TypeScript SDK. Their accompanying licenses are in [notices/](notices/).
