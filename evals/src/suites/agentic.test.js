// The agentic suite's determinism contract. Every task's `answerKey` is a
// reference solution that must pass its own grader — for the shell tasks
// that means actually running the reference script in the sandbox, for the
// JS tasks running it in the vm, for the plan/manifest tasks structural
// equality. If a fixture, expected output, or reference drifts, this is
// what catches it before a live sweep burns money on a task nobody can pass.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { agenticSuite } from './agentic.js';
import { TIER_ORDER } from '../config.js';

const KNOWN_CATEGORIES = ['code', 'reasoning', 'mechanical', 'debug', 'refactor', 'documentation', 'security'];

describe('agentic suite', () => {
  test('has 20–35 tasks, unique agentic: ids, categories from the existing taxonomy', () => {
    assert.ok(agenticSuite.length >= 20 && agenticSuite.length <= 35, `got ${agenticSuite.length}`);
    const ids = agenticSuite.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
    for (const t of agenticSuite) {
      assert.match(t.id, /^agentic:[a-z0-9-]+$/, t.id);
      assert.ok(KNOWN_CATEGORIES.includes(t.category), `${t.id}: unknown category ${t.category}`);
      assert.equal(t.flags.unverifiable, false, `${t.id}: every agentic task is mechanically verifiable`);
    }
  });

  test('covers every category in the taxonomy', () => {
    const cats = new Set(agenticSuite.map((t) => t.category));
    for (const c of KNOWN_CATEGORIES) assert.ok(cats.has(c), `missing category ${c}`);
  });

  test('every task carries a valid --mock difficulty profile, spread across tiers', () => {
    const byTier = {};
    for (const t of agenticSuite) {
      assert.ok(t.mock?.minTier, `${t.id}: missing mock.minTier`);
      assert.ok(t.mock.minTier === 'none' || TIER_ORDER.includes(t.mock.minTier), `${t.id}: bad minTier ${t.mock.minTier}`);
      byTier[t.mock.minTier] = (byTier[t.mock.minTier] ?? 0) + 1;
    }
    for (const tier of TIER_ORDER) assert.ok(byTier[tier] >= 1, `no task solves at ${tier}`);
    assert.ok(byTier.none >= 1, 'need at least one never-solved task so the failed-after-apex path is exercised');
    assert.ok(agenticSuite.some((t) => t.mock.retryAtMinTier), 'need at least one retry-then-pass task (hysteresis path)');
  });

  test('every reference solution passes its own grader (determinism check, runs the real sandboxes)', async () => {
    for (const t of agenticSuite) {
      const v = await t.grader(t.answerKey);
      assert.equal(v.pass, true, `${t.id}: ${v.reason}`);
    }
  });

  test('graders are repeatable: grading the reference twice gives the same verdict', async () => {
    for (const t of agenticSuite) {
      const [a, b] = [await t.grader(t.answerKey), await t.grader(t.answerKey)];
      assert.deepEqual({ pass: a.pass, reason: a.reason }, { pass: b.pass, reason: b.reason }, t.id);
    }
  });

  test('a wrong answer of the right shape fails every grader', async () => {
    for (const t of agenticSuite) {
      const wrong = typeof t.answerKey === 'string' ? 'echo definitely-not-the-answer' : { wrong: true };
      const v = await t.grader(wrong);
      assert.equal(v.pass, false, `${t.id} accepted a wrong answer`);
    }
  });

  test('shell and JS tasks carry an answerNote so the worker prompt asks for the right artifact', () => {
    for (const t of agenticSuite) {
      if (typeof t.answerKey === 'string' && t.category === 'code') {
        assert.ok(t.answerNote, `${t.id}: code-category task without answerNote`);
      }
    }
    const shell = agenticSuite.filter((t) => t.answerNote?.includes('bash script'));
    assert.ok(shell.length >= 5, 'expected at least five shell-graded tasks');
  });
});
