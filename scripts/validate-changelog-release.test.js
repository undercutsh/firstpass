// Direct unit coverage for validate-changelog-release.js's detection logic.
//
// The guard's whole purpose is to catch a state that does not exist in the
// repo right now (it was fixed in #192), so a `--check` run against real
// content can only ever prove the absence of false positives. These tests
// supply the broken states deliberately: the exact #189/#190 shape (a branch
// cut before a release, merged after it, whose entry lands in the now-dated
// section), plus the legitimate edits that must NOT fail — an in-place
// reword, a removal, a new [Unreleased] entry, and a release with no history
// to compare against.
//
// Every fixture is hand-built rather than read from the real CHANGELOG.md,
// so these tests keep working as the real changelog grows.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSections,
  datedSections,
  bulletIdentity,
  sectionBulletIdentities,
  sectionBullets,
  checkEmptySubsections,
  checkBackdatedBullets,
  firstWords,
  checkAll,
} from './validate-changelog-release.js';

// ---------------------------------------------------------------------------
// Fixtures — the #189 story in three states
// ---------------------------------------------------------------------------

// State 1: what the changelog looked like when 0.4.0 was cut. This is the
// baseline the guard compares against.
const AT_RELEASE_CUT = `# Changelog

## [Unreleased]

## [0.4.0] - 2026-09-17

### Changed

- **The headline cost claim is one number everywhere.** Both are real
  measured cells, but side by side they read as inconsistent.

### Added

- **Brand raster set and generator.** Rasterises the two logo marks.

## [0.3.0] - 2026-09-03

### Added

- **Sitemap drift checker, wired into CI.** Diffs site/*.html against
  sitemap.xml.

[0.3.0]: https://github.com/undercutsh/firstpass/releases/tag/v0.3.0
`;

// State 2: THE DEFECT. #189 merged after the cut and its entry landed under
// the dated 0.4.0 heading instead of [Unreleased].
const BACKDATED = `# Changelog

## [Unreleased]

## [0.4.0] - 2026-09-17

### Changed

- **The headline cost claim is one number everywhere.** Both are real
  measured cells, but side by side they read as inconsistent.

### Added

- **A per-page Open Graph card for every companion page.** All 45 pages
  under site/ shared one og-image.png.

- **Brand raster set and generator.** Rasterises the two logo marks.

## [0.3.0] - 2026-09-03

### Added

- **Sitemap drift checker, wired into CI.** Diffs site/*.html against
  sitemap.xml.

[0.3.0]: https://github.com/undercutsh/firstpass/releases/tag/v0.3.0
`;

// State 3: the fix — the entry moved to [Unreleased], where it belongs.
const FIXED = `# Changelog

## [Unreleased]

### Added

- **A per-page Open Graph card for every companion page.** All 45 pages
  under site/ shared one og-image.png.

## [0.4.0] - 2026-09-17

### Changed

- **The headline cost claim is one number everywhere.** Both are real
  measured cells, but side by side they read as inconsistent.

### Added

- **Brand raster set and generator.** Rasterises the two logo marks.

## [0.3.0] - 2026-09-03

### Added

- **Sitemap drift checker, wired into CI.** Diffs site/*.html against
  sitemap.xml.

[0.3.0]: https://github.com/undercutsh/firstpass/releases/tag/v0.3.0
`;

const baselinesFor = (markdown, versions = ['0.4.0', '0.3.0']) => {
  const out = {};
  for (const v of versions) out[v] = { commit: 'abc123def456', markdown };
  return out;
};

