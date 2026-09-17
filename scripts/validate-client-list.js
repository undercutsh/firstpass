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
// A fifth location, added later, is code rather than prose:
//
//   5. evals/src/selfactivation.js's HOSTS table, which classifies each
//      primary install client as 'skill-discovering' (the host matches
//      SKILL.md's description: and decides per session whether to load it)
//      or 'instruction-file' (the documented install appends the policy to
//      a file the host loads unconditionally). The self-activation harness
//      uses that classification to decide which hosts a rate exists for at
//      all, and refuses an id it does not know.
//
// THE EXACT FAILURE MODE DEFENDED (5): a new primary client lands in
// site/clients.json + site/index.html's INSTALL_CLIENTS picker, and nobody
// adds it to HOSTS. Two ways that bites, both silent until someone is
// already running trials:
//
//   - The harness throws "unknown host" for a client the product documents
//     as supported, so the operator either guesses a neighbouring id or
//     leaves the trial unlabelled (and unlabelled trials are excluded from
//     every rate, so a whole sweep can quietly score nothing).
//   - Worse: a client IS in HOSTS but with the wrong `kind`. An
//     instruction-file host misclassified as skill-discovering gets a
//     published self-activation percentage for a mechanism that has no
//     matcher to measure — a fabricated number with real provenance
//     attached. Nothing else in the repo would catch that.
//
// The HOSTS table carried only a "keep this in sync" comment, which is
// exactly the convention-not-construction problem the rest of this file
// exists to remove. checkHosts* below encode the real invariants instead.
// See "What the HOSTS checks do and do not assert" above checkHostsCoverage.
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
// Reused rather than reimplemented: the sibling guard already parses the
// x-dc script's first-party JS object literals, and a second copy of that
// logic here is one more thing to drift.
import { extractDcScript, extractArrayLiteral } from './validate-dc-drift.js';

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
  'setup.html',
  'data.html',
  'brand.html',
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
// 5. evals/src/selfactivation.js's HOSTS table vs the install clients
// ---------------------------------------------------------------------------

// Companion-page slug -> install-client/HOSTS id, for the cases where the two
// id spaces legitimately disagree. site/<slug>.html is a URL and reads as a
// product name ("gemini-cli"); the install picker and HOSTS use the shorter
// key the rest of the tooling passes around ("gemini"). Neither is wrong, so
// the mapping is declared rather than one side being bent to the other.
export const HOST_SLUG_ALIASES = Object.freeze({
  'gemini-cli': 'gemini',
});

export function slugToHostId(slug) {
  return HOST_SLUG_ALIASES[slug] ?? slug;
}

// Install-command shapes that are *evidence* of a host kind. Deliberately
// narrow: each pattern describes a mechanism, not a vendor.
//
// URLs are stripped before matching, and that is load-bearing rather than
// tidiness. Every curl-based install fetches the policy from
// .../main/skills/firstpass/SKILL.md — so the literal string "skills/"
// appears in the command of instruction-file hosts too, and matching it raw
// made all three of them look like both mechanisms at once. The install
// *destination* is what identifies the mechanism; the source URL is the same
// for everyone. (Caught by running this check against the real repo before
// committing it, which is the only reason it isn't shipped as a guard that
// fires on correct content.)
const URL_RE = /\bhttps?:\/\/\S+/g;
const APPEND_TO_INSTRUCTION_FILE = /(^|\s)>>\s*\S+\.md\b/; // `... >> AGENTS.md`
const INSTALLS_INTO_SKILLS = /npx skills add|\/plugin marketplace add|[\w.]+\/skills\b/;

/**
 * What an install command implies about the host's kind, or null when the
 * command matches neither shape (or both) and the classification therefore
 * cannot be derived. Exported so the tests can pin the mechanism mapping
 * without going through a whole fixture.
 */
