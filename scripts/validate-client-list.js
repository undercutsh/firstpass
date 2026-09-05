#!/usr/bin/env node
// site/clients.json is the single source of truth for every per-agent
// companion page (site/<slug>.html). Four hand-written locations quote "how
// many clients" or "which clients" and have to stay in sync with it by
// convention rather than by construction:
//
//   1. site/index.html — the "Which coding agents does this work with?" FAQ
//      answer, in BOTH its JSON-LD FAQPage block and its x-dc mirror (the
//      client-side-rendered copy of the same answer).
//   2. site/llms.txt — the "## Client setup guides" markdown link list.
//   3. README.md — the install-section client list (4 directory bullets +
//      6 named-inline clients + a "N more clients (...)" parenthetical).
//   4. AGENTS.md — the "## Client install matrix" section: 10 <details>
//      blocks expanded in full, plus an "Additional clients" table, plus
//      three sentences that state the 10/N-more counts as prose numerals.
//
// This is the recurring drift class behind PR #139 and #140 ("29,
// verified" going stale, then going stale again immediately after): a new
// companion page lands, and one or more of the four locations above don't
// get hand-mirrored. This script cross-checks all four against
// site/clients.json (count, membership, and the numerals each location
// states) instead of relying on someone remembering to update everything by
// hand. It does NOT rewrite prose — see the file header note in
// scripts/validate-dc-drift.js for why generating hand-written prose from
// data is a worse trade here than just catching drift at review time.
//
// Usage:
//   node scripts/validate-client-list.js          # print a report
//   node scripts/validate-client-list.js --check  # exit 1 on any drift
//
// The check* functions below are pure (string/data in, error-string array
// out) precisely so validate-client-list.test.js can feed them deliberately
// drifted fixtures and assert the drift is actually caught — not just that
// today's real repo content happens to pass. Only main() at the bottom
// touches the filesystem or process.exit.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Non-companion pages that live in site/*.html but aren't per-agent
// companion pages, so they're never expected in clients.json. Mirrors the
// same exclusion pattern as EXCLUDED_PAGES in validate-sitemap.js.
const NON_COMPANION_PAGES = new Set([
  '404.html',
  'index.html',
  'about.html',
  'developers.html',
  'accessibility.html',
  'privacy.html',
  'terms.html',
  'status.html',
]);

export function readCompanionSlugsFromDisk(siteDir) {
  return readdirSync(siteDir)
    .filter((f) => f.endsWith('.html') && !NON_COMPANION_PAGES.has(f))
    .map((f) => f.replace(/\.html$/, ''))
    .sort();
}

export function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// 0. Manifest vs. disk reconciliation
// ---------------------------------------------------------------------------

export function checkManifestVsDisk(manifestSlugs, diskSlugs) {
  const errors = [];
  for (const slug of diskSlugs) {
    if (!manifestSlugs.includes(slug)) {
      errors.push(`site/${slug}.html exists but has no entry in site/clients.json.`);
    }
  }
  for (const slug of manifestSlugs) {
    if (!diskSlugs.includes(slug)) {
      errors.push(`site/clients.json lists "${slug}" but site/${slug}.html does not exist.`);
    }
  }
  const dupSlugs = manifestSlugs.filter((s, i) => manifestSlugs.indexOf(s) !== i);
  if (dupSlugs.length) errors.push(`site/clients.json has duplicate slug(s): ${[...new Set(dupSlugs)].join(', ')}`);
  return errors;
}

// ---------------------------------------------------------------------------
// 1. site/index.html — FAQ JSON-LD + x-dc mirror
// ---------------------------------------------------------------------------