// ---------------------------------------------------------------------------
describe('parseSections', () => {
  test('finds every release heading with its date', () => {
    const sections = parseSections(FIXED);
    assert.deepEqual(
      sections.map((s) => [s.version, s.date]),
      [['Unreleased', null], ['0.4.0', '2026-09-17'], ['0.3.0', '2026-09-03']]
    );
  });

  test('groups bullets under their own "### " subsection', () => {
    const v040 = parseSections(FIXED).find((s) => s.version === '0.4.0');
    assert.deepEqual(v040.subsections.map((s) => s.heading), ['Changed', 'Added']);
    assert.equal(v040.subsections[0].bullets.length, 1);
    assert.equal(v040.subsections[1].bullets.length, 1);
  });

  test('folds a wrapped bullet\'s continuation lines into one bullet', () => {
    const v040 = parseSections(FIXED).find((s) => s.version === '0.4.0');
    const bullet = v040.subsections[0].bullets[0];
    assert.match(bullet.text, /one number everywhere.*read as inconsistent/s);
    assert.equal(v040.subsections[0].bullets.length, 1, 'wrapped lines must not become extra bullets');
  });

  test('records the real 1-based line number of each bullet', () => {
    const sections = parseSections(BACKDATED);
    const v040 = sections.find((s) => s.version === '0.4.0');
    const og = v040.subsections[1].bullets[0];
    const expected = BACKDATED.split('\n').findIndex((l) => l.startsWith('- **A per-page')) + 1;
    assert.equal(og.line, expected);
  });

  test('does not treat reference-link definitions as content', () => {
    const v030 = parseSections(FIXED).find((s) => s.version === '0.3.0');
    assert.equal(v030.subsections[0].bullets.length, 1);
    assert.ok(!JSON.stringify(v030).includes('releases/tag/v0.3.0'));
  });

  test('handles a release with repeated subsection headings', () => {
    const md = [
      '## [1.0.0] - 2026-01-01',
      '',
      '### Added',
      '',
      '- **One.** a',
      '',
      '### Changed',
      '',
      '- **Two.** b',
      '',
      '### Added',
      '',
      '- **Three.** c',
      '',
    ].join('\n');
    const section = parseSections(md)[0];
    assert.equal(section.subsections.length, 3);
    assert.deepEqual(sectionBulletIdentities(section), ['one.', 'two.', 'three.']);
  });
});

// ---------------------------------------------------------------------------
describe('datedSections', () => {
  test('excludes [Unreleased] — it is not a release', () => {
    const versions = datedSections(parseSections(FIXED)).map((s) => s.version);
    assert.deepEqual(versions, ['0.4.0', '0.3.0']);
  });

  test('excludes a heading that has no date', () => {
    const sections = parseSections('## [0.9.0]\n\n### Added\n\n- **x.** y\n');
    assert.deepEqual(datedSections(sections), []);
  });
});

// ---------------------------------------------------------------------------
describe('bulletIdentity', () => {
  test('uses the leading bold phrase when there is one', () => {
    assert.equal(bulletIdentity('**A per-page card.** Body text here.'), 'a per-page card.');
  });

  test('is stable when only the body is reworded — the legitimate edit', () => {
    const before = bulletIdentity('**Brand raster set and generator.** Rasterises the two logo marks.');
    const after = bulletIdentity('**Brand raster set and generator.** Now rasterises both marks at 2x, too.');
    assert.equal(before, after);
  });

  test('is stable across rewrapping', () => {
    assert.equal(
      bulletIdentity('**One   two\nthree.** body'),
      bulletIdentity('**One two three.** other body')
    );
  });

  test('falls back to full normalized text with no bold lead', () => {
    assert.equal(bulletIdentity('Plain  bullet   text'), 'plain bullet text');
  });
});

// ---------------------------------------------------------------------------
describe('checkEmptySubsections', () => {
  test('catches an "### Added" left behind with nothing under it', () => {
    const md = [
      '## [0.4.0] - 2026-09-17',
      '',
      '### Added',
      '',
      '### Fixed',
      '',
      '- **Something.** real content',
      '',
    ].join('\n');
    const errors = checkEmptySubsections(parseSections(md));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /"### Added".*has nothing under it/);
    assert.match(errors[0], /CHANGELOG\.md:3/);
  });

  test('catches an empty heading at the very end of the file', () => {
    const errors = checkEmptySubsections(parseSections('## [0.4.0] - 2026-09-17\n\n### Changed\n'));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /"### Changed"/);
  });

  test('catches an empty heading in [Unreleased] too', () => {
    const errors = checkEmptySubsections(parseSections('## [Unreleased]\n\n### Added\n\n## [0.1.0] - 2026-01-01\n\n### Added\n\n- **x.** y\n'));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Unreleased/);
  });

  test('does NOT flag a subsection carrying only prose', () => {
    const md = '## [0.4.0] - 2026-09-17\n\n### Changed\n\nThis release was mostly internal.\n';
    assert.deepEqual(checkEmptySubsections(parseSections(md)), []);
  });

  test('does NOT flag a non-standard heading with no bullets', () => {
    const md = '## [0.4.0] - 2026-09-17\n\n### Upgrade notes\n\n### Added\n\n- **x.** y\n';
    assert.deepEqual(checkEmptySubsections(parseSections(md)), []);
  });

  test('clean fixtures produce no errors', () => {
    assert.deepEqual(checkEmptySubsections(parseSections(FIXED)), []);
    assert.deepEqual(checkEmptySubsections(parseSections(AT_RELEASE_CUT)), []);
  });
});

