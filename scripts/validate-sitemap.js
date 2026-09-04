#!/usr/bin/env node
// Diffs the actual pages in site/*.html against the <url><loc> entries in
// site/sitemap.xml. Fails if a real page is missing from the sitemap, or if
// the sitemap points at a page that no longer exists (stale entry from a
// deleted/renamed page). This class of drift caused merge conflicts across
// companion-page PRs before this check existed.
//
// Also checks each entry's <lastmod> against that page's actual last-commit
// date in git history: if site/<page>.html was committed more recently than
// its sitemap <lastmod> claims, that's a stale-lastmod bug (see #101, where
// #98 touched all 18 site/*.html pages in one commit without updating
// sitemap.xml). This check only fires when git history *proves* the
// lastmod is behind — a page with no git history here (new/uncommitted, or
// history not available, e.g. a shallow checkout) is silently skipped
// rather than flagged, so it never produces a false positive for pages
// outside a PR's diff.
//
// Usage:
//   node scripts/validate-sitemap.js          # same as --check (read-only)
//   node scripts/validate-sitemap.js --check  # exit 1 on drift, no writes

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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

// Returns [{ url, lastmod }] for every <url> block that has both a <loc>
// and a <lastmod>. Blocks missing <lastmod> are skipped here — that's a
// different (unlikely, unenforced) shape and not this check's job.
function getSitemapEntries() {
  const xml = readFileSync(sitemapPath, 'utf8');
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)];
  const entries = [];
  for (const [, block] of blocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/);
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (loc && lastmod) {
      entries.push({ url: loc[1].trim(), lastmod: lastmod[1].trim() });
    }
  }
  return entries;
}

function urlToFile(url) {
  const path_ = url.replace(SITE_ORIGIN, '');
  if (path_ === '' || path_ === '/') return 'index.html';
  return `${path_.replace(/^\//, '')}.html`;
}

// Last-commit date (UTC, YYYY-MM-DD) for a tracked file, or null if git has
// no history for it (untracked/new file, or history unavailable — e.g. a
// shallow checkout that doesn't reach the commit that touched it). Callers
// must treat null as "unknown", never as "up to date".
function lastCommitDate(relPath) {
  let out;
  try {
    out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
  if (!out) return null;
  const d = new Date(out);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// lastmod entries whose file's actual last-commit date (per git history) is
// later than the date recorded in sitemap.xml.
function getStaleLastmods(realUrls) {
  const results = [];
  for (const { url, lastmod } of getSitemapEntries()) {
    if (!realUrls.has(url)) continue; // already reported as a stale <loc>
    const file = urlToFile(url);
    const actual = lastCommitDate(path.join('site', file));
    if (actual === null) continue; // no provable history — never flag
    if (actual > lastmod) {
      results.push({ file, url, lastmod, actual });
    }
  }
  return results;
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

const staleLastmods = getStaleLastmods(realUrls);
if (staleLastmods.length > 0) {
  ok = false;
  console.error('sitemap.xml has stale <lastmod> dates (the page was committed more recently):');
  for (const { file, url, lastmod, actual } of staleLastmods) {
    console.error(
      `  - <loc>${url}</loc> has <lastmod>${lastmod}</lastmod>, but site/${file} was last committed on ${actual}`
    );
  }
}

if (ok) {
  console.log(`sitemap.xml is in sync with site/*.html (${realPages.length} pages, ${EXCLUDED_PAGES.size} intentionally excluded).`);
  process.exit(0);
} else {
  console.error(
    `\nIf a page was intentionally excluded, add it to EXCLUDED_PAGES in ${path.relative(repoRoot, fileURLToPath(import.meta.url))}.` +
      (staleLastmods.length > 0
        ? ' For stale <lastmod> dates, update sitemap.xml to the date shown above (or later) for each affected page.'
        : '')
  );
  process.exit(1);
}
