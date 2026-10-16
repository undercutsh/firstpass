// node:test coverage for the read-only MCP server (site/api/mcp.js and its
// protocol core, ./mcp.js). Lives under _lib/ so Vercel never deploys it.
// Run with: node --test 'site/api/**/*.test.js'
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import * as data from './data.js';
import { TOOLS, SUPPORTED_VERSIONS, SERVER_INFO } from './mcp.js';
import handler, { isAllowedOrigin, MAX_BODY_BYTES } from '../mcp.js';

const MODERN = '2026-07-28';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(chunk) { this.body = chunk === undefined ? undefined : String(chunk); },
    get json() { return this.body === undefined ? undefined : JSON.parse(this.body); },
  };
}

// Vercel-style request: body already present as a string or parsed value.
async function post(body, headers = {}, { method = 'POST', raw = false } = {}) {
  const req = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body),
  };
  const res = mockRes();
  await handler(req, res);
  return res;
}

// Plain-Node request: the body is a stream the handler must read itself.
async function postStream(text, headers = {}) {
  const req = Readable.from([Buffer.from(text)]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json', ...headers };
  const res = mockRes();
  await handler(req, res);
  return res;
}

const legacyHeaders = (v = '2025-11-25') => ({ 'mcp-protocol-version': v });

function modern(method, params = {}, id = 1) {
  const body = {
    jsonrpc: '2.0', id, method,
    params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN, 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '0' } } },
  };
  const headers = { 'mcp-protocol-version': MODERN, 'mcp-method': method };
  if (method === 'tools/call') headers['mcp-name'] = params.name;
  return [body, headers];
}

const legacyCall = (name, args, id = 1) => post({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, legacyHeaders());

describe('HTTP layer', () => {
  test('OPTIONS preflight: 204 with open CORS and the MCP headers allowed', async () => {
    const res = await post(undefined, { origin: 'https://inspector.example' }, { method: 'OPTIONS' });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.match(res.headers['access-control-allow-headers'], /MCP-Protocol-Version/);
    assert.match(res.headers['access-control-allow-headers'], /Mcp-Name/);
    assert.equal(res.headers.allow, 'POST, OPTIONS');
  });

  for (const method of ['GET', 'DELETE', 'PUT', 'HEAD']) {
    test(`${method} -> 405 with Allow (no SSE stream, no sessions)`, async () => {
      const res = await post(undefined, {}, { method });
      assert.equal(res.statusCode, 405);
      assert.equal(res.headers.allow, 'POST, OPTIONS');
    });
  }

  test('Origin validation: invalid origins get 403 before anything else', async () => {
    for (const origin of ['null', 'http://evil.example', 'file://', 'not a url', 'https://ok.example/path']) {
      const res = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin });
      assert.equal(res.statusCode, 403, origin);
      assert.equal(res.json.id, undefined, 'error response has no id');
    }
    assert.ok(isAllowedOrigin(undefined));
    assert.ok(isAllowedOrigin('https://claude.ai'));
    assert.ok(isAllowedOrigin('http://localhost:6274'));
    assert.ok(isAllowedOrigin('http://127.0.0.1:3000'));
    assert.ok(!isAllowedOrigin('http://192.168.1.10'));
  });

  test('never issues a session id', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
    assert.equal(res.headers['mcp-session-id'], undefined);
  });

  test('non-JSON content type -> 415; oversized body -> 413', async () => {
    assert.equal((await post({}, { 'content-type': 'text/plain' })).statusCode, 415);
    assert.equal((await post({}, { 'content-length': String(MAX_BODY_BYTES + 1) })).statusCode, 413);
    assert.equal((await postStream(`{"x":"${'a'.repeat(MAX_BODY_BYTES)}"}`)).statusCode, 413);
  });

  test('malformed JSON -> 400 with -32700 and id null (string and stream bodies)', async () => {
    for (const res of [await post('{"jsonrpc":', {}, { raw: true }), await postStream('{nope')]) {
      assert.equal(res.statusCode, 400);
      assert.equal(res.json.error.code, -32700);
      assert.equal(res.json.id, null);
    }
  });

  test('a Vercel body getter that throws on bad JSON is a parse error too', async () => {
    const req = { method: 'POST', headers: { 'content-type': 'application/json' }, get body() { throw new Error('Invalid JSON'); } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error.code, -32700);
  });

  test('stream bodies (plain Node server) work end to end', async () => {
    const res = await postStream(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }), legacyHeaders());
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.id, 7);
    assert.equal(res.json.result.tools.length, TOOLS.length);
  });
});

