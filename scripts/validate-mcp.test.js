// Unit coverage for validate-mcp.js's detection logic: the real files come
// out clean, and each kind of drift is caught.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, checkCardShape, deref, buildSchemasModule, SCHEMAS_PATH, CARD_PATH, CATALOG_PATH, VERCEL_PATH } from './validate-mcp.js';
import { SPEC_PATH } from './validate-openapi.js';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const real = () => ({
  spec: json(SPEC_PATH),
  card: json(CARD_PATH),
  catalog: json(CATALOG_PATH),
  vercel: json(VERCEL_PATH),
  schemasSource: readFileSync(SCHEMAS_PATH, 'utf8'),
});

describe('validate-mcp', () => {
  test('the real server, card, catalog and rewrites are clean', async () => {
    assert.deepEqual(await check(real()), []);
  });

  test('deref inlines nested $refs', () => {
    const spec = { components: { schemas: { A: { type: 'object', properties: { b: { $ref: '#/components/schemas/B' } } }, B: { type: 'string' } } } };
    assert.deepEqual(deref(spec, { $ref: '#/components/schemas/A' }), { type: 'object', properties: { b: { type: 'string' } } });
    assert.throws(() => deref(spec, { $ref: '#/components/schemas/Nope' }));
  });

  test('catches an OpenAPI schema change not regenerated into mcp-schemas.js', async () => {
    const files = real();
    files.spec.components.schemas.Models.required.push('newField');
    assert.notEqual(buildSchemasModule(files.spec), files.schemasSource);
    assert.ok((await check(files)).some((e) => e.includes('mcp-schemas.js is stale')));
  });

  test('catches a hand-edited server card', async () => {
    const files = real();
    files.card.version = '9.9.9';
    files.card.remotes[0].supportedProtocolVersions = ['2026-07-28'];
    const errors = await check(files);
    assert.ok(errors.some((e) => e.includes('server-card.json is stale')));
    assert.ok(errors.some((e) => e.includes('supportedProtocolVersions')));
  });

  test('checkCardShape enforces the SEP-2127 draft constraints', () => {
    const card = real().card;
    assert.deepEqual(checkCardShape(card), []);
    const bad = { ...card, $schema: 'x', name: 'no-slash', version: '^1.0.0', description: 'x'.repeat(101), tools: [], remotes: [{ type: 'websocket', url: 'ftp://x' }] };
    const errors = checkCardShape(bad);
    for (const needle of ['$schema', 'reverse-DNS', 'exact version', '1-100', 'enumerate tools', 'websocket', 'ftp://x']) {
      assert.ok(errors.some((e) => e.includes(needle)), needle);
    }
  });

  test('catches a missing or wrong AI Catalog entry and a stale "no MCP server" note', async () => {
    const files = real();
    const entry = files.catalog.entries.find((e) => e.type === 'application/mcp-server-card+json');
    entry.url = 'https://getundercut.sh/elsewhere';
    entry.description = 'tools: none';
    files.catalog.notes = 'No MCP server exists yet.';
    const errors = await check(files);
    assert.ok(errors.some((e) => e.includes('url must be')));
    assert.ok(errors.some((e) => e.includes('does not mention tool get_policy')));
    assert.ok(errors.some((e) => e.includes('notes still says')));

    files.catalog.entries = files.catalog.entries.filter((e) => e !== entry);
    assert.ok((await check(files)).some((e) => e.includes('has no application/mcp-server-card+json entry')));
  });

  test('catches a missing /mcp rewrite', async () => {
    const files = real();
    files.vercel.rewrites = files.vercel.rewrites.filter((r) => r.source !== '/mcp');
    assert.ok((await check(files)).some((e) => e.includes('rewrite /mcp to /api/mcp')));
  });
});
