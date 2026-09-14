// Minimal node:test coverage for site/api/lead.js hardening.
// Run with: node --test site/api/lead.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from './lead.js';

function mockReq({ method = 'POST', body, headers = {} } = {}) {
  return { method, body, headers };
}

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

test('rejects non-POST methods', async () => {
  const req = mockReq({ method: 'GET' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.ok, false);
});

test('rejects missing/invalid email with 400', async () => {
  const req = mockReq({ body: { email: 'not-an-email' } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

test('rejects unexpected extra fields with 400', async () => {
  const req = mockReq({ body: { email: 'a@example.com', admin: true } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /unexpected field/);
});

test('rejects oversized string fields with 400', async () => {
  const req = mockReq({ body: { email: 'a@example.com', source: 'x'.repeat(1000) } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test('rejects non-finite/oversized numeric fields with 400', async () => {
  const req = mockReq({ body: { email: 'a@example.com', calcSeats: Number.POSITIVE_INFINITY } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test('rejects declared Content-Length over the cap with 413, before touching the webhook', async () => {
  const req = mockReq({
    body: { email: 'a@example.com' },
    headers: { 'content-length': String(11 * 1024) }
  });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 413);
});

test('rejects oversized raw string body with 413', async () => {
  const req = mockReq({ body: JSON.stringify({ email: 'a@example.com', source: 'x'.repeat(20000) }) });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 413);
});

test('returns 501 (not faked success) when LEAD_WEBHOOK_URL is unset, for an otherwise-valid payload', async () => {
  const prev = process.env.LEAD_WEBHOOK_URL;
  delete process.env.LEAD_WEBHOOK_URL;
  const req = mockReq({
    body: {
      email: 'valid@example.com',
      source: '/waitlist',
      calcMode: 'team',
      calcVendor: 'acme',
      calcSeats: 12,
      calcSpend: 500
    }
  });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 501);
  assert.equal(res.body.ok, false);
  if (prev !== undefined) process.env.LEAD_WEBHOOK_URL = prev;
});

test('forwards to webhook and returns 200 on the mocked success path', async (t) => {
  const prevUrl = process.env.LEAD_WEBHOOK_URL;
  process.env.LEAD_WEBHOOK_URL = 'https://example.com/webhook';

  const prevFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200 };
  };
  t.after(() => {
    globalThis.fetch = prevFetch;
    if (prevUrl !== undefined) process.env.LEAD_WEBHOOK_URL = prevUrl;
    else delete process.env.LEAD_WEBHOOK_URL;
  });

  const req = mockReq({ body: { email: 'valid@example.com', source: '/waitlist' } });
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(capturedBody.email, 'valid@example.com');
  assert.equal(capturedBody.source, '/waitlist');
});

test('forwards the Teams onboarding intake fields (intent/plan/billing/teamSize/providers/slot) verbatim', async (t) => {
  const prevUrl = process.env.LEAD_WEBHOOK_URL;
  process.env.LEAD_WEBHOOK_URL = 'https://example.com/webhook';
  const prevFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200 };
  };
  t.after(() => {
    globalThis.fetch = prevFetch;
    if (prevUrl !== undefined) process.env.LEAD_WEBHOOK_URL = prevUrl;
    else delete process.env.LEAD_WEBHOOK_URL;
  });

  const req = mockReq({
    body: {
      email: 'lead@company.example',
      source: '/',
      intent: 'teams-slot-request',
      plan: 'teams',
      billing: 'annual',
      teamSize: '16-50',
      providers: 'anthropic,openrouter',
      slot: '2026-10-01T17:00:00.000Z'
    }
  });
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedBody.intent, 'teams-slot-request');
  assert.equal(capturedBody.plan, 'teams');
  assert.equal(capturedBody.billing, 'annual');
  assert.equal(capturedBody.teamSize, '16-50');
  assert.equal(capturedBody.providers, 'anthropic,openrouter');
  assert.equal(capturedBody.slot, '2026-10-01T17:00:00.000Z');
});

test('accepts the Enterprise "Contact us" payload (intent enterprise-contact, plan enterprise) within the existing allowlist', async (t) => {
  const prevUrl = process.env.LEAD_WEBHOOK_URL;
  process.env.LEAD_WEBHOOK_URL = 'https://example.com/webhook';
  const prevFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200 };
  };
  t.after(() => {
    globalThis.fetch = prevFetch;
    if (prevUrl !== undefined) process.env.LEAD_WEBHOOK_URL = prevUrl;
    else delete process.env.LEAD_WEBHOOK_URL;
  });

  const req = mockReq({
    body: { email: 'cto@company.example', source: '/', intent: 'enterprise-contact', plan: 'enterprise', billing: 'annual' }
  });
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedBody.intent, 'enterprise-contact');
  assert.equal(capturedBody.plan, 'enterprise');
  assert.equal(capturedBody.billing, 'annual');
});

test('rejects an oversized providers string and a non-string slot with 400', async () => {
  let res = mockRes();
  await handler(mockReq({ body: { email: 'a@example.com', providers: 'x'.repeat(201) } }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /providers/);

  res = mockRes();
  await handler(mockReq({ body: { email: 'a@example.com', slot: 1759338000000 } }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /slot/);
});

test('returns 502 with a generic message when the webhook rejects, without leaking upstream detail', async (t) => {
  const prevUrl = process.env.LEAD_WEBHOOK_URL;
  process.env.LEAD_WEBHOOK_URL = 'https://example.com/webhook';
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  t.after(() => {
    globalThis.fetch = prevFetch;
    if (prevUrl !== undefined) process.env.LEAD_WEBHOOK_URL = prevUrl;
    else delete process.env.LEAD_WEBHOOK_URL;
  });

  const req = mockReq({ body: { email: 'valid@example.com' } });
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.ok, false);
  assert.doesNotMatch(JSON.stringify(res.body), /stack|Error:/);
});
