#!/usr/bin/env node
// Diffs the content trapped inside site/index.html's <x-dc> component (only
// rendered client-side, after React + the dc-runtime load from a CDN) against
// its two static, JS-independent substitutes: the #dc-fallback div (raw HTML,
// hidden but present in source for non-JS-executing crawlers) and
// site/index.md. This is the recurring bug class from PR #30 — a
// <script type="text/x-dc"> data edit (ladderRows, INSTALL_CLIENTS,
// pricingGrid) that doesn't get hand-mirrored into the substitutes.
//
// Scope, and why it stops where it does:
//   - Demo log (ladderRows) and install-client picker (INSTALL_CLIENTS) get a
//     full structural diff: every field, every row, against both
//     substitutes. These are the two spots the roadmap and PR #30 flagged as
//     having *no* JS-independent copy anywhere else, and their data shape is
//     rigid enough (short fixed strings, fixed row count) to diff precisely
//     without false positives from legitimate prose paraphrasing.
//   - pricingGrid's "Support" row (Community/Email/Dedicated — the exact
//     field PR #30 fixed) gets a targeted check against pricing.md, because
//     it's a small closed enum, not free text.
//   - The rest of pricingGrid (feature-by-feature ✓/— comparison) is
//     deliberately NOT diffed against pricing.md's prose. Tried it while
//     building this check: pricing.md legitimately paraphrases feature names
//     ("6-flag rubric" -> "six-flag rubric", "MIT licensed source" -> just
//     "MIT-licensed SKILL.md", "SOC 2 path" -> "SOC 2 compliance path"), so
//     both an exact-substring check and a keyword-overlap check throw false
//     positives against the *current, correct* content. A real per-feature
//     diff would need a hand-maintained feature-name alias map — which is
//     just the same "hand-mirror every edit" problem this check exists to
//     remove, moved one file over. Narrower and reliable beats comprehensive
//     and flaky (see the task's own guidance on this).
//   - FAQ: #dc-fallback carries a 3-question subset, and for one of them the
//     fallback answer is a deliberate truncation (first sentence only) of the
//     full x-dc answer, not a full copy. So the check requires the fallback
//     answer to be a normalized *prefix* of the x-dc answer for the same
//     question, not an exact match — an exact-match check would falsely flag
//     that intentional truncation as drift.
//
// Usage:
//   node scripts/validate-dc-drift.js          # same as --check (read-only)
//   node scripts/validate-dc-drift.js --check  # exit 1 on drift, no writes

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(repoRoot, 'site', 'index.html'), 'utf8');
const md = readFileSync(path.join(repoRoot, 'site', 'index.md'), 'utf8');
const pricingMd = readFileSync(path.join(repoRoot, 'site', 'pricing.md'), 'utf8');

const errors = [];
function fail(msg) {
  errors.push(msg);
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

// Returns the substring starting at `openIdx` (which must point at the
// opening bracket char) through its matching close bracket, inclusive.
function matchBalanced(text, openIdx, openCh, closeCh) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === openCh) depth++;
    else if (text[i] === closeCh) {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  throw new Error(`unbalanced ${openCh}${closeCh} starting at index ${openIdx}`);
}

// Finds `<label>: [` (or a bare `const <label> = [`) in `text` and returns the
// parsed array literal. The x-dc script is trusted first-party source (this
// repo's own content, not external input), so evaluating the literal
// directly is the only robust way to read data shaped as JS object literals
// rather than JSON.
function extractArrayLiteral(text, label, { bareConst = false } = {}) {
  const re = bareConst
    ? new RegExp(`const\\s+${label}\\s*=\\s*\\[`)
    : new RegExp(`\\b${label}\\s*:\\s*\\[`);
  const m = re.exec(text);
  if (!m) throw new Error(`could not find "${label}" array literal in the x-dc script`);
  const openIdx = m.index + m[0].length - 1;
  const literal = matchBalanced(text, openIdx, '[', ']');
  return new Function(`return (${literal});`)();
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '');
}

function normalizeText(s) {
  return decodeEntities(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Locate the x-dc script and dc-fallback block
// ---------------------------------------------------------------------------

const dcScriptMatch = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html);
if (!dcScriptMatch) {
  console.error('validate-dc-drift.js: could not find <script type="text/x-dc"> in site/index.html');
  process.exit(1);
}
const dcScript = dcScriptMatch[1];

const fallbackOpenMatch = /<div id="dc-fallback"[^>]*>/.exec(html);
if (!fallbackOpenMatch) {
  console.error('validate-dc-drift.js: could not find <div id="dc-fallback"> in site/index.html');
  process.exit(1);
}
const fallbackBlock = (() => {
  // Balance <div ...> / </div> tags (not just brackets) since the fallback
  // block contains a nested <div> for the FAQ section.
  const startIdx = fallbackOpenMatch.index;
  const tagRe = /<div\b[^>]*>|<\/div>/gi;
  tagRe.lastIndex = startIdx + fallbackOpenMatch[0].length;
  let depth = 1;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0].toLowerCase() === '</div>') depth--;
    else depth++;
    if (depth === 0) return html.slice(startIdx, tagRe.lastIndex);
  }
  throw new Error('unbalanced <div id="dc-fallback"> — could not find its closing tag');
})();

