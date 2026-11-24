import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, rmSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { providerHeaders } from './provider-credentials.mjs';

const [client, command, ...profiles] = process.argv.slice(2);
const filesOnly = profiles.length === 1 && profiles[0] === 'public-files';
const name = filesOnly ? 'ml-intern-files' : 'ml-intern';
const args = [filesOnly ? '--public-files' : '--byos'];
const keys = filesOnly ? [] : [...new Set(profiles.flatMap(provider => {
  if (!Object.hasOwn(providerHeaders, provider)) throw new Error('Unknown provider: ' + provider);
  return Object.keys(providerHeaders[provider]);
}))].sort();

function run(exe, argv) {
  const result = spawnSync(exe, argv, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(exe + ' registration failed.');
}

async function registerCodex() {
  // Use Codex's config writer so env_vars can forward names without saving token values.
  const child = spawn('codex', ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const messages = createInterface({ input: child.stdout });
  const reader = messages[Symbol.asyncIterator]();
  const timer = setTimeout(() => child.kill(), 20000);
  const send = packet => child.stdin.write(JSON.stringify(packet) + '\n');
  async function request(id, method, params) {
    send({ jsonrpc: '2.0', id, method, params });
    for (;;) {
      const line = await reader.next();
      if (line.done) throw new Error('Codex exited before it acknowledged ' + method);
      const response = JSON.parse(line.value);
      if (response.id !== id) continue;
      if (response.error) throw new Error(response.error.message);
      return;
    }
  }
  try {
    await request(1, 'initialize', { clientInfo: { name: 'ml-intern-installer', version: '1' }, capabilities: {} });
    send({ jsonrpc: '2.0', method: 'initialized' });
    await request(2, 'config/value/write', { keyPath: 'mcp_servers.' + name, mergeStrategy: 'replace',
      value: { command, args, env_vars: keys } });
  } finally {
    clearTimeout(timer);
    messages.close();
    child.kill();
  }
}

function registerCopilot() {
  const env = Object.fromEntries(keys.map(key => [key, '${' + key + '}']));
  const previous = spawnSync('copilot', ['mcp', 'get', name, '--json'], { encoding: 'utf8' });
  if (previous.status === 0) {
    const entry = JSON.parse(previous.stdout)[name];
    if (entry?.source !== 'user' || entry.command !== command || JSON.stringify(entry.args) !== JSON.stringify(args)) {
      throw new Error('Copilot already has a different ' + name + ' entry. Choose which server to keep in its MCP settings.');
    }
    if (keys.every(key => entry.env?.[key] === env[key])) return;
    // Copilot CLI exposes add and remove. Update our existing entry in place to
    // retain unrelated servers, approval settings, and prior provider mappings.
    const file = realpathSync(join(process.env.COPILOT_HOME || join(homedir(), '.copilot'), 'mcp-config.json'));
    const original = readFileSync(file, 'utf8');
    const config = JSON.parse(original);
    const owned = config.mcpServers?.[name];
    if (owned?.command !== command || JSON.stringify(owned.args) !== JSON.stringify(args)) throw new Error('Copilot configuration has changed. Retry the install.');
    owned.env = { ...owned.env, ...env };
    const temporary = file + '.' + randomUUID();
    try {
      writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      if (readFileSync(file, 'utf8') !== original) throw new Error('Copilot configuration has changed. Retry the install.');
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
    return;
  }
  const options = Object.entries(env).flatMap(([key, ref]) => ['--env', key + '=' + ref]);
  run('copilot', ['mcp', 'add', name, ...options, '--', command, ...args]);
}

try {
  if (client === 'codex') await registerCodex();
  else if (client === 'copilot') registerCopilot();
  else if (client === 'vscode') {
    const env = Object.fromEntries(keys.map(key => [key, '${env:' + key + '}']));
    run('code', ['--add-mcp', JSON.stringify({ name, type: 'stdio', command, args, env })]);
  } else throw new Error('Choose codex, copilot or vscode.');
  console.log('Registered ' + name + ' for ' + client + '.');
} catch (error) {
  console.error('ml-intern-mcp:', error.message);
  process.exitCode = 1;
}