export function kindFromInstallCommand(cmd) {
  const destination = String(cmd).replace(URL_RE, ' ');
  const appends = APPEND_TO_INSTRUCTION_FILE.test(destination);
  const skills = INSTALLS_INTO_SKILLS.test(destination);
  if (appends && !skills) return 'instruction-file';
  if (skills && !appends) return 'skill-discovering';
  return null;
}

// WHAT THE HOSTS CHECKS DO AND DO NOT ASSERT
//
// Asserted (the real invariant):
//   a. Every id in site/index.html's INSTALL_CLIENTS picker is classified in
//      HOSTS, and every id in HOSTS is one of those clients. The picker is
//      the set of install paths the product documents per host, and HOSTS'
//      whole job is to say what a self-activation rate means for each of
//      them — so on this set the two must correspond exactly.
//   b. Every `detailed: true` client in site/clients.json reaches a HOSTS id
//      (through HOST_SLUG_ALIASES). This is the earlier tripwire: a primary
//      client usually lands in the manifest and its companion page before
//      anyone touches the evals harness.
//   c. Each host's declared `kind` agrees with the mechanism its install
//      command actually uses (kindFromInstallCommand). A wrong kind is the
//      dangerous case — it is the one that yields a published number for a
//      mechanism that cannot produce one.
//
// NOT asserted, deliberately:
//   - The 24 `detailed: false` "additional clients" are NOT required to be
//     in HOSTS. They have companion pages but no entry in the install
//     picker, so the repo does not document a per-host install mechanism for
//     them — there is nothing to derive a `kind` from, and inventing one to
//     satisfy a guard is exactly the failure this check exists to prevent.
//     If someone wants to run trials on one, the harness refuses the id
//     loudly (`unknown host`), which is the safe failure: the fix is to
//     classify it deliberately, not to have been guessed at in advance.
//   - Labels/notes are not compared. HOSTS' label is a display string for a
//     report heading ("Windsurf / generic AGENTS.md"); the picker's is UI
//     copy. Requiring them to match would be demanding false equality on
//     two things that legitimately read differently.
//   - HOSTS is not required to cover every id in *other* arrays in
//     index.html (the calculator's vendor ids and so on). Only
//     INSTALL_CLIENTS is the install-path list.

export function checkHostsCoverage(hosts, installClients) {
  const errors = [];
  const hostIds = Object.keys(hosts);
  const clientIds = installClients.map((c) => c.id);

  for (const id of clientIds) {
    if (!Object.hasOwn(hosts, id)) {
      errors.push(
        `HOSTS drift: install client "${id}" is in site/index.html's INSTALL_CLIENTS but is not classified in ` +
          "evals/src/selfactivation.js's HOSTS. Add it with the kind its install mechanism implies " +
          '(skill-discovering if it installs into a skills directory, instruction-file if the install appends ' +
          'the policy to a file the host loads unconditionally) — otherwise the self-activation harness rejects ' +
          'the id as unknown for a client the product documents as supported.'
      );
    }
  }
  for (const id of hostIds) {
    if (!clientIds.includes(id)) {
      errors.push(
        `HOSTS drift: host "${id}" is classified in evals/src/selfactivation.js's HOSTS but is not an install ` +
          "client in site/index.html's INSTALL_CLIENTS. Either the client was renamed/removed from the picker " +
          '(drop or rename the HOSTS entry) or the id is a typo, which would silently become its own stratum ' +
          'in a self-activation report.'
      );
    }
  }
  return errors;
}

export function checkHostsCoverDetailedClients(hosts, clients) {
  const errors = [];
  for (const client of clients.filter((c) => c.detailed)) {
    const id = slugToHostId(client.slug);
    if (!Object.hasOwn(hosts, id)) {
      errors.push(
        `HOSTS drift: site/clients.json lists "${client.slug}" as a detailed (primary) client, but no HOSTS ` +
          `entry "${id}" exists in evals/src/selfactivation.js. Add it, or — if the slug and the install id ` +
          'legitimately differ — add the mapping to HOST_SLUG_ALIASES in scripts/validate-client-list.js ' +
          'with the reason.'
      );
    }
  }
  return errors;
}

