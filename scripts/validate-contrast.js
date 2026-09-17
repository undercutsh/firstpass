#!/usr/bin/env node
// Every page under site/ is authored as a self-contained HTML file with its
// own inline <style> block and a great deal of element-level style="...".
// There is no shared stylesheet, so the palette exists as literal hex
// values repeated across 44 files — #6e7278 alone appears ~2,500 times.
//
// That authoring model has one specific failure mode, and it has already
// bitten us three times at once:
//
//   1. A colour is picked so it reads well on the light ground (--paper
//      #f2f0ec) and then reused verbatim on the dark ground (--deep
//      #1c2027), or the reverse. #6e7278 measures 4.25:1 on paper and
//      3.38:1 on deep. Both are below AA for body text, in opposite
//      directions, so no single value fixes both.
//   2. An accent chosen as a *graph/stroke* colour (where AA only asks for
//      3:1) later gets used as small text or as a filled chip's ground
//      (where AA asks 4.5:1). #00959c is 3.19:1 against paper: fine as a
//      2px rule, a failure as 12px text and as a .tag fill.
//   3. Nobody notices, because contrast is the one design property you
//      cannot eyeball reliably and nothing in CI measured it.
//
// So this script measures it. It does two independent things:
//
//   A. TOKEN MATRIX (exact, no inference). A hand-written table of every
//      foreground/ground pair the design system actually sanctions, each
//      with the AA threshold that applies to it. This is the part that
//      cannot drift or produce a false positive: it is arithmetic over
//      declared constants. If someone edits a token, this fails.
//
//   B. DOM SWEEP (inferred, conservative). Walks each page maintaining a
//      stack of {color, background, font-size, font-weight} resolved from
//      element-level style="..." plus the simple class rules in the page's
//      own <style> block, and checks the effective pair at every text node.
//      This is what catches a *nested* case — a child with only `color:`
//      set, sitting inside a dark container three levels up — which a
//      same-attribute grep cannot see. Deliberately conservative: a pair is
//      only judged when BOTH sides were explicitly declared somewhere in
//      the stack. Unknown means skipped, never guessed, because a contrast
//      checker that cries wolf gets disabled within a week.
//
// The DOM sweep understands the subset of CSS this site is actually written
// in: single-class rules (`.small {}`), element rules (`body {}`), and
// two-part descendant rules (`.sec-deep .small {}`). It does not implement
// a cascade, specificity, or media queries — it does not need to, because
// what it is defending is a flat palette, not a layout.
//
// Usage:
//   node scripts/validate-contrast.js           # full report
//   node scripts/validate-contrast.js --check   # exit 1 on any AA failure
//   node scripts/validate-contrast.js --tokens  # token matrix only
//
// The pure helpers (relativeLuminance, contrastRatio, requiredRatio,
// parseDeclarations, checkTokenMatrix, auditHtml) take strings/data and
// return data so validate-contrast.test.js can feed them deliberately
// broken palettes and assert the failure is actually caught — not merely
// that today's site happens to pass. Only main() touches the filesystem.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, '..', 'site');

// ---------------------------------------------------------------------------
// WCAG 2.2 arithmetic (SC 1.4.3 Contrast Minimum, SC 1.4.11 Non-text)
// ---------------------------------------------------------------------------