// ---------------------------------------------------------------------------
describe('checkBackdatedBullets', () => {
  const v040Of = (md) => datedSections(parseSections(md)).find((s) => s.version === '0.4.0');

  test('catches a bullet added to a dated section after the release was cut', () => {
    const errors = checkBackdatedBullets(v040Of(BACKDATED), v040Of(AT_RELEASE_CUT), 'abc123def456789');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /inside the dated release section "## \[0\.4\.0\] - 2026-09-17"/);
    assert.match(errors[0], /was not there when that release was cut \(commit abc123def\)/);
    assert.match(errors[0], /A per-page Open Graph card/);
    assert.match(errors[0], /Move it to \[Unreleased\]/);
  });

  test('reports the offending bullet\'s line and subsection', () => {
    const errors = checkBackdatedBullets(v040Of(BACKDATED), v040Of(AT_RELEASE_CUT), 'abc123def456789');
    const expected = BACKDATED.split('\n').findIndex((l) => l.startsWith('- **A per-page')) + 1;
    assert.match(errors[0], new RegExp(`CHANGELOG\\.md:${expected}:`));
    assert.match(errors[0], /Under "### Added"/);
  });

  test('skips the section entirely when there is no baseline (undecidable)', () => {
    assert.deepEqual(checkBackdatedBullets(v040Of(BACKDATED), null, null), []);
  });

  test('does NOT flag an in-place reword of a released bullet', () => {
    const reworded = AT_RELEASE_CUT.replace(
      'Rasterises the two logo marks.',
      'Rasterises both logo marks, now at 2x as well.'
    );
    assert.deepEqual(checkBackdatedBullets(v040Of(reworded), v040Of(AT_RELEASE_CUT), 'abc123'), []);
  });

  test('does NOT flag a bullet removed from a released section', () => {
    const removed = AT_RELEASE_CUT.replace(
      '- **Brand raster set and generator.** Rasterises the two logo marks.\n',
      ''
    );
    assert.deepEqual(checkBackdatedBullets(v040Of(removed), v040Of(AT_RELEASE_CUT), 'abc123'), []);
  });

  test('does NOT flag a bullet that merely moved between subsections', () => {
    const moved = `# Changelog

## [0.4.0] - 2026-09-17

### Changed

- **The headline cost claim is one number everywhere.** Both are real
  measured cells, but side by side they read as inconsistent.
- **Brand raster set and generator.** Rasterises the two logo marks.
`;
    assert.deepEqual(checkBackdatedBullets(v040Of(moved), v040Of(AT_RELEASE_CUT), 'abc123'), []);
  });

  test('a section that did not grow is never reported, even with a changed identity', () => {
    // Bold lead rewritten in place: the count gate suppresses it on purpose,
    // because a same-size section cannot have gained an entry.
    const renamed = AT_RELEASE_CUT.replace(
      '**Brand raster set and generator.**',
      '**Brand rasters and their generator.**'
    );
    assert.deepEqual(checkBackdatedBullets(v040Of(renamed), v040Of(AT_RELEASE_CUT), 'abc123'), []);
  });

  test('catches several backdated bullets at once', () => {
    const two = BACKDATED.replace(
      '- **Brand raster set and generator.** Rasterises the two logo marks.',
      '- **Brand raster set and generator.** Rasterises the two logo marks.\n\n- **Another late entry.** Landed after the cut too.'
    );
    const errors = checkBackdatedBullets(v040Of(two), v040Of(AT_RELEASE_CUT), 'abc123');
    assert.equal(errors.length, 2);
    assert.ok(errors.some((e) => /A per-page Open Graph card/.test(e)));
    assert.ok(errors.some((e) => /Another late entry/.test(e)));
  });
});

