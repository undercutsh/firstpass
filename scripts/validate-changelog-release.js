#!/usr/bin/env node
// Guards CHANGELOG.md against RELEASE BACKDATING: work that shipped after a
// release was cut being silently documented as part of that release.
//
// The failure mode, as it actually happened (PRs #189/#190/#192):
//
//   1. PR #189 branched while the top of CHANGELOG.md was "## [Unreleased]"
//      and added its entry there — correct at the time.
//   2. PR #190 then cut 0.4.0, which renames that same heading to the dated
//      "## [0.4.0] - 2026-09-17".
//   3. #189 merged an hour later. Its entry still applied cleanly, but the
//      heading it landed under was no longer "[Unreleased]" — it was the
//      dated 0.4.0 section. So a page that shipped AFTER 0.4.0 was tagged is
//      now documented as having been part of 0.4.0, and site/changelog.xml
//      (generated from dated sections only) went stale.
//
// Neither PR's CI caught it, and this is the part worth being precise about:
// each was green *against its own base*. #189 never saw the dated heading,
// #190 never saw #189's entry. No single-commit check can catch this, which
// is why this guard compares against git history instead of only linting the
// current file.
//
// WHAT IS ACTUALLY DETERMINABLE FROM HISTORY, and what this deliberately
// does not claim:
//
// For each dated section, the commit that introduced its dated heading is
// recoverable exactly (`git log -S` on the heading text, first hit). That
// commit is the release cut, and the section's bullet list AS OF that commit
// is what the release actually shipped. Anything in the section now that was
// not in it then was added after the release — that is the defect. This is a
// comparison of two known file states, not an inference from timestamps:
// a date-only comparison would have MISSED the real #189 case, because the
// release was cut and #189 merged on the same calendar day (16:32 and 17:34).
//
// Cases that are NOT decidable are skipped rather than guessed at, because a
// guard that cries wolf gets disabled:
//
//   - No git history for the heading (a release being cut in the current PR,
//     an uncommitted edit, a shallow clone, git unavailable). Skipped: there
//     is no baseline to compare against, and a newly cut release legitimately
//     has no history yet.
//   - A section whose bullet count did NOT grow. Editing a released entry in
//     place — a typo fix, a reworded sentence — is legitimate and must not
//     fail CI. Only a section that GAINED a bullet is reported.
//   - Bullet identity is the leading **bold phrase** where there is one (106
//     of 122 bullets), so rewrapping or rewording a bullet's body does not
//     read as a new bullet. Bullets with no bold lead fall back to their full
//     normalized text; for those, a reword inside a released section that
//     also adds a bullet elsewhere in the same section can over-report. The
//     count gate keeps that to the one case, and the remedy is in the error.
//
// A deliberate post-release backfill ("we forgot to document X") is reported
// too, and that is intended, not a bug: from the file alone it is
// indistinguishable from the defect, and the honest fix is the same — put it
// under [Unreleased] or a new dated section, not inside a shipped one.
//
// Also checks a smaller, purely local invariant with no history involved: a
// "### Added"/"### Changed"/"### Fixed" heading left behind with no content
// under it. That is the litter this class of fix leaves when an entry is
// moved out of a section and the now-empty heading is not removed, and
// nothing else in CI flags it.
//
// NOT checked here: whether site/changelog.xml matches CHANGELOG.md.
// scripts/generate-changelog-feed.js --check already owns that, and the two
// are complementary rather than overlapping — that one compares the feed to
// the changelog's current dated sections, this one compares those sections to
// their own history. This script never reads or writes site/changelog.xml.
//
// Usage:
//   node scripts/validate-changelog-release.js          # print a report
//   node scripts/validate-changelog-release.js --check  # exit 1 on any issue
//
// Every check* function below is pure (parsed data in, error-string array
// out) so validate-changelog-release.test.js can feed it deliberately broken
// fixtures and assert the breakage is caught — not merely that today's real
// CHANGELOG.md happens to pass. Only main() and the git* helpers it calls
// touch the filesystem, run git, or exit the process.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SUBSECTION_HEADINGS = ['Added', 'Changed', 'Fixed', 'Removed', 'Deprecated', 'Security'];

// ---------------------------------------------------------------------------
// Parsing — pure
// ---------------------------------------------------------------------------

/**
 * Parse CHANGELOG.md into release sections.
 *
 * Returns [{ version, date, heading, line, subsections: [{ heading, line,
 * bullets: [{ text, line }], hasContent }] }]. `date` is null for
 * [Unreleased]. Bullets are top-level "- " items with their wrapped
 * continuation lines folded in; nested/indented bullets belong to their
 * parent's text and are not separate entries.
 */