/** sRGB 8-bit channel -> linear-light value. */
function linearize(channel8bit) {
  const c = channel8bit / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** #rrggbb | #rgb -> relative luminance per WCAG definition. */
export function relativeLuminance(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex colour: ${hex}`);
  const r = linearize(parseInt(h.slice(0, 2), 16));
  const g = linearize(parseInt(h.slice(2, 4), 16));
  const b = linearize(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio, always >= 1. Symmetric in its arguments. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// AA "large scale text" is >= 18pt, or >= 14pt bold. In CSS px at the
// default 96dpi mapping that is 24px, or 18.66px at weight >= 700.
export const LARGE_PX = 24;
export const LARGE_BOLD_PX = 18.66;

/** The AA threshold that applies to a given text size/weight. */
export function requiredRatio(fontSizePx, fontWeight) {
  const size = Number(fontSizePx);
  const weight = Number(fontWeight) || 400;
  if (!Number.isFinite(size)) return 4.5;
  if (size >= LARGE_PX) return 3;
  if (size >= LARGE_BOLD_PX && weight >= 700) return 3;
  return 4.5;
}

// ---------------------------------------------------------------------------
// A. The token matrix — the sanctioned palette, and what each pair is for
// ---------------------------------------------------------------------------

export const TOKENS = {
  // Grounds
  paper: '#f2f0ec',        // default page ground
  card: '#fbfaf8',         // raised card ground on paper
  deep: '#1c2027',         // dark section ground
  'deep-ink': '#13161b',   // darkest ground (terminals, inset cards)
  // Ink
  ink: '#13161b',          // body text on light grounds
  mute: '#6a6d73',         // secondary text on LIGHT grounds only
  'deep-mute': '#9a9ea4',  // secondary text on DARK grounds only
  // Rules (decorative hairlines — not UI component boundaries)
  rule: '#d4d0cb',
  'deep-rule': '#2f343c',
  // Accents. Three variants each, because one value cannot clear 4.5:1 on
  // both a near-white and a near-black ground:
  //   base  — strokes, graph fills, icon glyphs, large display type (3:1)
  //   -ink  — small text on a LIGHT ground, and filled chips carrying
  //           --paper text (4.5:1 both ways, contrast being symmetric)
  //   -dim  — small text on a DARK ground (4.5:1)
  cheap: '#00959c',
  'cheap-ink': '#007a80',
  'cheap-dim': '#03969d',
  frontier: '#c26e12',
  'frontier-ink': '#a35c0f',
  'frontier-dim': '#c4741b',
  pass: '#319751',
  'pass-ink': '#287c42',
  'pass-dim': '#359954',
};

// Each row: [foreground, background, threshold, what it is used for].
// A row is a promise the design system makes; the test is whether the
// arithmetic keeps it.
export const TOKEN_MATRIX = [
  ['ink', 'paper', 4.5, 'body text on the page ground'],
  ['ink', 'card', 4.5, 'body text on a card'],
  ['mute', 'paper', 4.5, 'secondary text on the page ground'],
  ['mute', 'card', 4.5, 'secondary text on a card'],
  ['deep-mute', 'deep', 4.5, 'secondary text on a dark section'],
  ['deep-mute', 'deep-ink', 4.5, 'secondary text on the darkest ground'],
  ['paper', 'deep', 4.5, 'body text on a dark section'],
  ['paper', 'deep-ink', 4.5, 'terminal / inset-card text'],

  ['cheap-ink', 'paper', 4.5, 'cheap-tier label as small text on paper'],
  ['cheap-ink', 'card', 4.5, 'cheap-tier label as small text on a card'],
  ['frontier-ink', 'paper', 4.5, 'frontier-tier label as small text on paper'],
  ['frontier-ink', 'card', 4.5, 'frontier-tier label as small text on a card'],
  ['pass-ink', 'paper', 4.5, 'pass/verified label as small text on paper'],
  ['pass-ink', 'card', 4.5, 'pass/verified label as small text on a card'],

  // Filled chips: --paper text sitting on an accent ground.
  ['paper', 'cheap-ink', 4.5, 'filled cheap chip (.tag-cheap)'],
  ['paper', 'frontier-ink', 4.5, 'filled frontier chip (.tag-frontier)'],
  ['paper', 'pass-ink', 4.5, 'filled pass chip'],
  ['paper', 'ink', 4.5, 'filled standard chip (.tag-std)'],

  ['cheap-dim', 'deep', 4.5, 'cheap-tier label as small text on a dark section'],
  ['cheap-dim', 'deep-ink', 4.5, 'cheap-tier label in a terminal block'],
  ['frontier-dim', 'deep', 4.5, 'frontier-tier label as small text on a dark section'],
  ['frontier-dim', 'deep-ink', 4.5, 'frontier-tier label in a terminal block'],
  ['pass-dim', 'deep', 4.5, 'pass label as small text on a dark section'],
  ['pass-dim', 'deep-ink', 4.5, 'pass label in a terminal block'],

  // Base accents are only ever promised at the non-text / large-text bar.
  ['cheap', 'paper', 3, 'cheap accent as a stroke, graph fill or display type'],
  ['frontier', 'paper', 3, 'frontier accent as a stroke, graph fill or display type'],
  ['pass', 'paper', 3, 'pass accent as a stroke, graph fill or display type'],
];

export function checkTokenMatrix(tokens = TOKENS, matrix = TOKEN_MATRIX) {
  const rows = [];
  for (const [fg, bg, need, purpose] of matrix) {
    const fgHex = tokens[fg];
    const bgHex = tokens[bg];
    if (!fgHex || !bgHex) {
      rows.push({ fg, bg, need, purpose, ratio: null, ok: false, reason: 'undefined token' });
      continue;
    }
    const ratio = contrastRatio(fgHex, bgHex);
    rows.push({
      fg, bg, need, purpose, fgHex, bgHex,
      ratio: Math.round(ratio * 100) / 100,
      ok: ratio >= need,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// B. The DOM sweep
// ---------------------------------------------------------------------------

const HEX = /#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i;

/** "color: #fff; font-size: 12px" -> {color:'#fff', fontSize:12} */
export function parseDeclarations(cssText) {
  const out = {};
  if (!cssText) return out;
  for (const decl of cssText.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (prop === 'color') {
      const m = value.match(HEX);
      if (m) out.color = m[0].toLowerCase();
    } else if (prop === 'background' || prop === 'background-color') {
      // `background: transparent` explicitly clears, so the nearest opaque
      // ancestor ground keeps applying rather than this element inventing one.
      if (/^transparent\b|^none\b/i.test(value)) out.background = null;
      else {
        const m = value.match(HEX);
        if (m) out.background = m[0].toLowerCase();
      }
    } else if (prop === 'font-size') {
      const m = value.match(/^([\d.]+)px/);
      if (m) out.fontSize = parseFloat(m[1]);
      // clamp()/vw sizes are responsive display type; treat as large.
      else if (/clamp\(|vw/.test(value)) out.fontSize = LARGE_PX;
    } else if (prop === 'font-weight') {
      const m = value.match(/^(\d{3})/);
      if (m) out.fontWeight = parseInt(m[1], 10);
      else if (/^bold\b/i.test(value)) out.fontWeight = 700;
    }
  }
  return out;
}

/**
 * Pull the simple rules out of a page's <style> blocks.
 * Returns { simple: Map<key, decls>, descendant: Array<{ancestor, target, decls}> }
 * where a `simple` key is either ".classname" or an element name.
 */
export function parseStyleBlocks(html) {
  const simple = new Map();
  const descendant = [];
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  for (const css of blocks) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Skip @media/@supports bodies wholesale: they are responsive overrides,
    // and applying them unconditionally would model a viewport we aren't in.
    const noAt = stripped.replace(/@(?:media|supports|keyframes)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '');
    for (const m of noAt.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      const decls = parseDeclarations(m[2]);
      if (!('color' in decls) && !('background' in decls) && !('fontSize' in decls) && !('fontWeight' in decls)) continue;
      for (const sel of selectors) {
        if (/^\.[a-z0-9_-]+$/i.test(sel)) {
          simple.set(sel.toLowerCase(), { ...(simple.get(sel.toLowerCase()) || {}), ...decls });
        } else if (/^[a-z][a-z0-9]*$/i.test(sel)) {
          simple.set(sel.toLowerCase(), { ...(simple.get(sel.toLowerCase()) || {}), ...decls });
        } else {
          const two = sel.match(/^\.([a-z0-9_-]+)\s+\.?([a-z0-9_-]+)$/i);
          // `sel` is kept verbatim: a consumer that needs to rewrite this
          // rule has to match the source text, and reconstructing it from
          // the parts loses whether the target was a class or an element
          // (`.a .b` vs `.a b`).
          if (two) descendant.push({ sel, ancestor: two[1].toLowerCase(), target: two[2].toLowerCase(), decls });
        }
      }
    }
  }
  return { simple, descendant };
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);
// Text inside these is never rendered as prose.
const SKIP_CONTENT = new Set(['script', 'style', 'title', 'noscript', 'template', 'svg', 'head']);

/**
 * Walk the document, resolving the effective colour pair at each text node.
 * Returns { failures: [...], judged: n, skipped: n }.
 */
export function auditHtml(html, filename = '<string>') {
  const { simple, descendant } = parseStyleBlocks(html);
  const failures = [];
  let judged = 0;
  let skipped = 0;

  // Seed from `body`, falling back to the design system's defaults.
  const bodyDecls = simple.get('body') || {};
  const root = {
    tag: 'root',
    classes: [],
    color: bodyDecls.color || TOKENS.ink,
    background: bodyDecls.background || TOKENS.paper,
    fontSize: bodyDecls.fontSize || 16,
    fontWeight: bodyDecls.fontWeight || 400,
    colorExplicit: Boolean(bodyDecls.color),
    bgExplicit: Boolean(bodyDecls.background),
    ariaHidden: false,
  };
  const stack = [root];
  const ancestorClasses = () => {
    const s = new Set();
    for (const f of stack) for (const c of f.classes) s.add(c);
    return s;
  };

  const tokenRe = /<!--[\s\S]*?-->|<\/?([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/gi;
  let line = 1;
  let m;
  let skipDepth = 0;
  let skipTag = null;

  while ((m = tokenRe.exec(html)) !== null) {
    const raw = m[0];
    const startLine = line;
    line += (raw.match(/\n/g) || []).length;

    // Inside <script>/<svg>/... — consume until the matching close tag.
    if (skipTag) {
      const close = raw.match(/^<\/([a-z][a-z0-9-]*)/i);
      if (close && close[1].toLowerCase() === skipTag) { skipTag = null; }
      continue;
    }

    if (raw.startsWith('<!--')) continue;

    const text = m[3];
    if (text !== undefined) {
      const content = text.replace(/&[a-z]+;|&#\d+;/gi, 'x').trim();
      if (!content) continue;
      const top = stack[stack.length - 1];
      // SC 1.4.3 governs "text and images of text" presented to the user.
      // Content in an aria-hidden subtree is not presented to assistive
      // technology and is decorative by construction here — the site uses it
      // for glyph arrowheads deliberately tinted to match the connector line
      // they sit on. Judging those reports a 1:1 "failure" for something no
      // one is meant to read, which is exactly the noise that gets a
      // contrast check switched off.
      if (top.ariaHidden) { skipped += 1; continue; }
      // Only judge a pair both of whose sides were actually declared.
      if (!top.colorExplicit || !top.bgExplicit) { skipped += 1; continue; }
      const need = requiredRatio(top.fontSize, top.fontWeight);
      const ratio = contrastRatio(top.color, top.background);
      judged += 1;
      if (ratio < need) {
        failures.push({
          file: filename,
          line: startLine,
          color: top.color,
          background: top.background,
          fontSize: top.fontSize,
          fontWeight: top.fontWeight,
          ratio: Math.round(ratio * 100) / 100,
          need,
          snippet: content.slice(0, 58).replace(/\s+/g, ' '),
        });
      }
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
    const styleAttr = (attrs.match(/style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i) || [])[1] || '';

    // Resolution order, weakest first: element rule, class rules, matching
    // descendant rules, then the element's own style="" (strongest).
    let decls = { ...(simple.get(tag) || {}) };
    for (const c of classes) Object.assign(decls, simple.get(`.${c}`) || {});
    if (descendant.length) {
      const anc = ancestorClasses();
      for (const d of descendant) {
        if ((anc.has(d.ancestor) || classes.includes(d.ancestor)) &&
            (classes.includes(d.target) || d.target === tag)) {
          Object.assign(decls, d.decls);
        }
      }
    }
    Object.assign(decls, parseDeclarations(styleAttr));

    const frame = {
      tag,
      classes,
      color: 'color' in decls && decls.color ? decls.color : parent.color,
      // `background: transparent` -> inherit the ancestor ground.
      background: 'background' in decls && decls.background ? decls.background : parent.background,
      fontSize: 'fontSize' in decls ? decls.fontSize : parent.fontSize,
      fontWeight: 'fontWeight' in decls ? decls.fontWeight : parent.fontWeight,
      colorExplicit: parent.colorExplicit || Boolean(decls.color),
      bgExplicit: parent.bgExplicit || Boolean(decls.background),
      ariaHidden: parent.ariaHidden || /aria-hidden\s*=\s*["']true["']/i.test(attrs),
    };
    stack.push(frame);
  }

  return { failures, judged, skipped };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const checkOnly = process.argv.includes('--check');
  const tokensOnly = process.argv.includes('--tokens');

  const matrixRows = checkTokenMatrix();
  const matrixFailures = matrixRows.filter((r) => !r.ok);

  console.log(`Token matrix — ${matrixRows.length} sanctioned pairs:\n`);
  for (const r of matrixRows) {
    const mark = r.ok ? 'ok  ' : 'FAIL';
    const ratio = r.ratio === null ? '  n/a' : String(r.ratio).padStart(5);
    console.log(`  ${mark} ${ratio}:1 (need ${String(r.need).padEnd(3)}) ${r.fg} on ${r.bg} — ${r.purpose}`);
  }

  if (tokensOnly) {
    console.log(matrixFailures.length === 0
      ? '\nAll sanctioned token pairs clear their WCAG 2.2 AA threshold.'
      : `\n${matrixFailures.length} token pair(s) below threshold.`);
    process.exit(matrixFailures.length === 0 ? 0 : 1);
  }

  const files = readdirSync(SITE_DIR).filter((f) => f.endsWith('.html')).sort();
  const allFailures = [];
  let judged = 0;
  let skipped = 0;
  for (const f of files) {
    const html = readFileSync(path.join(SITE_DIR, f), 'utf8');
    const res = auditHtml(html, `site/${f}`);
    allFailures.push(...res.failures);
    judged += res.judged;
    skipped += res.skipped;
  }

  console.log(
    `\nDOM sweep — ${files.length} pages, ${judged} text nodes with a fully ` +
    `determined colour pair (${skipped} skipped as indeterminate).`
  );

  // Group identical (colour, background, need) triples: one palette mistake
  // repeated 300 times is one thing to fix, not 300.
  const groups = new Map();
  for (const f of allFailures) {
    const key = `${f.color}|${f.background}|${f.need}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  if (allFailures.length === 0) {
    console.log('\nNo text node falls below its AA threshold.');
  } else {
    console.log(`\n${allFailures.length} failing text node(s) in ${groups.size} distinct colour pair(s):\n`);
    for (const [, items] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const f = items[0];
      const fileCount = new Set(items.map((i) => i.file)).size;
      console.log(
        `  ${f.color} on ${f.background} — ${f.ratio}:1, need ${f.need} ` +
        `(${items.length} node${items.length === 1 ? '' : 's'} in ${fileCount} file${fileCount === 1 ? '' : 's'})`
      );
      for (const i of items.slice(0, 3)) {
        console.log(`      ${i.file}:${i.line}  ${i.fontSize}px/${i.fontWeight}  "${i.snippet}"`);
      }
      if (items.length > 3) console.log(`      ... and ${items.length - 3} more`);
    }
  }

  const total = matrixFailures.length + allFailures.length;
  if (total === 0) {
    console.log('\nContrast OK: token matrix and DOM sweep both clean.');
    process.exit(0);
  }
  console.error(
    '\nContrast check failed. Pick the variant that matches the ground: ' +
    '--mute/--*-ink on light, --deep-mute/--*-dim on dark. A base accent ' +
    '(--cheap/--frontier/--pass) is only cleared for strokes, graph fills ' +
    'and display type, never for small text or as a filled chip ground.'
  );
  process.exit(checkOnly ? 1 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
