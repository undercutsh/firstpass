// Request/response plumbing shared by the public read-only API handlers.
// Uses only core Node http.ServerResponse members (statusCode, setHeader,
// end), so the handlers run unchanged on Vercel's Node runtime, under
// `node --test` with a mock res, or behind any other Node server.

import snapshot from './snapshot.js';

export const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

// Data changes only when a new deployment ships (Vercel purges its CDN cache
// on deploy), so a short browser TTL plus a longer shared-cache TTL is safe.
export const CACHE_DATA = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
export const CACHE_NONE = 'no-store';

function setCommonHeaders(res, cacheControl) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Undercut-Version', snapshot.service.version);
}

export function sendJson(req, res, status, body, cacheControl = CACHE_DATA) {
  setCommonHeaders(res, cacheControl);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
}

// One error shape everywhere: { error: { status, code, message } }.
export function sendError(req, res, status, code, message) {
  sendJson(req, res, status, { error: { status, code, message } }, CACHE_NONE);
}

// Answers CORS preflight and rejects non-read methods. Returns true when the
// request has been answered and the handler should stop.
export function preflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCommonHeaders(res, CACHE_DATA);
    res.setHeader('Allow', ALLOWED_METHODS);
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ALLOWED_METHODS);
    sendError(req, res, 405, 'method_not_allowed', `${req.method} is not supported. This API is read-only: use GET.`);
    return true;
  }
  return false;
}

// Wraps a data getter as a complete read-only handler.
export function readOnly(getter, cacheControl = CACHE_DATA) {
  return function handler(req, res) {
    if (preflight(req, res)) return;
    let body;
    try {
      body = getter(req);
    } catch {
      return sendError(req, res, 500, 'internal_error', 'Unexpected error reading published data.');
    }
    sendJson(req, res, 200, body, cacheControl);
  };
}
