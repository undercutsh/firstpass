// The protocol core of Undercut's read-only MCP server (site/api/mcp.js,
// served at https://getundercut.sh/mcp). Hand-rolled JSON-RPC 2.0 with no
// dependencies: every tool returns exactly what the matching REST endpoint
// returns, straight from ./data.js. Nothing here writes, routes, proxies, or
// runs a model call.
//
// Dual-era, stateless (see the MCP spec's "Versioning" page):
//   - Modern (2026-07-28): no handshake; every request carries its protocol
//     version in params._meta and mirrors it, the method, and (for
//     tools/call) the tool name into MCP-Protocol-Version / Mcp-Method /
//     Mcp-Name headers, which must match the body. `server/discover`
//     advertises versions and capabilities.
//   - Legacy (2025-11-25, 2025-06-18, 2025-03-26): `initialize` negotiates a
//     version; later requests carry it in the MCP-Protocol-Version header
//     (absent means 2025-03-26). No session is ever issued, so nothing here
//     depends on which instance served the previous request.
//
// This module is transport-agnostic: handleMessage() maps one parsed JSON-RPC
// message plus the request headers to { status, body }, and the HTTP layer
// in ../mcp.js only deals with methods, CORS, Origin, and body parsing.

import * as data from './data.js';
import snapshot from './snapshot.js';
import OUTPUT_SCHEMAS from './mcp-schemas.js';

export const MODERN_VERSIONS = ['2026-07-28'];
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
export const SUPPORTED_VERSIONS = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];
// Legacy clients that omit MCP-Protocol-Version are, per spec, on 2025-03-26.
export const DEFAULT_LEGACY_VERSION = '2025-03-26';

export const ENDPOINT = 'https://getundercut.sh/mcp';

// JSON-RPC 2.0 codes, plus the MCP-reserved ones (-32020..-32099).
export const ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  HEADER_MISMATCH: -32020,
  UNSUPPORTED_PROTOCOL_VERSION: -32022,
};

export const SERVER_INFO = Object.freeze({
  name: 'sh.getundercut/undercut',
  title: 'Undercut public data',
  version: snapshot.service.version,
  description: 'Read-only data Undercut publishes: routing policy, model map, benchmark results, clients, pricing.',
  websiteUrl: 'https://getundercut.sh/developers',
});

export const CAPABILITIES = Object.freeze({ tools: {} });

export const INSTRUCTIONS = [
  'Read-only access to data Undercut (https://getundercut.sh) already publishes in the undercutsh/firstpass repository.',
  'Every tool returns the same JSON as the matching GET /api/* endpoint (described at https://getundercut.sh/openapi.json), as structuredContent plus a JSON text block.',
  'Nothing here routes, proxies, or runs model calls, and there are no write tools: the routing itself happens inside your own agent, which follows the policy that get_policy returns.',
  'Benchmark claims should cite get_benchmark_results, including its standingLimitation and caveats.',
].join(' ');

// Hints only (clients must not trust them blindly), but accurate for every
// tool here: nothing changes state, and the domain is this site's own data.
const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

const NO_ARGS = Object.freeze({ type: 'object', properties: {}, additionalProperties: false });

function kb(value) {
  return `${Math.max(1, Math.round(JSON.stringify(value).length / 1024))} KB`;
}

const clientSlugs = data.getClients().map((c) => c.slug);

