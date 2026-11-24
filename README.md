# ML Intern MCP

Use HuggingChat’s ML Intern Hub tools from Codex or another MCP client. Read papers and checkpoints, inspect datasets, run Hub Jobs, and work inside a sandbox across multiple tool calls. Your client supplies the model and agent loop. This server runs Hugging Face’s pinned `intern` tool handlers. [HuggingChat preset](https://github.com/huggingface/chat-ui/blob/7fc0f672685331f11317a448f24c1c66b64894c6/src/lib/server/mlAssistant.ts) · [Hub tools](https://github.com/huggingface/hf-mcp-server/blob/df77feaa49795d7fd11dc472f4fa067e7bd2f542/packages/app/src/shared/bouquet-presets.ts)

**BYOS means Bring Your Own Sandbox.** The built-in backend connects to a dedicated Hugging Face sandbox, an HF Job running Hugging Face’s `sbx-server`. Supply its handle to reconnect from multiple clients and work with the same files. Hugging Face hosts the compute, and you control its lifetime and billing. Other sandbox providers need their own tool handlers. [Hugging Face sandbox guide](https://huggingface.co/docs/huggingface_hub/guides/sandbox)

## Run the server

With Node.js 22.14 or newer installed, clone the private repository and install its locked runtime dependencies.

```sh
git clone git@github.com:candacelabs/ml-intern-mcp.git
cd ml-intern-mcp
npm ci --omit=dev
node server.mjs --http
```

The shared **Streamable HTTP** endpoint is `http://127.0.0.1:8787/mcp`. To check that it is listening, run `curl -fsS http://127.0.0.1:8787/healthz`. For a **stdio** client, configure the absolute paths to `node` and `server.mjs` as its command and argument. The client starts one subprocess. Run `node server.mjs --help` for listener options.

| Server mode | Tools advertised |
| --- | --- |
| `--public-files`, on either transport | `hf_fs` for public files and papers |
| Full server, anonymous caller | `hf_fs`, `hub_repo_details`, `hf_whoami` |
| Full server, verified Hub credential | All three public tools plus `hf_fs_write`, `create_repo`, `hf_jobs`, `hf_sandbox`, `hf_sandbox_exec`, `hf_sandbox_fs` |

## Work with an existing sandbox

Replace `NAMESPACE/JOB_ID` in the examples with your own dedicated sandbox handle. The canonical form `hfsb2:NAMESPACE:JOB_ID` also works. Supply the same Hub credential used to create the sandbox. Hugging Face uses it to derive the sandbox access key. An ordinary Hub Job ID alone is insufficient. [Upstream handle and credential handling](https://github.com/huggingface/hf-mcp-server/blob/df77feaa49795d7fd11dc472f4fa067e7bd2f542/packages/mcp/src/sandbox-tool.ts#L94-L165)

With the owner’s `HF_TOKEN` available in your environment, set `SANDBOX_HANDLE` to the existing handle and run the probe.

```sh
npm run check:sandbox -- --url http://127.0.0.1:8787/mcp "$SANDBOX_HANDLE"
```

The probe checks sandbox health, runs `printf ml-intern-ok`, and inspects the root directory. It exits nonzero if any step fails. Omit `--url` to run the same check through stdio. Provisioning, file writes, and termination are separate tool calls.

| Task | Tool | Example arguments |
| --- | --- | --- |
| Check readiness | `hf_sandbox` | `{"cmd":"status","args":["NAMESPACE/JOB_ID"]}` |
| Run a command | `hf_sandbox_exec` | `{"cmd":"exec","args":["NAMESPACE/JOB_ID","pwd"]}` |
| Read a file | `hf_sandbox_fs` | `{"cmd":"cat","args":["NAMESPACE/JOB_ID","/etc/os-release"]}` |

Each exec call starts a shell for one command and returns stdout, stderr, and an exit code. Files and detached processes belong to the sandbox. There is no terminal-attach tool. The full server also exposes explicit create and terminate operations. HuggingChat’s conversation spend limit and dashboard live in the web app. [Sandbox command interface](https://github.com/huggingface/hf-mcp-server/blob/df77feaa49795d7fd11dc472f4fa067e7bd2f542/packages/mcp/src/sandbox-tool.ts#L1247-L1270) · [ML Intern architecture](https://huggingface.co/docs/chat-ui/ml-intern/local-development)

## Connect Codex

**Using your existing Hugging Face app connection.** Start the HTTP server with `node server.mjs --http --public-files`. In another shell in the same checkout, register the endpoint and link the skill.

```sh
codex mcp add ml_intern --url http://127.0.0.1:8787/mcp
mkdir -p "$HOME/.agents/skills"
test -e "$HOME/.agents/skills/ml-intern" || ln -s "$PWD/skills/ml-intern" "$HOME/.agents/skills/ml-intern"
```

In a new Codex session, ask **“Use $ml-intern to check my Hugging Face account and read the BERT checkpoint config.”** The skill routes identity and Jobs to your connected app and the public file read to this server. For the same pairing over stdio, register `codex mcp add ml_intern -- "$(command -v node)" "$PWD/server.mjs" --public-files`.

**Connecting to a full BYOS server.** A standalone client supplies its own sandbox credential. For HTTP, send it in `X-HF-Token` on each request. For stdio, pass `HF_TOKEN` in the child process environment. In Codex, the following entry in `~/.codex/config.toml` reads the credential from the environment.

```toml
[mcp_servers.ml_intern_byos]
url = "https://mcp.example.com/mcp"
env_http_headers = { "X-HF-Token" = "HF_TOKEN" }
```

## Deploy a shared endpoint

Run the server behind your authenticated TLS reverse proxy. Set the public origin to the address clients use, and configure the proxy to preserve `Host`, `Origin`, and streaming responses.

```sh
node server.mjs --http --host 127.0.0.1 --port 8787 --public-origin https://mcp.example.com
```

For a proxy in another container, bind the server to its private network interface and restrict direct access to the backend port. The listener checks the host and browser origin. Your proxy owns gateway access and the `Authorization` header. HTTP tool calls use only the caller’s `X-HF-Token`, verified with Hugging Face per request. Exclude that header from proxy logs. A proxy that supplies it on behalf of users must overwrite any incoming value with that user’s credential. For a gateway with bearer authentication, the sandbox probe can read its gateway token from `ML_INTERN_PROXY_TOKEN`.

`GET /healthz` reports listener health. The sandbox probe checks provider connectivity. SIGTERM stops accepting new connections and gives active HTTP requests up to 15 seconds to drain. The sandbox remains under its owner’s control when the MCP process stops.

## Contract and verification

`openapi.yaml` describes the upstream hosted JSON-RPC interface, tool schemas, and Jobs operations. Its `x-mcp-local-http` section records this server’s routes and Hub credential header. Both transports use the same tool definitions. To embed the tools in your own client, pass a connected MCP SDK client to `createMlInternClient`. To supply your own backend handlers, use `registerMlInternTools`. [OpenAPI contract](openapi.yaml) · [Generated bindings](generated/)

From a development checkout, install the full dependency set with `npm ci`.

| Command | What it checks |
| --- | --- |
| `npm test` | Generated bindings and types, real stdio and HTTP clients, concurrent caller isolation, and sandbox calls against a simulated Hub and sandbox service |
| `npm run check:drift` | HuggingChat’s current preset, live public schemas and a pinned BERT file read, plus all nine tool schemas and 15 Jobs operations from the pinned package using an offline identity |
| `npm run check:sandbox -- HANDLE` | An operator-supplied running sandbox, using the operator’s credential |

After updating the upstream pin, run `npm run capture`, review the OpenAPI diff, then run `npm run generate` and the checks above. [Upstream licenses](notices/)
