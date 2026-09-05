// Direct unit coverage for validate-dc-drift.js's detection logic.
//
// Before this file, the script was only ever exercised as an opaque
// `--check` CLI call against the real, currently-correct repo content (in
// CI and manually) — which proves the check doesn't false-positive today,
// but nothing would catch a regression in the detection logic itself (a
// broken regex, an off-by-one, a normalizeText change that stops
// stripping something) as long as it happened to still pass against
// today's content. These tests feed the exported pure functions
// deliberately drifted fixtures and assert the drift is actually caught,
// plus that clean fixtures produce zero errors.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchBalanced,
  extractArrayLiteral,
  decodeEntities,
  stripTags,
  normalizeText,
  extractDcScript,
  extractFallbackBlock,
  fallbackDemoLogLines,
  mdDemoLogLines,
  checkDemoLog,
  fallbackInstallClients,
  mdInstallClients,
  checkInstallClients,
  checkPricingSupportRow,
  fallbackFaqPairs,
  checkFaqDrift,
  checkAll,
} from './validate-dc-drift.js';

describe('matchBalanced', () => {
  test('returns the matching bracket span, including nested brackets', () => {
    const text = 'x = [1, [2, 3], 4]; y';
    const span = matchBalanced(text, text.indexOf('['), '[', ']');
    assert.equal(span, '[1, [2, 3], 4]');
  });

  test('throws on an unbalanced opening bracket', () => {
    assert.throws(() => matchBalanced('[1, 2', 0, '[', ']'), /unbalanced/);
  });
});

describe('extractArrayLiteral', () => {
  test('extracts a labeled array literal (object form: `label: [...]`)', () => {
    const text = `const x = { ladderRows: [ { a: 1 }, { a: 2 } ], other: [] };`;
    const arr = extractArrayLiteral(text, 'ladderRows');
    assert.deepEqual(arr, [{ a: 1 }, { a: 2 }]);
  });

  test('extracts a bare `const label = [...]` literal', () => {
    const text = `const INSTALL_CLIENTS = [ { label: 'Claude Code', cmd: 'npx skills add x' } ];`;
    const arr = extractArrayLiteral(text, 'INSTALL_CLIENTS', { bareConst: true });
    assert.deepEqual(arr, [{ label: 'Claude Code', cmd: 'npx skills add x' }]);
  });

  test('throws with a clear message when the label is not found', () => {
    assert.throws(() => extractArrayLiteral('const y = [];', 'nope'), /could not find "nope"/);
  });
});

describe('text helpers', () => {
  test('decodeEntities handles the entities this file actually emits', () => {
    assert.equal(decodeEntities('&quot;a&quot; &amp; &lt;b&gt; &#39;c&#39;'), `"a" & <b> 'c'`);
  });

  test('stripTags removes tags but keeps text', () => {
    assert.equal(stripTags('<strong>Claude Code</strong> — <code>npx x</code>'), 'Claude Code — npx x');
  });

  test('normalizeText collapses whitespace and curly quotes to straight ones', () => {
    assert.equal(normalizeText('  “Hello”\n\n  ‘world’  '), `"Hello" 'world'`);
  });
});

describe('extractDcScript / extractFallbackBlock', () => {
  const html = `
    <div id="dc-fallback" class="x">
      <p>outer</p>
      <div><p>nested</p></div>
    </div>
    <script type="text/x-dc">const faqs = [];</script>
  `;

  test('extractDcScript finds the x-dc script content', () => {
    assert.equal(extractDcScript(html).trim(), 'const faqs = [];');
  });

  test('extractDcScript throws when the script tag is missing', () => {
    assert.throws(() => extractDcScript('<html></html>'), /could not find <script type="text\/x-dc">/);
  });

  test('extractFallbackBlock balances nested <div> tags, not just brackets', () => {
    const block = extractFallbackBlock(html);
    assert.ok(block.includes('<p>outer</p>'));
    assert.ok(block.includes('<p>nested</p>'));
    assert.ok(block.trim().endsWith('</div>'));
  });

  test('extractFallbackBlock throws when #dc-fallback is missing', () => {
    assert.throws(() => extractFallbackBlock('<html></html>'), /could not find <div id="dc-fallback">/);
  });
});

