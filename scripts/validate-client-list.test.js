// Direct unit coverage for validate-client-list.js's detection logic.
//
// Before this file, the script was only ever exercised as an opaque
// `--check` CLI call against the real, currently-correct repo content (in
// CI and manually) — which proves the check doesn't false-positive today,
// but nothing would catch a regression in the detection logic itself (e.g.
// a broken regex or an off-by-one in a count comparison) as long as it
// happened to still pass against today's content. These tests feed the
// exported pure functions deliberately drifted fixtures and assert the
// drift is actually caught, plus that clean fixtures produce zero errors.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  collapse,
  readCompanionSlugsFromDisk,
  checkManifestVsDisk,
  extractFaqAnswers,
  checkFaqAnswers,
  checkFaqCountAndMembership,
  checkLlmsTxt,
  checkReadme,
  checkAgentsMd,
  checkAll,
} from './validate-client-list.js';

// A small, self-consistent 4-client fixture (3 detailed — 2 given their own
// directory bullet, 1 named inline — + 1 additional) — deliberately not the
// real 32-client manifest, so these tests don't need to track the real
// site's content, but shaped the same way README.md/AGENTS.md actually are.
const CLIENTS = [
  { slug: 'claude-code', detailed: true, labels: { faq: 'Claude Code', llms: 'Claude Code', readme: 'Claude Code', agents: 'Claude Code' } },
  { slug: 'cursor', detailed: true, labels: { faq: 'Cursor', llms: 'Cursor', readme: 'Cursor', agents: 'Cursor' } },
  { slug: 'devin', detailed: true, labels: { faq: 'Devin', llms: 'Devin', readme: 'Devin', agents: 'Devin' } },
  { slug: 'windsurf', detailed: false, labels: { faq: 'Windsurf', llms: 'Windsurf', readme: 'Windsurf', agents: 'Windsurf' } },
];

const FAQ_TEXT = '4, verified: Claude Code, Cursor, Devin, and Windsurf — each reads SKILL.md from its own directory.';

const GOOD_INDEX_HTML = `
<script type="application/ld+json">
{ "name": "Which coding agents does this work with?", "text": "${FAQ_TEXT}" }
</script>
<script>
const faqs = [
  { q: 'Which coding agents does this work with?', a: '${FAQ_TEXT}' },
];
</script>
`;

const GOOD_LLMS_TXT = `## Client setup guides
Per-agent companion pages:
[Claude Code](https://getundercut.sh/claude-code) · [Cursor](https://getundercut.sh/cursor) · [Devin](https://getundercut.sh/devin) · [Windsurf](https://getundercut.sh/windsurf)
`;

const GOOD_README = `
Every client uses its own directory:

- **Claude Code** → \`.claude/skills/firstpass/\`
- **Cursor** → \`.cursor/skills/firstpass/\`

Full install steps for these plus Devin, and 1 more clients (Windsurf).
`;

const GOOD_AGENTS_MD = `## Client install matrix

The 3 clients detailed in full below are the primary ones. A further 1
clients have companion pages summarized only in the table further down.

<details><summary><strong>Claude Code</strong></summary></details>
<details><summary><strong>Cursor</strong></summary></details>
<details><summary><strong>Devin</strong></summary></details>

### Additional clients

1 more companion pages landed on 2026-09-05.

| Client | Discovery mechanism (summary) | Source |
| --- | --- | --- |
| Windsurf | Reads SKILL.md | \`site/windsurf.html\` |

### Verify your install
`;

describe('collapse', () => {
  test('collapses runs of whitespace (including newlines) to single spaces and trims', () => {
    assert.equal(collapse('  a\n\n  b   c\t\td  '), 'a b c d');
  });
});

