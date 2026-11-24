import { once } from 'node:events';
import { createServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { hostHeaderValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createHubServer, fetchHfWhoami } from './hub.mjs';
import { allProviderHeaders } from './provider-credentials.mjs';

const loopback = ['localhost', '127.0.0.1', '::1'];

function errorResponse(status, message) {
  return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }, { status });
}

export async function startHttp({ host = '127.0.0.1', port = '8787', publicOrigin, publicFiles, byos }) {
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error('--port must be an integer from 0 to 65535');
  const external = publicOrigin === undefined ? undefined : new URL(publicOrigin);
  if (external && (external.protocol !== 'https:' || external.href !== external.origin + '/')) {
    throw new Error('--public-origin must be an HTTPS origin, such as https://mcp.example.com');
  }
  if (!external && !loopback.includes(host)) throw new Error('A non-loopback bind requires --public-origin for the TLS proxy');
  const validateHost = hostHeaderValidation(external ? [external.hostname] : ['localhost', '127.0.0.1', '[::1]']);
  async function dispatch(request, options) {
    const url = new URL(request.url);
    if (url.searchParams.has('bouquet') && url.searchParams.get('bouquet') !== 'intern') {
      return errorResponse(400, 'This endpoint serves the intern preset.');
    }
    const token = publicFiles ? null : request.headers.get('x-hf-token');
    if (!token && url.searchParams.has('login')) return errorResponse(403, 'This request requires a Hugging Face credential.');
    const sandboxCredentials = byos ? {} : undefined;
    const headers = new Headers(request.headers);
    for (const [key, name] of Object.entries(allProviderHeaders)) {
      const value = headers.get(name);
      if (value && /\s|,/.test(value)) return errorResponse(403, `Invalid ${name} header.`);
      if (sandboxCredentials && value) sandboxCredentials[key] = value;
      headers.delete(name);
    }
    for (const key of ['authorization', 'proxy-authorization', 'cookie']) headers.delete(key);
    const protocolRequest = new Request(request, { headers });
    let user;
    if (token) {
      try {
        user = await fetchHfWhoami(token);
      } catch (error) {
        return [401, 403].includes(error.statusCode)
          ? errorResponse(403, 'Hugging Face rejected the supplied Hub credential.')
          : errorResponse(502, 'Could not verify the caller with Hugging Face.');
      }
    }
    const mcp = createMcpHandler(() => createHubServer({ publicFiles, token, user, sandboxCredentials }));
    return mcp.fetch(protocolRequest, options);
  }
  const serve = toNodeHandler({
    async fetch(request, options) {
      const response = await dispatch(request, options);
      response.headers.set('Cache-Control', 'private, no-store, no-transform');
      return response;
    },
  });
  const listener = createServer({ headersTimeout: 15_000, requestTimeout: 60_000 }, (req, res) => {
    if (!validateHost(req, res)) return;
    if (req.headers.origin && req.headers.origin !== (external?.origin ?? 'http://' + req.headers.host)) {
      res.writeHead(403).end('Origin is not allowed.');
      return;
    }
    const path = req.url?.split('?')[0];
    if (path === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"status":"ok"}');
      return;
    }
    if (path !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
    void serve(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  listener.listen(Number(port), host);
  await once(listener, 'listening');
  const address = listener.address();
  const displayHost = address.family === 'IPv6' ? '[' + address.address + ']' : address.address;
  console.error(`ml-intern-mcp listening on http://${displayHost}:${address.port}/mcp`);
  const stop = () => {
    if (!listener.listening) return;
    const deadline = setTimeout(() => listener.closeAllConnections(), 15_000).unref();
    listener.close(() => clearTimeout(deadline));
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
