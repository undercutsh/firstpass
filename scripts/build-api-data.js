#!/usr/bin/env node
// Builds site/api/_lib/snapshot.js — the read-only data snapshot behind the
// public JSON API (site/api/*.js, described by site/openapi.json).
//
// Why a generated snapshot: Vercel deploys this project from site/, so a
// function there cannot read skills/, testing/, AGENTS.md or
// .claude-plugin/ at request time. Everything the API serves is copied (or
// mechanically derived) from files already published in this repo, here,
// at commit time — the API never says anything the repo doesn't.
//
// Why .js and not .json: @vercel/node compiles typeless-package ESM to
// CommonJS with Babel, where neither `import ... with { type: 'json' }` nor
// `import.meta.url` (for a readFileSync path) is reliable. A plain
// `export default {...}` module is traced and bundled with zero runtime
// file I/O.
//
// Sources (and nothing else):
//   site/clients.json, site/segments.json, site/teams-availability.json,
//   site/pricing.md, skills/firstpass/SKILL.md, skills/firstpass/models.md,
//   testing/README.md, testing/results/*.json, AGENTS.md (rubric spec
//   version), .claude-plugin/plugin.json (package version).
//
// Usage:
//   node scripts/build-api-data.js          # write the regenerated snapshot
//   node scripts/build-api-data.js --check  # exit 1 if the snapshot is stale

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT_PATH = path.join(repoRoot, 'site/api/_lib/snapshot.js');

const SITE = 'https://getundercut.sh';
const REPO = 'https://github.com/undercutsh/firstpass';
const BLOB = `${REPO}/blob/main`;
const RAW = 'https://raw.githubusercontent.com/undercutsh/firstpass/main';

// models.md column header label -> vendor id (mirror of
// scripts/sync-models-md.js's COLUMN_LABELS, which writes that header).
const VENDOR_IDS = { Anthropic: 'anthropic', OpenAI: 'openai', Google: 'gemini', 'Open-weight': 'openweights' };

function read(rel, root = repoRoot) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function readJson(rel, root) {
  return JSON.parse(read(rel, root));
}

// Drops the repo's in-file comment keys ("//", "//clients", "_readme", ...)
// recursively; they're maintainer notes about the file, not data.
export function stripCommentKeys(value) {
  if (Array.isArray(value)) return value.map(stripCommentKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('//') || k.startsWith('_')) continue;
      out[k] = stripCommentKeys(v);
    }
    return out;
  }
  return value;
}

// Minimal YAML-frontmatter reader for the flat `key: value` blocks these
// files use (values optionally single- or double-quoted).
export function parseFrontmatter(markdown) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(markdown);
  if (!m) return { data: {}, body: markdown };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
    else if (v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v);
    data[kv[1]] = v;
  }
  return { data, body: markdown.slice(m[0].length) };
}

// Returns the markdown under a `## heading` up to the next `## ` heading.
export function section(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

function buildClients(root) {
  const { clients } = readJson('site/clients.json', root);
  return clients.map((c) => ({
    slug: c.slug,
    name: c.labels.llms,
    detailed: c.detailed,
    labels: c.labels,
    url: `${SITE}/${c.slug}`,
  }));
}

function buildPolicy(root, version, rubricVersion) {
  const markdown = read('skills/firstpass/SKILL.md', root);
  const { data } = parseFrontmatter(markdown);
  if (!data.name) throw new Error('skills/firstpass/SKILL.md frontmatter has no name:');
  return {
    name: data.name,
    version,
    rubricVersion,
    description: data.description ?? null,
    format: 'text/markdown',
    markdown,
    source: { url: `${BLOB}/skills/firstpass/SKILL.md`, raw: `${RAW}/skills/firstpass/SKILL.md` },
  };
}

export function parseModelsTable(markdown) {
  const begin = markdown.indexOf('<!-- BEGIN AUTO-GENERATED');
  const end = markdown.indexOf('<!-- END AUTO-GENERATED -->');
  if (begin === -1 || end === -1) throw new Error('models.md is missing its AUTO-GENERATED table markers');
  const rows = markdown
    .slice(begin, end)
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim().replace(/^`|`$/g, '')));
  const [header, , ...body] = rows;
  const vendorLabels = header.slice(1);
  const vendors = vendorLabels.map((label) => {
    const id = VENDOR_IDS[label];
    if (!id) throw new Error(`models.md: unknown vendor column "${label}"`);
    return { id, label };
  });
  const tiers = body.map((cells) => ({
    tier: cells[0],
    models: Object.fromEntries(vendors.map((v, i) => [v.id, cells[i + 1]])),
  }));
  return { vendors, tiers };
}

