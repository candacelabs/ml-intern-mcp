import ts from 'typescript';
import { z } from 'zod';

// Keep every wire field. The SDK's typed listTools() strips unknown tool metadata.
const pageSchema = z.object({
  tools: z.array(z.looseObject({ name: z.string().min(1) })),
  nextCursor: z.string().min(1).optional(),
});

export async function listWireTools(client, signal) {
  const tools = [];
  const cursors = new Set();
  let cursor;
  do {
    const page = await client.request({
      method: 'tools/list', params: cursor === undefined ? {} : { cursor },
    }, pageSchema, { signal });
    tools.push(...page.tools);
    cursor = page.nextCursor;
    if (cursor !== undefined && cursors.has(cursor)) throw new Error('Repeated tools/list cursor');
    cursors.add(cursor);
  } while (cursor !== undefined);
  return tools;
}

export function byName(tools) {
  const catalog = Object.create(null);
  for (const tool of tools) {
    if (Object.hasOwn(catalog, tool.name)) throw new Error(`Duplicate tool ${tool.name}`);
    catalog[tool.name] = tool;
  }
  return catalog;
}

// Tool order and object key order do not affect discovery. Preserve all nested
// array order and report JSON Pointers so a change can be located in a big schema.
export function differences(expected, actual, path = '') {
  if (expected === actual) return [];
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object'
      && Array.isArray(expected) === Array.isArray(actual)) {
    const changes = [];
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of [...keys].sort()) {
      const field = path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1');
      if (!Object.hasOwn(expected, key)) changes.push(`added ${field}`);
      else if (!Object.hasOwn(actual, key)) changes.push(`removed ${field}`);
      else changes.push(...differences(expected[key], actual[key], field));
    }
    return changes;
  }
  const preview = value => {
    const json = JSON.stringify(value);
    return json.length <= 100 ? json : json.slice(0, 97) + '…';
  };
  return [`changed ${path || '/'} (${preview(expected)} → ${preview(actual)})`];
}

// Read the URL actually registered in the current Chat UI preset. Parse the
// upstream TypeScript as data and resolve only string literals and templates.
export function chatPresetUrl(source) {
  const file = ts.createSourceFile('mlAssistant.ts', source, ts.ScriptTarget.Latest);
  const declarations = new Map();
  for (const statement of file.statements.filter(ts.isVariableStatement)) {
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) declarations.set(decl.name.text, decl.initializer);
    }
  }
  function stringValue(expr, seen = new Set()) {
    if (expr && ts.isStringLiteralLike(expr)) return expr.text;
    if (expr && ts.isIdentifier(expr) && !seen.has(expr.text)) {
      return stringValue(declarations.get(expr.text), new Set([...seen, expr.text]));
    }
    if (expr && ts.isTemplateExpression(expr)) {
      return expr.head.text + expr.templateSpans.map(span =>
        stringValue(span.expression, seen) + span.literal.text).join('');
    }
    throw new Error('Could not resolve the Hugging Face URL in HuggingChat’s ML Intern preset');
  }
  const servers = declarations.get('ML_ASSISTANT_MCP_SERVERS');
  if (servers && ts.isArrayLiteralExpression(servers)) {
    for (const entry of servers.elements.filter(ts.isObjectLiteralExpression)) {
      const field = name => entry.properties.find(p => ts.isPropertyAssignment(p) && p.name.text === name)?.initializer;
      const name = field('name');
      if (name && stringValue(name) === 'Hugging Face') return new URL(stringValue(field('url')));
    }
  }
  throw new Error('Could not find HuggingChat’s Hugging Face entry in ML_ASSISTANT_MCP_SERVERS');
}
