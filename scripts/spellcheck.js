#!/usr/bin/env node
// Spellchecks the visible text content of every site/*.html page against a
// standard English wordlist (scripts/wordlist.txt, derived from Debian's
// wamerican package), skipping brand/proper names, code/technical terms,
// and URLs. Flags anything left over as a possible typo.
//
// Usage:
//   node scripts/spellcheck.js            # exit 1 if anything is flagged
//   node scripts/spellcheck.js --list     # also print the allowlist in use

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const siteDir = path.join(repoRoot, 'site');
const wordlistPath = path.join(scriptDir, 'wordlist.txt');

// ---------------------------------------------------------------------------
// Wordlist
// ---------------------------------------------------------------------------

const wordlistRaw = readFileSync(wordlistPath, 'utf8');
const dictionary = new Set();
for (const line of wordlistRaw.split('\n')) {
  const w = line.trim();
  if (!w) continue;
  dictionary.add(w.toLowerCase());
}

// The wamerican wordlist is a base-forms list; it's missing a lot of
// ordinary derived English (un-/non-/re- prefixes, -able/-ive/-ness/-ing
// suffixes) and closed compounds (waitlist, handoff, backend). Rather than
// hand-list every such derivation, strip common affixes and try splitting
// closed compounds before giving up on a word.

const PREFIXES = ['un', 'non', 're', 'pre', 'dis', 'mis', 'over', 'under', 'semi', 'sub', 'multi', 'inter', 'co', 'anti', 'out'];
const SUFFIXES = [
  'abilities', 'ability', 'ibility', 'ization', 'isation', 'ableness',
  'edness', 'fulness', 'lessness', 'able', 'ible', 'ness', 'ment', 'ments',
  'tion', 'tions', 'sion', 'sions', 'ive', 'edly', 'ingly', 'ing', 'ed',
  'ers', 'er', 'est', 'ly', "'s", 's',
];

function baseDictHas(w) {
  return dictionary.has(w);
}

function stripAffixes(w) {
  const candidates = new Set([w]);
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 2) {
      candidates.add(w.slice(0, -suf.length));
    }
  }
  for (const pre of PREFIXES) {
    if (w.startsWith(pre) && w.length - pre.length >= 3) {
      candidates.add(w.slice(pre.length));
    }
  }
  for (const pre of PREFIXES) {
    if (w.startsWith(pre) && w.length - pre.length >= 3) {
      const rest = w.slice(pre.length);
      for (const suf of SUFFIXES) {
        if (rest.endsWith(suf) && rest.length - suf.length >= 2) {
          candidates.add(rest.slice(0, -suf.length));
        }
      }
    }
  }
  return candidates;
}

function isCompound(w) {
  // Closed compounds of two real words (waitlist, handoff, backend),
  // each segment at least 3 letters to avoid spurious 2-letter splits.
  for (let i = 3; i <= w.length - 3; i++) {
    const left = w.slice(0, i);
    const right = w.slice(i);
    if (baseDictHas(left) && baseDictHas(right)) return true;
  }
  return false;
}

function inDictionaryNoHyphen(w) {
  if (baseDictHas(w)) return true;
  for (const candidate of stripAffixes(w)) {
    if (candidate !== w && baseDictHas(candidate)) return true;
  }
  if (isCompound(w)) return true;
  // Try compound-splitting after stripping a suffix (e.g. "onboarding" ->
  // "onboard" -> "on" + "board").
  for (const candidate of stripAffixes(w)) {
    if (candidate !== w && candidate.length >= 6 && isCompound(candidate)) return true;
  }
  return false;
}

function inDictionary(word) {
  const w = word.toLowerCase();
  if (baseDictHas(w)) return true;
  // Hyphenated compounds: accept if every segment is a real (or affixed or
  // allowlisted, e.g. "org-wide", "per-repo") word.
  if (w.includes('-')) {
    const parts = w.split('-').filter(Boolean);
    if (parts.length > 1 && parts.every((p) => allowSet.has(p) || inDictionaryNoHyphen(p))) return true;
  }
  // Possessive/plural of an allowlisted term (Junie's, CLI's, repo's).
  if (w.endsWith("'s") && allowSet.has(w.slice(0, -2))) return true;
  if (w.endsWith('s') && !w.endsWith("'s") && allowSet.has(w.slice(0, -1))) return true;
  return inDictionaryNoHyphen(w);
}

// ---------------------------------------------------------------------------
// Allowlist: proper nouns, brand names, and repo-specific technical terms.
// Built from names actually used across site/*.html, evals/, and the repo's
// own docs — not a generic "just in case" list.
// ---------------------------------------------------------------------------