describe('demo log (ladderRows)', () => {
  const ladderRows = [
    { unit: 'code:refactor-1', flags: '--novel', result: '✓ tiered' },
    { unit: 'security:sqli-1', flags: '--blast', result: '↑ apex' },
  ];

  test('fallbackDemoLogLines extracts one normalized line per <li>', () => {
    const block = `<h3>Example run</h3><ul><li>code:refactor-1 --novel ✓ tiered</li><li>security:sqli-1 --blast ↑ apex</li></ul>`;
    assert.deepEqual(fallbackDemoLogLines(block), [
      'code:refactor-1 --novel ✓ tiered',
      'security:sqli-1 --blast ↑ apex',
    ]);
  });

  test('mdDemoLogLines extracts "- " bullet lines under "## Example run"', () => {
    const md = `## Example run\n- code:refactor-1 --novel ✓ tiered\n- security:sqli-1 --blast ↑ apex\n\n## Next section\nunrelated\n`;
    assert.deepEqual(mdDemoLogLines(md), [
      'code:refactor-1 --novel ✓ tiered',
      'security:sqli-1 --blast ↑ apex',
    ]);
  });

  test('checkDemoLog: no errors when every row is present, in order, with matching unit/flags/result', () => {
    const lines = ['code:refactor-1 --novel ✓ tiered', 'security:sqli-1 --blast ↑ apex'];
    assert.deepEqual(checkDemoLog('test', lines, ladderRows), []);
  });

  test('checkDemoLog: catches a row count mismatch (a row added to ladderRows, not mirrored)', () => {
    const errs = checkDemoLog('test', ['code:refactor-1 --novel ✓ tiered'], ladderRows);
    assert.ok(errs.some((e) => /has 1 row\(s\), x-dc's ladderRows has 2/.test(e)));
  });

  test('checkDemoLog: catches a result field silently drifting (tiered vs apex) even with the unit/flags intact', () => {
    const lines = ['code:refactor-1 --novel ✓ tiered', 'security:sqli-1 --blast ✓ tiered'];
    const errs = checkDemoLog('test', lines, ladderRows);
    assert.ok(errs.some((e) => /row 2 \(security:sqli-1\).*doesn't contain result "apex"/.test(e)));
  });

  test('checkDemoLog: catches a missing unit/flags substring', () => {
    const lines = ['code:refactor-1 --novel ✓ tiered', 'a totally different line'];
    const errs = checkDemoLog('test', lines, ladderRows);
    assert.ok(errs.some((e) => /missing unit "security:sqli-1"/.test(e)));
  });
});

describe('install-client picker (INSTALL_CLIENTS)', () => {
  const installClients = [
    { label: 'Claude Code', cmd: 'npx skills add undercutsh/firstpass', note: 'reads skill from .claude/skills' },
  ];

  test('fallbackInstallClients parses <li><strong>label</strong> — <code>cmd</code></li>', () => {
    const block = `<h3>Install for your agent</h3><ul><li><strong>Claude Code</strong> — <code>npx skills add undercutsh/firstpass</code></li></ul>`;
    assert.deepEqual(fallbackInstallClients(block), [{ label: 'Claude Code', cmd: 'npx skills add undercutsh/firstpass' }]);
  });

  test('mdInstallClients parses the markdown table rows, skipping header/separator', () => {
    const md = `### Install for your agent\n| Agent | Command | Note |\n| --- | --- | --- |\n| Claude Code | \`npx skills add undercutsh/firstpass\` | reads skill from .claude/skills |\n\n## Next\n`;
    assert.deepEqual(mdInstallClients(md), [
      { label: 'Claude Code', cmd: 'npx skills add undercutsh/firstpass', note: 'reads skill from .claude/skills' },
    ]);
  });

  test('checkInstallClients: no errors on a matching fallback list (no note check)', () => {
    const list = [{ label: 'Claude Code', cmd: 'npx skills add undercutsh/firstpass' }];
    assert.deepEqual(checkInstallClients('test', list, installClients, { checkNote: false }), []);
  });

  test('checkInstallClients: catches a drifted command', () => {
    const list = [{ label: 'Claude Code', cmd: 'npx skills add someone-else/firstpass' }];
    const errs = checkInstallClients('test', list, installClients, { checkNote: false });
    assert.ok(errs.some((e) => /command differs in test/.test(e)));
  });

  test('checkInstallClients: catches a missing client entirely', () => {
    const errs = checkInstallClients('test', [], installClients, { checkNote: false });
    assert.ok(errs.some((e) => /missing from test/.test(e)));
  });

  test('checkInstallClients: catches a drifted note when checkNote is true', () => {
    const list = [{ label: 'Claude Code', cmd: 'npx skills add undercutsh/firstpass', note: 'a completely different note' }];
    const errs = checkInstallClients('test', list, installClients, { checkNote: true });
    assert.ok(errs.some((e) => /note differs in test/.test(e)));
  });

  test('checkInstallClients: catches an extra client in the substitute with no x-dc counterpart', () => {
    const list = [
      { label: 'Claude Code', cmd: 'npx skills add undercutsh/firstpass' },
      { label: 'Some Orphan Client', cmd: 'x' },
    ];
    const errs = checkInstallClients('test', list, installClients, { checkNote: false });
    assert.ok(errs.some((e) => /"Some Orphan Client" in test has no matching entry/.test(e)));
  });
});

describe('checkPricingSupportRow', () => {
  const pricingMd = `## Free\n- **Includes:** community support, basic features\n\n## Teams\n- **Includes:** email support, everything in Free\n\n## Enterprise\n- **Includes:** dedicated support, everything in Teams\n`;

  test('no errors when every tier value is mentioned in its pricing.md section', () => {
    const pricingGrid = [{ feature: 'Support', free: 'Community', team: 'Email', ent: 'Dedicated' }];
    assert.deepEqual(checkPricingSupportRow(pricingGrid, pricingMd), []);
  });

  test('catches the exact PR #30 drift: a tier value that no longer matches pricing.md prose', () => {
    const pricingGrid = [{ feature: 'Support', free: 'Community', team: 'Dedicated', ent: 'Dedicated' }];
    const errs = checkPricingSupportRow(pricingGrid, pricingMd);
    assert.ok(errs.some((e) => /"Teams" = "Dedicated", but pricing\.md's ## Teams Includes line doesn't mention "dedicated" support/.test(e)));
  });

  test('reports a clear error when pricingGrid has no "Support" row at all', () => {
    const errs = checkPricingSupportRow([{ feature: 'Something else', free: 'a', team: 'b', ent: 'c' }], pricingMd);
    assert.ok(errs.some((e) => /no row with feature "Support" found/.test(e)));
  });

  test('reports a clear error when a tier heading is missing from pricing.md', () => {
    const pricingGrid = [{ feature: 'Support', free: 'Community', team: 'Email', ent: 'Dedicated' }];
    const noEnterprise = pricingMd.replace(/## Enterprise[\s\S]*/, '');
    const errs = checkPricingSupportRow(pricingGrid, noEnterprise);
    assert.ok(errs.some((e) => /could not find "## Enterprise" section/.test(e)));
  });
});

describe('FAQ subset drift', () => {
  const faqs = [
    { q: 'Does this cost money?', a: 'No, the skill itself is free and MIT licensed. Optional paid tiers add team dashboards.' },
  ];

  test('fallbackFaqPairs parses alternating <p>question</p><p>answer</p>', () => {
    const block = `<h3>Frequently asked</h3><div><p>Does this cost money?</p><p>No, the skill itself is free.</p></div>`;
    assert.deepEqual(fallbackFaqPairs(block), [{ q: 'Does this cost money?', a: 'No, the skill itself is free.' }]);
  });

  test('checkFaqDrift: no error when the fallback answer is a truncated prefix of the full answer', () => {
    const pairs = [{ q: 'Does this cost money?', a: 'No, the skill itself is free and MIT licensed.' }];
    assert.deepEqual(checkFaqDrift(pairs, faqs), []);
  });

  test('checkFaqDrift: catches a fallback answer that is no longer a prefix (drifted wording)', () => {
    const pairs = [{ q: 'Does this cost money?', a: 'Yes, it costs money.' }];
    const errs = checkFaqDrift(pairs, faqs);
    assert.ok(errs.some((e) => /FAQ drift for "Does this cost money\?"/.test(e)));
  });

  test('checkFaqDrift: catches a fallback question with no match in the x-dc faqs array', () => {
    const pairs = [{ q: 'A question that does not exist', a: 'anything' }];
    const errs = checkFaqDrift(pairs, faqs);
    assert.ok(errs.some((e) => /no match in x-dc's faqs array/.test(e)));
  });
});

describe('checkAll (integration)', () => {
  function buildHtml({ ladderRows, installClients, pricingGrid, faqs, demoLine, installLi, faqBlock }) {
    return `
      <div id="dc-fallback">
        <h3>Example run</h3><ul>${demoLine}</ul>
        <h3>Install for your agent</h3><ul>${installLi}</ul>
        <h3>Frequently asked</h3><div>${faqBlock}</div>
      </div>
      <script type="text/x-dc">
        const x = {
          ladderRows: ${JSON.stringify(ladderRows)},
          pricingGrid: ${JSON.stringify(pricingGrid)},
          faqs: ${JSON.stringify(faqs)},
        };
        const INSTALL_CLIENTS = ${JSON.stringify(installClients)};
      </script>
    `;
  }

  const ladderRows = [{ unit: 'code:refactor-1', flags: '--novel', result: '✓ tiered' }];
  const installClients = [{ label: 'Claude Code', cmd: 'npx skills add undercutsh/firstpass', note: 'reads skill from .claude/skills' }];
  const pricingGrid = [{ feature: 'Support', free: 'Community', team: 'Email', ent: 'Dedicated' }];
  const faqs = [{ q: 'Does this cost money?', a: 'No, it is free.' }];

  const pricingMd = `## Free\n- **Includes:** community support\n\n## Teams\n- **Includes:** email support\n\n## Enterprise\n- **Includes:** dedicated support\n`;
  const md = `## Example run\n- code:refactor-1 --novel ✓ tiered\n\n## Next\nunrelated\n\n### Install for your agent\n| Agent | Command | Note |\n| --- | --- | --- |\n| Claude Code | \`npx skills add undercutsh/firstpass\` | reads skill from .claude/skills |\n\n## Next2\n`;

  test('zero errors when every substitute matches the x-dc content', () => {
    const html = buildHtml({
      ladderRows, installClients, pricingGrid, faqs,
      demoLine: '<li>code:refactor-1 --novel ✓ tiered</li>',
      installLi: `<li><strong>Claude Code</strong> — <code>npx skills add undercutsh/firstpass</code></li>`,
      faqBlock: '<p>Does this cost money?</p><p>No, it is free.</p>',
    });
    const { errors, counts } = checkAll({ html, md, pricingMd });
    assert.deepEqual(errors, []);
    assert.deepEqual(counts, { ladderRows: 1, installClients: 1, faqPairs: 1 });
  });

  test('a single drifted substitute (demo log result changed) is caught without disturbing the others', () => {
    const html = buildHtml({
      ladderRows, installClients, pricingGrid, faqs,
      demoLine: '<li>code:refactor-1 --novel ✓ apex</li>', // drifted: apex instead of tiered
      installLi: `<li><strong>Claude Code</strong> — <code>npx skills add undercutsh/firstpass</code></li>`,
      faqBlock: '<p>Does this cost money?</p><p>No, it is free.</p>',
    });
    const { errors } = checkAll({ html, md, pricingMd });
    assert.ok(errors.length > 0);
    assert.ok(errors.every((e) => /demo log/.test(e)));
  });
});