export function parseSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let section = null;
  let subsection = null;
  let bullet = null;

  const flushBullet = () => {
    if (bullet && subsection) subsection.bullets.push(bullet);
    bullet = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    const releaseMatch = line.match(/^## \[(.+?)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/);
    if (releaseMatch) {
      flushBullet();
      subsection = null;
      section = {
        version: releaseMatch[1],
        date: releaseMatch[2] ?? null,
        heading: line,
        line: lineNo,
        subsections: [],
      };
      sections.push(section);
      continue;
    }

    const subMatch = line.match(/^### (.+?)\s*$/);
    if (subMatch && section) {
      flushBullet();
      subsection = { heading: subMatch[1].trim(), line: lineNo, bullets: [], hasContent: false };
      section.subsections.push(subsection);
      continue;
    }

    if (!section) continue;

    // Reference-link definitions at the foot of the file ("[0.3.0]: https://")
    // are not section content.
    if (/^\[[^\]]+\]:\s/.test(line)) {
      flushBullet();
      continue;
    }

    const bulletMatch = line.match(/^- (.+)$/);
    if (bulletMatch && subsection) {
      flushBullet();
      subsection.hasContent = true;
      bullet = { text: bulletMatch[1], line: lineNo };
      continue;
    }

    if (line.trim() === '') {
      flushBullet();
      continue;
    }

    if (subsection) {
      subsection.hasContent = true;
      // Continuation of a wrapped bullet, or prose under the heading.
      if (bullet) bullet.text += ' ' + line.trim();
    }
  }

  flushBullet();
  return sections;
}

/** The dated (i.e. released) sections only. [Unreleased] is not a release. */
export function datedSections(sections) {
  return sections.filter((s) => s.date && s.version.toLowerCase() !== 'unreleased');
}

/**
 * A stable identity for a bullet, used to decide whether a bullet in a
 * released section is genuinely NEW or just an edited version of one that
 * was already there.
 *
 * Prefers the leading **bold phrase**: that is the entry's headline and it
 * survives rewrapping and body rewording, which are the legitimate edits.
 * Falls back to the whole normalized text when there is no bold lead.
 */
