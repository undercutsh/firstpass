// Unit tests for runner.js's seed tagging — the "additive line" from
// business/build-backlog-2026-08-20-round3.md §2 that lets stats.js's
// seed-cluster bootstrap group units by the seed they ran under.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runSuite, mockAttempter } from './runner.js';
import { makeTask } from './tasks.js';
import { createPolicy } from './policy.js';

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
