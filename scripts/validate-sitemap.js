#!/usr/bin/env node
// Diffs the actual pages in site/*.html against the <url><loc> entries in
// site/sitemap.xml. Fails if a real page is missing from the sitemap, or if
// the sitemap points at a page that no longer exists (stale entry from a
// deleted/renamed page). This class of drift caused merge conflicts across
// companion-page PRs before this check existed.
//
// Usage:
//   node scripts/validate-sitemap.js          # same as --check (read-only)
//   node scripts/validate-sitemap.js --check  # exit 1 on drift, no writes

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(repoRoot, 'site');
const sitemapPath = path.join(siteDir, 'sitemap.xml');

// Pages that intentionally do not belong in the sitemap (error pages,
// utility endpoints that aren't crawlable content, etc.). Add to this list
// with a comment explaining why when a new page needs to be excluded.
const EXCLUDED_PAGES = new Set([
  '404.html', // error page — not a real destination to index
]);

const SITE_ORIGIN = 'https://getundercut.sh';

function slugToUrl(filename) {
  if (filename === 'index.html') return `${SITE_ORIGIN}/`;
  const slug = filename.replace(/\.html$/, '');
  return `${SITE_ORIGIN}/${slug}`;
}

function getRealPageUrls() {
  return readdirSync(siteDir)
    .filter((f) => f.endsWith('.html') && !EXCLUDED_PAGES.has(f))
    .map((f) => ({ file: f, url: slugToUrl(f) }));
}

function getSitemapUrls() {
  const xml = readFileSync(sitemapPath, 'utf8');
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((m) => m[1].trim());
}

function urlToFile(url) {
  const path_ = url.replace(SITE_ORIGIN, '');
  if (path_ === '' || path_ === '/') return 'index.html';
  return `${path_.replace(/^\//, '')}.html`;
}

const realPages = getRealPageUrls();
const realUrls = new Set(realPages.map((p) => p.url));
const sitemapUrls = getSitemapUrls();
const sitemapUrlSet = new Set(sitemapUrls);

const missing = realPages.filter((p) => !sitemapUrlSet.has(p.url));
const stale = sitemapUrls.filter((u) => !realUrls.has(u));

// Duplicate <loc> entries are also drift worth catching.
const seen = new Set();
const duplicates = [];
for (const u of sitemapUrls) {
  if (seen.has(u)) duplicates.push(u);
  seen.add(u);
}

let ok = true;

if (missing.length > 0) {
  ok = false;
  console.error('sitemap.xml is missing entries for real pages:');
  for (const p of missing) {
    console.error(`  - ${p.file} -> expected <loc>${p.url}</loc>`);
  }
}

if (stale.length > 0) {
  ok = false;
  console.error('sitemap.xml has stale entries pointing at files that do not exist:');
  for (const u of stale) {
    console.error(`  - <loc>${u}</loc> -> expected site/${urlToFile(u)}`);
  }
}

if (duplicates.length > 0) {
  ok = false;
  console.error('sitemap.xml has duplicate <loc> entries:');
  for (const u of [...new Set(duplicates)]) {
    console.error(`  - ${u}`);
  }
}

if (ok) {
  console.log(`sitemap.xml is in sync with site/*.html (${realPages.length} pages, ${EXCLUDED_PAGES.size} intentionally excluded).`);
  process.exit(0);
} else {
  console.error(
    `\nIf a page was intentionally excluded, add it to EXCLUDED_PAGES in ${path.relative(repoRoot, fileURLToPath(import.meta.url))}.`
  );
  process.exit(1);
}
