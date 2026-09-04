// Unit tests for policy.js — pure-function tier assignment/escalation logic.
// See business/build-backlog-2026-08-20-round3.md §7 for the sketch this
// implements. No I/O, no mocking: policy.js is pure logic over task/flags
// objects.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicy, countFlags } from './policy.js';
import { makeTask } from './tasks.js';
import { TIER_ORDER } from './config.js';

// --- countFlags boundary tests: 0/1/2/3 flags -------------------------------

describe('countFlags', () => {
  test('0 flags set', () => {
    const task = makeTask({ id: 't0', category: 'reasoning', prompt: 'x', flags: {}, answerKey: 'x', grader: () => {} });
    assert.equal(countFlags(task), 0);
  });

  test('1 flag set', () => {
    const task = makeTask({ id: 't1', category: 'reasoning', prompt: 'x', flags: { unverifiable: true }, answerKey: 'x', grader: () => {} });
    assert.equal(countFlags(task), 1);
  });

  test('2 flags set', () => {
    const task = makeTask({
      id: 't2',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, ambiguous: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(countFlags(task), 2);
  });

  test('3 flags set', () => {
    const task = makeTask({
      id: 't3',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, ambiguous: true, blast: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(countFlags(task), 3);
  });
});

// --- baseTier() across policy versions --------------------------------------

describe('baseTier — cheap-to-verify override (no formatStrict)', () => {
  for (const version of ['v1', 'probe', 'latest']) {
    test(`${version}: verifiable, no flags -> cheap`, () => {
      const policy = createPolicy(version);
      const task = makeTask({ id: 'a', category: 'mechanical', prompt: 'x', flags: {}, answerKey: 'x', grader: () => {} });
      assert.equal(policy.baseTier(task), 'cheap');
    });
  }
});

describe('baseTier — v1-vs-probe/latest formatStrict divergence', () => {
  // A task that is BOTH format-strict and cheap-to-verify (unverifiable:
  // false). This is the exact case round 5's finding (documented in
  // policy.js's header comment) reversed for `probe`: `latest` hardcodes
  // formatStrict -> 'standard' unconditionally; v1 has no formatStrict
  // concept at all and probe deliberately restores cheap-first.
  const formatStrictVerifiable = () =>
    makeTask({
      id: 'fs-verifiable',
      category: 'mechanical',
      prompt: 'x',
      flags: { formatStrict: true, unverifiable: false },
      answerKey: 'x',
      grader: () => {},
    });

  test('v1 ignores formatStrict entirely -> cheap (override applies)', () => {
    const policy = createPolicy('v1');
    assert.equal(policy.baseTier(formatStrictVerifiable()), 'cheap');
  });

  test('probe restores cheap-first on formatStrict -> cheap', () => {
    const policy = createPolicy('probe');
    assert.equal(policy.baseTier(formatStrictVerifiable()), 'cheap');
  });

  test('latest hardcodes formatStrict -> standard, even though cheap-to-verify', () => {
    const policy = createPolicy('latest');
    assert.equal(policy.baseTier(formatStrictVerifiable()), 'standard');
  });

  // A second case: formatStrict + unverifiable + blast (would independently
  // route to 'frontier' via the ownership/judgment rule). `latest`'s
  // hardcoded formatStrict rule fires FIRST and overrides that entirely —
  // v1/probe fall through to the flags-count/blast logic instead.
  const formatStrictUnverifiableBlast = () =>
    makeTask({
      id: 'fs-unverifiable-blast',
      category: 'reasoning',
      prompt: 'x',
      flags: { formatStrict: true, unverifiable: true, blast: true },
      answerKey: 'x',
      grader: () => {},
    });

  test('v1: formatStrict is just another flag, blast still forces frontier', () => {
    const policy = createPolicy('v1');
    assert.equal(policy.baseTier(formatStrictUnverifiableBlast()), 'frontier');
  });

  test('probe: same fallthrough as v1 -> frontier', () => {
    const policy = createPolicy('probe');
    assert.equal(policy.baseTier(formatStrictUnverifiableBlast()), 'frontier');
  });

  test('latest: hardcoded formatStrict rule wins over blast -> standard', () => {
    const policy = createPolicy('latest');
    assert.equal(policy.baseTier(formatStrictUnverifiableBlast()), 'standard');
  });
});

describe('baseTier — flag-count ladder for unverifiable tasks (shared by v1/probe)', () => {
  // NOTE: countFlags() counts ALL true flags, including `unverifiable`
  // itself — so an unverifiable task with no other flags already has
  // countFlags() === 1, not 0. There is no way to reach 'cheap' once
  // unverifiable is true; the cheap-to-verify override only fires when
  // unverifiable is false.
  test('unverifiable with no other flags -> countFlags is 1 -> standard', () => {
    const policy = createPolicy('probe');
    const task = makeTask({ id: 'u0', category: 'reasoning', prompt: 'x', flags: { unverifiable: true }, answerKey: 'x', grader: () => {} });
    assert.equal(countFlags(task), 1);
    assert.equal(policy.baseTier(task), 'standard');
  });

  test('unverifiable + 1 extra flag -> standard', () => {
    const policy = createPolicy('probe');
    const task = makeTask({
      id: 'u1',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, ambiguous: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(policy.baseTier(task), 'standard');
  });

  test('3+ extra flags -> frontier', () => {
    const policy = createPolicy('probe');
    const task = makeTask({
      id: 'u3',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, ambiguous: true, crossCutting: true, novel: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(policy.baseTier(task), 'frontier');
  });

  test('blast alone forces frontier regardless of flag count', () => {
    const policy = createPolicy('probe');
    const task = makeTask({
      id: 'ublast',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, blast: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(policy.baseTier(task), 'frontier');
  });
});

// --- escalate(): never overruns the ladder, idempotent at top tier ---------

describe('escalate', () => {
  test('steps up one tier at a time through the full ladder', () => {
    const policy = createPolicy('latest');
    assert.equal(policy.escalate('cheap'), 'standard');
    assert.equal(policy.escalate('standard'), 'frontier');
    assert.equal(policy.escalate('frontier'), 'apex');
  });

  test('never overruns the ladder: escalating the top tier stays at the top tier', () => {
    const policy = createPolicy('latest');
    assert.equal(policy.escalate('apex'), TIER_ORDER[TIER_ORDER.length - 1]);
  });

  test('idempotent at the top tier across repeated calls', () => {
    const policy = createPolicy('latest');
    let tier = 'apex';
    for (let i = 0; i < 5; i++) tier = policy.escalate(tier);
    assert.equal(tier, 'apex');
  });

  test('behavior is identical across policy versions (escalate has no version branching)', () => {
    for (const version of ['v1', 'probe', 'latest']) {
      const policy = createPolicy(version);
      assert.equal(policy.escalate('cheap'), 'standard');
      assert.equal(policy.escalate('apex'), 'apex');
    }
  });
});

// --- capTier(): direct coverage (previously only exercised indirectly via
// baseTier's formatStrict fallthrough) ---------------------------------------

describe('capTier', () => {
  const task = (flags) => makeTask({ id: 'c', category: 'mechanical', prompt: 'x', flags, answerKey: 'x', grader: () => {} });

  test('v1 always caps at frontier, formatStrict or not (no formatStrict concept)', () => {
    const policy = createPolicy('v1');
    assert.equal(policy.capTier(task({})), 'frontier');
    assert.equal(policy.capTier(task({ formatStrict: true })), 'frontier');
  });

  for (const version of ['latest', 'probe']) {
    test(`${version}: non-formatStrict task caps at frontier`, () => {
      const policy = createPolicy(version);
      assert.equal(policy.capTier(task({})), 'frontier');
    });

    test(`${version}: formatStrict task caps at standard (never spends frontier on format work)`, () => {
      const policy = createPolicy(version);
      assert.equal(policy.capTier(task({ formatStrict: true })), 'standard');
    });
  }
});

// --- runUnitLadder(): escalation trace, hysteresis, and the apex cap -------
// Previously untested directly — only exercised indirectly through
// runner.test.js's seed-tagging tests via a mock attempter that never
// exercises retries, uncertainty, or the needsApex cap path.

describe('runUnitLadder', () => {
  const task = (flags = {}) => makeTask({ id: 'ladder-task', category: 'reasoning', prompt: 'x', flags, answerKey: 'x', grader: () => {} });

  const passResult = { answer: 'ok', status: 'grounded', uncertaintyReason: null, verdict: { pass: true, reason: 'ok' }, cost: 1 };
  const failResult = { answer: 'bad', status: 'grounded', uncertaintyReason: null, verdict: { pass: false, reason: 'nope' }, cost: 1 };
  const uncertainResult = { answer: null, status: 'uncertain', uncertaintyReason: 'unsure', verdict: { pass: false, reason: 'unsure' }, cost: 1 };

  test('passes on the very first attempt: single attempt, no escalation', async () => {
    const policy = createPolicy('latest');
    const attempt = async () => passResult;
    const trace = await policy.runUnitLadder(task(), attempt);
    assert.equal(trace.attempts.length, 1);
    assert.equal(trace.finalTier, 'cheap');
    assert.equal(trace.escalated, false);
    assert.equal(trace.needsApex, false);
  });

  test('hysteresis: one retry at the same tier on failure before escalating', async () => {
    const policy = createPolicy('latest');
    let calls = 0;
    // Fail twice at cheap (initial + 1 retry), then pass at standard.
    const attempt = async (tier) => {
      calls++;
      if (tier === 'cheap') return failResult;
      return passResult;
    };
    const trace = await policy.runUnitLadder(task(), attempt);
    assert.equal(calls, 3); // cheap, cheap (retry), standard (pass)
    assert.deepEqual(trace.attempts.map((a) => a.tier), ['cheap', 'cheap', 'standard']);
    assert.equal(trace.finalTier, 'standard');
    assert.equal(trace.escalated, true);
  });

  test('uncertain status escalates immediately, with no same-tier retry', async () => {
    const policy = createPolicy('latest');
    const attempt = async (tier) => (tier === 'cheap' ? uncertainResult : passResult);
    const trace = await policy.runUnitLadder(task(), attempt);
    assert.deepEqual(trace.attempts.map((a) => a.tier), ['cheap', 'standard']);
    assert.equal(trace.finalTier, 'standard');
  });

  test('never escalates past the cap: exhausting the cap tier marks needsApex instead of trying apex directly', async () => {
    const policy = createPolicy('latest');
    // Always fails, at every tier — should climb cheap -> standard -> frontier
    // (the v1/non-formatStrict cap) and stop there, never attempting 'apex'.
    const attempt = async () => failResult;
    const trace = await policy.runUnitLadder(task(), attempt);
    assert.equal(trace.needsApex, true);
    assert.equal(trace.finalTier, 'frontier');
    assert.ok(trace.attempts.every((a) => a.tier !== 'apex'), 'ladder must never call apex directly');
  });

  test('a formatStrict task under `latest` caps at standard, not frontier', async () => {
    const policy = createPolicy('latest');
    const attempt = async () => failResult;
    const trace = await policy.runUnitLadder(task({ formatStrict: true }), attempt);
    assert.equal(trace.needsApex, true);
    assert.equal(trace.finalTier, 'standard');
  });
});

// --- runUnitDual(): dual-run disagreement for ambiguous cheap work ---------
// Previously untested directly.

describe('runUnitDual', () => {
  const task = makeTask({ id: 'dual-task', category: 'reasoning', prompt: 'x', flags: { ambiguous: true }, answerKey: 'x', grader: () => {} });

  test('two agreeing, passing attempts: no escalation, settles at the low tier', async () => {
    const policy = createPolicy('latest');
    const attempt = async () => ({ answer: 'same', status: 'grounded', uncertaintyReason: null, verdict: { pass: true, reason: 'ok' }, cost: 1 });
    const result = await policy.runUnitDual(task, attempt);
    assert.equal(result.escalated, false);
    assert.equal(result.finalTier, 'cheap');
    assert.equal(result.attempts.length, 2);
  });

  test('two agreeing attempts that both FAIL still escalate (agreement alone is not enough)', async () => {
    const policy = createPolicy('latest');
    const attempt = async () => ({ answer: 'same', status: 'grounded', uncertaintyReason: null, verdict: { pass: false, reason: 'nope' }, cost: 1 });
    const result = await policy.runUnitDual(task, attempt);
    assert.equal(result.escalated, true);
    assert.equal(result.finalTier, null);
    assert.equal(result.disagreement, true);
  });

  test('two attempts with different answers escalate as a disagreement', async () => {
    const policy = createPolicy('latest');
    let call = 0;
    const attempt = async () => {
      call++;
      return { answer: call === 1 ? 'a' : 'b', status: 'grounded', uncertaintyReason: null, verdict: { pass: true, reason: 'ok' }, cost: 1 };
    };
    const result = await policy.runUnitDual(task, attempt);
    assert.equal(result.escalated, true);
    assert.equal(result.disagreement, true);
    assert.equal(result.finalTier, null);
  });

  test('respects a custom lowTier argument', async () => {
    const policy = createPolicy('latest');
    const seenTiers = [];
    const attempt = async (tier) => {
      seenTiers.push(tier);
      return { answer: 'x', status: 'grounded', uncertaintyReason: null, verdict: { pass: true, reason: 'ok' }, cost: 1 };
    };
    await policy.runUnitDual(task, attempt, 'standard');
    assert.deepEqual(seenTiers, ['standard', 'standard']);
  });
});