describe('legacy era (initialize handshake)', () => {
  const init = (protocolVersion) => post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion, capabilities: {}, clientInfo: { name: 'test', version: '0' } } });

  test('initialize echoes a supported legacy version', async () => {
    for (const v of ['2025-11-25', '2025-06-18', '2025-03-26']) {
      const res = await init(v);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
      const r = res.json.result;
      assert.equal(r.protocolVersion, v);
      assert.deepEqual(r.capabilities, { tools: {} });
      assert.equal(r.serverInfo.name, SERVER_INFO.name);
      assert.equal(r.serverInfo.version, SERVER_INFO.version);
      assert.match(r.instructions, /read-only/i);
      assert.equal(r.resultType, undefined);
    }
  });

  test('initialize with an unknown version is offered the latest legacy version', async () => {
    assert.equal((await init('2024-11-05')).json.result.protocolVersion, '2025-11-25');
    assert.equal((await init('2099-01-01')).json.result.protocolVersion, '2025-11-25');
  });

  test('notifications/initialized (and any notification) -> 202, no body', async () => {
    for (const method of ['notifications/initialized', 'notifications/cancelled', 'notifications/whatever']) {
      const res = await post({ jsonrpc: '2.0', method }, legacyHeaders());
      assert.equal(res.statusCode, 202);
      assert.equal(res.body, undefined);
    }
  });

  test('ping -> empty result', async () => {
    const res = await post({ jsonrpc: '2.0', id: 'p', method: 'ping' }, legacyHeaders());
    assert.deepEqual(res.json, { jsonrpc: '2.0', id: 'p', result: {} });
  });

  test('a request with no MCP-Protocol-Version header is served as 2025-03-26', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.result.tools.length, TOOLS.length);
  });

  test('an unsupported MCP-Protocol-Version header -> 400 -32022 listing supported versions', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, legacyHeaders('2024-11-05'));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error.code, -32022);
    assert.deepEqual(res.json.error.data, { supported: SUPPORTED_VERSIONS, requested: '2024-11-05' });
  });

  test('unknown method -> -32601 over HTTP 200 (a legacy 404 would mean "session expired")', async () => {
    const res = await post({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, legacyHeaders());
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.error.code, -32601);
  });
});

