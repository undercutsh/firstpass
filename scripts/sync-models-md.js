#!/usr/bin/env node
// Regenerates the tier->model table in skills/firstpass/models.md from the
// single source of truth: evals/src/config.js's VENDORS roster. Keeps the
// human-facing doc and the eval harness from drifting apart.
//
// Usage:
//   node scripts/sync-models-md.js          # write the regenerated table
//   node scripts/sync-models-md.js --check  # exit 1 if models.md is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { VENDORS, TIER_ORDER } = await import(
  path.join(repoRoot, 'evals/src/config.js')
);

const BEGIN = '<!-- BEGIN AUTO-GENERATED: tier-model table (source: evals/src/config.js) -->';
const END = '<!-- END AUTO-GENERATED -->';

const COLUMN_LABELS = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google', openweights: 'Open-weight' };
const columns = Object.keys(VENDORS);

function buildTable() {
  const header = `| Tier | ${columns.map((c) => COLUMN_LABELS[c] ?? VENDORS[c].label).join(' | ')} |`;
  const divider = `|---|${columns.map(() => '---').join('|')}|`;
  const rows = TIER_ORDER.map((tier) => {
    const cells = columns.map((c) => `\`${VENDORS[c].tiers[tier]}\``);
    return `| ${tier} | ${cells.join(' | ')} |`;
  });
  return [header, divider, ...rows].join('\n');
}

const modelsPath = path.join(repoRoot, 'skills/firstpass/models.md');
const current = readFileSync(modelsPath, 'utf8');

const beginIdx = current.indexOf(BEGIN);
const endIdx = current.indexOf(END);
if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
  console.error(`models.md is missing the ${BEGIN} / ${END} markers.`);
  process.exit(1);
}

const table = buildTable();
const next =
  current.slice(0, beginIdx) +
  BEGIN + '\n' +
  table + '\n' +
  current.slice(endIdx);

const checkOnly = process.argv.includes('--check');

if (current === next) {
  if (checkOnly) console.log('models.md is in sync with evals/src/config.js.');
  process.exit(0);
}

if (checkOnly) {
  console.error(
    'models.md is stale: the tier-model table no longer matches evals/src/config.js.\n' +
    'Run `node scripts/sync-models-md.js` and commit the result.'
  );
  process.exit(1);
}

writeFileSync(modelsPath, next);
console.log('Updated skills/firstpass/models.md from evals/src/config.js.');
