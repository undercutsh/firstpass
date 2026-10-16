// node:test coverage for the public read-only API (site/api/*.js) and its
// shared data layer. Lives under _lib/ so Vercel never deploys it as a
// function. Run with: node --test 'site/api/**/*.test.js'
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as data from './data.js';
import clients from '../clients.js';
import client from '../clients/[slug].js';
import segments from '../segments.js';
import policy from '../policy.js';
import models from '../models.js';
import results from '../results.js';
import pricing from '../pricing.js';
import teamsAvailability from '../teams-availability.js';
import health from '../health.js';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(chunk) { this.body = chunk; },
    get json() { return this.body === undefined ? undefined : JSON.parse(this.body); },
  };
}

function call(handler, { method = 'GET', query = {}, url = '/' } = {}) {
  const res = mockRes();
  handler({ method, query, url, headers: {} }, res);
  return res;
}

const ENDPOINTS = { clients, segments, policy, models, results, pricing, teamsAvailability, health };

describe('data layer', () => {
  test('exports exactly the agreed functions', () => {
    assert.deepEqual(Object.keys(data).sort(), [
      'getClient', 'getClients', 'getModels', 'getPolicy', 'getPricing',
      'getResults', 'getSegments', 'getTeamsAvailability',
    ]);
  });

  test('getClients / getClient', () => {
    const all = data.getClients();
    assert.ok(all.length > 0);
    assert.equal(data.getClient('claude-code').name, 'Claude Code');
    assert.equal(data.getClient('no-such-client'), null);
    for (const c of all) assert.equal(c.url, `https://getundercut.sh/${c.slug}`);
  });

  test('getPolicy returns SKILL.md as markdown', () => {
    const p = data.getPolicy();
    assert.equal(p.name, 'firstpass');
    assert.equal(p.format, 'text/markdown');
    assert.match(p.markdown, /^---\nname: firstpass/);
    assert.match(p.version, /^\d+\.\d+\.\d+$/);
  });

  test('getModels has a model for every tier and vendor', () => {
    const m = data.getModels();
    assert.deepEqual(m.tiers.map((t) => t.tier), ['cheap', 'standard', 'frontier', 'apex']);
    for (const t of m.tiers) for (const v of m.vendors) assert.ok(t.models[v.id], `${t.tier}/${v.id}`);
  });

  test('getResults comparisons are arithmetic over the cells', () => {
    const r = data.getResults();
    assert.ok(r.comparisons.length > 0);
    for (const c of r.comparisons) {
      assert.equal(c.passDelta, c.tiered.passed - c.baseline.passed);
      assert.ok(Math.abs(c.costDeltaPct - ((c.tiered.costUsd - c.baseline.costUsd) / c.baseline.costUsd) * 100) < 0.1);
    }
    assert.match(r.standingLimitation, /baseTier\(\)/);
  });

  test('getPricing exposes all four plans', () => {
    assert.deepEqual(data.getPricing().plans.map((p) => p.name), ['Pro', 'Teams', 'Enterprise', 'Free']);
  });

  test('getSegments and getTeamsAvailability drop maintainer comment keys', () => {
    const keys = [...Object.keys(data.getSegments()), ...Object.keys(data.getTeamsAvailability())];
    assert.ok(keys.every((k) => !k.startsWith('//') && !k.startsWith('_')));
    assert.ok(Array.isArray(data.getTeamsAvailability().windows));
  });

  test('returned data is frozen (shared across invocations)', () => {
    assert.throws(() => { data.getClients().push({}); }, TypeError);
  });
});

describe('handlers', () => {
  for (const [name, handler] of Object.entries(ENDPOINTS)) {
    test(`${name}: GET 200 JSON with CORS and caching`, () => {
      const res = call(handler);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
      assert.equal(res.headers['access-control-allow-origin'], '*');
      assert.ok(res.headers['cache-control']);
      assert.equal(typeof res.json, 'object');
    });

    test(`${name}: POST is 405 with Allow and the error shape`, () => {
      const res = call(handler, { method: 'POST' });
      assert.equal(res.statusCode, 405);
      assert.equal(res.headers.allow, 'GET, HEAD, OPTIONS');
      assert.deepEqual(Object.keys(res.json.error).sort(), ['code', 'message', 'status']);
      assert.equal(res.json.error.code, 'method_not_allowed');
    });
  }

  test('OPTIONS preflight is 204 with CORS', () => {
    const res = call(policy, { method: 'OPTIONS' });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.body, undefined);
  });

  test('HEAD sends headers but no body', () => {
    const res = call(models, { method: 'HEAD' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, undefined);
  });

  test('health reports ok and the package version, uncached', () => {
    const res = call(health);
    assert.equal(res.json.status, 'ok');
    assert.equal(res.json.version, data.getPolicy().version);
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  test('clients list count matches', () => {
    const { json } = call(clients);
    assert.equal(json.count, json.clients.length);
  });

  test('clients/{slug}: found, 404, 400', () => {
    assert.equal(call(client, { query: { slug: 'cursor' } }).json.slug, 'cursor');
    const missing = call(client, { query: { slug: 'nope' } });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json.error.code, 'not_found');
    const bad = call(client, { query: { slug: '../etc' } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json.error.code, 'invalid_slug');
  });

  test('clients/{slug} falls back to the URL path when req.query is empty', () => {
    const res = mockRes();
    client({ method: 'GET', url: '/api/clients/zed', headers: {} }, res);
    assert.equal(res.json.slug, 'zed');
  });
});