describe('modern era (2026-07-28, stateless, no handshake)', () => {
  test('server/discover advertises versions, tools capability, cache hints, serverInfo', async () => {
    const res = await post(...modern('server/discover'));
    assert.equal(res.statusCode, 200);
    const r = res.json.result;
    assert.equal(r.resultType, 'complete');
    assert.deepEqual(r.supportedVersions, SUPPORTED_VERSIONS);
    assert.deepEqual(r.capabilities, { tools: {} });
    assert.equal(r.cacheScope, 'public');
    assert.ok(r.ttlMs > 0);
    assert.equal(r._meta['io.modelcontextprotocol/serverInfo'].name, SERVER_INFO.name);
  });

  test('tools/list works with no prior handshake and carries cache hints', async () => {
    const r = (await post(...modern('tools/list'))).json.result;
    assert.equal(r.resultType, 'complete');
    assert.equal(r.tools.length, TOOLS.length);
    assert.equal(r.cacheScope, 'public');
  });

  test('missing or mismatched MCP-Protocol-Version / Mcp-Method / Mcp-Name -> 400 -32020', async () => {
    const cases = [];
    let [b, h] = modern('tools/list');
    cases.push([b, { ...h, 'mcp-protocol-version': undefined }]);
    cases.push([b, { ...h, 'mcp-protocol-version': '2025-11-25' }]);
    cases.push([b, { ...h, 'mcp-method': undefined }]);
    cases.push([b, { ...h, 'mcp-method': 'tools/call' }]);
    [b, h] = modern('tools/call', { name: 'get_policy', arguments: {} });
    cases.push([b, { ...h, 'mcp-name': undefined }]);
    cases.push([b, { ...h, 'mcp-name': 'get_models' }]);
    // Header says modern, body carries no _meta version.
    cases.push([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' }]);
    for (const [body, headers] of cases) {
      const clean = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined));
      const res = await post(body, clean);
      assert.equal(res.statusCode, 400, JSON.stringify(clean));
      assert.equal(res.json.error.code, -32020, JSON.stringify(clean));
    }
  });

  test('Mcp-Name accepts the =?base64?...?= sentinel encoding', async () => {
    const [b, h] = modern('tools/call', { name: 'get_models', arguments: {} });
    const res = await post(b, { ...h, 'mcp-name': `=?base64?${Buffer.from('get_models').toString('base64')}?=` });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json.result.structuredContent, data.getModels());
  });

  test('an unknown modern version -> 400 -32022 with the supported list', async () => {
    const [b, h] = modern('tools/list');
    b.params._meta['io.modelcontextprotocol/protocolVersion'] = '2099-01-01';
    const res = await post(b, { ...h, 'mcp-protocol-version': '2099-01-01' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error.code, -32022);
    assert.deepEqual(res.json.error.data.supported, SUPPORTED_VERSIONS);
  });

  test('unknown method -> HTTP 404 with -32601', async () => {
    const res = await post(...modern('prompts/list'));
    assert.equal(res.statusCode, 404);
    assert.equal(res.json.error.code, -32601);
  });
});

describe('tools/list', () => {
  test('exactly the eight read-only tools, with sane schemas and annotations', async () => {
    const { tools } = (await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, legacyHeaders())).json.result;
    assert.deepEqual(tools.map((t) => t.name), [
      'list_clients', 'get_client', 'get_segments', 'get_policy', 'get_models',
      'get_benchmark_results', 'get_pricing', 'get_teams_availability',
    ]);
    for (const t of tools) {
      assert.match(t.name, /^[a-z_]{1,64}$/);
      assert.ok(t.title && t.description, t.name);
      assert.equal(t.inputSchema.type, 'object', t.name);
      assert.equal(t.inputSchema.additionalProperties, false, t.name);
      assert.equal(t.outputSchema.type, 'object', t.name);
      assert.ok(!JSON.stringify(t.outputSchema).includes('$ref'), `${t.name}: outputSchema must be self-contained`);
      assert.equal(t.annotations.readOnlyHint, true, t.name);
      assert.equal(t.annotations.destructiveHint, false, t.name);
      assert.equal(t.annotations.openWorldHint, false, t.name);
    }
    const getClient = tools.find((t) => t.name === 'get_client');
    assert.deepEqual(getClient.inputSchema.required, ['slug']);
    assert.deepEqual(getClient.inputSchema.properties.slug.enum, data.getClients().map((c) => c.slug));
  });

  test('a cursor this server never issued -> -32602', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { cursor: 'abc' } }, legacyHeaders());
    assert.equal(res.json.error.code, -32602);
  });
});

