#!/usr/bin/env node
// One-shot codemod that migrated site/*.html from a single-value palette to
// the ground-specific palette documented in scripts/validate-contrast.js.
//
// It is committed rather than run-and-discarded because the change it made
// is large (thousands of literal hex values across 44 files) and otherwise
// unauditable: a reviewer needs to be able to see the exact remapping rule
// that produced the diff, and re-run it to confirm the diff is what the rule
// implies. It is idempotent — a second run is a no-op.
//
// The problem it solves is that the palette was stored as literal hex
// repeated inline, so the SAME value (#6e7278) appears both as secondary
// text on the light ground and as secondary text on the dark ground. A
// blind find-and-replace therefore cannot work: darkening it for the light
// ground makes the dark-ground cases worse, and vice versa. The correct
// replacement depends on what the text actually sits on, which is a
// property of the DOM, not of the string.
//
// So this walks each document the same way validate-contrast.js does,
// resolving the effective ground at every text node, and attributes each
// text node back to the DECLARATION SITE that set its colour — either an
// element's own style="..." (identified by byte offset) or a rule in the
// page's <style> block (identified by selector). It then rewrites each
// declaration site once:
//
//   * every text node under it renders on a light ground -> light variant
//   * every text node under it renders on a dark ground  -> dark variant
//   * a mix of both                                      -> REFUSED, reported
//
// Two notes from actually running it:
//
//   * It reaches a fixpoint in two passes, not one. Rewriting a RULE's
//     colour changes what the elements inheriting that rule resolve to, so
//     a handful of sites are only attributable on the next pass. Run it
//     until it reports zero.
//   * The first version wrote each file as it finished planning it, then
//     threw on file 37 and left the tree half-migrated. It now computes
//     every file's output in memory and writes nothing unless all of them
//     succeeded.
//
// The refusal is the important part. A declaration serving both grounds
// cannot be fixed by changing its value; it has to be split by hand. The
// script prints those instead of guessing, and there were none in the
// migration it was written for.
//
// Usage:
//   node scripts/fix-contrast.js --dry    # report the plan, write nothing
//   node scripts/fix-contrast.js --write  # apply it

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseDeclarations, parseStyleBlocks, TOKENS } from './validate-contrast.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, '..', 'site');

// Grounds classified by which variant of a foreground belongs on them.
const DARK_GROUNDS = new Set(['#1c2027', '#13161b']);

// old value -> { light, dark }. Keys are every foreground the old palette
// used ambiguously across grounds, plus two one-off bespoke colours that
// were hand-picked on a dark ground and never reconciled with the system.
const REMAP = {
  '#6e7278': { light: TOKENS.mute, dark: TOKENS['deep-mute'] },
  '#00959c': { light: TOKENS['cheap-ink'], dark: TOKENS['cheap-dim'] },
  '#c26e12': { light: TOKENS['frontier-ink'], dark: TOKENS['frontier-dim'] },
  '#319751': { light: TOKENS['pass-ink'], dark: TOKENS['pass-dim'] },
  '#955d22': { light: TOKENS['frontier-ink'], dark: TOKENS['frontier-dim'] },
};

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);
const SKIP_CONTENT = new Set(['script', 'style', 'title', 'noscript', 'template', 'svg', 'head']);

/**
 * Walk one document and attribute text nodes to colour declaration sites.
 * Returns Map<siteKey, {kind, offset?, selector?, value, grounds:Set, nodes:n}>.
 */
