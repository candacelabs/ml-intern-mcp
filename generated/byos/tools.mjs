// Generated from byos.openapi.yaml by npm run generate.
import { fromJsonSchema } from '@modelcontextprotocol/server';
import catalog from './catalog.json' with { type: 'json' };

export function listByosTools(authenticated = false) {
  const tools = authenticated ? catalog.tools : catalog.tools.filter(tool => catalog.anonymous.includes(tool.name));
  return structuredClone(tools);
}

export function createByosClient(client) {
  return Object.fromEntries(catalog.tools.map(tool => [
    tool.name,
    (args = {}, options) => client.callTool(
      { name: tool.name, arguments: args },
      { toolDefinition: tool, ...options },
    ),
  ]));
}

export function registerByosTools(server, handlers, authenticated = false) {
  const tools = listByosTools(authenticated);
  for (const { name } of tools) {
    if (typeof handlers[name] !== 'function') throw new Error('Missing handler for ' + name);
  }
  for (const { name, inputSchema, outputSchema, ...metadata } of tools) {
    server.registerTool(name, {
      ...metadata,
      inputSchema: fromJsonSchema(inputSchema),
      ...(outputSchema && { outputSchema: fromJsonSchema(outputSchema) }),
    }, handlers[name]);
  }
}