// name -> { title, description, inputSchema, run(args) }. Each `run` returns
// the same body as the REST handler named in its description.
const TOOL_DEFS = {
  list_clients: {
    title: 'List supported coding agents',
    description: `Every coding agent with a researched Undercut install guide: slug, display name, and guide URL. Same data as GET /api/clients (about ${kb({ count: 0, clients: data.getClients() })}).`,
    inputSchema: NO_ARGS,
    run: () => ({ count: data.getClients().length, clients: data.getClients() }),
  },
  get_client: {
    title: 'Get one coding agent',
    description: 'One coding agent\'s entry by slug (list_clients gives every valid slug). Same data as GET /api/clients/{slug}.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Client slug, e.g. "claude-code".', enum: clientSlugs },
      },
      required: ['slug'],
      additionalProperties: false,
    },
    run: ({ slug }) => data.getClient(slug),
  },
  get_segments: {
    title: 'Get the setup segment router',
    description: `The editor and provider-setup segment router behind https://getundercut.sh/setup. Same data as GET /api/segments (about ${kb(data.getSegments())}).`,
    inputSchema: NO_ARGS,
    run: () => data.getSegments(),
  },
  get_policy: {
    title: 'Get the routing policy',
    description: `The routing policy itself (skills/firstpass/SKILL.md) as markdown, with its package and rubric versions. Same data as GET /api/policy (about ${kb(data.getPolicy())}).`,
    inputSchema: NO_ARGS,
    run: () => data.getPolicy(),
  },
  get_models: {
    title: 'Get the tier-to-model mapping',
    description: `The tier-to-model mapping (skills/firstpass/models.md), structured per tier and vendor, plus the markdown. Same data as GET /api/models (about ${kb(data.getModels())}).`,
    inputSchema: NO_ARGS,
    run: () => data.getModels(),
  },
  get_benchmark_results: {
    title: 'Get published benchmark results',
    description: `Benchmark totals and tiered-versus-baseline comparisons computed from the raw files in testing/results, with the methodology's standing limitation and caveats. Same data as GET /api/results (about ${kb(data.getResults())}).`,
    inputSchema: NO_ARGS,
    run: () => data.getResults(),
  },
  get_pricing: {
    title: 'Get the published rate card',
    description: `Undercut's published plans and prices (site/pricing.md), structured plus the markdown. Same data as GET /api/pricing (about ${kb(data.getPricing())}).`,
    inputSchema: NO_ARGS,
    run: () => data.getPricing(),
  },
  get_teams_availability: {
    title: 'Get Teams onboarding windows',
    description: 'The founder-published Teams onboarding windows and slot rules. Read-only: booking happens on the site, not through this server. Same data as GET /api/teams-availability.',
    inputSchema: NO_ARGS,
    run: () => data.getTeamsAvailability(),
  },
};

/** The tools/list entries, in a deterministic order. */
export const TOOLS = Object.freeze(
  Object.entries(TOOL_DEFS).map(([name, def]) =>
    Object.freeze({
      name,
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema,
      outputSchema: OUTPUT_SCHEMAS[name],
      annotations: { title: def.title, ...READ_ONLY },
    })
  )
);

/** Runs a tool by name (throws on an unknown name); used by tests and the validator. */
export function runTool(name, args = {}) {
  return TOOL_DEFS[name].run(args);
}

// Just enough JSON Schema for the input schemas above.
function validateArgs(schema, args) {
  const errors = [];
  for (const key of schema.required ?? []) if (!(key in args)) errors.push(`missing required argument "${key}"`);
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties?.[key];
    if (!prop) { errors.push(`unexpected argument "${key}"`); continue; }
    if (prop.type === 'string' && typeof value !== 'string') errors.push(`"${key}" must be a string`);
    else if (prop.enum && !prop.enum.includes(value)) errors.push(`"${key}" must be one of: ${prop.enum.join(', ')}`);
  }
  return errors;
}

// ---- JSON-RPC plumbing ----------------------------------------------------

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isValidId(id) {
  return typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
}

export function errorBody(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return id === undefined ? { jsonrpc: '2.0', error } : { jsonrpc: '2.0', id, error };
}

function fail(status, id, code, message, data) {
  return { status, body: errorBody(id, code, message, data) };
}

