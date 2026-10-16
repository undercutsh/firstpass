// POST /mcp (rewritten to /api/mcp) — Undercut's read-only MCP server over
// the Streamable HTTP transport. Stateless: every POST is answered with a
// single application/json response (or 202 for a notification), no session
// id is ever issued, and there is no server-initiated stream, so GET and
// DELETE get 405. The protocol itself lives in ./_lib/mcp.js; this file only
// does HTTP: methods, CORS, Origin validation, and body parsing.
import { handleBody, errorBody, ERR } from './_lib/mcp.js';
import snapshot from './_lib/snapshot.js';

export const MAX_BODY_BYTES = 64 * 1024;
const ALLOW = 'POST, OPTIONS';

// Vercel's Node body parser honours this too; the byte checks below don't
// rely on it.
export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

function setCommonHeaders(res) {
  // Open CORS so browser-based MCP clients can connect. Safe here: there are
  // no credentials, cookies, or user-specific data, and every tool result is
  // already public via GET /api/*.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', ALLOW);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Undercut-Version', snapshot.service.version);
}

function send(res, status, body) {
  res.statusCode = status;
  if (body === null || body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// The spec requires validating Origin (DNS-rebinding defence) and answering
// an invalid one with 403. Allowed: no Origin (CLI/desktop clients), any
// well-formed https origin (CORS is open, see above), and http only on
// loopback for local tools such as the MCP Inspector. Everything else —
// "null", file:, malformed values, plain-http public hosts — is refused.
export function isAllowedOrigin(origin) {
  if (origin === undefined) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin.replace(/\/$/, '')) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

async function readRawBody(req) {
  // Vercel pre-parses JSON into req.body (a getter that throws on bad JSON);
  // a plain Node server leaves the stream for us to read.
  if ('body' in req) {
    const body = req.body;
    if (typeof body === 'string' || Buffer.isBuffer(body)) return Buffer.from(body).toString('utf8');
    if (body !== undefined && body !== null) return { parsed: body };
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('too large'), { tooLarge: true });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  setCommonHeaders(res);
  const origin = req.headers?.origin;
  if (!isAllowedOrigin(origin)) {
    return send(res, 403, errorBody(undefined, ERR.INVALID_REQUEST, `Forbidden: Origin '${origin}' is not allowed`));
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', ALLOW);
    return send(res, 204, null);
  }
  if (req.method !== 'POST') {
    // GET would open a server-initiated SSE stream and DELETE would end a
    // session; this server offers neither.
    res.setHeader('Allow', ALLOW);
    return send(res, 405, errorBody(undefined, ERR.INVALID_REQUEST, `Method not allowed: ${req.method}. This MCP endpoint is stateless and accepts JSON-RPC over POST only (no SSE stream, no sessions).`));
  }

  const contentType = String(req.headers?.['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return send(res, 415, errorBody(undefined, ERR.INVALID_REQUEST, 'Unsupported Media Type: POST a JSON-RPC message with Content-Type: application/json'));
  }
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return send(res, 413, errorBody(undefined, ERR.INVALID_REQUEST, `Payload too large (limit ${MAX_BODY_BYTES} bytes)`));
  }

  let parsed;
  try {
    const raw = await readRawBody(req);
    if (typeof raw === 'object') {
      parsed = raw.parsed;
      if (Buffer.byteLength(JSON.stringify(parsed), 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('too large'), { tooLarge: true });
    } else {
      if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('too large'), { tooLarge: true });
      parsed = JSON.parse(raw);
    }
  } catch (err) {
    if (err?.tooLarge) return send(res, 413, errorBody(undefined, ERR.INVALID_REQUEST, `Payload too large (limit ${MAX_BODY_BYTES} bytes)`));
    // JSON-RPC: a parse error is answered with id null.
    return send(res, 400, errorBody(null, ERR.PARSE, 'Parse error: request body is not valid JSON'));
  }

  let out;
  try {
    out = handleBody(parsed, req.headers ?? {});
  } catch {
    return send(res, 500, errorBody(null, ERR.INTERNAL, 'Internal error'));
  }
  return send(res, out.status, out.body);
}