function buildModels(root) {
  const markdown = read('skills/firstpass/models.md', root);
  const lastUpdated = /Last updated: (\d{4}-\d{2}-\d{2})/.exec(markdown)?.[1] ?? null;
  return {
    lastUpdated,
    ...parseModelsTable(markdown),
    format: 'text/markdown',
    markdown,
    source: { url: `${BLOB}/skills/firstpass/models.md`, raw: `${RAW}/skills/firstpass/models.md` },
  };
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

function buildResults(root) {
  const readme = read('testing/README.md', root);
  const dir = path.join(root, 'testing/results');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const runs = [];
  const cells = [];
  for (const file of files) {
    const { meta, results } = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    runs.push({
      file,
      policy: meta.policy,
      vendors: meta.vendors,
      arms: meta.arms,
      suites: meta.suites,
      seeds: meta.seeds,
      mode: meta.mode,
      generated: meta.generated,
      url: `${BLOB}/testing/results/${file}`,
      raw: `${RAW}/testing/results/${file}`,
    });
    for (const [vendor, arms] of Object.entries(results)) {
      for (const [arm, suites] of Object.entries(arms)) {
        for (const [suite, units] of Object.entries(suites)) {
          cells.push({
            vendor,
            arm,
            suite,
            policy: meta.policy,
            file,
            units: units.length,
            passed: units.filter((u) => u.passed).length,
            costUsd: round(units.reduce((s, u) => s + (u.cost || 0), 0), 6),
          });
        }
      }
    }
  }
  const comparisons = [];
  for (const tiered of cells.filter((c) => c.arm === 'tiered')) {
    const baseline = cells.find((c) => c.arm === 'all-standard' && c.vendor === tiered.vendor && c.suite === tiered.suite);
    if (!baseline) continue;
    const pick = ({ file, policy, units, passed, costUsd }) => ({ file, policy, units, passed, costUsd });
    comparisons.push({
      vendor: tiered.vendor,
      suite: tiered.suite,
      baseline: pick(baseline),
      tiered: pick(tiered),
      costDeltaPct: round(((tiered.costUsd - baseline.costUsd) / baseline.costUsd) * 100, 1),
      passDelta: tiered.passed - baseline.passed,
    });
  }
  const standingLimitation = section(readme, 'Standing limitation: these numbers measure the ladder, not the rubric');
  const caveats = section(readme, 'Caveats');
  if (!standingLimitation || !caveats) throw new Error('testing/README.md is missing its Standing limitation or Caveats section');
  return {
    note:
      'cells and comparisons are computed directly from the raw run files (sum of per-unit cost, count of passed units). ' +
      'Read them with testing/README.md: it explains cells the arithmetic alone does not (e.g. OpenAI HumanEval is reported there as NA because its cheap tier cannot write Python), ' +
      'and its standing limitation applies to every synthetic-suite number.',
    standingLimitation,
    caveats,
    runs,
    cells,
    comparisons,
    methodology: { format: 'text/markdown', markdown: readme },
    source: {
      url: `${BLOB}/testing/README.md`,
      raw: `${RAW}/testing/README.md`,
      rawData: `${REPO}/tree/main/testing/results`,
    },
  };
}

export function parsePricing(markdown) {
  const { data, body } = parseFrontmatter(markdown);
  const plans = [];
  for (const name of ['Pro', 'Teams', 'Enterprise', 'Free']) {
    const text = section(body, name);
    if (text === null) throw new Error(`site/pricing.md has no "## ${name}" section`);
    const details = [];
    for (const line of text.split('\n')) {
      const m = /^- \*\*(.+?):\*\*\s*(.*)$/.exec(line);
      if (m) details.push({ label: m[1], text: m[2] });
    }
    const get = (label) => details.find((d) => d.label === label)?.text ?? null;
    plans.push({ name, price: get('Price'), status: get('Status'), details });
  }
  return { frontmatter: data, plans };
}

function buildPricing(root) {
  const markdown = read('site/pricing.md', root);
  const { frontmatter, plans } = parsePricing(markdown);
  return {
    title: frontmatter.title ?? null,
    summary: frontmatter.description ?? null,
    lastUpdated: frontmatter['last-updated'] ?? null,
    plans,
    format: 'text/markdown',
    markdown,
    source: { url: `${SITE}/pricing.md`, html: `${SITE}/#pricing` },
  };
}

export function buildSnapshot(root = repoRoot) {
  const plugin = readJson('.claude-plugin/plugin.json', root);
  const rubricVersion = /rubric spec version\*\* inside `SKILL\.md` itself \(currently `([^`]+)`\)/.exec(read('AGENTS.md', root))?.[1];
  if (!rubricVersion) throw new Error('AGENTS.md no longer states the rubric spec version');
  return {
    service: { name: plugin.name, version: plugin.version },
    clients: buildClients(root),
    segments: { ...stripCommentKeys(readJson('site/segments.json', root)), source: { url: `${SITE}/segments.json`, html: `${SITE}/setup` } },
    policy: buildPolicy(root, plugin.version, rubricVersion),
    models: buildModels(root),
    results: buildResults(root),
    pricing: buildPricing(root),
    teamsAvailability: {
      ...stripCommentKeys(readJson('site/teams-availability.json', root)),
      notes:
        'Founder-published Teams onboarding windows as ISO-8601 UTC ranges; each window is cut into slotMinutes slots, ' +
        'slots listed in taken are already requested, and slots sooner than leadTimeHours or later than horizonDays from now are not offered. ' +
        'An empty windows list means no windows are open right now.',
      source: { url: `${SITE}/teams-availability.json` },
    },
  };
}

export function renderSnapshot(snapshot) {
  return (
    '// AUTO-GENERATED by scripts/build-api-data.js from files published in this repo.\n' +
    '// Do not edit by hand: run `node scripts/build-api-data.js` (CI runs it with --check).\n' +
    `export default ${JSON.stringify(snapshot, null, 2)};\n`
  );
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const next = renderSnapshot(buildSnapshot());
  const current = existsSync(SNAPSHOT_PATH) ? readFileSync(SNAPSHOT_PATH, 'utf8') : null;
  if (current === next) {
    if (checkOnly) console.log('site/api/_lib/snapshot.js is in sync with its source files.');
    process.exit(0);
  }
  if (checkOnly) {
    console.error(
      'site/api/_lib/snapshot.js is stale: a source file it is built from changed.\n' +
      'Run `node scripts/build-api-data.js` and commit the result.'
    );
    process.exit(1);
  }
  writeFileSync(SNAPSHOT_PATH, next);
  console.log('Updated site/api/_lib/snapshot.js.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
