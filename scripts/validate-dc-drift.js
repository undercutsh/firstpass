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
//   - META TAGS: site/index.html carries its link-preview/SEO meta block
//     TWICE — once in the real server-rendered <head> (lines ~3-260), and
//     once inside <x-dc><helmet> (~line 337), which the dc-runtime clones
//     into document.head after boot (support.js's createHelmetManager:
//     `doc.head.appendChild(child.cloneNode(true))` for every META/LINK
//     child). Same recurring bug class as the rest of this file: two
//     hand-maintained copies of the same data, and an edit to one that
//     nobody mirrors into the other. It had already happened and nothing
//     caught it — the real <head> carries twitter:creator and the helmet
//     copy does not — because this script diffed the x-dc *data* and never
//     the two meta blocks. checkMetaDrift closes that, comparing both
//     directions (a tag in only one block, and a tag whose content differs)
//     with a deliberate, individually-justified exemption list
//     (META_DRIFT_EXEMPT) for the tags that legitimately belong to only one
//     of the two blocks. That list is the whole reason this check is safe to
//     leave enabled: a guard that fires on a correct difference gets deleted
//     by the next person it blocks, which is worse than no guard.
//
// Usage:
//   node scripts/validate-dc-drift.js          # same as --check (read-only)
//   node scripts/validate-dc-drift.js --check  # exit 1 on drift, no writes
//
// The extract*/check* functions below are pure (string/data in, error-string
// array out) precisely so validate-dc-drift.test.js can feed them
// deliberately drifted fixtures and assert the drift is actually caught —
// not just that today's real repo content happens to pass. Only main() at
// the bottom touches the filesystem or process.exit.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

