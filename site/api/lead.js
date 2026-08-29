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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid email' });
  }

  // Free-form context from the calculator/waitlist forms — never trusted for
  // anything beyond logging/forwarding, so no further validation needed.
  const context = {
    email,
    source: typeof body?.source === 'string' ? body.source.slice(0, 64) : 'unknown',
    calcMode: typeof body?.calcMode === 'string' ? body.calcMode.slice(0, 32) : undefined,
    calcVendor: typeof body?.calcVendor === 'string' ? body.calcVendor.slice(0, 32) : undefined,
    calcSeats: Number.isFinite(body?.calcSeats) ? body.calcSeats : undefined,
    calcSpend: Number.isFinite(body?.calcSpend) ? body.calcSpend : undefined,
    submittedAt: new Date().toISOString()
  };

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

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
