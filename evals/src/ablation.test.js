// Unit tests for ablation.js: the static-vs-tiered summary math (all of it
// delegated to stats.js) and the runAblation loop over runSuite with the
// mock attempter.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runAblation, summarizeAblation, ABLATION_ARMS } from './ablation.js';
import { mockAttempter, mockApex, STATIC_ARMS } from './runner.js';
import { createPolicy } from './policy.js';
import { makeTask } from './tasks.js';
import { newcombeDiffInterval } from './stats.js';

const unit = (passed, cost, seed = 0, category = 'code', extra = {}) => ({ passed, cost, seed, category, escalated: false, apexResolved: false, tokensIn: 1, tokensOut: 1, ...extra });

describe('summarizeAblation', () => {
  test('computes per-arm pass/cost rows, tiered−static Newcombe diffs, best-static headline', () => {
    const byArm = {
      'static-cheap': [unit(true, 0.001), unit(false, 0.001), unit(false, 0.001), unit(false, 0.001)],
      'static-frontier': [unit(true, 0.01), unit(true, 0.01), unit(true, 0.01), unit(false, 0.01)],
      tiered: [unit(true, 0.001), unit(true, 0.004, 0, 'code', { escalated: true }), unit(true, 0.004, 0, 'code', { escalated: true }), unit(true, 0.02, 0, 'code', { escalated: true, apexResolved: true })],
    };
    const s = summarizeAblation(byArm);

    assert.deepEqual(s.arms.map((r) => r.arm), ['static-cheap', 'static-frontier', 'tiered']);
    const tiered = s.arms.find((r) => r.arm === 'tiered');
    assert.equal(tiered.passes, 4);
    assert.equal(tiered.escalated, 3);
    assert.equal(tiered.apexResolved, 1);
    assert.ok(Math.abs(tiered.cost - 0.029) < 1e-9);
    assert.ok(Math.abs(tiered.costPerPass - 0.029 / 4) < 1e-9);
    assert.equal(tiered.passRate.point, 1);
    assert.ok(tiered.passRate.lower < 1 && tiered.passRate.upper === 1);

    // Diffs are exactly newcombeDiffInterval(tiered, static).
    const dCheap = s.diffs.find((d) => d.arm === 'static-cheap');
    const expected = newcombeDiffInterval(4, 4, 1, 4);
    assert.deepEqual(dCheap.passDiff, expected);
    assert.equal(dCheap.passDiff.significant, true);
    assert.ok(Math.abs(dCheap.costRatio - 0.029 / 0.004) < 1e-9);
    assert.ok(Math.abs(dCheap.costPerPassRatio - (0.029 / 4) / (0.004 / 1)) < 1e-9);

    // Best static = highest pass rate (frontier at 3/4).
    assert.equal(s.bestStatic, 'static-frontier');
    assert.equal(s.headline.bestStatic, 'static-frontier');
    assert.equal(s.headline.diff.arm, 'static-frontier');
    assert.equal(s.headline.tieredPass, 1);
    assert.equal(s.headline.bestStaticPass, 0.75);
  });

  test('best-static tie on pass rate is broken by lower cost per completed task', () => {
    const byArm = {
      'static-standard': [unit(true, 0.002), unit(true, 0.002)],
      'static-frontier': [unit(true, 0.01), unit(true, 0.01)],
      tiered: [unit(true, 0.001), unit(true, 0.001)],
    };
    assert.equal(summarizeAblation(byArm).bestStatic, 'static-standard');
  });

  test('a static arm with zero completions gets ∞ $/pass and a null cost-per-pass ratio, not a crash', () => {
    const byArm = {
      'static-cheap': [unit(false, 0.001), unit(false, 0.001)],
      tiered: [unit(true, 0.01), unit(true, 0.01)],
    };
    const s = summarizeAblation(byArm);
    const cheap = s.arms.find((r) => r.arm === 'static-cheap');
    assert.equal(cheap.costPerPass, Infinity);
    const d = s.diffs.find((x) => x.arm === 'static-cheap');
    assert.equal(d.costPerPassRatio, null);
    assert.ok(Number.isFinite(d.costRatio));
    assert.equal(d.passDiff.point, 1);
  });

  test('per-category ledger buckets units by task.category per arm', () => {
    const byArm = {
      'static-cheap': [unit(true, 0, 0, 'code'), unit(false, 0, 0, 'debug')],
      tiered: [unit(true, 0, 0, 'code'), unit(true, 0, 0, 'debug')],
    };
    const s = summarizeAblation(byArm);
    assert.deepEqual(s.perCategory.debug['static-cheap'], { n: 1, passes: 0, cost: 0 });
    assert.deepEqual(s.perCategory.debug.tiered, { n: 1, passes: 1, cost: 0 });
    assert.deepEqual(Object.keys(s.perCategory).sort(), ['code', 'debug']);
  });

  test('requires the tiered arm', () => {
    assert.throws(() => summarizeAblation({ 'static-cheap': [] }), /tiered/);
  });
});

