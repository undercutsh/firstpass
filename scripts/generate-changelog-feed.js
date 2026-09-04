#!/usr/bin/env node
// Regenerates site/changelog.xml (an RSS 2.0 feed) from the single source
// of truth: CHANGELOG.md's dated release entries. [Unreleased] is skipped —
// it has no date and isn't a release yet. Keeps the published feed and the
// changelog from drifting apart, the same way sync-models-md.js keeps
// models.md in sync with evals/src/config.js.
//
// Usage:
//   node scripts/generate-changelog-feed.js          # write the regenerated feed
//   node scripts/generate-changelog-feed.js --check  # exit 1 if changelog.xml is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const feedPath = path.join(repoRoot, 'site/changelog.xml');

const SITE_URL = 'https://getundercut.sh';
const FEED_TITLE = 'Undercut Changelog';
const FEED_DESCRIPTION = 'Dated releases of Undercut (firstpass), the tiered-dispatch skill for coding agents.';

const changelog = readFileSync(changelogPath, 'utf8');

// --- Parse CHANGELOG.md -----------------------------------------------

// Split on release headers: "## [version] - date" or "## [Unreleased]".
const HEADING_RE = /^## \[(.+?)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/gm;

const headings = [...changelog.matchAll(HEADING_RE)];
if (headings.length === 0) {
  console.error('No release headers found in CHANGELOG.md.');
  process.exit(1);
}

function cleanInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](link)
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse a release body (everything between one "## [...]" heading and the
// next) into an ordered list of { section, bullets } for its "### " blocks,
// plus any leading prose before the first "### " subsection.
function parseBody(body) {
  const lines = body.split('\n');
  let intro = [];
  const sections = [];
  let current = null; // { section, bullets: [] }
  let bulletBuf = null;

  const flushBullet = () => {
    if (bulletBuf !== null) {
      current.bullets.push(cleanInline(bulletBuf));
      bulletBuf = null;
    }
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^### (.+)$/);
    if (sectionMatch) {
      flushBullet();
      current = { section: sectionMatch[1].trim(), bullets: [] };
      sections.push(current);
      continue;
    }
    const bulletMatch = line.match(/^- (.+)$/);
    if (bulletMatch) {
      if (current) {
        flushBullet();
        bulletBuf = bulletMatch[1];
      }
      continue;
    }
    if (current) {
      // Continuation line of a wrapped bullet (indented, non-empty), or
      // a blank line separating bullets — either way, fold into the
      // in-progress bullet's text if there is one and the line isn't blank.
      if (bulletBuf !== null && line.trim() !== '') {
        bulletBuf += ' ' + line.trim();
      } else if (bulletBuf !== null && line.trim() === '') {
        flushBullet();
      }
    } else if (line.trim() !== '' && !line.startsWith('[')) {
      // Prose before the first "### " subsection (e.g. a release summary
      // paragraph), and not the reference-link footer lines like
      // "[0.3.0]: https://...".
      intro.push(line.trim());
    }
  }
  flushBullet();

  return { intro: intro.join(' ').trim(), sections };
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const releases = [];
for (let i = 0; i < headings.length; i++) {
  const [, version, date] = headings[i];
  if (version.toLowerCase() === 'unreleased' || !date) continue; // no date, not a release yet

  const start = headings[i].index + headings[i][0].length;
  const end = i + 1 < headings.length ? headings[i + 1].index : changelog.length;
  const body = changelog.slice(start, end);

  releases.push({ version, date, ...parseBody(body) });
}

if (releases.length === 0) {
  console.error('No dated release entries found in CHANGELOG.md (only [Unreleased]?).');
  process.exit(1);
}

// --- Build feed ----------------------------------------------------------

function buildDescriptionHtml(release) {
  const parts = [];
  if (release.intro) parts.push(`<p>${escapeXml(release.intro)}</p>`);
  for (const { section, bullets } of release.sections) {
    if (bullets.length === 0) continue;
    parts.push(`<p><strong>${escapeXml(section)}</strong></p>`);
    parts.push('<ul>' + bullets.map((b) => `<li>${escapeXml(b)}</li>`).join('') + '</ul>');
  }
  return parts.join('\n      ');
}

function rfc822(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toUTCString();
}

const items = releases
  .map((release) => {
    const title = `v${release.version}`;
    const itemLink = `https://github.com/undercutsh/firstpass/releases/tag/v${release.version}`;
    const guid = itemLink;
    const description = buildDescriptionHtml(release);
    return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(itemLink)}</link>
      <guid isPermaLink="true">${escapeXml(guid)}</guid>
      <pubDate>${rfc822(release.date)}</pubDate>
      <description><![CDATA[
      ${description}
      ]]></description>
    </item>`;
  })
  .join('\n');

const lastBuildDate = rfc822(releases[0].date);

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(SITE_URL)}/</link>
    <atom:link href="${escapeXml(SITE_URL)}/changelog.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>scripts/generate-changelog-feed.js</generator>
${items}
  </channel>
</rss>
`;

// --- Write or check --------------------------------------------------------

const checkOnly = process.argv.includes('--check');

let current = null;
try {
  current = readFileSync(feedPath, 'utf8');
} catch {
  current = null;
}

if (current === feed) {
  if (checkOnly) console.log('site/changelog.xml is in sync with CHANGELOG.md.');
  process.exit(0);
}

if (checkOnly) {
  console.error(
    'site/changelog.xml is stale: it no longer matches CHANGELOG.md\'s dated release entries.\n' +
    'Run `node scripts/generate-changelog-feed.js` and commit the result.'
  );
  process.exit(1);
}

writeFileSync(feedPath, feed);
console.log('Updated site/changelog.xml from CHANGELOG.md.');
