// Direct unit coverage for validate-contrast.js.
//
// The script's own `--check` run against the real site proves only that
// today's content passes. That is the weaker half of what matters: a
// contrast checker's job is to FAIL on bad input, and a subtly broken one
// (a luminance formula missing the linearization step, a threshold picked
// at 3 instead of 4.5, a DOM walker that loses the background when a
// wrapper sets only `color`) would sail through a green repo forever.
//
// So these tests feed known-bad palettes and known-bad markup and assert
// the failure is actually produced, with the reference values taken from
// the WCAG 2.x definition rather than from this implementation.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  relativeLuminance,
  contrastRatio,
  requiredRatio,
  parseDeclarations,
  parseStyleBlocks,
  checkTokenMatrix,
  auditHtml,
  TOKENS,
} from './validate-contrast.js';

const near = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);

describe('relativeLuminance', () => {
  test('anchors at the two endpoints defined by the spec', () => {
    near(relativeLuminance('#000000'), 0);
    near(relativeLuminance('#ffffff'), 1);
  });

  test('applies the sRGB transfer curve, not a naive average', () => {
    // Mid-grey #808080 is 0.5019 in sRGB but ~0.2159 in linear light. A
    // implementation that skipped linearization would report ~0.50 here.
    near(relativeLuminance('#808080'), 0.2159, 0.002);
  });

  test('weights the channels per the luma coefficients', () => {
    near(relativeLuminance('#ff0000'), 0.2126, 0.001);
    near(relativeLuminance('#00ff00'), 0.7152, 0.001);
    near(relativeLuminance('#0000ff'), 0.0722, 0.001);
  });

  test('expands 3-digit hex and tolerates a missing #', () => {
    assert.equal(relativeLuminance('#fff'), relativeLuminance('#ffffff'));
    assert.equal(relativeLuminance('000'), relativeLuminance('#000000'));
  });

  test('rejects a non-colour rather than silently returning 0', () => {
    assert.throws(() => relativeLuminance('rebeccapurple'), /not a hex colour/);
    assert.throws(() => relativeLuminance('#12345'), /not a hex colour/);
  });
});

describe('contrastRatio', () => {
  test('black on white is the 21:1 maximum', () => {
    near(contrastRatio('#000000', '#ffffff'), 21, 0.01);
  });

  test('a colour against itself is 1:1', () => {
    near(contrastRatio('#6a6d73', '#6a6d73'), 1, 0.0001);
  });

  test('is symmetric, which is why a chip fill and its text are one check', () => {
    assert.equal(
      contrastRatio(TOKENS.paper, TOKENS['cheap-ink']),
      contrastRatio(TOKENS['cheap-ink'], TOKENS.paper),
    );
  });

  test('reproduces the measured values that motivated the migration', () => {
    // These are the live defects the codemod fixed. If any of these numbers
    // moves, either a token changed or the maths broke.
    near(contrastRatio('#6e7278', '#f2f0ec'), 4.25, 0.01);   // old mute on paper
    near(contrastRatio('#6e7278', '#1c2027'), 3.38, 0.01);   // old mute on deep
    near(contrastRatio('#00959c', '#f2f0ec'), 3.19, 0.01);   // cheap as small text
    near(contrastRatio('#c26e12', '#1c2027'), 4.30, 0.01);   // frontier on deep
  });
});

describe('requiredRatio', () => {
  test('small text needs 4.5', () => {
    assert.equal(requiredRatio(12, 400), 4.5);
    assert.equal(requiredRatio(16, 400), 4.5);
    assert.equal(requiredRatio(23.9, 400), 4.5);
  });

  test('large text needs only 3', () => {
    assert.equal(requiredRatio(24, 400), 3);
    assert.equal(requiredRatio(48, 400), 3);
  });

  test('bold text reaches the large bar earlier', () => {
    assert.equal(requiredRatio(19, 700), 3);
    assert.equal(requiredRatio(19, 400), 4.5);
    assert.equal(requiredRatio(18, 700), 4.5);
  });

  test('defaults to the strict bar when the size is unknown', () => {
    assert.equal(requiredRatio(undefined, undefined), 4.5);
    assert.equal(requiredRatio('inherit', 400), 4.5);
  });
});