export function checkHostKinds(hosts, hostKinds, installClients) {
  const errors = [];
  const byId = new Map(installClients.map((c) => [c.id, c]));
  for (const [id, host] of Object.entries(hosts)) {
    if (!Object.hasOwn(hostKinds, host.kind)) {
      errors.push(
        `HOSTS drift: host "${id}" declares kind "${host.kind}", which is not a key of HOST_KINDS ` +
          `(${Object.keys(hostKinds).join(', ')}). The report code indexes HOST_KINDS by this value.`
      );
      continue;
    }
    const client = byId.get(id);
    if (!client) continue; // already reported by checkHostsCoverage
    const implied = kindFromInstallCommand(client.cmd);
    if (implied === null) {
      errors.push(
        `HOSTS kind unverifiable for "${id}": its INSTALL_CLIENTS command does not match either recognised ` +
          `mechanism, so this check cannot confirm the declared kind "${host.kind}".\n    cmd: ${client.cmd}\n` +
          '    Resolve it deliberately: confirm the kind by hand, then teach kindFromInstallCommand the new ' +
          'mechanism in scripts/validate-client-list.js. This fails rather than passes because a wrong kind ' +
          'publishes a self-activation rate for a mechanism that has no matcher to measure.'
      );
      continue;
    }
    if (implied !== host.kind) {
      errors.push(
        `HOSTS kind mismatch for "${id}": HOSTS declares "${host.kind}", but its documented install command ` +
          `is the ${implied} mechanism.\n    cmd: ${client.cmd}\n    A host whose install appends the policy to ` +
          'an instruction file has no matcher, so its self-activation rate is undefined, not measurable; a host ' +
          'that installs into a skills directory does have a matcher and must not be excluded from the ' +
          'denominator. Fix whichever of the two is wrong.'
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Orchestration — pure, given every source string + the parsed manifest.
// ---------------------------------------------------------------------------

export function checkAll({ manifest, diskSlugs, indexHtml, llmsTxt, readme, agents, hosts, hostKinds }) {
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

  // The HOSTS checks need the evals table passed in; callers that don't have
  // it (older fixtures) skip this section rather than get a spurious pass —
  // main() always passes it, and a test asserts that.
  if (hosts && hostKinds) {
    const installClients = extractArrayLiteral(extractDcScript(indexHtml), 'INSTALL_CLIENTS', { bareConst: true });
    errors.push(...checkHostsCoverage(hosts, installClients));
    errors.push(...checkHostsCoverDetailedClients(hosts, clients));
    errors.push(...checkHostKinds(hosts, hostKinds, installClients));
  }

  return errors;
}

// ---------------------------------------------------------------------------
// main() — filesystem + CLI, only runs when invoked directly.
// ---------------------------------------------------------------------------

async function main() {
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

  // Imported, not parsed: HOSTS/HOST_KINDS are the live exported tables, so
  // this guard can never disagree with what the harness actually uses.
  const { HOSTS, HOST_KINDS } = await import(
    pathToFileURL(path.join(repoRoot, 'evals', 'src', 'selfactivation.js')).href
  );

  const errors = checkAll({
    manifest,
    diskSlugs,
    indexHtml,
    llmsTxt,
    readme,
    agents,
    hosts: HOSTS,
    hostKinds: HOST_KINDS,
  });

  const checkOnly = process.argv.includes('--check');

  if (errors.length === 0) {
    console.log(
      `Client list is in sync: ${clients.length} companion pages (${detailedClients.length} detailed + ` +
      `${additionalClients.length} additional) match site/clients.json, site/index.html's FAQ ` +
      `(JSON-LD + x-dc), site/llms.txt, README.md, AGENTS.md, and evals/src/selfactivation.js's ` +
      `HOSTS table (${Object.keys(HOSTS).length} hosts classified, kinds cross-checked against their install commands).`
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
  main().catch((e) => {
    console.error(`validate-client-list.js: ${e.message}`);
    process.exit(1);
  });
}