export function extractFaqAnswers(html) {
  // JSON-LD occurrence: "name": "Which coding agents..." then "text": "...".
  const jsonldMatch = html.match(
    /"name":\s*"Which coding agents does this work with\?"[\s\S]*?"text":\s*"((?:[^"\\]|\\.)*)"/
  );
  // x-dc mirror occurrence: { q: '...', a: '...' } inside the FAQ array.
  const dcMatch = html.match(
    /q:\s*'Which coding agents does this work with\?',\s*a:\s*'((?:[^'\\]|\\.)*)'/
  );
  return {
    jsonld: jsonldMatch ? jsonldMatch[1].replace(/\\"/g, '"').replace(/\\u2019/g, '\u2019') : null,
    dc: dcMatch ? dcMatch[1].replace(/\\'/g, "'") : null,
  };
}

export function checkFaqAnswers(faqAnswers) {
  const errors = [];
  if (!faqAnswers.jsonld) {
    errors.push('Could not find the "Which coding agents does this work with?" JSON-LD FAQ answer in site/index.html.');
  }
  if (!faqAnswers.dc) {
    errors.push('Could not find the "Which coding agents does this work with?" x-dc mirror answer in site/index.html.');
  }
  if (faqAnswers.jsonld && faqAnswers.dc && faqAnswers.jsonld !== faqAnswers.dc) {
    errors.push(
      'The FAQ answer text differs between the JSON-LD block and the x-dc mirror in site/index.html ' +
      '(this is the exact drift pattern from PR #139/#140 — they must be character-identical).'
    );
  }
  return errors;
}

export function checkFaqCountAndMembership(text, sourceLabel, clients) {
  const errors = [];
  if (!text) return errors;
  const TOTAL = clients.length;
  const countMatch = text.match(/^(\d+),\s*verified:/);
  if (!countMatch) {
    errors.push(`${sourceLabel}: expected the answer to start with "<N>, verified: ...".`);
    return errors;
  }
  const claimedCount = Number(countMatch[1]);
  if (claimedCount !== TOTAL) {
    errors.push(`${sourceLabel}: claims ${claimedCount} clients, but site/clients.json has ${TOTAL}.`);
  }
  for (const client of clients) {
    if (!text.includes(client.labels.faq)) {
      errors.push(`${sourceLabel}: missing "${client.labels.faq}" (${client.slug}).`);
    }
  }
  // Rough membership count via comma-splitting the client list portion (after
  // "verified: " and before the trailing " — each reads..." sentence), so a
  // client added to clients.json but never mentioned in prose, or vice
  // versa, shows up as a count mismatch even if individual names slip past
  // the includes() check above (e.g. a name that's a substring of another).
  const listPortion = text.replace(/^\d+,\s*verified:\s*/, '').split(/\s*—\s*each reads/)[0];
  const items = listPortion
    .split(',')
    .map((s) => s.trim().replace(/^and\s+/, ''))
    .filter(Boolean);
  if (items.length !== TOTAL) {
    errors.push(`${sourceLabel}: comma-separated client list has ${items.length} entries, expected ${TOTAL}.`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 2. site/llms.txt — "## Client setup guides" link list
// ---------------------------------------------------------------------------

export function checkLlmsTxt(llmsTxt, clients) {
  const errors = [];
  const TOTAL = clients.length;
  const clientGuidesMatch = llmsTxt.match(/## Client setup guides\n.*\n(.*)\n/);
  if (!clientGuidesMatch) {
    errors.push('site/llms.txt: could not find the "## Client setup guides" link line.');
    return errors;
  }
  const line = clientGuidesMatch[1];
  const links = [...line.matchAll(/\[([^\]]+)\]\(https:\/\/getundercut\.sh\/([a-z0-9-]+)\)/g)];
  if (links.length !== TOTAL) {
    errors.push(`site/llms.txt: "## Client setup guides" has ${links.length} links, expected ${TOTAL}.`);
  }
  const linkedSlugs = new Set(links.map((m) => m[2]));
  for (const client of clients) {
    if (!linkedSlugs.has(client.slug)) {
      errors.push(`site/llms.txt: "## Client setup guides" is missing a link to /${client.slug} (${client.labels.llms}).`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 3. README.md — install-section client list
// ---------------------------------------------------------------------------

export function checkReadme(readme, clients) {
  const errors = [];
  const detailedClients = clients.filter((c) => c.detailed);
  const additionalClients = clients.filter((c) => !c.detailed);
  const readmeFlat = collapse(readme);

  // The clients given their own directory bullet under "Every client uses
  // its own directory:".
  const dirSectionMatch = readme.match(/Every client uses its own directory:\n\n([\s\S]*?)\n\n/);
  const primaryLabels = dirSectionMatch
    ? [...dirSectionMatch[1].matchAll(/^-\s+\*\*([^*]+)\*\*/gm)].map((m) => m[1].trim())
    : [];
  if (!dirSectionMatch || primaryLabels.length === 0) {
    errors.push('README.md: could not find the per-client directory bullet list under "Every client uses its own directory:".');
  }

  // "Full install steps for these plus X, Y, ..., and N more clients (A, B, ...)"
  const namedMatch = readmeFlat.match(
    /Full install steps for these plus (.+?), and (\d+) more clients \(([^)]*)\)/
  );
  if (!namedMatch) {
    errors.push('README.md: could not find the "Full install steps for these plus ... and N more clients (...)" sentence.');
    return errors;
  }

  const namedLabels = namedMatch[1].split(',').map((s) => s.trim());
  const claimedMoreCount = Number(namedMatch[2]);
  const additionalLabels = namedMatch[3]
    .split(',')
    .map((s) => s.trim().replace(/^and\s+/, ''))
    .filter(Boolean);

  if (claimedMoreCount !== additionalClients.length) {
    errors.push(
      `README.md: says "${claimedMoreCount} more clients" but site/clients.json has ${additionalClients.length} ` +
      `non-detailed clients (${detailedClients.length} detailed + ${additionalClients.length} additional = ${clients.length}).`
    );
  }
  if (additionalLabels.length !== additionalClients.length) {
    errors.push(
      `README.md: the "(...)" parenthetical after "N more clients" lists ${additionalLabels.length} clients, ` +
      `expected ${additionalClients.length}.`
    );
  }
  for (const client of additionalClients) {
    if (!additionalLabels.includes(client.labels.readme)) {
      errors.push(`README.md: the "N more clients (...)" parenthetical is missing "${client.labels.readme}" (${client.slug}).`);
    }
  }

  const namedAndPrimaryLabels = [...primaryLabels, ...namedLabels];
  if (namedAndPrimaryLabels.length !== detailedClients.length) {
    errors.push(
      `README.md: ${primaryLabels.length} directory bullet(s) + ${namedLabels.length} named-inline client(s) = ` +
      `${namedAndPrimaryLabels.length}, expected ${detailedClients.length} detailed clients from site/clients.json.`
    );
  }
  for (const client of detailedClients) {
    if (!namedAndPrimaryLabels.includes(client.labels.readme)) {
      errors.push(`README.md: "${client.labels.readme}" (${client.slug}) is a detailed client but appears in neither the directory bullets nor the named-inline list.`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 4. AGENTS.md — "## Client install matrix" section
// ---------------------------------------------------------------------------

export function checkAgentsMd(agents, clients) {
  const errors = [];
  const detailedClients = clients.filter((c) => c.detailed);
  const additionalClients = clients.filter((c) => !c.detailed);

  const matrixSectionMatch = agents.match(/## Client install matrix\n([\s\S]*?)\n### Verify your install/);
  if (!matrixSectionMatch) {
    errors.push('AGENTS.md: could not find the "## Client install matrix" section (expected to end before "### Verify your install").');
    return errors;
  }

  const matrixSection = matrixSectionMatch[1];
  const additionalSectionMatch = matrixSection.match(/### Additional clients\n([\s\S]*)$/);
  const detailedSection = additionalSectionMatch
    ? matrixSection.slice(0, additionalSectionMatch.index)
    : matrixSection;

  // <details><summary><strong>Label</strong>...</summary></details> blocks.
  const detailedLabels = [...detailedSection.matchAll(/<summary><strong>([^<]+)<\/strong>/g)].map((m) => m[1].trim());
  if (detailedLabels.length !== detailedClients.length) {
    errors.push(`AGENTS.md: found ${detailedLabels.length} <details> client block(s), expected ${detailedClients.length} detailed clients.`);
  }
  for (const client of detailedClients) {
    if (!detailedLabels.some((label) => label.includes(client.labels.agents))) {
      errors.push(`AGENTS.md: no <details> block's <summary> contains "${client.labels.agents}" (${client.slug}).`);
    }
  }

  // Prose numerals in the intro paragraph.
  const detailedCountMatch = collapse(detailedSection).match(/The (\d+) clients detailed in full below/);
  if (detailedCountMatch && Number(detailedCountMatch[1]) !== detailedClients.length) {
    errors.push(`AGENTS.md: says "The ${detailedCountMatch[1]} clients detailed in full below" but there are ${detailedClients.length}.`);
  }
  const furtherCountMatch = collapse(detailedSection).match(/A further (\d+) clients have companion pages/);
  if (furtherCountMatch && Number(furtherCountMatch[1]) !== additionalClients.length) {
    errors.push(
      `AGENTS.md: says "A further ${furtherCountMatch[1]} clients have companion pages" but ` +
      `site/clients.json has ${additionalClients.length} non-detailed clients.`
    );
  }

  // "Additional clients" table: | Client | ... | Source |
  if (!additionalSectionMatch) {
    errors.push('AGENTS.md: could not find the "### Additional clients" subsection.');
    return errors;
  }

  const additionalSection = additionalSectionMatch[0];
  const moreCountMatch = collapse(additionalSection).match(/(\d+) more companion pages landed/);
  if (moreCountMatch && Number(moreCountMatch[1]) !== additionalClients.length) {
    errors.push(
      `AGENTS.md: "Additional clients" section says "${moreCountMatch[1]} more companion pages landed" but ` +
      `site/clients.json has ${additionalClients.length} non-detailed clients.`
    );
  }
  const tableRows = [...additionalSection.matchAll(/^\|\s*([^|]+?)\s*\|[^|]*\|\s*`site\/([a-z0-9-]+)\.html`\s*\|/gm)];
  if (tableRows.length !== additionalClients.length) {
    errors.push(`AGENTS.md: "Additional clients" table has ${tableRows.length} row(s), expected ${additionalClients.length}.`);
  }
  const tableSlugs = new Set(tableRows.map((m) => m[2]));
  for (const client of additionalClients) {
    if (!tableSlugs.has(client.slug)) {
      errors.push(`AGENTS.md: "Additional clients" table is missing a row for site/${client.slug}.html (${client.labels.agents}).`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Orchestration — pure, given every source string + the parsed manifest.
// ---------------------------------------------------------------------------

export function checkAll({ manifest, diskSlugs, indexHtml, llmsTxt, readme, agents }) {
  const clients = manifest.clients;
  const errors = [];
  const manifestSlugs = clients.map((c) => c.slug).sort();

  errors.push(...checkManifestVsDisk(manifestSlugs, diskSlugs));

  const faqAnswers = extractFaqAnswers(indexHtml);
  errors.push(...checkFaqAnswers(faqAnswers));
  errors.push(...checkFaqCountAndMembership(faqAnswers.jsonld, 'site/index.html FAQ (JSON-LD)', clients));
  errors.push(...checkFaqCountAndMembership(faqAnswers.dc, 'site/index.html FAQ (x-dc mirror)', clients));

  errors.push(...checkLlmsTxt(llmsTxt, clients));
  errors.push(...checkReadme(readme, clients));
  errors.push(...checkAgentsMd(agents, clients));

  return errors;
}

// ---------------------------------------------------------------------------
// main() — filesystem + CLI, only runs when invoked directly.
// ---------------------------------------------------------------------------

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const siteDir = path.join(repoRoot, 'site');

  const manifest = JSON.parse(readFileSync(path.join(siteDir, 'clients.json'), 'utf8'));
  const clients = manifest.clients;
  const detailedClients = clients.filter((c) => c.detailed);
  const additionalClients = clients.filter((c) => !c.detailed);

  const diskSlugs = readCompanionSlugsFromDisk(siteDir);
  const indexHtml = readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  const llmsTxt = readFileSync(path.join(siteDir, 'llms.txt'), 'utf8');
  const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const agents = readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');

  const errors = checkAll({ manifest, diskSlugs, indexHtml, llmsTxt, readme, agents });

  const checkOnly = process.argv.includes('--check');

  if (errors.length === 0) {
    console.log(
      `Client list is in sync: ${clients.length} companion pages (${detailedClients.length} detailed + ` +
      `${additionalClients.length} additional) match site/clients.json, site/index.html's FAQ ` +
      `(JSON-LD + x-dc), site/llms.txt, README.md, and AGENTS.md.`
    );
    process.exit(0);
  }

  console.error(`Client list drift detected (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    '\nUpdate site/clients.json first if a client was added/removed/renamed, then bring site/index.html\'s ' +
    'FAQ (both the JSON-LD block and its x-dc mirror), site/llms.txt, README.md, and AGENTS.md\'s client ' +
    'install matrix back in line with it.'
  );
  process.exit(checkOnly ? 1 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
