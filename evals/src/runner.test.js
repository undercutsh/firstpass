// Unit tests for runner.js's seed tagging — the "additive line" from
// business/build-backlog-2026-08-20-round3.md §2 that lets stats.js's
// seed-cluster bootstrap group units by the seed they ran under.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runSuite, mockAttempter, mockApex } from './runner.js';
import vm from 'node:vm';
import { makeTask } from './tasks.js';
import { createPolicy } from './policy.js';
import { codeSuite } from './suites/code.js';
import { reasoningSuite } from './suites/reasoning.js';
import { TIER_ORDER, MAX_TIER_RETRIES } from './config.js';

const task = makeTask({
  id: 'reasoning:t1',
  category: 'reasoning',
  prompt: 'x',
  flags: {},
  answerKey: 'ok',
  grader: async (answer) => ({ pass: answer === 'ok', reason: '' }),
});

describe('runSuite seed tagging', () => {
  test('every unit carries the seed index it ran under', async () => {
    const policy = createPolicy('latest');
    const units = await runSuite({
      arm: 'all-standard',
      vendor: 'anthropic',
      suite: [task],
      attempt: mockAttempter({ alwaysPass: true }),
      apexChat: null,
      apexModel: null,
      seeds: 3,
      concurrency: 4,
      policy,
    });

    assert.equal(units.length, 3);
    // One unit per seed, in seed order 0..2, and no seed reused.
    assert.deepEqual(
      units.map((u) => u.seed),
      [0, 1, 2]
    );
  });

  test('multiple tasks in the same seed all share that seed value', async () => {
    const task2 = makeTask({ ...task, id: 'reasoning:t2' });
    const policy = createPolicy('latest');
    const units = await runSuite({
      arm: 'all-standard',
      vendor: 'anthropic',
      suite: [task, task2],
      attempt: mockAttempter({ alwaysPass: true }),
      apexChat: null,
      apexModel: null,
      seeds: 2,
      concurrency: 4,
      policy,
    });

    assert.equal(units.length, 4);
    const bySeed = new Map();
    for (const u of units) {
      if (!bySeed.has(u.seed)) bySeed.set(u.seed, []);
      bySeed.get(u.seed).push(u.id);
    }
    assert.deepEqual([...bySeed.keys()].sort(), [0, 1]);
    assert.equal(bySeed.get(0).length, 2);
    assert.equal(bySeed.get(1).length, 2);
  });
});

describe('mockAttempter code-suite fixtures exercise key-order independence', () => {
  test('code:word-count mock solution passes with an object key order that differs from the expected literal (regression coverage for #105 in --mock mode)', async () => {
    const wordCountTask = codeSuite.find((t) => t.id === 'code:word-count');
    assert.ok(wordCountTask, 'expected a code:word-count task in codeSuite');

    const attempt = mockAttempter();
    const result = await attempt('cheap', wordCountTask, null);

    // The task must actually pass (the mock's reference solution is correct).
    assert.equal(result.verdict.pass, true, result.verdict.reason);

    // And the *reason it passes* must be genuine key-order independence, not
    // a coincidental match — run the solution directly and confirm its
    // object keys are NOT in the same order as the suite's expected literals
    // (suites/code.js's code:word-count test cases), for the non-trivial
    // (>1 key) cases. If this ever stops being true (e.g. the mock solution
    // or the fixtures change), gradeCode's deepEqual fix would go
    // unexercised by `--mock` again.
    const source = `(function(){\n${result.answer}\nreturn main;})()`;
    const fn = vm.runInNewContext(source, {});
    const nonTrivialCases = [
      { input: ['the cat and the dog'], expectedOrder: ['the', 'cat', 'and', 'dog'] },
      { input: ['Hello, world! Hello.'], expectedOrder: ['hello', 'world'] },
    ];
    for (const { input, expectedOrder } of nonTrivialCases) {
      const got = fn(...input);
      assert.deepEqual(Object.keys(got).sort(), [...expectedOrder].sort()); // same key set
      assert.notDeepEqual(Object.keys(got), expectedOrder); // different order
    }
  });
});

// --- regression coverage: does --mock actually reach the batched apex   ---
// --- tie-break, and does it genuinely exercise the hysteresis cap?      ---
//
// Before the 'apex-tiebreak' fixture (suites/reasoning.js) and its
// APEX_PROBE_IDS handling (runner.js's mockAttempter), EVERY mock task
// resolved by the 'standard' tier (mockAttempter passes any tier !==
// 'cheap'), so runSuite's single-batched-apex-call code path — and the
// ladder's cap-exhaustion branch that feeds it — were dead in `node
// src/main.js --mock`: a naive implementation that dropped the max-one-retry
// hysteresis, or that called apex per-item instead of in one batch, would
// still pass `--mock` with zero coverage. This pins the genuine path.
describe('runSuite exercises the single batched apex tie-break in --mock', () => {
  test('a task that fails at every local tier rides the ladder to its cap and is resolved by ONE batched apex call', async () => {
    const policy = createPolicy('latest');
    const probeTask = reasoningSuite.find((t) => t.id === 'reasoning:apex-tiebreak');
    assert.ok(probeTask, 'expected a reasoning:apex-tiebreak task in reasoningSuite');

    let apexCalls = 0;
    const apexChat = mockApex((id) => (id === probeTask.id ? probeTask.answerKey : null));
    const wrappedApexChat = async (...args) => {
      apexCalls++;
      return apexChat(...args);
    };

    const units = await runSuite({
      arm: 'tiered',
      vendor: 'anthropic',
      suite: [probeTask],
      attempt: mockAttempter(),
      apexChat: wrappedApexChat,
      apexModel: 'mock-apex',
      seeds: 1,
      concurrency: 4,
      policy,
    });

    assert.equal(units.length, 1);
    const [u] = units;

    // Genuinely resolved via apex, not just marked for it.
    assert.equal(u.needsApex, true);
    assert.equal(u.apexResolved, true);
    assert.equal(u.finalTier, 'apex');
    assert.equal(u.passed, true, u.reason);

    // Exactly ONE batched apex call for the whole suite (never per-item).
    assert.equal(apexCalls, 1);

    // The ladder actually rode through every local tier, in order, cap ==
    // 'frontier' (TIER_ORDER[length-2]) before falling to apex — apex is
    // never attempted directly.
    const localTiers = u.attemptLog.filter((a) => a.tier !== 'apex').map((a) => a.tier);
    assert.deepEqual([...new Set(localTiers)], ['cheap', 'standard', 'frontier']);
    assert.equal(policy.capTier(probeTask), TIER_ORDER[TIER_ORDER.length - 2]);
    assert.equal(policy.capTier(probeTask), 'frontier');

    // Hysteresis is genuinely exercised, not just declared: MAX_TIER_RETRIES
    // + 1 attempts at EACH local tier before escalating (one retry, then up).
    for (const tier of ['cheap', 'standard', 'frontier']) {
      const attemptsAtTier = u.attemptLog.filter((a) => a.tier === tier).length;
      assert.equal(attemptsAtTier, MAX_TIER_RETRIES + 1, `expected ${MAX_TIER_RETRIES + 1} attempts at ${tier}`);
    }

    // And the ladder never de-escalates — attempted tiers only ever move up.
    const tierIdx = (t) => TIER_ORDER.indexOf(t);
    const seenOrder = u.attemptLog.map((a) => tierIdx(a.tier));
    for (let i = 1; i < seenOrder.length; i++) {
      assert.ok(seenOrder[i] >= seenOrder[i - 1], 'tier index must never decrease (no de-escalation)');
    }
  });
});