// ---------------------------------------------------------------------------
describe('checkAll', () => {
  test('flags the #189 shape end to end', () => {
    const errors = checkAll({ markdown: BACKDATED, baselines: baselinesFor(AT_RELEASE_CUT) });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /A per-page Open Graph card/);
  });

  test('the fix clears it — the entry under [Unreleased] is not a violation', () => {
    assert.deepEqual(checkAll({ markdown: FIXED, baselines: baselinesFor(AT_RELEASE_CUT) }), []);
  });

  test('an unchanged changelog is clean against itself', () => {
    assert.deepEqual(checkAll({ markdown: AT_RELEASE_CUT, baselines: baselinesFor(AT_RELEASE_CUT) }), []);
  });

  test('adding to [Unreleased] is always allowed', () => {
    const md = FIXED.replace(
      '### Added\n\n- **A per-page Open Graph card',
      '### Added\n\n- **A brand new thing.** Shipped today.\n\n- **A per-page Open Graph card'
    );
    assert.deepEqual(checkAll({ markdown: md, baselines: baselinesFor(AT_RELEASE_CUT) }), []);
  });

  test('with no baselines at all, only the empty-heading check runs', () => {
    // The shallow-clone / no-git path: the backdating defect is present but
    // undetectable, and the guard must stay silent rather than guess.
    assert.deepEqual(checkAll({ markdown: BACKDATED, baselines: {} }), []);

    const withLitter = BACKDATED.replace('### Changed\n', '### Removed\n\n### Changed\n');
    const errors = checkAll({ markdown: withLitter, baselines: {} });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /"### Removed"/);
  });

  test('a newly cut release with no history yet is skipped, not flagged', () => {
    // The shape of a PR that cuts a release: a dated section appears for the
    // first time, so no baseline exists for it. Its sibling still gets
    // checked.
    const cut = FIXED.replace('## [Unreleased]', '## [0.5.0] - 2026-10-01');
    assert.deepEqual(checkAll({ markdown: cut, baselines: baselinesFor(AT_RELEASE_CUT) }), []);
  });

  test('reports both problem classes together', () => {
    const both = BACKDATED.replace('### Changed\n', '### Fixed\n\n### Changed\n');
    const errors = checkAll({ markdown: both, baselines: baselinesFor(AT_RELEASE_CUT) });
    assert.equal(errors.length, 2);
    assert.ok(errors.some((e) => /"### Fixed"/.test(e)));
    assert.ok(errors.some((e) => /A per-page Open Graph card/.test(e)));
  });

  test('a baseline whose section is absent is skipped', () => {
    const baselines = { '0.4.0': { commit: 'abc123', markdown: '# Changelog\n\n## [0.1.0] - 2026-01-01\n' } };
    assert.deepEqual(checkAll({ markdown: BACKDATED, baselines }), []);
  });
});

// ---------------------------------------------------------------------------
describe('helpers', () => {
  test('sectionBullets carries identity, line and subsection', () => {
    const v040 = datedSections(parseSections(BACKDATED)).find((s) => s.version === '0.4.0');
    const bullets = sectionBullets(v040);
    assert.equal(bullets.length, 3);
    assert.deepEqual(
      bullets.map((b) => b.subsection),
      ['Changed', 'Added', 'Added']
    );
    assert.ok(bullets.every((b) => typeof b.line === 'number' && b.line > 0));
  });

  test('firstWords strips bold markers, flattens and truncates', () => {
    assert.equal(firstWords('**Bold.**  body\ntext'), 'Bold. body text');
    const long = firstWords('x'.repeat(200));
    assert.ok(long.length <= 72);
    assert.match(long, /…$/);
  });
});