function attribute(html) {
  const { simple, descendant } = parseStyleBlocks(html);
  const sites = new Map();

  const bodyDecls = simple.get('body') || {};
  const root = {
    tag: 'root', classes: [],
    color: bodyDecls.color || TOKENS.ink,
    background: bodyDecls.background || TOKENS.paper,
    colorSite: bodyDecls.color ? 'rule:body' : null,
    ariaHidden: false,
  };
  const stack = [root];
  const ancestorClasses = () => {
    const s = new Set();
    for (const f of stack) for (const c of f.classes) s.add(c);
    return s;
  };

  const tokenRe = /<!--[\s\S]*?-->|<\/?([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/gi;
  let m;
  let skipTag = null;

  while ((m = tokenRe.exec(html)) !== null) {
    const raw = m[0];
    if (skipTag) {
      const close = raw.match(/^<\/([a-z][a-z0-9-]*)/i);
      if (close && close[1].toLowerCase() === skipTag) skipTag = null;
      continue;
    }
    if (raw.startsWith('<!--')) continue;

    const text = m[3];
    if (text !== undefined) {
      const content = text.replace(/&[a-z]+;|&#\d+;/gi, 'x').trim();
      if (!content) continue;
      const top = stack[stack.length - 1];
      // Decorative content hidden from assistive tech carries no contrast
      // obligation (WCAG applies to text presented to the user), so it must
      // not drag a declaration site into "mixed grounds".
      if (top.ariaHidden) continue;
      if (!top.colorSite) continue;
      const site = sites.get(top.colorSite);
      if (!site) continue;
      site.grounds.add(DARK_GROUNDS.has(top.background) ? 'dark' : 'light');
      site.nodes += 1;
      continue;
    }

    const tag = (m[1] || '').toLowerCase();
    if (!tag) continue;
    const attrs = m[2] || '';
    const isClose = raw.startsWith('</');
    const selfClosing = /\/\s*>$/.test(raw) || VOID_ELEMENTS.has(tag);

    if (isClose) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    if (SKIP_CONTENT.has(tag) && !selfClosing) { skipTag = tag; continue; }
    if (selfClosing) continue;

    const parent = stack[stack.length - 1];
    const classAttr = (attrs.match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i) || [])[1] || '';
    const classes = classAttr.split(/\s+/).filter(Boolean).map((c) => c.toLowerCase());
    const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
    const styleAttr = styleMatch ? styleMatch[1] : '';

    let decls = { ...(simple.get(tag) || {}) };
    let colorSite = null;
    if (simple.get(tag)?.color) colorSite = `rule:${tag}`;
    for (const c of classes) {
      const r = simple.get(`.${c}`);
      if (r) { Object.assign(decls, r); if (r.color) colorSite = `rule:.${c}`; }
    }
    if (descendant.length) {
      const anc = ancestorClasses();
      for (const d of descendant) {
        if ((anc.has(d.ancestor) || classes.includes(d.ancestor)) &&
            (classes.includes(d.target) || d.target === tag)) {
          Object.assign(decls, d.decls);
          if (d.decls.color) colorSite = `rule:${d.sel}`;
        }
      }
    }
    const inline = parseDeclarations(styleAttr);
    if (inline.color) {
      // Byte offset of the hex literal inside the file, so the rewrite can
      // target this one declaration and nothing else that shares its value.
      const attrStart = m.index + raw.indexOf(styleMatch[0]) + styleMatch[0].indexOf(styleAttr);
      const rel = styleAttr.search(new RegExp(inline.color.replace('#', '#'), 'i'));
      colorSite = `inline:${attrStart + rel}`;
    }
    Object.assign(decls, inline);

    if (colorSite && !sites.has(colorSite)) {
      const value = (decls.color || '').toLowerCase();
      sites.set(colorSite, {
        kind: colorSite.startsWith('inline:') ? 'inline' : 'rule',
        offset: colorSite.startsWith('inline:') ? Number(colorSite.slice(7)) : null,
        selector: colorSite.startsWith('rule:') ? colorSite.slice(5) : null,
        value,
        grounds: new Set(),
        nodes: 0,
      });
    }

    const ariaHidden = parent.ariaHidden || /aria-hidden\s*=\s*["']true["']/i.test(attrs);
    stack.push({
      tag,
      classes,
      color: decls.color || parent.color,
      background: 'background' in decls && decls.background ? decls.background : parent.background,
      colorSite: colorSite || parent.colorSite,
      ariaHidden,
    });
  }
  return sites;
}

function planFile(html) {
  const sites = attribute(html);
  const edits = [];
  const refusals = [];
  for (const [key, site] of sites) {
    const remap = REMAP[site.value];
    if (!remap) continue;
    if (site.nodes === 0) continue; // declares a colour but renders no text
    const light = site.grounds.has('light');
    const dark = site.grounds.has('dark');
    if (light && dark) {
      refusals.push({ key, value: site.value, nodes: site.nodes });
      continue;
    }
    const next = dark ? remap.dark : remap.light;
    if (next === site.value) continue;
    edits.push({ ...site, key, next });
  }
  return { edits, refusals };
}

function applyEdits(html, edits) {
  let out = html;
  // Inline edits are offset-addressed, so apply them last-first; rule edits
  // are selector-addressed and order-independent.
  const inline = edits.filter((e) => e.kind === 'inline').sort((a, b) => b.offset - a.offset);
  const rules = edits.filter((e) => e.kind === 'rule');

  for (const e of inline) {
    const at = out.slice(e.offset, e.offset + e.value.length);
    if (at.toLowerCase() !== e.value) {
      throw new Error(`offset ${e.offset} holds "${at}", expected "${e.value}"`);
    }
    out = out.slice(0, e.offset) + e.next + out.slice(e.offset + e.value.length);
  }
  for (const e of rules) {
    const sel = e.selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Rewrite only the `color:` declaration inside that one rule body.
    const re = new RegExp(`(${sel}\\s*\\{[^{}]*?color\\s*:\\s*)${e.value}`, 'i');
    if (!re.test(out)) throw new Error(`rule ${e.selector} with color ${e.value} not found`);
    out = out.replace(re, `$1${e.next}`);
  }
  return out;
}

function main() {
  const write = process.argv.includes('--write');
  const files = readdirSync(SITE_DIR).filter((f) => f.endsWith('.html')).sort();
  let totalEdits = 0;
  let touched = 0;
  const allRefusals = [];
  const byRemap = new Map();

  // Two phases on purpose. An edit that cannot be resolved is a bug in this
  // script, and if the write loop discovers it halfway through it leaves the
  // tree half-migrated — which is exactly what happened the first time this
  // ran. So every file's rewrite is computed and validated in memory first,
  // and nothing touches disk unless all 44 succeeded.
  const pending = [];
  for (const f of files) {
    const p = path.join(SITE_DIR, f);
    const html = readFileSync(p, 'utf8');
    const { edits, refusals } = planFile(html);
    for (const r of refusals) allRefusals.push({ file: f, ...r });
    if (!edits.length) continue;
    for (const e of edits) {
      const k = `${e.value} -> ${e.next}`;
      byRemap.set(k, (byRemap.get(k) || 0) + 1);
    }
    totalEdits += edits.length;
    touched += 1;
    pending.push({ p, next: applyEdits(html, edits) });
  }
  if (write) for (const { p, next } of pending) writeFileSync(p, next, 'utf8');

  console.log(`${write ? 'Applied' : 'Planned'} ${totalEdits} colour-declaration rewrite(s) across ${touched} file(s):\n`);
  for (const [k, n] of [...byRemap.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}   x${n}`);
  }
  if (allRefusals.length) {
    console.log(`\n${allRefusals.length} declaration(s) serve BOTH grounds and need splitting by hand:`);
    for (const r of allRefusals) console.log(`  ${r.file} ${r.key} (${r.value}, ${r.nodes} nodes)`);
  } else {
    console.log('\nNo declaration serves both grounds — every rewrite is unambiguous.');
  }
  if (!write) console.log('\nDry run. Re-run with --write to apply.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