export function bulletIdentity(text) {
  const bold = text.match(/^\*\*(.+?)\*\*/s);
  const basis = bold ? bold[1] : text;
  return basis.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Every bullet identity in a section, across all its subsections. */
export function sectionBulletIdentities(section) {
  const out = [];
  for (const sub of section.subsections) {
    for (const b of sub.bullets) out.push(bulletIdentity(b.text));
  }
  return out;
}

/** Bullets of a section paired with their identity and line, for reporting. */
export function sectionBullets(section) {
  const out = [];
  for (const sub of section.subsections) {
    for (const b of sub.bullets) {
      out.push({ identity: bulletIdentity(b.text), line: b.line, subsection: sub.heading, text: b.text });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Check 1 — empty "### Added"/"### Changed"/... headings (no history needed)
// ---------------------------------------------------------------------------

export function checkEmptySubsections(sections) {
  const errors = [];
  for (const section of sections) {
    for (const sub of section.subsections) {
      if (sub.hasContent) continue;
      if (!SUBSECTION_HEADINGS.includes(sub.heading)) continue;
      errors.push(
        `CHANGELOG.md:${sub.line}: "### ${sub.heading}" under "${section.heading.trim()}" has nothing under it. ` +
        `Remove the heading — an empty one is the litter left behind when an entry is moved out of a section.`
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Check 2 — bullets added to a section after that section was dated
// ---------------------------------------------------------------------------

/**
 * Compare one dated section against its own state at the commit that dated
 * it.
 *
 * `baseline` is the parsed section as of the release commit, or null when
 * that is not determinable — in which case this returns no errors, on
 * purpose (see the file header).
 */
export function checkBackdatedBullets(section, baseline, releaseCommit) {
  if (!baseline) return [];

  const current = sectionBullets(section);
  const baselineIdentities = new Set(sectionBulletIdentities(baseline));

  // Gate: only a section that GAINED bullets can have been added to. A
  // same-count or shrinking section is an in-place edit or a removal, both
  // of which are legitimate on a released entry.
  if (current.length <= baselineIdentities.size) return [];

  const added = current.filter((b) => !baselineIdentities.has(b.identity));
  if (added.length === 0) return [];

  const shortCommit = releaseCommit ? releaseCommit.slice(0, 9) : '(unknown)';
  return added.map(
    (b) =>
      `CHANGELOG.md:${b.line}: this bullet is inside the dated release section ` +
      `"## [${section.version}] - ${section.date}" but was not there when that release was cut ` +
      `(commit ${shortCommit}), so it documents work that shipped after ${section.version} as part of it. ` +
      `Under "### ${b.subsection}": "${firstWords(b.text)}". ` +
      `Move it to [Unreleased] (or to a newer dated section) and delete the heading if it empties out. ` +
      `If instead this bullet was only reworded in place, rename its leading **bold phrase** back to what it was ` +
      `so it is recognisable as the same entry.`
  );
}

/** A short, single-line excerpt of a bullet for error messages. */
export function firstWords(text, max = 72) {
  const flat = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// Orchestration — pure, given the current markdown plus a baseline per version
// ---------------------------------------------------------------------------

/**
 * `baselines` maps a version string to { commit, markdown } — the CHANGELOG
 * as of the commit that dated that version — or to null/absent when the
 * baseline is not determinable and the section must be skipped.
 */
export function checkAll({ markdown, baselines = {} }) {
  const sections = parseSections(markdown);
  const errors = [];

  errors.push(...checkEmptySubsections(sections));

  for (const section of datedSections(sections)) {
    const baseline = baselines[section.version];
    if (!baseline || !baseline.markdown) continue;
    const baselineSection = datedSections(parseSections(baseline.markdown)).find(
      (s) => s.version === section.version
    );
    if (!baselineSection) continue;
    errors.push(...checkBackdatedBullets(section, baselineSection, baseline.commit));
  }

  return errors;
}

// ---------------------------------------------------------------------------
// git helpers — impure. Called only from main(). Every one of them returns
// null on any failure so a shallow clone or a missing git degrades to
// "skip the history check" instead of failing the build.
// ---------------------------------------------------------------------------

function git(repoRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** The first commit that introduced `heading` into CHANGELOG.md, or null. */
function gitFindHeadingCommit(repoRoot, heading) {
  const out = git(repoRoot, [
    'log',
    '--reverse',
    '--format=%H',
    `-S${heading}`,
    '--',
    'CHANGELOG.md',
  ]);
  if (!out) return null;
  const first = out.split('\n').map((l) => l.trim()).filter(Boolean)[0];
  return first ?? null;
}

/** CHANGELOG.md as of `commit`, or null. */
function gitFileAt(repoRoot, commit) {
  return git(repoRoot, ['show', `${commit}:CHANGELOG.md`]);
}

function gitAvailable(repoRoot) {
  return git(repoRoot, ['rev-parse', '--git-dir']) !== null;
}

// ---------------------------------------------------------------------------
// main() — filesystem + git + CLI, only when invoked directly.
// ---------------------------------------------------------------------------

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const markdown = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');

  const sections = parseSections(markdown);
  const dated = datedSections(sections);

  const baselines = {};
  let skipped = [];
  const haveGit = gitAvailable(repoRoot);

  if (haveGit) {
    for (const section of dated) {
      const commit = gitFindHeadingCommit(repoRoot, section.heading.trim());
      if (!commit) {
        skipped.push(`${section.version} (no commit in history introduces "${section.heading.trim()}")`);
        continue;
      }
      const at = gitFileAt(repoRoot, commit);
      if (!at) {
        skipped.push(`${section.version} (CHANGELOG.md not readable at ${commit.slice(0, 9)})`);
        continue;
      }
      baselines[section.version] = { commit, markdown: at };
    }
  }

  const errors = checkAll({ markdown, baselines });
  const checkOnly = process.argv.includes('--check');

  if (errors.length === 0) {
    const compared = Object.keys(baselines).length;
    console.log(
      `CHANGELOG.md release sections are clean: ${dated.length} dated release${dated.length === 1 ? '' : 's'}, ` +
      `${compared} compared against the commit that cut ${compared === 1 ? 'it' : 'them'}, ` +
      `no empty "### " headings.`
    );
    if (!haveGit) {
      console.log(
        '  Note: git history was not available, so the backdating check was skipped ' +
        '(only the empty-heading check ran).'
      );
    } else if (skipped.length) {
      console.log(`  Skipped as not determinable from history: ${skipped.join('; ')}.`);
    }
    process.exit(0);
  }

  console.error(`CHANGELOG.md release problems (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    '\nThis usually means a branch was cut before a release and merged after it, so its [Unreleased] entry ' +
    'landed in what had become a dated section. Move the entry to [Unreleased], remove any heading it leaves ' +
    'empty, and run `node scripts/generate-changelog-feed.js` so site/changelog.xml follows.'
  );
  process.exit(checkOnly ? 1 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
