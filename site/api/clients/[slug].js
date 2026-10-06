// GET /api/clients/{slug} — one coding agent's companion-page entry.
// Vercel's file-based dynamic segment ([slug]) passes the path segment as
// req.query.slug.
import { getClient } from '../_lib/data.js';
import { preflight, sendJson, sendError } from '../_lib/http.js';

const SLUG_RE = /^[a-z0-9-]{1,64}$/;

function slugFrom(req) {
  if (req.query && typeof req.query.slug === 'string') return req.query.slug;
  // Fallback when nothing populated req.query (a plain Node server).
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  try {
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return '';
  }
}

export default function handler(req, res) {
  if (preflight(req, res)) return;
  const slug = slugFrom(req);
  if (!SLUG_RE.test(slug)) {
    return sendError(req, res, 400, 'invalid_slug', 'slug must be 1-64 lowercase letters, digits, or hyphens; GET /api/clients lists every valid slug.');
  }
  const client = getClient(slug);
  if (!client) {
    return sendError(req, res, 404, 'not_found', `No client with slug "${slug}". GET /api/clients lists every valid slug.`);
  }
  sendJson(req, res, 200, client);
}