describe('parseDeclarations', () => {
  test('reads colour, background and text metrics', () => {
    const d = parseDeclarations('color: #AABBCC; background: #123456; font-size: 13.5px; font-weight: 700');
    assert.deepEqual(d, { color: '#aabbcc', background: '#123456', fontSize: 13.5, fontWeight: 700 });
  });

  test('treats background:transparent as "inherit the ancestor ground"', () => {
    // Recorded as an explicit null, not omitted: omitting it would be
    // indistinguishable from "no background declared".
    const d = parseDeclarations('background: transparent');
    assert.equal(d.background, null);
    assert.ok('background' in d);
  });

  test('accepts background-color as well as background', () => {
    assert.equal(parseDeclarations('background-color: #fff').background, '#fff');
  });

  test('treats a clamp()/vw size as display type', () => {
    assert.equal(parseDeclarations('font-size: clamp(20px, 4vw, 44px)').fontSize, 24);
  });

  test('maps font-weight: bold to 700', () => {
    assert.equal(parseDeclarations('font-weight: bold').fontWeight, 700);
  });

  test('ignores colours it cannot resolve rather than guessing', () => {
    assert.equal(parseDeclarations('color: currentColor').color, undefined);
    assert.equal(parseDeclarations('color: rgb(1,2,3)').color, undefined);
  });
});

describe('parseStyleBlocks', () => {
  test('collects class and element rules', () => {
    const { simple } = parseStyleBlocks('<style>body{color:#111;background:#eee} .mute{color:#777}</style>');
    assert.equal(simple.get('body').color, '#111');
    assert.equal(simple.get('.mute').color, '#777');
  });

  test('keeps a descendant rule with its source selector intact', () => {
    // `.a b` and `.a .b` must stay distinguishable: a consumer rewriting
    // the rule has to match the original text.
    const { descendant } = parseStyleBlocks('<style>.sec-deep span{color:#999}</style>');
    assert.equal(descendant.length, 1);
    assert.equal(descendant[0].sel, '.sec-deep span');
    assert.equal(descendant[0].ancestor, 'sec-deep');
    assert.equal(descendant[0].target, 'span');
  });

  test('skips @media bodies, which model a viewport we are not in', () => {
    const { simple } = parseStyleBlocks(
      '<style>.x{color:#111} @media (max-width: 600px){.x{color:#eee}}</style>',
    );
    assert.equal(simple.get('.x').color, '#111');
  });

  test('drops comments', () => {
    const { simple } = parseStyleBlocks('<style>/* .x{color:#000} */ .y{color:#abc}</style>');
    assert.equal(simple.get('.x'), undefined);
    assert.equal(simple.get('.y').color, '#abc');
  });
});

