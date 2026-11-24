import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { byName, chatPresetUrl, differences, listWireTools } from '../scripts/drift.mjs';

test('discovery order is ignored and added, removed and changed fields are located', () => {
  const file = { name: 'file', inputSchema: { properties: { 'a/b~c': { type: 'string' } } } };
  const job = { name: 'job', annotations: { readOnlyHint: true } };
  assert.deepEqual(differences(byName([file, job]), byName([job, { inputSchema: file.inputSchema, name: 'file' }])), []);
  const changed = structuredClone(file);
  changed.inputSchema.properties['a/b~c'].type = 'integer';
  changed.extraMetadata = true;
  assert.deepEqual(differences(byName([file, job]), byName([changed, { name: 'sandbox' }])), [
    'added /file/extraMetadata',
    'changed /file/inputSchema/properties/a~1b~0c/type ("string" → "integer")',
    'removed /job',
    'added /sandbox',
  ]);
  assert.ok(differences(['a', 'b'], ['b', 'a']).length);
  assert.ok(differences({}, []).length);
  assert.throws(() => byName([file, file]), /Duplicate tool file/);
});

test('wire discovery preserves new metadata across pages and rejects a repeated cursor', async () => {
  const pages = [
    { tools: [{ name: 'a', newField: { extra: true } }], nextCursor: 'second' },
    { tools: [{ name: 'b' }] },
  ];
  const params = [];
  const client = { async request(request, schema) {
    assert.equal(request.method, 'tools/list');
    params.push(request.params);
    return schema.parse(pages[params.length - 1]);
  } };
  assert.deepEqual(await listWireTools(client), [...pages[0].tools, ...pages[1].tools]);
  assert.deepEqual(params, [{}, { cursor: 'second' }]);
  pages[1].nextCursor = 'second';
  params.length = 0;
  await assert.rejects(listWireTools(client), /Repeated tools\/list cursor/);
});

test('the check follows the URL registered for Hugging Face in the Chat UI preset', () => {
  const source = [
    'const preset = "intern";',
    'const url = `https://huggingface.co/mcp?login&bouquet=${preset}`;',
    'export const ML_ASSISTANT_MCP_SERVERS = [{name: "Hugging Face", url: url}];',
  ].join('\n');
  assert.equal(chatPresetUrl(source).searchParams.get('bouquet'), 'intern');
  assert.equal(chatPresetUrl(source.replace('"intern"', '"other"')).searchParams.get('bouquet'), 'other');
  assert.throws(() => chatPresetUrl(source.replace('url: url', 'url: loadConfig()')), /Could not resolve/);
  assert.throws(() => chatPresetUrl('// ' + source.replaceAll('\n', ' ')), /Could not find/);
});

test('the drift CLI fails on a changed wire field and distinguishes an unavailable service', () => {
  const args = ['--import', new URL('./fixtures/drift.mjs', import.meta.url).href,
    fileURLToPath(new URL('../scripts/check-drift.mjs', import.meta.url))];
  for (const [scenario, status, diagnostic] of [
    ['changed', 1, /added \/hf_fs\/newWireField/],
    ['unavailable', 2, /Drift check incomplete: .*503/],
  ]) {
    const run = spawnSync(process.execPath, args, {
      encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, DRIFT_FIXTURE: scenario, HF_TOKEN: 'unused-test-credential' },
    });
    assert.ifError(run.error);
    assert.equal(run.status, status, run.stderr);
    assert.match(run.stderr, diagnostic);
  }
});