describe('runAblation', () => {
  test('runs every arm (static-<tier> × TIER_ORDER, then tiered) over the suite and returns units per arm', async () => {
    assert.deepEqual(ABLATION_ARMS, [...STATIC_ARMS, 'tiered']);
    assert.deepEqual(STATIC_ARMS, ['static-cheap', 'static-standard', 'static-frontier', 'static-apex']);

    const grader = (answer) => ({ pass: answer === 'ok', reason: '' });
    const easy = makeTask({ id: 'agentic:easy', category: 'code', prompt: 'x', flags: {}, answerKey: 'ok', grader, mock: { minTier: 'cheap' } });
    const hard = makeTask({ id: 'agentic:hard', category: 'debug', prompt: 'x', flags: {}, answerKey: 'ok', grader, mock: { minTier: 'frontier' } });
    const never = makeTask({ id: 'agentic:never', category: 'debug', prompt: 'x', flags: {}, answerKey: 'ok', grader, mock: { minTier: 'none' } });
    const suite = [easy, hard, never];

    const armsSeen = [];
    const byArm = await runAblation({
      vendor: 'anthropic',
      suite,
      seeds: 2,
      concurrency: 2,
      policy: createPolicy('latest'),
      makeAttempt: () => mockAttempter(),
      apexChat: mockApex((id) => (id === never.id ? null : 'ok')),
      apexModel: 'mock-apex',
      onArm: (a) => armsSeen.push(a),
    });

    assert.deepEqual(armsSeen, ABLATION_ARMS);
    assert.deepEqual(Object.keys(byArm), ABLATION_ARMS);
    for (const arm of ABLATION_ARMS) assert.equal(byArm[arm].length, suite.length * 2, arm);

    const passes = (arm) => byArm[arm].filter((u) => u.passed).length;
    assert.equal(passes('static-cheap'), 2); // easy only, both seeds
    assert.equal(passes('static-standard'), 2);
    assert.equal(passes('static-frontier'), 4); // easy + hard
    assert.equal(passes('static-apex'), 4);
    assert.equal(passes('tiered'), 4); // never stays failed even after apex

    // Static arms never escalate and never touch apex; tiered does both.
    for (const arm of STATIC_ARMS) {
      assert.ok(byArm[arm].every((u) => !u.escalated && !u.apexResolved), arm);
    }
    const tieredHard = byArm.tiered.filter((u) => u.id === hard.id);
    assert.ok(tieredHard.every((u) => u.escalated && u.passed));
    const tieredNever = byArm.tiered.filter((u) => u.id === never.id);
    assert.ok(tieredNever.every((u) => u.needsApex && !u.passed));

    const s = summarizeAblation(byArm);
    assert.equal(s.bestStatic, 'static-frontier'); // ties apex on pass, cheaper per completion
    assert.equal(s.headline.diff.passDiff.point, 0);
  });
});
