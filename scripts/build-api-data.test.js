// Unit coverage for build-api-data.js: the committed snapshot matches its
// sources, and the parsers that derive structured fields from markdown
// catch the shapes they depend on (rather than silently emitting nothing).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SNAPSHOT_PATH,
  buildSnapshot,
  renderSnapshot,
  stripCommentKeys,
  parseFrontmatter,
  parseModelsTable,
  parsePricing,
  section,
} from './build-api-data.js';

describe('build-api-data', () => {
  test('committed snapshot is in sync with its sources', () => {
    assert.equal(readFileSync(SNAPSHOT_PATH, 'utf8'), renderSnapshot(buildSnapshot()));
  });

  test('a changed source produces a different snapshot (the --check would fail)', () => {
    const snap = buildSnapshot();
    const before = renderSnapshot(snap);
    snap.clients.push({ slug: 'new-client' });
    assert.notEqual(renderSnapshot(snap), before);
  });

  test('stripCommentKeys removes // and _ keys at any depth, keeps data', () => {
    assert.deepEqual(
      stripCommentKeys({ '//': 'x', _readme: 'y', a: 1, b: { '//note': 1, c: [{ _x: 1, d: null }] } }),
      { a: 1, b: { c: [{ d: null }] } }
    );
  });

  test('parseFrontmatter handles quoted values and YAML single-quote escaping', () => {
    const { data, body } = parseFrontmatter("---\nname: firstpass\ndescription: 'it''s fine'\ntitle: \"T\"\n---\n# Body\n");
    assert.deepEqual(data, { name: 'firstpass', description: "it's fine", title: 'T' });
    assert.equal(body, '# Body\n');
  });

  test('section returns the text under a ## heading only', () => {
    assert.equal(section('## A\none\n### sub\ntwo\n## B\nthree', 'A'), 'one\n### sub\ntwo');
    assert.equal(section('## A\n', 'Z'), null);
  });

  test('parseModelsTable maps columns to vendor ids', () => {
    const md = [
      '<!-- BEGIN AUTO-GENERATED: x -->',
      '| Tier | Anthropic | Google |',
      '|---|---|---|',
      '| cheap | `a/1` | `g/1` |',
      '<!-- END AUTO-GENERATED -->',
    ].join('\n');
    assert.deepEqual(parseModelsTable(md), {
      vendors: [{ id: 'anthropic', label: 'Anthropic' }, { id: 'gemini', label: 'Google' }],
      tiers: [{ tier: 'cheap', models: { anthropic: 'a/1', gemini: 'g/1' } }],
    });
    assert.throws(() => parseModelsTable('no markers'), /markers/);
    assert.throws(() => parseModelsTable(md.replace('Google', 'Mystery')), /unknown vendor/);
  });

  test('parsePricing requires every plan section and reads labelled lines', () => {
    const md = ['---', 'title: "P"', '---', '## Pro', '- **Price:** $1', '- **Status:** live', '## Teams', '## Enterprise', '## Free', '- **Price:** $0'].join('\n');
    const { frontmatter, plans } = parsePricing(md);
    assert.equal(frontmatter.title, 'P');
    assert.deepEqual(plans[0], { name: 'Pro', price: '$1', status: 'live', details: [{ label: 'Price', text: '$1' }, { label: 'Status', text: 'live' }] });
    assert.equal(plans[1].price, null);
    assert.throws(() => parsePricing(md.replace('## Teams', '## Team')), /Teams/);
  });
});