// Returns the substring starting at `openIdx` (which must point at the
// opening bracket char) through its matching close bracket, inclusive.
export function matchBalanced(text, openIdx, openCh, closeCh) {
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
export function extractArrayLiteral(text, label, { bareConst = false } = {}) {
  const re = bareConst
    ? new RegExp(`const\\s+${label}\\s*=\\s*\\[`)
    : new RegExp(`\\b${label}\\s*:\\s*\\[`);
  const m = re.exec(text);
  if (!m) throw new Error(`could not find "${label}" array literal in the x-dc script`);
  const openIdx = m.index + m[0].length - 1;
  const literal = matchBalanced(text, openIdx, '[', ']');
  return new Function(`return (${literal});`)();
}

export function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

export function stripTags(s) {
  return s.replace(/<[^>]+>/g, '');
}

export function normalizeText(s) {
  return decodeEntities(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Locate the x-dc script and dc-fallback block
// ---------------------------------------------------------------------------

export function extractDcScript(html) {
  const m = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('could not find <script type="text/x-dc"> in site/index.html');
  return m[1];
}

export function extractFallbackBlock(html) {
  const fallbackOpenMatch = /<div id="dc-fallback"[^>]*>/.exec(html);
  if (!fallbackOpenMatch) throw new Error('could not find <div id="dc-fallback"> in site/index.html');
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
}

export function extractHeadBlock(html) {
  const m = /<head(?:\s[^>]*)?>([\s\S]*?)<\/head\s*>/i.exec(html);
  if (!m) throw new Error('could not find <head>...</head> in site/index.html');
  return m[1];
}

export function extractHelmetBlock(html) {
  // Source spelling is <helmet> (support.js rewrites it to <sc-helmet> at
  // runtime, after this file has already read the source).
  const m = /<helmet(?:\s[^>]*)?>([\s\S]*?)<\/helmet\s*>/i.exec(html);
  if (!m) throw new Error('could not find <helmet>...</helmet> inside the x-dc element in site/index.html');
  return m[1];
}

// ---------------------------------------------------------------------------
// 0. No x-dc opening tag inside an HTML comment
// ---------------------------------------------------------------------------

// support.js (the dc-runtime) re-fetches index.html's raw source after boot
// and finds the page template with a plain regex — the FIRST x-dc opening
// tag in the text, comments included — then re-renders the root with
// whatever follows it. A literal tag inside an HTML comment above the real
// one therefore turns the tail of that comment, the hidden #dc-fallback div
// and everything else up to the real tag into rendered page content
// (getundercut.sh shipped exactly that once). Flag every comment carrying
// one, wherever it sits, so nobody has to reason about which position is
// safe.
export const XDC_OPEN_TAG_RE = /<x-dc(?:\s[^>]*)?>/;

export function checkCommentedXdcTag(html) {
  const errors = [];
  const commentRe = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = commentRe.exec(html))) {
    const inner = XDC_OPEN_TAG_RE.exec(m[0]);
    if (!inner) continue;
    const line = html.slice(0, m.index + inner.index).split('\n').length;
    errors.push(
      `site/index.html line ${line}: an HTML comment contains a literal x-dc opening tag ("${inner[0]}"). ` +
        'support.js locates the page template by regex over the raw source and does not skip comments, ' +
        'so this renders the comment text and #dc-fallback above the real page — write "the x-dc element" instead.'
    );
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 1. Demo log (ladderRows)
// ---------------------------------------------------------------------------

// One line of raw text per row from each substitute, in document order.
export function fallbackDemoLogLines(fallbackBlock) {
  const ulMatch = /Example run[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/.exec(fallbackBlock);
  if (!ulMatch) throw new Error('could not find the demo-log <ul> in #dc-fallback');
  return [...ulMatch[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => normalizeText(stripTags(m[1])));
}

export function mdDemoLogLines(md) {
  const secMatch = /## Example run\n([\s\S]*?)(?=\n## )/.exec(md);
  if (!secMatch) throw new Error('could not find "## Example run" section in site/index.md');
  return secMatch[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => normalizeText(l.slice(2)));
}

export function checkDemoLog(sourceName, lines, ladderRows) {
  const errors = [];
  if (lines.length !== ladderRows.length) {
    errors.push(
      `demo log: ${sourceName} has ${lines.length} row(s), x-dc's ladderRows has ${ladderRows.length}`
    );
  }
  ladderRows.forEach((row, i) => {
    const line = lines[i];
    if (line === undefined) return; // count mismatch already reported
    const strippedResult = normalizeText(row.result).replace(/^[✓↑]\s*/, '');
    if (!line.includes(normalizeText(row.unit))) {
      errors.push(`demo log row ${i + 1}: ${sourceName} is missing unit "${row.unit}" (line: "${line}")`);
    }
    if (!line.includes(normalizeText(row.flags))) {
      errors.push(
        `demo log row ${i + 1} (${row.unit}): ${sourceName} doesn't contain flags text "${row.flags}" (line: "${line}")`
      );
    }
    if (!line.includes(strippedResult)) {
      errors.push(
        `demo log row ${i + 1} (${row.unit}): ${sourceName} doesn't contain result "${strippedResult}" (line: "${line}")`
      );
    }
  });
  return errors;
}

// ---------------------------------------------------------------------------
// 2. Install-client picker (INSTALL_CLIENTS)
// ---------------------------------------------------------------------------

export function fallbackInstallClients(fallbackBlock) {
  const ulMatch = /Install for your agent[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/.exec(fallbackBlock);
  if (!ulMatch) throw new Error('could not find the install-client <ul> in #dc-fallback');
  return [...ulMatch[1].matchAll(/<li><strong>([\s\S]*?)<\/strong>\s*—\s*<code>([\s\S]*?)<\/code><\/li>/g)].map(
    (m) => ({ label: normalizeText(stripTags(m[1])), cmd: normalizeText(decodeEntities(m[2])) })
  );
}

export function mdInstallClients(md) {
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

export function checkInstallClients(sourceName, list, installClients, { checkNote }) {
  const errors = [];
  const map = byLabel(list);
  for (const client of installClients) {
    const label = normalizeText(client.label);
    const entry = map.get(label);
    if (!entry) {
      errors.push(`install client "${label}": missing from ${sourceName}`);
      continue;
    }
    const expectedCmd = normalizeText(client.cmd);
    if (entry.cmd !== expectedCmd) {
      errors.push(
        `install client "${label}": command differs in ${sourceName}\n    x-dc:        ${expectedCmd}\n    ${sourceName}: ${entry.cmd}`
      );
    }
    if (checkNote) {
      const expectedNote = normalizeText(client.note.replace(/`/g, ''));
      if (entry.note !== expectedNote) {
        errors.push(
          `install client "${label}": note differs in ${sourceName}\n    x-dc:        ${expectedNote}\n    ${sourceName}: ${entry.note}`
        );
      }
    }
  }
  for (const item of list) {
    if (!installClients.some((c) => normalizeText(c.label) === item.label)) {
      errors.push(`install client "${item.label}" in ${sourceName} has no matching entry in x-dc's INSTALL_CLIENTS`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 3. Pricing grid's Support row (Community / Email / Dedicated) vs pricing.md
//    — the exact field PR #30 found drifted. See file-header note on why the
//    rest of pricingGrid isn't diffed the same way.
// ---------------------------------------------------------------------------

export function checkPricingSupportRow(pricingGrid, pricingMd) {
  const errors = [];
  const supportRow = pricingGrid.find((row) => normalizeText(row.feature) === 'Support');
  if (!supportRow) {
    errors.push('pricingGrid: no row with feature "Support" found — pricing.md drift check can\'t run');
    return errors;
  }
  const tiers = [
    { key: 'free', heading: '## Free', value: supportRow.free },
    { key: 'team', heading: '## Teams', value: supportRow.team },
    { key: 'ent', heading: '## Enterprise', value: supportRow.ent },
  ];
  for (const { heading, value } of tiers) {
    const secRe = new RegExp(`${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
    const secMatch = secRe.exec(pricingMd);
    if (!secMatch) {
      errors.push(`pricing.md: could not find "${heading}" section to check the Support field`);
      continue;
    }
    const includesMatch = /- \*\*Includes:\*\*\s*(.+)/.exec(secMatch[1]);
    if (!includesMatch) {
      errors.push(`pricing.md: "${heading}" section has no "- **Includes:**" line`);
      continue;
    }
    const includesText = includesMatch[1].toLowerCase();
    const wordMatch = /^[a-z]+/.exec(value.toLowerCase());
    const word = wordMatch ? wordMatch[0] : value.toLowerCase();
    if (!includesText.includes(word) || !includesText.includes('support')) {
      errors.push(
        `pricing.md drift: pricingGrid's Support row says "${heading.replace('## ', '')}" = "${value}", but pricing.md's ${heading} Includes line doesn't mention "${word}" support:\n    ${includesMatch[1]}`
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 4. FAQ subset in #dc-fallback vs x-dc's faqs array
// ---------------------------------------------------------------------------

export function fallbackFaqPairs(fallbackBlock) {
  const secMatch = /Frequently asked[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/.exec(fallbackBlock);
  if (!secMatch) throw new Error('could not find the FAQ block in #dc-fallback');
  const paras = [...secMatch[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => normalizeText(stripTags(m[1])));
  const pairs = [];
  for (let i = 0; i + 1 < paras.length; i += 2) {
    pairs.push({ q: paras[i], a: paras[i + 1] });
  }
  return pairs;
}

export function checkFaqDrift(pairs, faqs) {
  const errors = [];
  for (const { q, a } of pairs) {
    const match = faqs.find((f) => normalizeText(f.q) === q);
    if (!match) {
      errors.push(`FAQ: #dc-fallback has a question with no match in x-dc's faqs array: "${q}"`);
      continue;
    }
    const fullAnswer = normalizeText(match.a);
    if (!fullAnswer.startsWith(a)) {
      errors.push(
        `FAQ drift for "${q}":\n    #dc-fallback answer: ${a}\n    x-dc answer:         ${fullAnswer}\n    (the fallback answer must be the start of the full answer, word for word)`
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 5. Meta tags: real <head> vs the <x-dc><helmet> copy
// ---------------------------------------------------------------------------

// Parse a head/helmet block's <meta> tags into { key -> [content, ...] }.
//
// The key is whatever identifies the tag to a consumer: `name`, `property`
// (OpenGraph), or `http-equiv`, lowercased. A <meta> with none of those but
// with `charset` keys as "charset" and carries the charset value as its
// content, so the exemption list can name it. Anything else (a <meta> with
// no identifying attribute at all) is ignored rather than guessed at.
//
// Values are arrays because a key may legitimately repeat (multiple
// og:image:* variants, an og:image per size, ...); comparing sorted arrays
// means "same multiset of values", so reordering the block is not drift but
// dropping one of two copies is.
export function parseMetaTags(block) {
  const out = new Map();
  for (const m of block.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name) => {
      const am = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
      if (!am) return null;
      return am[2] ?? am[3] ?? am[4] ?? '';
    };
    const name = attr('name');
    const property = attr('property');
    const httpEquiv = attr('http-equiv');
    const charset = attr('charset');
    let key;
    let value;
    if (name !== null) {
      key = name.toLowerCase();
      value = attr('content') ?? '';
    } else if (property !== null) {
      key = property.toLowerCase();
      value = attr('content') ?? '';
    } else if (httpEquiv !== null) {
      key = `http-equiv:${httpEquiv.toLowerCase()}`;
      value = attr('content') ?? '';
    } else if (charset !== null) {
      key = 'charset';
      value = charset;
    } else {
      continue; // nothing identifying — not something we can diff
    }
    const values = out.get(key) ?? [];
    values.push(normalizeText(value));
    out.set(key, values);
  }
  return out;
}

// Tags that legitimately differ between the server-rendered <head> and the
// client-rendered <helmet> copy, each with the reason it is exempt. Exempt
// means "the two blocks are allowed to disagree about this key, including one
// of them omitting it entirely" — it does NOT mean the key is forbidden
// anywhere.
//
// Keep this list SHORT and argued. Every entry is a hole in the guard, and
// the guard's value is precisely that everything not listed here must match.
export const META_DRIFT_EXEMPT = Object.freeze({
  // Head-only by specification: the encoding declaration must appear within
  // the first 1024 bytes of the document, and by the time the dc-runtime
  // clones helmet children into document.head the parser has long since
  // committed to an encoding. A cloned <meta charset> is a no-op the HTML
  // spec ignores, so mirroring it into the helmet would be cargo cult.
  charset: 'encoding declaration; only meaningful in the parsed <head>, ignored if appended after boot',

  // Head-only on purpose: theme-color paints the browser/OS chrome around
  // first paint. The helmet copy lands after React + the dc-runtime have
  // loaded from a CDN, i.e. after the moment it would have mattered, and a
  // crawler or a JS-less visitor never runs the helmet at all. The real head
  // is the only place it does any work.
  'theme-color': 'first-paint browser-chrome hint; the helmet copy is applied after boot, too late to matter',

  // Per-route / runtime-rewritten: the served head must name the URL that was
  // actually served, while the helmet belongs to a client-rendered template
  // that can be mounted under a different path (and the runtime rewrites the
  // URL when it does). Requiring these to match would fire the moment a
  // second route reuses the template.
  'og:url': 'per-route canonical URL; the static head names the served URL, the client-rendered copy names the mounted route',
  robots: 'per-page indexing directive; a JS-applied copy cannot retract or add a directive for a crawler that never runs it, so the two are allowed to differ',

  // Helmet-only by design: the dc-runtime's own control channel
  // (support.js's DESIGN_DOC_MODE_RE reads it out of the rendered template).
  // It must never appear in the served head, so it is exempt rather than
  // required.
  design_doc_mode: "dc-runtime control meta read by support.js; belongs to the rendered template only, never to the served head",
});

/**
 * Diff the two meta blocks. Reports, for every non-exempt key:
 *   - present in <head> but missing from <helmet> (the twitter:creator case)
 *   - present in <helmet> but missing from <head>
 *   - present in both with different content
 * Returns an error-string array plus how many keys were actually compared, so
 * the caller can report coverage instead of silently checking nothing if a
 * regex stops matching.
 */
export function checkMetaDrift(headMetas, helmetMetas) {
  const errors = [];
  const keys = [...new Set([...headMetas.keys(), ...helmetMetas.keys()])].sort();
  let compared = 0;
  for (const key of keys) {
    if (Object.hasOwn(META_DRIFT_EXEMPT, key)) continue;
    const inHead = headMetas.get(key);
    const inHelmet = helmetMetas.get(key);
    compared++;
    if (inHead && !inHelmet) {
      errors.push(
        `meta drift: "${key}" is in site/index.html's real <head> but missing from the <x-dc><helmet> copy (head value: "${inHead.join(
          '", "'
        )}"). Add it to the helmet block, or — if it genuinely belongs to only one of the two — add it to META_DRIFT_EXEMPT in scripts/validate-dc-drift.js with the reason.`
      );
      continue;
    }
    if (!inHead && inHelmet) {
      errors.push(
        `meta drift: "${key}" is in the <x-dc><helmet> copy but missing from site/index.html's real <head> (helmet value: "${inHelmet.join(
          '", "'
        )}"). Crawlers and JS-less visitors only ever see the real <head>, so a helmet-only tag is invisible to them. Mirror it into <head>, or exempt it in META_DRIFT_EXEMPT with the reason.`
      );
      continue;
    }
    const a = [...inHead].sort();
    const b = [...inHelmet].sort();
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      errors.push(
        `meta drift: "${key}" content differs between the two blocks in site/index.html\n    <head>:   ${a.join(
          ' | '
        )}\n    <helmet>: ${b.join(' | ')}`
      );
    }
  }
  return { errors, compared };
}

// ---------------------------------------------------------------------------
// Orchestration — pure, given the three raw source documents.
// ---------------------------------------------------------------------------

export function checkAll({ html, md, pricingMd }) {
  const errors = [];
  errors.push(...checkCommentedXdcTag(html));
  const dcScript = extractDcScript(html);
  const fallbackBlock = extractFallbackBlock(html);

  const ladderRows = extractArrayLiteral(dcScript, 'ladderRows');
  errors.push(...checkDemoLog('#dc-fallback', fallbackDemoLogLines(fallbackBlock), ladderRows));
  errors.push(...checkDemoLog('site/index.md', mdDemoLogLines(md), ladderRows));

  const installClients = extractArrayLiteral(dcScript, 'INSTALL_CLIENTS', { bareConst: true });
  errors.push(...checkInstallClients('#dc-fallback', fallbackInstallClients(fallbackBlock), installClients, { checkNote: false }));
  errors.push(...checkInstallClients('site/index.md', mdInstallClients(md), installClients, { checkNote: true }));

  const pricingGrid = extractArrayLiteral(dcScript, 'pricingGrid');
  errors.push(...checkPricingSupportRow(pricingGrid, pricingMd));

  const faqs = extractArrayLiteral(dcScript, 'faqs');
  const faqPairCount = fallbackFaqPairs(fallbackBlock).length;
  errors.push(...checkFaqDrift(fallbackFaqPairs(fallbackBlock), faqs));

  const meta = checkMetaDrift(parseMetaTags(extractHeadBlock(html)), parseMetaTags(extractHelmetBlock(html)));
  errors.push(...meta.errors);

  return {
    errors,
    counts: {
      ladderRows: ladderRows.length,
      installClients: installClients.length,
      faqPairs: faqPairCount,
      metaKeys: meta.compared,
    },
  };
}

// ---------------------------------------------------------------------------
// main() — filesystem + CLI, only runs when invoked directly.
// ---------------------------------------------------------------------------

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const html = readFileSync(path.join(repoRoot, 'site', 'index.html'), 'utf8');
  const md = readFileSync(path.join(repoRoot, 'site', 'index.md'), 'utf8');
  const pricingMd = readFileSync(path.join(repoRoot, 'site', 'pricing.md'), 'utf8');

  let result;
  try {
    result = checkAll({ html, md, pricingMd });
  } catch (e) {
    console.error(`validate-dc-drift.js: ${e.message}`);
    process.exit(1);
  }

  const { errors, counts } = result;

  if (errors.length > 0) {
    console.error('x-dc content has drifted from its static substitutes (#dc-fallback / site/index.md / site/pricing.md) or from the real <head>:\n');
    for (const e of errors) console.error(`  - ${e}\n`);
    console.error(
      `${errors.length} drift issue(s) found. Update the static substitute(s) to match the <x-dc> content in site/index.html, or update x-dc if the substitute is the source of truth.`
    );
    process.exit(1);
  } else {
    console.log(
      `x-dc content is in sync with its static substitutes (${counts.ladderRows} demo-log rows, ${counts.installClients} install clients, pricingGrid Support row, ${counts.faqPairs} FAQ pairs, ${counts.metaKeys} meta keys checked).`
    );
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
