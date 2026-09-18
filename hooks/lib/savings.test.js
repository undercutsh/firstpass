// Unit coverage for the receipt/digest math in savings.js and the model-ID
// normalization in pricing.js that feeds it.
//
// These exist because of a defect class that unit tests are unusually well
// suited to catch and integration testing is unusually bad at: the numbers
// were WRONG, not missing. The hooks ran fine, wrote a ledger, and printed a
// receipt — the receipt just told the user the opposite of what happened
// (a cheap dispatch reported as "escalated to frontier/apex"). Nothing
// crashed, so nothing surfaced it. The assertions below pin the specific
// arithmetic, not the plumbing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, formatSavingsLine } from './savings.js';
import { normalizeModel, tierForModel, isKnownModel, costForUsage } from './pricing.js';

// planMonthlyCostUsd() reads UNDERCUT_PLAN_MONTHLY_USD and nothing else, so
// clearing it is the whole of the isolation these tests need — no temp dirs,
// no ledger on disk. Set explicitly rather than assumed unset, because a
// developer with it exported in their shell would otherwise see different
// output here than CI does.
delete process.env.UNDERCUT_PLAN_MONTHLY_USD;

const USAGE = { input_tokens: 1000, output_tokens: 1000 };

const row = (model, tier) => ({ model, tier, usage: USAGE });

describe('summarize: tier classification', () => {
  test('counts cheap and standard rows as cheapOrStandard', () => {
    const s = summarize([row('claude-haiku-4-5', 'cheap'), row('claude-sonnet-5', 'standard')]);
    assert.equal(s.total, 2);
    assert.equal(s.cheapOrStandard, 2);
    assert.equal(s.escalated, 0);
    assert.equal(s.unclassified, 0);
  });

  test('counts frontier and apex rows as escalated', () => {
    const s = summarize([row('claude-opus-5', 'frontier'), row('claude-fable-5-1', 'apex')]);
    assert.equal(s.escalated, 2);
    assert.equal(s.cheapOrStandard, 0);
    assert.equal(s.unclassified, 0);
  });

  // The regression this file exists for. escalated was derived as
  // (total - cheapOrStandard), so ANY row whose tier didn't resolve was
  // reported as escalated. Combined with the un-normalized pricing table,
  // that meant a dated Haiku ID — an ordinary, correct, cheap dispatch —
  // could be shown to the user as an escalation to frontier/apex. The
  // product's central claim, inverted, in the one number that reports it.
  test('a row with an unresolved tier is unclassified, NOT escalated', () => {
    const s = summarize([row('claude-haiku-4-5', 'cheap'), row('some-unrecognized-id', null)]);
    assert.equal(s.total, 2);
    assert.equal(s.cheapOrStandard, 1);
    assert.equal(s.escalated, 0, 'an unresolved tier must never be counted as an escalation');
    assert.equal(s.unclassified, 1);
  });

  test('escalated is counted from the tier, never inferred by subtraction', () => {
    // One of each bucket: if escalated were still (total - cheapOrStandard)
    // this would report 2 instead of 1.
    const s = summarize([row('claude-haiku-4-5', 'cheap'), row('claude-opus-5', 'frontier'), row('junk', null)]);
    assert.equal(s.escalated, 1);
    assert.equal(s.unclassified, 1);
    assert.equal(s.cheapOrStandard + s.escalated + s.unclassified, s.total, 'the three buckets must partition the rows');
  });

  test('an empty ledger summarizes to zeroes rather than throwing', () => {
    const s = summarize([]);
    assert.equal(s.total, 0);
    assert.equal(s.unclassified, 0);
    assert.equal(s.estimatedSavings, null);
  });
});

describe('summarize: cost', () => {
  test('savings are non-negative and priced rows are excluded from unpriced', () => {
    const s = summarize([row('claude-haiku-4-5', 'cheap')]);
    assert.equal(s.unpriced, 0);
    assert.ok(s.estimatedSavings > 0, 'a cheap model vs. frontier rates should show positive estimated savings');
  });

  test('a row with an unpriceable model is excluded from cost, not counted as zero', () => {
    const s = summarize([row('claude-haiku-4-5', 'cheap'), row('some-unrecognized-id', null)]);
    assert.equal(s.unpriced, 1);
    assert.equal(s.total, 2);
  });

  test('estimatedSavings is null when nothing could be priced, rather than a misleading $0.00', () => {
    const s = summarize([row('some-unrecognized-id', null)]);
    assert.equal(s.estimatedSavings, null);
    assert.equal(formatSavingsLine(s), null);
  });

  test('the unpriced note appears in the formatted line when rows were excluded', () => {
    const s = summarize([row('claude-haiku-4-5', 'cheap'), row('some-unrecognized-id', null)]);
    assert.match(formatSavingsLine(s), /1 unpriced, excluded/);
  });
});

describe('normalizeModel', () => {
  test('strips a trailing -YYYYMMDD snapshot suffix', () => {
    assert.equal(normalizeModel('claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
  });

  test('passes an undated ID through unchanged', () => {
    assert.equal(normalizeModel('claude-sonnet-5'), 'claude-sonnet-5');
  });

  test('passes an unrecognized string through unchanged, so it still misses the table', () => {
    // Normalization must not invent a match. An unknown ID stays unknown and
    // is handled by the existing unpriceable path.
    assert.equal(normalizeModel('totally-made-up'), 'totally-made-up');
    assert.equal(isKnownModel('totally-made-up'), false);
  });

  test('does not strip a version segment that only looks like a date', () => {
    // -4-5 and -5-1 are version segments, not snapshots; only a full 8-digit
    // trailing group is a date.
    assert.equal(normalizeModel('claude-haiku-4-5'), 'claude-haiku-4-5');
    assert.equal(normalizeModel('claude-fable-5-1'), 'claude-fable-5-1');
  });

  test('tolerates a non-string without throwing', () => {
    assert.equal(normalizeModel(undefined), undefined);
    assert.equal(normalizeModel(null), null);
  });
});

describe('dated and undated IDs resolve identically', () => {
  // Claude Code is inconsistent about snapshot suffixes within a single
  // session: a Sonnet dispatch logs `claude-sonnet-5` while a Haiku dispatch
  // logs `claude-haiku-4-5-20251001`. Both forms must land on the same row.
  test('tierForModel', () => {
    assert.equal(tierForModel('claude-haiku-4-5-20251001'), tierForModel('claude-haiku-4-5'));
    assert.equal(tierForModel('claude-haiku-4-5-20251001'), 'cheap');
  });

  test('isKnownModel', () => {
    assert.equal(isKnownModel('claude-haiku-4-5-20251001'), true);
  });

  test('costForUsage', () => {
    assert.equal(costForUsage('claude-haiku-4-5-20251001', USAGE), costForUsage('claude-haiku-4-5', USAGE));
  });

  test('an unrecognized ID still returns no tier rather than a default one', () => {
    // Guessing a tier here would feed the escalated/unclassified split above
    // with fabricated data, which is worse than reporting a visible gap.
    assert.equal(tierForModel('some-unrecognized-id'), null);
  });
});
