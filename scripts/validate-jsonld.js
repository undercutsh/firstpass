#!/usr/bin/env node
// Extracts every <script type="application/ld+json"> block from site/*.html,
// confirms each parses as JSON, and checks it against the basic schema.org /
// Google structured-data required-field rules for whichever @type(s) it
// actually declares (top-level and nested, e.g. an Offer inside a
// SoftwareApplication's `offers`, or a Question inside FAQPage's
// `mainEntity`). Only rules for types actually used on this site are
// defined below — see RULES.
//
// Usage:
//   node scripts/validate-jsonld.js          # print a report
//   node scripts/validate-jsonld.js --check  # exit 1 if anything fails

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(repoRoot, 'site');

const SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function requireFields(obj, fields) {
  const errors = [];
  for (const field of fields) {
    const value = obj[field];
    const missing =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (missing) errors.push(`missing required "${field}"`);
  }
  return errors;
}

// One rule per @type actually present in site/*.html's JSON-LD today.
// Field requirements follow schema.org's own property expectations for
// these types plus Google's structured-data required-property guidance
// (https://developers.google.com/search/docs/appearance/structured-data)
// for the types Google defines rich-result rules for (Offer, FAQPage,
// BreadcrumbList). Do not add a type here that isn't emitted by the site.
const RULES = {
  SoftwareApplication: (o) => requireFields(o, ['name', 'operatingSystem', 'applicationCategory']),
  Offer: (o) => requireFields(o, ['price', 'priceCurrency']),
  Person: (o) => requireFields(o, ['name']),
  WebPage: (o) => requireFields(o, ['name', 'url']),
  BreadcrumbList: (o) => {
    const errors = requireFields(o, ['itemListElement']);
    if (Array.isArray(o.itemListElement)) {
      o.itemListElement.forEach((item, i) => {
        if (item.position === undefined || item.position === null) {
          errors.push(`itemListElement[${i}] missing required "position"`);
        }
        if (!item.name && !item.item) {
          errors.push(`itemListElement[${i}] missing "name" or "item"`);
        }
      });
    }
    return errors;
  },
  FAQPage: (o) => {
    const errors = requireFields(o, ['mainEntity']);
    if (o.mainEntity !== undefined && !Array.isArray(o.mainEntity)) {
      errors.push('"mainEntity" must be an array');
    }
    return errors;
  },
  Question: (o) => {
    const errors = requireFields(o, ['name', 'acceptedAnswer']);
    if (o.acceptedAnswer && typeof o.acceptedAnswer === 'object' && !Array.isArray(o.acceptedAnswer)) {
      if (!o.acceptedAnswer.text) errors.push('"acceptedAnswer.text" missing');
    }
    return errors;
  },
  Answer: (o) => requireFields(o, ['text']),
  SpeakableSpecification: (o) => requireFields(o, ['cssSelector']),
};

function typesOf(node) {
  if (!node || typeof node !== 'object') return [];
  const t = node['@type'];
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

// Walk a parsed JSON-LD document, validating every nested object that
// declares an @type we have a rule for, and collecting a labeled path
// (e.g. `offers[1] (Offer "Teams")`) for readable error messages.
function walk(node, label, errors) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${label}[${i}]`, errors));
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const type of typesOf(node)) {
    const rule = RULES[type];
    if (!rule) continue;
    const name = typeof node.name === 'string' ? ` "${node.name}"` : '';
    const fieldErrors = rule(node);
    for (const fieldError of fieldErrors) {
      errors.push(`${label} (${type}${name}): ${fieldError}`);
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === '@context' || key === '@type') continue;
    if (value && typeof value === 'object') walk(value, `${label}.${key}`, errors);
  }
}

function validateFile(file) {
  const html = readFileSync(path.join(siteDir, file), 'utf8');
  const results = [];
  let match;
  let index = 0;
  SCRIPT_RE.lastIndex = 0;
  while ((match = SCRIPT_RE.exec(html)) !== null) {
    const raw = match[1];
    const blockLabel = `${file}#ld+json[${index}]`;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      results.push({ file, block: index, errors: [`invalid JSON: ${err.message}`] });
      index++;
      continue;
    }
    const errors = [];
    const topType = typesOf(parsed)[0];
    walk(parsed, topType ? `${blockLabel} (${topType})` : blockLabel, errors);
    results.push({ file, block: index, errors });
    index++;
  }
  return results;
}

const files = readdirSync(siteDir)
  .filter((f) => f.endsWith('.html'))
  .sort();

let totalBlocks = 0;
let failingBlocks = 0;
const allErrors = [];

for (const file of files) {
  const results = validateFile(file);
  for (const r of results) {
    totalBlocks++;
    if (r.errors.length > 0) {
      failingBlocks++;
      allErrors.push(...r.errors);
    }
  }
}

const checkOnly = process.argv.includes('--check');

console.log(`Checked ${totalBlocks} JSON-LD block(s) across ${files.length} page(s) in site/.`);

if (allErrors.length === 0) {
  console.log('All JSON-LD blocks parse and satisfy the required-field rules.');
  process.exit(0);
}

console.error(`\n${failingBlocks} block(s) failed validation:\n`);
for (const e of allErrors) console.error(`  - ${e}`);

if (checkOnly) {
  console.error('\nFix the JSON-LD above (see scripts/validate-jsonld.js for the rule set).');
}

process.exit(1);