describe('readCompanionSlugsFromDisk', () => {
  test('lists .html files as slugs, excluding non-companion pages', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-site-'));
    try {
      writeFileSync(path.join(dir, 'claude-code.html'), '');
      writeFileSync(path.join(dir, 'cursor.html'), '');
      writeFileSync(path.join(dir, 'index.html'), ''); // excluded
      writeFileSync(path.join(dir, 'privacy.html'), ''); // excluded
      writeFileSync(path.join(dir, 'clients.json'), ''); // not .html
      const slugs = readCompanionSlugsFromDisk(dir);
      assert.deepEqual(slugs, ['claude-code', 'cursor']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('checkManifestVsDisk', () => {
  test('no errors when manifest and disk slugs match exactly', () => {
    assert.deepEqual(checkManifestVsDisk(['a', 'b'], ['a', 'b']), []);
  });

  test('catches a page on disk with no manifest entry', () => {
    const errs = checkManifestVsDisk(['a'], ['a', 'orphan-page']);
    assert.ok(errs.some((e) => /orphan-page.*no entry/.test(e)));
  });

  test('catches a manifest entry with no page on disk', () => {
    const errs = checkManifestVsDisk(['a', 'ghost'], ['a']);
    assert.ok(errs.some((e) => /"ghost".*does not exist/.test(e)));
  });

  test('catches a duplicate slug in the manifest', () => {
    const errs = checkManifestVsDisk(['a', 'a', 'b'], ['a', 'b']);
    assert.ok(errs.some((e) => /duplicate slug/.test(e) && e.includes('a')));
  });
});

describe('extractFaqAnswers', () => {
  test('extracts matching JSON-LD and x-dc answers', () => {
    const { jsonld, dc } = extractFaqAnswers(GOOD_INDEX_HTML);
    assert.equal(jsonld, FAQ_TEXT);
    assert.equal(dc, FAQ_TEXT);
  });

  test('returns null for a missing block instead of throwing', () => {
    const { jsonld, dc } = extractFaqAnswers('<html>nothing here</html>');
    assert.equal(jsonld, null);
    assert.equal(dc, null);
  });
});

describe('checkFaqAnswers', () => {
  test('no errors when both blocks are present and identical', () => {
    assert.deepEqual(checkFaqAnswers({ jsonld: 'x', dc: 'x' }), []);
  });

  test('catches the JSON-LD/x-dc mirrors going out of sync (PR #139/#140 pattern)', () => {
    const errs = checkFaqAnswers({ jsonld: '32, verified: A, B', dc: '31, verified: A, B' });
    assert.ok(errs.some((e) => /differs between the JSON-LD block and the x-dc mirror/.test(e)));
  });

  test('catches a missing JSON-LD block', () => {
    const errs = checkFaqAnswers({ jsonld: null, dc: 'x' });
    assert.ok(errs.some((e) => /JSON-LD FAQ answer/.test(e)));
  });

  test('catches a missing x-dc mirror', () => {
    const errs = checkFaqAnswers({ jsonld: 'x', dc: null });
    assert.ok(errs.some((e) => /x-dc mirror answer/.test(e)));
  });
});

describe('checkFaqCountAndMembership', () => {
  test('no errors against the matching 4-client fixture', () => {
    assert.deepEqual(checkFaqCountAndMembership(FAQ_TEXT, 'test', CLIENTS), []);
  });

  test('catches a stale claimed count (a client added to clients.json, not to the prose)', () => {
    const errs = checkFaqCountAndMembership(FAQ_TEXT, 'test', [...CLIENTS, { slug: 'zed', labels: { faq: 'Zed' } }]);
    assert.ok(errs.some((e) => /claims 4 clients, but site\/clients\.json has 5/.test(e)));
  });

  test('catches a client label missing from the prose entirely', () => {
    const text = '4, verified: Claude Code, Cursor, Devin, and Somebody Else — each reads...';
    const errs = checkFaqCountAndMembership(text, 'test', CLIENTS);
    assert.ok(errs.some((e) => /missing "Windsurf"/.test(e)));
  });

  test('catches a missing "N, verified:" prefix', () => {
    const errs = checkFaqCountAndMembership('Claude Code, Cursor, Devin, and Windsurf.', 'test', CLIENTS);
    assert.ok(errs.some((e) => /expected the answer to start with/.test(e)));
  });

  test('returns no errors for a null/absent text (missing-block case already reported elsewhere)', () => {
    assert.deepEqual(checkFaqCountAndMembership(null, 'test', CLIENTS), []);
  });
});

describe('checkLlmsTxt', () => {
  test('no errors against the matching fixture', () => {
    assert.deepEqual(checkLlmsTxt(GOOD_LLMS_TXT, CLIENTS), []);
  });

  test('catches a missing link for a manifest client', () => {
    const txt = `## Client setup guides
line
[Claude Code](https://getundercut.sh/claude-code) · [Cursor](https://getundercut.sh/cursor) · [Devin](https://getundercut.sh/devin)
`;
    const errs = checkLlmsTxt(txt, CLIENTS);
    assert.ok(errs.some((e) => /missing a link to \/windsurf/.test(e)));
    assert.ok(errs.some((e) => /has 3 links, expected 4/.test(e)));
  });

  test('catches a missing "## Client setup guides" section entirely', () => {
    const errs = checkLlmsTxt('nothing relevant here', CLIENTS);
    assert.ok(errs.some((e) => /could not find the "## Client setup guides"/.test(e)));
  });
});

describe('checkReadme', () => {
  test('no errors against the matching fixture', () => {
    assert.deepEqual(checkReadme(GOOD_README, CLIENTS), []);
  });

  test('catches a stale "N more clients" count', () => {
    const readme = GOOD_README.replace('and 1 more clients (Windsurf)', 'and 2 more clients (Windsurf)');
    const errs = checkReadme(readme, CLIENTS);
    assert.ok(errs.some((e) => /says "2 more clients" but site\/clients\.json has 1/.test(e)));
  });

  test('catches a detailed client missing from both the directory bullets and named-inline list', () => {
    const readme = GOOD_README.replace('- **Cursor** → `.cursor/skills/firstpass/`\n', '');
    const errs = checkReadme(readme, CLIENTS);
    assert.ok(errs.some((e) => /"Cursor".*is a detailed client but appears in neither/.test(e)));
  });

  test('catches a missing "N more clients (...)" sentence entirely', () => {
    const readme = 'Every client uses its own directory:\n\n- **Claude Code** → `x`\n\nno such sentence here';
    const errs = checkReadme(readme, CLIENTS);
    assert.ok(errs.some((e) => /could not find the "Full install steps/.test(e)));
  });
});

describe('checkAgentsMd', () => {
  test('no errors against the matching fixture', () => {
    assert.deepEqual(checkAgentsMd(GOOD_AGENTS_MD, CLIENTS), []);
  });

  test('catches a stale "The N clients detailed in full below" numeral', () => {
    const agents = GOOD_AGENTS_MD.replace('The 3 clients detailed', 'The 4 clients detailed');
    const errs = checkAgentsMd(agents, CLIENTS);
    assert.ok(errs.some((e) => /says "The 4 clients detailed in full below" but there are 3/.test(e)));
  });

  test('catches a missing <details> block for a detailed client', () => {
    const agents = GOOD_AGENTS_MD.replace('<details><summary><strong>Cursor</strong></summary></details>\n', '');
    const errs = checkAgentsMd(agents, CLIENTS);
    assert.ok(errs.some((e) => /found 2 <details> client block\(s\), expected 3/.test(e)));
    assert.ok(errs.some((e) => /no <details> block's <summary> contains "Cursor"/.test(e)));
  });

  test('catches a missing row in the "Additional clients" table', () => {
    const agents = GOOD_AGENTS_MD.replace('| Windsurf | Reads SKILL.md | `site/windsurf.html` |\n', '');
    const errs = checkAgentsMd(agents, CLIENTS);
    assert.ok(errs.some((e) => /table has 0 row\(s\), expected 1/.test(e)));
    assert.ok(errs.some((e) => /missing a row for site\/windsurf\.html/.test(e)));
  });

  test('catches a missing "## Client install matrix" section entirely', () => {
    const errs = checkAgentsMd('nothing relevant here', CLIENTS);
    assert.ok(errs.some((e) => /could not find the "## Client install matrix" section/.test(e)));
  });
});

describe('checkAll (integration)', () => {
  test('zero errors when every source matches the manifest', () => {
    const errors = checkAll({
      manifest: { clients: CLIENTS },
      diskSlugs: ['claude-code', 'cursor', 'devin', 'windsurf'],
      indexHtml: GOOD_INDEX_HTML,
      llmsTxt: GOOD_LLMS_TXT,
      readme: GOOD_README,
      agents: GOOD_AGENTS_MD,
    });
    assert.deepEqual(errors, []);
  });

  test('a single drifted source (llms.txt missing a client) is caught without disturbing the others', () => {
    const brokenLlms = GOOD_LLMS_TXT.replace(' · [Windsurf](https://getundercut.sh/windsurf)', '');
    const errors = checkAll({
      manifest: { clients: CLIENTS },
      diskSlugs: ['claude-code', 'cursor', 'devin', 'windsurf'],
      indexHtml: GOOD_INDEX_HTML,
      llmsTxt: brokenLlms,
      readme: GOOD_README,
      agents: GOOD_AGENTS_MD,
    });
    assert.ok(errors.length > 0);
    assert.ok(errors.every((e) => /llms\.txt/.test(e)));
  });
});