describe('tools/call returns exactly the published data', () => {
  const EXPECTED = {
    list_clients: () => ({ count: data.getClients().length, clients: data.getClients() }),
    get_segments: () => data.getSegments(),
    get_policy: () => data.getPolicy(),
    get_models: () => data.getModels(),
    get_benchmark_results: () => data.getResults(),
    get_pricing: () => data.getPricing(),
    get_teams_availability: () => data.getTeamsAvailability(),
  };
  for (const [name, expected] of Object.entries(EXPECTED)) {
    test(`${name} (legacy and modern)`, async () => {
      for (const res of [await legacyCall(name, {}), await post(...modern('tools/call', { name, arguments: {} }))]) {
        assert.equal(res.statusCode, 200);
        const r = res.json.result;
        assert.notEqual(r.isError, true);
        assert.deepEqual(r.structuredContent, expected());
        assert.equal(r.content[0].type, 'text');
        assert.deepEqual(JSON.parse(r.content[0].text), expected());
      }
    });
  }

  test('get_client returns every client by slug', async () => {
    for (const c of data.getClients()) {
      assert.deepEqual((await legacyCall('get_client', { slug: c.slug })).json.result.structuredContent, c);
    }
  });

  test('arguments may be omitted for no-argument tools', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_models' } }, legacyHeaders());
    assert.deepEqual(res.json.result.structuredContent, data.getModels());
  });
});

describe('tool errors', () => {
  test('unknown tool -> JSON-RPC -32602 (protocol error)', async () => {
    const res = await legacyCall('route_my_task', {});
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.error.code, -32602);
    assert.match(res.json.error.message, /Unknown tool: route_my_task/);
  });

  test('non-object arguments -> -32602', async () => {
    assert.equal((await legacyCall('get_policy', ['x'])).json.error.code, -32602);
  });

  test('bad arguments and unknown slugs are tool execution errors (isError), readable by the model', async () => {
    for (const args of [{}, { slug: 'no-such-client' }, { slug: 42 }, { slug: 'cursor', extra: true }]) {
      const r = (await legacyCall('get_client', args)).json.result;
      assert.equal(r.isError, true, JSON.stringify(args));
      assert.equal(r.structuredContent, undefined);
      assert.match(r.content[0].text, /Invalid arguments|No result/);
    }
    const r = (await legacyCall('get_policy', { unexpected: 1 })).json.result;
    assert.equal(r.isError, true);
  });
});

describe('JSON-RPC edge cases', () => {
  test('invalid request objects -> 400 -32600', async () => {
    for (const body of [{ id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 1 }, { jsonrpc: '2.0', id: null, method: 'ping' }, { jsonrpc: '2.0', id: 1, method: 'ping', params: [1] }, 'ping', 42]) {
      const res = await post(body, legacyHeaders());
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.equal(res.json.error.code, -32600, JSON.stringify(body));
    }
  });

  test('a JSON-RPC response sent to the server is refused (it never sends requests)', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, result: {} }, legacyHeaders());
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error.code, -32600);
  });
});

describe('batches (JSON-RPC arrays existed only in 2025-03-26)', () => {
  const batch = [
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_models', arguments: {} } },
    { jsonrpc: '2.0', id: 3, method: 'nope' },
  ];

  test('2025-03-26 (explicit or implied): one response per request, notifications skipped', async () => {
    for (const headers of [{}, legacyHeaders('2025-03-26')]) {
      const res = await post(batch, headers);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json.map((r) => r.id), [1, 2, 3]);
      assert.deepEqual(res.json[1].result.structuredContent, data.getModels());
      assert.equal(res.json[2].error.code, -32601);
    }
  });

  test('a batch of only notifications -> 202', async () => {
    assert.equal((await post([{ jsonrpc: '2.0', method: 'notifications/initialized' }])).statusCode, 202);
  });

  test('initialize inside a batch is rejected', async () => {
    const res = await post([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }]);
    assert.equal(res.json[0].error.code, -32600);
  });

  test('empty batch, or a batch under 2025-06-18 or later -> 400 -32600', async () => {
    assert.equal((await post([])).json.error.code, -32600);
    for (const v of ['2025-06-18', '2025-11-25', MODERN]) {
      const res = await post(batch, legacyHeaders(v));
      assert.equal(res.statusCode, 400, v);
      assert.equal(res.json.error.code, -32600, v);
    }
  });
});
