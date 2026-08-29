// Unit tests for benchmarks.js's MBPP loader/grader.
//
// GSM8K/HumanEval (loadGsm8k/loadHumanEval) are intentionally NOT tested here
// — they fetch live from HuggingFace, and this suite must stay offline. MBPP
// (loadMbpp) is the one embedded, network-free public benchmark, so it's the
// one we can unit test deterministically and cheaply (real python3 execs,
// same trust model as HumanEval's grader — no network, sandboxed to running
// a subprocess with a timeout).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadMbpp, gradeMbpp } from './benchmarks.js';
import { MBPP_SUBSET } from './data/mbpp-subset.js';

describe('MBPP_SUBSET (embedded data)', () => {
  test('has 30 problems, each with the fields the loader needs', () => {
    assert.equal(MBPP_SUBSET.length, 30);
    for (const p of MBPP_SUBSET) {
      assert.equal(typeof p.task_id, 'number');
      assert.equal(typeof p.prompt, 'string');
      assert.equal(typeof p.code, 'string');
      assert.ok(Array.isArray(p.test_list) && p.test_list.length > 0);
    }
  });

  test('task_ids are unique', () => {
    const ids = MBPP_SUBSET.map((p) => p.task_id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('no problem needs test_imports or test_setup_code (self-contained)', () => {
    // Matches the selection rule documented in data/mbpp-subset.js's header.
    for (const p of MBPP_SUBSET) {
      assert.ok(!p.test_imports?.length, `${p.task_id} has test_imports`);
      assert.ok(!p.test_setup_code, `${p.task_id} has test_setup_code`);
    }
  });
});

describe('loadMbpp', () => {
  test('is synchronous and needs no network (offline by construction)', () => {
    // No await, no fetch mock — if this were doing I/O the call below would
    // return a pending Promise, not an array.
    const tasks = loadMbpp(5);
    assert.ok(Array.isArray(tasks));
    assert.equal(tasks.length, 5);
  });

  test('defaults to the full embedded subset', () => {
    assert.equal(loadMbpp().length, MBPP_SUBSET.length);
  });

  test('builds well-formed tasks: id, category, grader, flags', () => {
    const [task] = loadMbpp(1);
    assert.equal(task.id, `mbpp:${MBPP_SUBSET[0].task_id}`);
    assert.equal(task.category, 'mbpp');
    assert.equal(typeof task.grader, 'function');
    assert.equal(task.answerKey, MBPP_SUBSET[0].code);
    assert.deepEqual(task.flags, {
      unverifiable: false,
      ambiguous: false,
      blast: false,
      crossCutting: false,
      novel: false,
      formatStrict: false,
    });
  });

  test('prompt embeds the task description and the official test asserts', () => {
    const [task] = loadMbpp(1);
    assert.ok(task.prompt.includes(MBPP_SUBSET[0].prompt));
    for (const t of MBPP_SUBSET[0].test_list) assert.ok(task.prompt.includes(t));
  });
});

describe('gradeMbpp / task.grader (real python3 execution, deterministic)', () => {
  test('the dataset\'s own reference solution passes its own tests, for every embedded problem', async () => {
    const tasks = loadMbpp();
    for (const task of tasks) {
      const verdict = await task.grader(task.answerKey);
      assert.equal(verdict.pass, true, `${task.id} reference solution failed: ${verdict.reason}`);
    }
  });

  test('an incorrect solution fails deterministically', async () => {
    const [task] = loadMbpp(1);
    const verdict = await task.grader('def totally_wrong_fn():\n    return None\n');
    assert.equal(verdict.pass, false);
  });

  test('empty/missing output fails without executing', async () => {
    const [task] = loadMbpp(1);
    assert.equal((await task.grader('')).pass, false);
    assert.equal((await task.grader(undefined)).pass, false);
  });

  test('gradeMbpp joins test_list into one assert block', async () => {
    const p = MBPP_SUBSET[0];
    const verdict = await gradeMbpp(p.code, p.test_list);
    assert.equal(verdict.pass, true);
  });

  test('two independent MBPP problems grade independently (no shared state)', async () => {
    const [a, b] = loadMbpp(2);
    const [va, vb] = await Promise.all([a.grader(a.answerKey), b.grader(b.answerKey)]);
    assert.equal(va.pass, true);
    assert.equal(vb.pass, true);
  });
});