const ALLOWLIST = [
  // Product / brand
  'Undercut', 'undercut', 'getundercut', 'firstpass', 'undercutsh', 'undercuts', 'undercutting',
  // AI vendors / models / agents referenced across the companion pages
  'Claude', 'Anthropic', 'anthropics', 'Codex', 'Cursor', 'cursorrules', 'Copilot', 'OpenCode',
  'Windsurf', 'windsurfrules', 'Cascade', 'Junie', 'JetBrains', 'Amp', 'Devin', 'Gemini',
  'Cline', 'clinerules', 'clinerules-workflows',
  'gemini-cli', 'Sourcegraph', 'OpenAI', 'ChatGPT', 'GPT', 'Google', 'Sonnet', 'Opus', 'Haiku',
  'codeium', 'agentskills', 'ccusage', 'Kiro', "Kiro's", 'kiro', 'kiro-cli', 'AWS', 'Warp',
  // Platforms / tooling
  'Vercel', 'vercel-labs', 'GitHub', 'githubusercontent', 'GitLab', 'npm', 'npx', 'Node',
  'JSON', 'YAML', 'yml', 'toml', 'mdc', 'Markdown', 'CI', 'API', 'CLI', "CLI's", 'URL', 'URLs',
  'HTML', 'CSS', 'JS', 'SDK', 'SKU', 'SSO', 'MIT', 'DOM', 'SVG', 'PR', 'PRs', 'SEO', 'FAQ',
  'FAQs', 'MCP', 'LLM', 'LLMs', 'README', 'https', 'src', 'cp', 'mkdir', 'auth', 'config',
  'onclick', 'frontmatter', "frontmatter's", 'crawler', 'endpoint', 'endpoints', 'webhook',
  'monospace', 'org', 'repo', "repo's", 'repos', 'workspace', 'worktree', 'subagent',
  'subagent-model-routing', 'codebase', 'eval', 'evals', 'Eval', 'eval-harness', 'xhigh',
  'yml', 'Sitemap', 'Edgee', 'Observability', 'dev', 'devs', 'onboarding', 're-runnable',
  'signup', 'agentic', 'git', 'prem', 'div', 'divs', 'img', 'quo', 'ent', 'serverless',
  'uptime', 'service-uptime', 'txt', 'labelledby', 'describedby', 'programmatic', 'init',
  // Files / identifiers used verbatim in copy
  'SKILL.md', 'AGENTS.md', 'CLAUDE.md', 'CHANGELOG.md', 'WARP.md',
  // People / orgs in credits, socials, contributors
  'Winter', 'Justin', 'iamjustinwinter', 'jcwinter', 'justinwinter', "peragwin's", 'soumabali',
];

const allowSet = new Set(ALLOWLIST.map((w) => w.toLowerCase()));

// ---------------------------------------------------------------------------
// HTML -> visible text extraction
// ---------------------------------------------------------------------------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', copy: '©',
  reg: '®', trade: '™', minus: '−', times: '×',
  middot: '·', rarr: '→', larr: '←', uarr: '↑', darr: '↓',
  rsaquo: '›', lsaquo: '‹', raquo: '»', laquo: '«', bull: '•',
  sect: '§', para: '¶', deg: '°', plusmn: '±', divide: '÷',
  dagger: '†', Dagger: '‡', permil: '‰', shy: '', ensp: ' ', emsp: ' ',
  thinsp: ' ', zwnj: '', zwj: '',
};

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    // Named entities: decode known ones, and blank out any other named
    // entity reference rather than leaving its bare name (e.g. "&middot;")
    // to leak into the text as a fake "word".
    .replace(/&(\w+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : ' '));
}

function extractVisibleText(html) {
  let text = html
    // Drop entire elements whose content is never rendered as page prose.
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Mustache-style template bindings ("{{ row.ent }}") used by the
    // sc-for/sc-bind custom elements are data expressions, not prose.
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    // Only text between tags is kept — attribute values (href, src, alt)
    // are dropped along with the tags themselves.
    .replace(/<[^>]+>/g, '\n');
  text = decodeEntities(text);
  return text;
}

// ---------------------------------------------------------------------------
// Tokenization + checking
// ---------------------------------------------------------------------------

// A "word" for spellchecking purposes: letters plus internal apostrophes
// (don't, it's) or internal hyphens (well-formed, tier-to-model).
const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*/g;

function looksTechnical(word) {
  // camelCase / PascalCase identifiers with an internal capital, e.g.
  // formatStrict, getUndercut — real English words are never mixed-case
  // past the first letter.
  if (/[a-z][A-Z]/.test(word)) return true;
  // ALL-CAPS acronyms of 2+ letters not already in the allowlist are left
  // alone rather than flagged as misspellings.
  if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) return true;
  return false;
}

function checkFile(filePath) {
  const html = readFileSync(filePath, 'utf8');
  const text = extractVisibleText(html);
  const flagged = new Map(); // word -> count

  const matches = text.match(WORD_RE) || [];
  for (const raw of matches) {
    const word = raw.replace(/^[-']+|[-']+$/g, '');
    if (!word) continue;
    if (word.length < 2) continue; // single letters (I, a) are fine
    if (allowSet.has(word.toLowerCase())) continue;
    if (inDictionary(word)) continue;
    if (looksTechnical(word)) continue;
    flagged.set(word, (flagged.get(word) || 0) + 1);
  }
  return flagged;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    console.log('Allowlist:', [...allowSet].sort().join(', '));
  }

  const files = readdirSync(siteDir)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => path.join(siteDir, f));

  let totalFlags = 0;
  const report = [];

  for (const file of files) {
    const flagged = checkFile(file);
    if (flagged.size > 0) {
      totalFlags += flagged.size;
      report.push({ file: path.relative(repoRoot, file), words: flagged });
    }
  }

  if (report.length === 0) {
    console.log(`Spellcheck OK: ${files.length} pages in site/, no unrecognized words.`);
    process.exit(0);
  }

  console.error(`Spellcheck found ${totalFlags} unrecognized word(s) across ${report.length} page(s):\n`);
  for (const { file, words } of report) {
    console.error(`  ${file}`);
    for (const [word, count] of [...words.entries()].sort()) {
      console.error(`    - "${word}"${count > 1 ? ` (x${count})` : ''}`);
    }
  }
  console.error(
    '\nIf any of these are intentional (brand names, technical terms), add them to ' +
    'ALLOWLIST in scripts/spellcheck.js. Otherwise, fix the typo in site/*.html.'
  );
  process.exit(1);
}

main();