// ---------------------------------------------------------------------------
// 1. Demo log (ladderRows)
// ---------------------------------------------------------------------------

const ladderRows = extractArrayLiteral(dcScript, 'ladderRows');

// One line of raw text per row from each substitute, in document order.
function fallbackDemoLogLines() {
  const ulMatch = /Example run[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/.exec(fallbackBlock);
  if (!ulMatch) throw new Error('could not find the demo-log <ul> in #dc-fallback');
  return [...ulMatch[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => normalizeText(stripTags(m[1])));
}

function mdDemoLogLines() {
  const secMatch = /## Example run\n([\s\S]*?)(?=\n## )/.exec(md);
  if (!secMatch) throw new Error('could not find "## Example run" section in site/index.md');
  return secMatch[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => normalizeText(l.slice(2)));
}

function checkDemoLog(sourceName, lines) {
  if (lines.length !== ladderRows.length) {
    fail(
      `demo log: ${sourceName} has ${lines.length} row(s), x-dc's ladderRows has ${ladderRows.length}`
    );
  }
  ladderRows.forEach((row, i) => {
    const line = lines[i];
    if (line === undefined) return; // count mismatch already reported
    const strippedResult = normalizeText(row.result).replace(/^[✓↑]\s*/, '');
    if (!line.includes(normalizeText(row.unit))) {
      fail(`demo log row ${i + 1}: ${sourceName} is missing unit "${row.unit}" (line: "${line}")`);
    }
    if (!line.includes(normalizeText(row.flags))) {
      fail(
        `demo log row ${i + 1} (${row.unit}): ${sourceName} doesn't contain flags text "${row.flags}" (line: "${line}")`
      );
    }
    if (!line.includes(strippedResult)) {
      fail(
        `demo log row ${i + 1} (${row.unit}): ${sourceName} doesn't contain result "${strippedResult}" (line: "${line}")`
      );
    }
  });
}

checkDemoLog('#dc-fallback', fallbackDemoLogLines());
checkDemoLog('site/index.md', mdDemoLogLines());

// ---------------------------------------------------------------------------
// 2. Install-client picker (INSTALL_CLIENTS)
// ---------------------------------------------------------------------------

const installClients = extractArrayLiteral(dcScript, 'INSTALL_CLIENTS', { bareConst: true });

function fallbackInstallClients() {
  const ulMatch = /Install for your agent[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/.exec(fallbackBlock);
  if (!ulMatch) throw new Error('could not find the install-client <ul> in #dc-fallback');
  return [...ulMatch[1].matchAll(/<li><strong>([\s\S]*?)<\/strong>\s*—\s*<code>([\s\S]*?)<\/code><\/li>/g)].map(
    (m) => ({ label: normalizeText(stripTags(m[1])), cmd: normalizeText(decodeEntities(m[2])) })
  );
}

function mdInstallClients() {
  const secMatch = /### Install for your agent\n([\s\S]*?)(?=\n## |\n### )/.exec(md);
  if (!secMatch) throw new Error('could not find "### Install for your agent" section in site/index.md');
  const rows = secMatch[1]
    .split('\n')
    .filter((l) => l.trim().startsWith('|') && !/^\|\s*-+\s*\|/.test(l.trim()) && !/^\|\s*Agent\s*\|/.test(l.trim()));
  return rows.map((l) => {
    const cells = l
      .trim()
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    const [label, cmdCell, noteCell] = cells;
    return {
      label: normalizeText(label),
      cmd: normalizeText(cmdCell.replace(/^`|`$/g, '')),
      note: normalizeText(noteCell.replace(/`/g, '')),
    };
  });
}

function byLabel(list) {
  const map = new Map();
  for (const item of list) map.set(item.label, item);
  return map;
}

function checkInstallClients(sourceName, list, { checkNote }) {
  const map = byLabel(list);
  for (const client of installClients) {
    const label = normalizeText(client.label);
    const entry = map.get(label);
    if (!entry) {
      fail(`install client "${label}": missing from ${sourceName}`);
      continue;
    }
    const expectedCmd = normalizeText(client.cmd);
    if (entry.cmd !== expectedCmd) {
      fail(
        `install client "${label}": command differs in ${sourceName}\n    x-dc:        ${expectedCmd}\n    ${sourceName}: ${entry.cmd}`
      );
    }
    if (checkNote) {
      const expectedNote = normalizeText(client.note.replace(/`/g, ''));
      if (entry.note !== expectedNote) {
        fail(
          `install client "${label}": note differs in ${sourceName}\n    x-dc:        ${expectedNote}\n    ${sourceName}: ${entry.note}`
        );
      }
    }
  }
  for (const item of list) {
    if (!installClients.some((c) => normalizeText(c.label) === item.label)) {
      fail(`install client "${item.label}" in ${sourceName} has no matching entry in x-dc's INSTALL_CLIENTS`);
    }
  }
}

checkInstallClients('#dc-fallback', fallbackInstallClients(), { checkNote: false });
checkInstallClients('site/index.md', mdInstallClients(), { checkNote: true });

// ---------------------------------------------------------------------------
// 3. Pricing grid's Support row (Community / Email / Dedicated) vs pricing.md
//    — the exact field PR #30 found drifted. See file-header note on why the
//    rest of pricingGrid isn't diffed the same way.
// ---------------------------------------------------------------------------

const pricingGrid = extractArrayLiteral(dcScript, 'pricingGrid');
const supportRow = pricingGrid.find((row) => normalizeText(row.feature) === 'Support');
if (!supportRow) {
  fail('pricingGrid: no row with feature "Support" found — pricing.md drift check can\'t run');
} else {
  const tiers = [
    { key: 'free', heading: '## Free', value: supportRow.free },
    { key: 'team', heading: '## Teams', value: supportRow.team },
    { key: 'ent', heading: '## Enterprise', value: supportRow.ent },
  ];
  for (const { heading, value } of tiers) {
    const secRe = new RegExp(`${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
    const secMatch = secRe.exec(pricingMd);
    if (!secMatch) {
      fail(`pricing.md: could not find "${heading}" section to check the Support field`);
      continue;
    }
    const includesMatch = /- \*\*Includes:\*\*\s*(.+)/.exec(secMatch[1]);
    if (!includesMatch) {
      fail(`pricing.md: "${heading}" section has no "- **Includes:**" line`);
      continue;
    }
    const includesText = includesMatch[1].toLowerCase();
    const wordMatch = /^[a-z]+/.exec(value.toLowerCase());
    const word = wordMatch ? wordMatch[0] : value.toLowerCase();
    if (!includesText.includes(word) || !includesText.includes('support')) {
      fail(
        `pricing.md drift: pricingGrid's Support row says "${heading.replace('## ', '')}" = "${value}", but pricing.md's ${heading} Includes line doesn't mention "${word}" support:\n    ${includesMatch[1]}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4. FAQ subset in #dc-fallback vs x-dc's faqs array
// ---------------------------------------------------------------------------

const faqs = extractArrayLiteral(dcScript, 'faqs');

function fallbackFaqPairs() {
  const secMatch = /Frequently asked[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/.exec(fallbackBlock);
  if (!secMatch) throw new Error('could not find the FAQ block in #dc-fallback');
  const paras = [...secMatch[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => normalizeText(stripTags(m[1])));
  const pairs = [];
  for (let i = 0; i + 1 < paras.length; i += 2) {
    pairs.push({ q: paras[i], a: paras[i + 1] });
  }
  return pairs;
}

for (const { q, a } of fallbackFaqPairs()) {
  const match = faqs.find((f) => normalizeText(f.q) === q);
  if (!match) {
    fail(`FAQ: #dc-fallback has a question with no match in x-dc's faqs array: "${q}"`);
    continue;
  }
  const fullAnswer = normalizeText(match.a);
  if (!fullAnswer.startsWith(a)) {
    fail(
      `FAQ drift for "${q}":\n    #dc-fallback answer: ${a}\n    x-dc answer:         ${fullAnswer}\n    (the fallback answer must be the start of the full answer, word for word)`
    );
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error('x-dc content has drifted from its static substitutes (#dc-fallback / site/index.md / site/pricing.md):\n');
  for (const e of errors) console.error(`  - ${e}\n`);
  console.error(
    `${errors.length} drift issue(s) found. Update the static substitute(s) to match the <x-dc> content in site/index.html, or update x-dc if the substitute is the source of truth.`
  );
  process.exit(1);
} else {
  console.log(
    `x-dc content is in sync with its static substitutes (${ladderRows.length} demo-log rows, ${installClients.length} install clients, pricingGrid Support row, ${fallbackFaqPairs().length} FAQ pairs checked).`
  );
  process.exit(0);
}
