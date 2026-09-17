// Direct unit coverage for validate-og-images.js's detection logic.
//
// As with validate-client-list.test.js: running the script's `--check` CLI
// against the real repo only proves it doesn't false-positive on today's
// correct content. These tests feed the exported pure functions
// deliberately drifted fixtures and assert the drift is actually caught —
// so a broken regex or an inverted comparison can't pass by happening to
// agree with the current site.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractImageMeta, checkPage, checkAll, MAX_CARD_BYTES } from './validate-og-images.js';

const ORIGIN = 'https://getundercut.sh';

const CLIENTS = [
  { slug: 'claude-code', labels: { llms: 'Claude Code' } },
  { slug: 'cursor', labels: { llms: 'Cursor' } },
];

function page(imageUrl, twitterUrl = imageUrl) {
  return `<head>
<meta property="og:title" content="x">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${twitterUrl}">
</head>`;
}

const CARDS = new Map([
  ['claude-code.png', 12_000],
  ['cursor.png', 12_000],
]);

function goodRepo(overrides = {}) {
  return {
    clients: CLIENTS,
    pages: [
      ['claude-code.html', page(`${ORIGIN}/og/claude-code.png`)],
      ['cursor.html', page(`${ORIGIN}/og/cursor.png`)],
      ['privacy.html', page(`${ORIGIN}/og-image.png`)],
      ['index.html', page(`${ORIGIN}/og-image.png`)],
    ],
    cardSizes: new Map(CARDS),
    defaultImageExists: true,
    ...overrides,
  };
}

describe('extractImageMeta', () => {
  test('pulls both tags', () => {
    const { og, twitter } = extractImageMeta(page(`${ORIGIN}/og/cursor.png`));
    assert.deepEqual(og, [`${ORIGIN}/og/cursor.png`]);
    assert.deepEqual(twitter, [`${ORIGIN}/og/cursor.png`]);
  });

  test('collects every copy of a mirrored head, not just the first', () => {
    const doubled = page(`${ORIGIN}/a.png`) + page(`${ORIGIN}/b.png`);
    const { og, twitter } = extractImageMeta(doubled);
    assert.deepEqual(og, [`${ORIGIN}/a.png`, `${ORIGIN}/b.png`]);
    assert.deepEqual(twitter, [`${ORIGIN}/a.png`, `${ORIGIN}/b.png`]);
  });

  test('is empty for a page with no image meta', () => {
    const { og, twitter } = extractImageMeta('<head><title>x</title></head>');
    assert.deepEqual(og, []);
    assert.deepEqual(twitter, []);
  });
});

describe('checkPage', () => {
  const want = `${ORIGIN}/og/cursor.png`;

  test('clean page produces no errors', () => {
    assert.deepEqual(checkPage('cursor.html', page(want), want), []);
  });

  test('catches the copy-pasted default — the actual failure mode', () => {
    const errors = checkPage('cursor.html', page(`${ORIGIN}/og-image.png`), want);
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => e.includes('expected ' + want)));
  });

  test('catches og:image and twitter:image disagreeing with each other', () => {
    const errors = checkPage('cursor.html', page(want, `${ORIGIN}/og/claude-code.png`), want);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('twitter:image'));
  });

  test('catches a missing tag', () => {
    const errors = checkPage('cursor.html', '<head></head>', want);
    assert.equal(errors.length, 2);
    assert.ok(errors.some((e) => e.includes('no <meta property="og:image">')));
    assert.ok(errors.some((e) => e.includes('no <meta name="twitter:image">')));
  });

  test('a mirrored head where only one copy drifted is still caught', () => {
    const html = page(want) + page(`${ORIGIN}/og-image.png`);
    const errors = checkPage('index.html', html, want);
    assert.equal(errors.length, 2);
  });
});

describe('checkAll', () => {
  test('the clean fixture passes', () => {
    assert.deepEqual(checkAll(goodRepo()), []);
  });

  test('a new companion page that kept the default is caught', () => {
    const repo = goodRepo();
    repo.clients = [...CLIENTS, { slug: 'zed', labels: { llms: 'Zed' } }];
    repo.pages.push(['zed.html', page(`${ORIGIN}/og-image.png`)]);
    repo.cardSizes.set('zed.png', 12_000);
    const errors = checkAll(repo);
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => e.startsWith('zed.html:')));
  });

  test('a companion page whose card was never generated is caught', () => {
    const repo = goodRepo();
    repo.cardSizes.delete('cursor.png');
    const errors = checkAll(repo);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('does not exist'));
  });

  test('a utility page given a bespoke card is caught', () => {
    const repo = goodRepo();
    repo.pages[2] = ['privacy.html', page(`${ORIGIN}/og/privacy.png`)];
    const errors = checkAll(repo);
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => e.includes('expected ' + `${ORIGIN}/og-image.png`)));
  });

  test('an oversized card is caught', () => {
    const repo = goodRepo();
    repo.cardSizes.set('cursor.png', MAX_CARD_BYTES + 1);
    const errors = checkAll(repo);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('over the'));
  });

  test('a card at exactly the budget is allowed', () => {
    const repo = goodRepo();
    repo.cardSizes.set('cursor.png', MAX_CARD_BYTES);
    assert.deepEqual(checkAll(repo), []);
  });

  test('a card left behind by a removed client is caught', () => {
    const repo = goodRepo();
    repo.cardSizes.set('devin.png', 12_000);
    const errors = checkAll(repo);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('no client in site/clients.json'));
  });

  test('a missing shared default is caught', () => {
    const errors = checkAll(goodRepo({ defaultImageExists: false }));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('site/og-image.png is missing'));
  });
});
