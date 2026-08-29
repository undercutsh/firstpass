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