function unsupported(id, requested) {
  return fail(400, id, ERR.UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version', { supported: SUPPORTED_VERSIONS, requested });
}

// Headers arrive lower-cased from Node. Mcp-Name may use the
// =?base64?...?= sentinel encoding for values that aren't plain ASCII.
function header(headers, name) {
  const v = headers?.[name];
  return Array.isArray(v) ? v.join(', ') : v;
}

export function decodeHeaderValue(value) {
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(value ?? '');
  if (!m) return value;
  return Buffer.from(m[1], 'base64').toString('utf8');
}

/**
 * Works out which protocol era and version a request speaks. Returns
 * { era: 'modern' | 'legacy', version } or { error: { status, body } }.
 */
export function negotiate(msg, headers) {
  const id = msg.id;
  const headerVersion = header(headers, 'mcp-protocol-version');
  const meta = isObject(msg.params) && isObject(msg.params._meta) ? msg.params._meta : undefined;
  const metaVersion = meta?.['io.modelcontextprotocol/protocolVersion'];

  // initialize always selects legacy semantics; its own params negotiate.
  if (msg.method === 'initialize') return { era: 'legacy', version: null };

  if (metaVersion !== undefined) {
    if (headerVersion === undefined) {
      return { error: fail(400, id, ERR.HEADER_MISMATCH, 'Header mismatch: MCP-Protocol-Version header is required') };
    }
    if (headerVersion !== metaVersion) {
      return { error: fail(400, id, ERR.HEADER_MISMATCH, `Header mismatch: MCP-Protocol-Version header value '${headerVersion}' does not match body value '${metaVersion}'`) };
    }
    if (!MODERN_VERSIONS.includes(metaVersion)) return { error: unsupported(id, metaVersion) };
    const methodHeader = header(headers, 'mcp-method');
    if (methodHeader !== msg.method) {
      return { error: fail(400, id, ERR.HEADER_MISMATCH, methodHeader === undefined
        ? 'Header mismatch: Mcp-Method header is required'
        : `Header mismatch: Mcp-Method header value '${methodHeader}' does not match body value '${msg.method}'`) };
    }
    if (msg.method === 'tools/call') {
      const rawName = header(headers, 'mcp-name');
      const name = decodeHeaderValue(rawName);
      if (name !== msg.params.name) {
        return { error: fail(400, id, ERR.HEADER_MISMATCH, rawName === undefined
          ? 'Header mismatch: Mcp-Name header is required for tools/call'
          : `Header mismatch: Mcp-Name header value '${name}' does not match body value '${msg.params.name}'`) };
      }
    }
    return { era: 'modern', version: metaVersion };
  }

  if (headerVersion !== undefined && MODERN_VERSIONS.includes(headerVersion)) {
    return { error: fail(400, id, ERR.HEADER_MISMATCH, `Header mismatch: MCP-Protocol-Version is '${headerVersion}' but params._meta carries no io.modelcontextprotocol/protocolVersion`) };
  }
  if (headerVersion !== undefined && !LEGACY_VERSIONS.includes(headerVersion)) return { error: unsupported(id, headerVersion) };
  return { era: 'legacy', version: headerVersion ?? DEFAULT_LEGACY_VERSION };
}

// Modern results carry resultType and serverInfo; cacheable ones a TTL.
const LIST_TTL_MS = 5 * 60 * 1000;

function result(era, id, body, { cacheable = false } = {}) {
  let out = body;
  if (era === 'modern') {
    out = { resultType: 'complete', ...body, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO } };
    if (cacheable) Object.assign(out, { ttlMs: LIST_TTL_MS, cacheScope: 'public' });
  }
  return { status: 200, body: { jsonrpc: '2.0', id, result: out } };
}

