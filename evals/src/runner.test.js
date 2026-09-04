// Unit tests for runner.js's seed tagging — the "additive line" from
// business/build-backlog-2026-08-20-round3.md §2 that lets stats.js's
// seed-cluster bootstrap group units by the seed they ran under.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runSuite, mockAttempter } from './runner.js';
import vm from 'node:vm';
import { makeTask } from './tasks.js';
import { createPolicy } from './policy.js';
import { codeSuite } from './suites/code.js';

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
