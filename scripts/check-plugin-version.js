#!/usr/bin/env node
// Checks that .claude-plugin/plugin.json's "version" field matches the
// most recent dated release header in CHANGELOG.md. Nothing derives the
// plugin's correct next version automatically (unlike models.md's table,
// which is regenerated from evals/src/config.js), so this is check-only —
// there's no auto-fix mode, just a guard against forgetting to hand-bump
// plugin.json on release.
//
// Usage:
//   node scripts/check-plugin-version.js

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const pluginPath = path.join(repoRoot, '.claude-plugin/plugin.json');

const changelog = readFileSync(changelogPath, 'utf8');

const HEADING_RE = /^## \[(.+?)\](?: - (.+))?$/gm;

let latestVersion = null;
for (const match of changelog.matchAll(HEADING_RE)) {
  const [, version] = match;
  if (version === 'Unreleased') continue;
  latestVersion = version;
  break;
}

if (!latestVersion) {
  console.error('Could not find a dated release header in CHANGELOG.md (only [Unreleased]?).');
  process.exit(1);
}

const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'));
const pluginVersion = plugin.version;

if (pluginVersion === latestVersion) {
  console.log(`.claude-plugin/plugin.json is in sync with CHANGELOG.md (${pluginVersion}).`);
  process.exit(0);
}

console.error(
  `.claude-plugin/plugin.json's version (${pluginVersion}) does not match ` +
  `CHANGELOG.md's latest dated release (${latestVersion}).\n` +
  `Bump .claude-plugin/plugin.json's "version" field to ${latestVersion} and commit the result.`
);
process.exit(1);