function callTool(era, id, params) {
  if (typeof params.name !== 'string') return fail(200, id, ERR.INVALID_PARAMS, 'tools/call requires params.name (a string)');
  if (!Object.hasOwn(TOOL_DEFS, params.name)) {
    return fail(200, id, ERR.INVALID_PARAMS, `Unknown tool: ${params.name}`, { tools: Object.keys(TOOL_DEFS) });
  }
  const def = TOOL_DEFS[params.name];
  const args = params.arguments ?? {};
  if (!isObject(args)) return fail(200, id, ERR.INVALID_PARAMS, `Invalid arguments for tool ${params.name}: arguments must be an object`);

  // Argument problems are tool execution errors (isError), so the model can
  // read them and retry, per the spec's error-handling guidance.
  const problems = validateArgs(def.inputSchema, args);
  if (problems.length) {
    return result(era, id, { content: [{ type: 'text', text: `Invalid arguments for ${params.name}: ${problems.join('; ')}.` }], isError: true });
  }
  let value;
  try {
    value = def.run(args);
  } catch {
    return fail(200, id, ERR.INTERNAL, 'Unexpected error reading published data');
  }
  if (value == null) {
    return result(era, id, { content: [{ type: 'text', text: `No result for ${JSON.stringify(args)}. Call list_clients for every valid slug.` }], isError: true });
  }
  return result(era, id, { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
}

/**
 * Handles one JSON-RPC message. Returns { status, body } where body is a
 * JSON-RPC response object, or null when nothing is sent back (an accepted
 * notification: the HTTP layer answers 202).
 */
export function handleMessage(msg, headers = {}, { inBatch = false } = {}) {
  if (!isObject(msg) || msg.jsonrpc !== '2.0') return fail(400, null, ERR.INVALID_REQUEST, 'Invalid Request: expected a JSON-RPC 2.0 object');
  const hasId = 'id' in msg;
  if (typeof msg.method !== 'string') {
    if (hasId && ('result' in msg || 'error' in msg)) {
      return fail(400, null, ERR.INVALID_REQUEST, 'Invalid Request: this server never sends requests, so it accepts no JSON-RPC responses');
    }
    return fail(400, isValidId(msg.id) ? msg.id : null, ERR.INVALID_REQUEST, 'Invalid Request: method must be a string');
  }
  if ('params' in msg && !isObject(msg.params)) {
    return fail(400, isValidId(msg.id) ? msg.id : null, ERR.INVALID_REQUEST, 'Invalid Request: params must be an object');
  }

  // Notifications (no id): nothing to answer. notifications/initialized and
  // notifications/cancelled need no action from a stateless server.
  if (!hasId) return { status: 202, body: null };
  if (!isValidId(msg.id)) return fail(400, null, ERR.INVALID_REQUEST, 'Invalid Request: id must be a string or a number');

  const { id, method } = msg;
  const params = msg.params ?? {};
  const negotiated = negotiate(msg, headers);
  if (negotiated.error) return negotiated.error;
  const { era } = negotiated;

  switch (method) {
    case 'initialize': {
      if (inBatch) return fail(400, id, ERR.INVALID_REQUEST, 'Invalid Request: initialize must not be part of a JSON-RPC batch');
      const requested = params.protocolVersion;
      // Legacy negotiation: echo a supported legacy version, else offer the
      // latest legacy one (modern clients don't initialize at all).
      const protocolVersion = LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0];
      return result('legacy', id, { protocolVersion, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'server/discover':
      return result(era, id, { supportedVersions: SUPPORTED_VERSIONS, capabilities: CAPABILITIES, instructions: INSTRUCTIONS }, { cacheable: true });
    case 'ping':
      return result(era, id, {});
    case 'tools/list':
      // One page holds every tool; any cursor is one this server never issued.
      if (params.cursor !== undefined) return fail(200, id, ERR.INVALID_PARAMS, 'Invalid cursor: tools/list returns every tool in one page');
      return result(era, id, { tools: TOOLS }, { cacheable: true });
    case 'tools/call':
      return callTool(era, id, params);
    default:
      // Modern Streamable HTTP answers an unimplemented method with 404; a
      // legacy client would read a 404 as "session expired", so it gets 200.
      return fail(era === 'modern' ? 404 : 200, id, ERR.METHOD_NOT_FOUND, `Method not found: ${method}. This server offers tools only (tools/list, tools/call).`);
  }
}

/**
 * Handles a parsed POST body: one message, or (2025-03-26 only) a batch.
 * Returns { status, body } with body null for "202, no body".
 */
export function handleBody(parsed, headers = {}) {
  if (!Array.isArray(parsed)) return handleMessage(parsed, headers);

  // JSON-RPC batching existed only in 2025-03-26 (removed in 2025-06-18).
  const headerVersion = header(headers, 'mcp-protocol-version');
  const version = headerVersion ?? DEFAULT_LEGACY_VERSION;
  if (version !== '2025-03-26') {
    return fail(400, null, ERR.INVALID_REQUEST, `Invalid Request: JSON-RPC batches are not supported in protocol version ${version} (only 2025-03-26 allowed them)`);
  }
  if (parsed.length === 0) return fail(400, null, ERR.INVALID_REQUEST, 'Invalid Request: empty batch');
  const responses = parsed.map((m) => handleMessage(m, headers, { inBatch: true }).body).filter((b) => b !== null);
  return responses.length ? { status: 200, body: responses } : { status: 202, body: null };
}