describe('auditHtml', () => {
  const page = (body, style = '') =>
    `<html><head><style>body{background:#f2f0ec;color:#13161b}${style}</style></head><body>${body}</body></html>`;

  test('passes compliant text', () => {
    const { failures } = auditHtml(page('<p>Readable body copy.</p>'));
    assert.deepEqual(failures, []);
  });

  test('catches the original mute-on-paper defect', () => {
    const { failures } = auditHtml(page('<p style="color:#6e7278;font-size:13px">Secondary.</p>'));
    assert.equal(failures.length, 1);
    near(failures[0].ratio, 4.25, 0.01);
    assert.equal(failures[0].need, 4.5);
  });

  test('accepts the migrated value in the same position', () => {
    const { failures } = auditHtml(page(`<p style="color:${TOKENS.mute};font-size:13px">Secondary.</p>`));
    assert.deepEqual(failures, []);
  });

  test('inherits the ground from a distant ancestor, not just the same element', () => {
    // This is the case a same-attribute grep cannot see, and the reason the
    // checker walks the DOM at all: the dark ground is three levels up and
    // the failing element declares only a colour.
    const { failures } = auditHtml(page(
      '<section style="background:#1c2027"><div><div>' +
      '<span style="color:#6e7278;font-size:12px">Muted on dark</span>' +
      '</div></div></section>',
    ));
    assert.equal(failures.length, 1);
    assert.equal(failures[0].background, '#1c2027');
    near(failures[0].ratio, 3.38, 0.01);
  });

  test('restores the ancestor ground after a nested element closes', () => {
    const { failures } = auditHtml(page(
      '<section style="background:#1c2027">' +
      '<span style="color:#9a9ea4;font-size:12px">fine on dark</span></section>' +
      '<p style="color:#9a9ea4;font-size:12px">but not on paper</p>',
    ));
    assert.equal(failures.length, 1);
    assert.equal(failures[0].background, '#f2f0ec');
  });

  test('lets a large heading through at the 3:1 bar', () => {
    const big = auditHtml(page('<h1 style="color:#00959c;background:#f2f0ec;font-size:40px">Big</h1>'));
    assert.deepEqual(big.failures, []);
    const small = auditHtml(page('<p style="color:#00959c;background:#f2f0ec;font-size:14px">Small</p>'));
    assert.equal(small.failures.length, 1);
  });

  test('exempts decorative aria-hidden content', () => {
    const { failures } = auditHtml(page(
      '<div style="background:#2f343c"><span aria-hidden="true" style="color:#2f343c">&rsaquo;</span></div>',
    ));
    assert.deepEqual(failures, []);
  });

  test('exempts descendants of an aria-hidden container too', () => {
    const { failures } = auditHtml(page(
      '<div aria-hidden="true" style="background:#2f343c"><span><i style="color:#2f343c">x</i></span></div>',
    ));
    assert.deepEqual(failures, []);
  });

  test('does not read script or svg content as prose', () => {
    const { failures } = auditHtml(page(
      '<div style="background:#f2f0ec;color:#f2f0ec">' +
      '<script>var s = "invisible";</script><svg><title>t</title></svg></div>',
    ));
    assert.deepEqual(failures, []);
  });

  test('skips a pair it cannot fully determine rather than inventing one', () => {
    // No <style> seeding the body at all: nothing is explicit, so nothing
    // is judged. Silence beats a fabricated failure.
    const { failures, judged } = auditHtml('<html><body><p>text</p></body></html>');
    assert.deepEqual(failures, []);
    assert.equal(judged, 0);
  });

  test('applies class rules from the page style block', () => {
    const { failures } = auditHtml(page(
      '<p class="mute">Muted.</p>',
      '.mute{color:#6e7278;font-size:13px}',
    ));
    assert.equal(failures.length, 1);
    near(failures[0].ratio, 4.25, 0.01);
  });

  test("an element's own style beats the class rule", () => {
    const { failures } = auditHtml(page(
      `<p class="mute" style="color:${TOKENS.mute}">Muted.</p>`,
      '.mute{color:#6e7278;font-size:13px}',
    ));
    assert.deepEqual(failures, []);
  });

  test('reports the line number so a failure is navigable', () => {
    const html = page('\n\n<p style="color:#6e7278;font-size:12px">x</p>');
    const { failures } = auditHtml(html, 'site/fake.html');
    assert.equal(failures[0].file, 'site/fake.html');
    assert.ok(failures[0].line >= 3);
  });
});

describe('checkTokenMatrix', () => {
  test('the shipped palette keeps every promise it makes', () => {
    const bad = checkTokenMatrix().filter((r) => !r.ok);
    assert.deepEqual(bad, [], `failing pairs: ${bad.map((r) => `${r.fg}/${r.bg}`).join(', ')}`);
  });

  test('catches a regressed token', () => {
    const regressed = { ...TOKENS, mute: '#6e7278' }; // the pre-migration value
    const bad = checkTokenMatrix(regressed).filter((r) => !r.ok);
    assert.ok(bad.some((r) => r.fg === 'mute' && r.bg === 'paper'));
  });

  test('catches a token deleted outright instead of reporting a pass', () => {
    const missing = { ...TOKENS };
    delete missing['cheap-ink'];
    const bad = checkTokenMatrix(missing).filter((r) => !r.ok);
    assert.ok(bad.some((r) => r.reason === 'undefined token'));
  });

  test('holds the base accents to 3:1, not 4.5:1', () => {
    // The base accents legitimately sit at ~3.2:1 on paper. If someone
    // "tightens" the matrix to 4.5 for them, the palette is not broken —
    // the matrix is — and this test says so.
    const rows = checkTokenMatrix();
    const cheapOnPaper = rows.find((r) => r.fg === 'cheap' && r.bg === 'paper');
    assert.equal(cheapOnPaper.need, 3);
    assert.ok(cheapOnPaper.ratio < 4.5);
    assert.ok(cheapOnPaper.ok);
  });
});
