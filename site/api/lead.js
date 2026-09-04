// Vercel serverless function: POST /api/lead
//
// Real destination is intentionally NOT hardcoded here — this repo is public
// and MIT-licensed, and picking a specific vendor (email service, sheet,
// CRM) is a business decision, not a code one (see roadmap.md: "Not
// Klaviyo — that's reserved for the owner's day job; keep this simple").
// Instead this forwards each submission as JSON to an operator-configured
// webhook URL (LEAD_WEBHOOK_URL, set in Vercel project env vars) — point it
// at a Zapier/Make/Sheets webhook, a transactional-email API, or anything
// else that accepts a POST. If it isn't configured, this responds with a
// clear 501 rather than pretending to succeed (no unearned trust signals —
// see AGENTS.md's hard rules).
//
// Hardening note (this endpoint is live and publicly reachable even while
// LEAD_WEBHOOK_URL is unset, so it's worth defending regardless of
// activation status):
//   - Real rate limiting needs a shared, persistent store (Vercel KV / Edge
//     Config or similar) — this project doesn't have one wired up yet, and
//     picking/paying for one is an infra decision out of scope here. A
//     per-invocation counter would do nothing, since Vercel serverless
//     functions don't share memory across invocations. Until that infra
//     exists, this leans on strict input validation, a hard payload-size
//     cap, and an allowlist of known fields to keep the endpoint cheap to
//     reject-and-forget even under abuse — and never echoes internal
//     error detail back to the caller.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;
const MAX_BODY_BYTES = 10 * 1024; // 10KB — a lead payload has no business being bigger
const MAX_STRING_LEN = 500; // hard cap for any string field before per-field caps apply

// Allowlist of fields submitLead() actually sends (site/index.html). Anything
// else in the payload is rejected outright rather than silently dropped, so
// unexpected/extra fields can't be used to smuggle bulk data through this
// endpoint.
const STRING_FIELDS = {
  source: 64,
  calcMode: 32,
  calcVendor: 32
};
const NUMBER_FIELDS = ['calcSeats', 'calcSpend'];
const ALLOWED_FIELDS = new Set(['email', ...Object.keys(STRING_FIELDS), ...NUMBER_FIELDS]);

// Vercel's default Node.js body parser also honors this, but we don't rely
// on that alone — see the explicit Content-Length + byte-length checks below.
export const config = {
  api: {
    bodyParser: { sizeLimit: '10kb' }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: 'payload too large' });
  }

  let body;
  try {
    body = readBody(req);
  } catch (err) {
    // Never echo the parser's own error text back to the client.
    const status = err?.message === 'payload too large' ? 413 : 400;
    return res.status(status).json({ ok: false, error: status === 413 ? 'payload too large' : 'invalid request body' });
  }

  if (!isPlainObject(body)) {
    return res.status(400).json({ ok: false, error: 'invalid request body' });
  }

  // Reject anything with fields we don't expect — no silent stripping.
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return res.status(400).json({ ok: false, error: 'unexpected field: ' + key });
    }
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid email' });
  }

  const context = { email };

  for (const [field, maxLen] of Object.entries(STRING_FIELDS)) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > Math.min(maxLen, MAX_STRING_LEN)) {
      return res.status(400).json({ ok: false, error: 'invalid field: ' + field });
    }
    context[field] = value;
  }
  if (!('source' in context)) context.source = 'unknown';

  for (const field of NUMBER_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e9) {
      return res.status(400).json({ ok: false, error: 'invalid field: ' + field });
    }
    context[field] = value;
  }

  context.submittedAt = new Date().toISOString();

  const webhookUrl = process.env.LEAD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('[lead] LEAD_WEBHOOK_URL not configured — dropping submission, not faking success');
    return res.status(501).json({ ok: false, error: 'lead capture not configured' });
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context)
    });
    if (!upstream.ok) {
      console.error('[lead] webhook rejected submission:', upstream.status);
      return res.status(502).json({ ok: false, error: 'upstream rejected submission' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[lead] webhook forward failed:', err);
    return res.status(502).json({ ok: false, error: 'upstream unreachable' });
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Accepts either an already-parsed body (normal Vercel behavior) or a raw
// string, and enforces the byte cap regardless of which one we got —
// Content-Length can be absent or spoofed, so the actual bytes are checked
// too.
function readBody(req) {
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
      throw new Error('payload too large');
    }
    return JSON.parse(req.body);
  }
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_BODY_BYTES) {
      throw new Error('payload too large');
    }
    return req.body;
  }
  return null;
}
