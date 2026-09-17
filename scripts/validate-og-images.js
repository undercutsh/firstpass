#!/usr/bin/env node
// Checks that every companion page in site/clients.json points its
// og:image and twitter:image at its own card in site/og/<slug>.png, that
// the card exists and is within the size budget, that every non-companion
// utility page still points at the shared site/og-image.png default, and
// that site/og/ has no cards left over from a client that has since been
// removed.
//
// Why this exists: before PR #140 all 45 pages under site/ shared one
// og-image.png, so every link preview looked identical. The failure mode
// the moment that stopped being true is a new companion page landing with
// the copy-pasted default meta still in its <head> and nobody noticing,
// because a wrong-but-valid OG image looks fine in every test that isn't
// a human sharing that specific link. The generator
// (scripts/build-og-images.py) needs python + cairosvg, which CI does not
// have, so this check is deliberately a pure-node reader of committed
// output rather than a re-render-and-diff.
//
// Usage:
//   node scripts/validate-og-images.js          # same as --check (read-only)
//   node scripts/validate-og-images.js --check  # exit 1 on drift, no writes

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(repoRoot, 'site');

const SITE_ORIGIN = 'https://getundercut.sh';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/og-image.png`;

// Per-file budget. These cards are fetched only by a crawler unfurling a
// link -- never by a browser rendering a page, so they are not on any
// page's critical path -- but a runaway one still ships on every deploy.
export const MAX_CARD_BYTES = 200 * 1024;

// ---------------------------------------------------------------------------
// Extraction (pure, so the tests can feed it fixtures)
// ---------------------------------------------------------------------------

// Returns every og:image / twitter:image URL in a page's source. A page
// can legitimately carry more than one copy of its own <head> -- index.html
// mirrors its meta inside an <x-dc> component -- so this collects all of
// them and the caller requires every copy to agree.
export function extractImageMeta(html) {
  const og = [...html.matchAll(/<meta\s+property="og:image"\s+content="([^"]*)"\s*\/?>/g)]
    .map((m) => m[1]);
  const twitter = [...html.matchAll(/<meta\s+name="twitter:image"\s+content="([^"]*)"\s*\/?>/g)]
    .map((m) => m[1]);
  return { og, twitter };
}

// One page's expectations, given the URL it should be pointing at.
export function checkPage(filename, html, expectedUrl) {
  const errors = [];
  const { og, twitter } = extractImageMeta(html);

  if (og.length === 0) errors.push(`${filename}: no <meta property="og:image">`);
  if (twitter.length === 0) errors.push(`${filename}: no <meta name="twitter:image">`);

  for (const [label, found] of [['og:image', og], ['twitter:image', twitter]]) {
    for (const url of found) {
      if (url !== expectedUrl) {
        errors.push(`${filename}: ${label} is ${url}, expected ${expectedUrl}`);
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Whole-repo check
// ---------------------------------------------------------------------------

export function checkAll({ clients, pages, cardSizes, defaultImageExists }) {
  const errors = [];
  const bySlug = new Map(clients.map((c) => [c.slug, c]));

  if (!defaultImageExists) {
    errors.push('site/og-image.png is missing — the utility pages point at it');
  }

  for (const [filename, html] of pages) {
    const slug = filename.replace(/\.html$/, '');
    if (bySlug.has(slug)) {
      errors.push(...checkPage(filename, html, `${SITE_ORIGIN}/og/${slug}.png`));
      const size = cardSizes.get(`${slug}.png`);
      if (size === undefined) {
        errors.push(`${filename}: og:image points at site/og/${slug}.png, which does not exist`);
      } else if (size > MAX_CARD_BYTES) {
        errors.push(
          `site/og/${slug}.png is ${(size / 1024).toFixed(0)}KB, over the ` +
          `${MAX_CARD_BYTES / 1024}KB budget — re-run scripts/build-og-images.py`,
        );
      }
    } else {
      // Not a companion page: 404, about, privacy, terms, accessibility,
      // status, setup, data, developers, brand, and the home page. These
      // keep the shared default on purpose — a bespoke card for /privacy
      // would be work with no reader.
      errors.push(...checkPage(filename, html, DEFAULT_IMAGE));
    }
  }

  for (const card of cardSizes.keys()) {
    const slug = card.replace(/\.png$/, '');
    if (!bySlug.has(slug)) {
      errors.push(
        `site/og/${card} has no client in site/clients.json — ` +
        're-run scripts/build-og-images.py to drop it',
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const clients = JSON.parse(
    readFileSync(path.join(siteDir, 'clients.json'), 'utf8'),
  ).clients;

  const pages = readdirSync(siteDir)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => [f, readFileSync(path.join(siteDir, f), 'utf8')]);

  const ogDir = path.join(siteDir, 'og');
  const cardSizes = new Map();
  if (existsSync(ogDir)) {
    for (const f of readdirSync(ogDir).filter((f) => f.endsWith('.png'))) {
      cardSizes.set(f, statSync(path.join(ogDir, f)).size);
    }
  }

  const errors = checkAll({
    clients,
    pages,
    cardSizes,
    defaultImageExists: existsSync(path.join(siteDir, 'og-image.png')),
  });

  if (errors.length) {
    console.error(`og-image drift (${errors.length}):\n`);
    for (const e of errors) console.error(`  ${e}`);
    console.error('\nSee scripts/build-og-images.py.');
    process.exit(1);
  }

  const total = [...cardSizes.values()].reduce((a, b) => a + b, 0);
  console.log(
    `og images OK: ${cardSizes.size} per-page cards ` +
    `(${(total / 1024).toFixed(0)}KB total, largest ` +
    `${(Math.max(...cardSizes.values()) / 1024).toFixed(1)}KB), ` +
    `${pages.length - cardSizes.size} pages on the shared default`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
