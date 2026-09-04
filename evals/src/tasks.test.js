// Unit tests for tasks.js — extractJson() and gradeJsonSubset().
// See business/build-backlog-2026-08-20-round3.md §7 for the sketch this
// implements.
//
// NOTE on gradeJsonSubset: rounds 1-3 flagged that it compares array-valued
// keys with order-sensitive JSON.stringify even though at least one
// mechanical task ("json-flatten-keys") explicitly tells the worker "in any
// order." The tests below PIN the current (buggy) order-sensitive behavior
// as a regression baseline, per round 3's instruction — they document what
// the code does today, not what it should do. Fixing the order-insensitivity
// is separate, future work; do not "fix" these tests without also fixing
// gradeJsonSubset and updating round-3's tracked finding.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, gradeJsonSubset, gradeCode, gradeExact, makeTask } from './tasks.js';

// --- extractJson() -----------------------------------------------------

describe('extractJson', () => {
  test('parses a fenced ```json block', () => {
    const text = '```json\n{"status": "ok", "answer": 42}\n```';
    assert.deepEqual(extractJson(text), { status: 'ok', answer: 42 });
  });

  test('parses a fenced block without the json language tag', () => {
    const text = '```\n{"a": 1}\n```';
    assert.deepEqual(extractJson(text), { a: 1 });
  });

  test('parses raw JSON with no fencing', () => {
    const text = '{"a": 1, "b": [1, 2, 3]}';
    assert.deepEqual(extractJson(text), { a: 1, b: [1, 2, 3] });
  });

  test('extracts JSON embedded in surrounding prose', () => {
    const text = 'Sure, here is the answer: {"status": "grounded", "answer": "x"} — let me know if you need more.';
    assert.deepEqual(extractJson(text), { status: 'grounded', answer: 'x' });
  });

  test('returns falsy (not a throw) on garbage input', () => {
    const text = 'this is not json at all, sorry';
    assert.ok(!extractJson(text));
  });

  test('returns falsy (not a throw) on empty string', () => {
    assert.ok(!extractJson(''));
  });

  test('returns falsy (not a throw) on null input', () => {
    assert.ok(!extractJson(null));
  });

  test('returns falsy (not a throw) on undefined input', () => {
    assert.ok(!extractJson(undefined));
  });

  test('returns falsy on malformed JSON with brace-like prose', () => {
    // Has a `{` ... `}` span but the interior isn't valid JSON.
    const text = 'The config looks like {this is not json, no quotes} to me';
    assert.ok(!extractJson(text));
  });
});

// --- gradeJsonSubset() --------------------------------------------------

describe('gradeJsonSubset', () => {
  test('passes when all expected keys match exactly', () => {
    const result = gradeJsonSubset({ a: 1, b: 'x', extra: 'ignored' }, { a: 1, b: 'x' });
    assert.equal(result.pass, true);
  });

  test('fails on a missing key', () => {
    const result = gradeJsonSubset({ a: 1 }, { a: 1, b: 2 });
    assert.equal(result.pass, false);
    assert.match(result.reason, /missing key "b"/);
  });

  test('fails on non-JSON string input', () => {
    const result = gradeJsonSubset('not json', { a: 1 });
    assert.equal(result.pass, false);
    assert.equal(result.reason, 'non-JSON output');
  });

  test('accepts a JSON string answer (routes through extractJson)', () => {
    const result = gradeJsonSubset('{"a": 1}', { a: 1 });
    assert.equal(result.pass, true);
  });

  test('array-valued key: identical order passes', () => {
    const result = gradeJsonSubset({ keys: ['a', 'b', 'c'] }, { keys: ['a', 'b', 'c'] });
    assert.equal(result.pass, true);
  });

  // REGRESSION BASELINE (current buggy behavior, not the desired behavior):
  // gradeJsonSubset uses JSON.stringify equality, so a same-content array in
  // a different order is treated as a mismatch. Some mechanical tasks
  // explicitly permit "any order" for array-valued answers, so this is a
  // known bug (rounds 1-3) — pinned here so a future order-insensitive fix
  // has a clear red/green signal, not fixed in this change.
  test('[REGRESSION] array-valued key: same elements, different order currently FAILS', () => {
    const result = gradeJsonSubset({ keys: ['c', 'b', 'a'] }, { keys: ['a', 'b', 'c'] });
    assert.equal(result.pass, false);
    assert.match(result.reason, /key "keys"/);
  });

  test('[REGRESSION] array-valued key: same elements, reversed, still currently FAILS', () => {
    const result = gradeJsonSubset({ tags: ['x', 'y'] }, { tags: ['y', 'x'] });
    assert.equal(result.pass, false);
  });

  // FIXED BUG: object-valued keys (including objects nested inside an
  // order-sensitive array, e.g. documentation's "params" list) were compared
  // with plain JSON.stringify equality, which is sensitive to key
  // enumeration order even though object equality never should be — a
  // worker emitting the exact same fields in a different order was scored
  // as a failure. gradeJsonSubset (and gradeCode, tested below) now uses a
  // deepEqual that is key-order-independent for objects while staying
  // element-order-sensitive for arrays (see the REGRESSION tests above,
  // still pinned/unchanged).
  test('object-valued key: same fields in a different order passes', () => {
    const result = gradeJsonSubset({ returns: { type: 'int', name: 'n' } }, { returns: { name: 'n', type: 'int' } });
    assert.equal(result.pass, true);
  });

  test('object nested inside an array: key order within each object does not matter', () => {
    const result = gradeJsonSubset(
      { params: [{ type: 'int', name: 'n' }] },
      { params: [{ name: 'n', type: 'int' }] },
    );
    assert.equal(result.pass, true);
  });

  test('object nested inside an array: still fails on genuinely different content', () => {
    const result = gradeJsonSubset(
      { params: [{ name: 'n', type: 'str' }] },
      { params: [{ name: 'n', type: 'int' }] },
    );
    assert.equal(result.pass, false);
  });

  test('array element order still matters even when elements are objects', () => {
    const result = gradeJsonSubset(
      { params: [{ name: 'b' }, { name: 'a' }] },
      { params: [{ name: 'a' }, { name: 'b' }] },
    );
    assert.equal(result.pass, false);
  });
});

// --- gradeCode() ---------------------------------------------------------
// Previously had zero direct coverage — only exercised indirectly through
// runner.test.js's mock plumbing. The cases below cover the malformed-input
// and failure-reporting paths gradeCode is actually responsible for.

describe('gradeCode', () => {
  test('passes when main() satisfies every test case', () => {
    const result = gradeCode('function main(a, b) { return a + b; }', [
      { input: [1, 2], expected: 3 },
      { input: [-1, 1], expected: 0 },
    ]);
    assert.equal(result.pass, true);
    assert.equal(result.reason, '2/2 cases passed');
  });

  test('supports `run` as an alternate export name when `main` is absent', () => {
    const result = gradeCode('function run(x) { return x * 2; }', [{ input: [3], expected: 6 }]);
    assert.equal(result.pass, true);
  });

  test('rejects a non-string solution (e.g. null) without throwing', () => {
    const result = gradeCode(null, [{ input: [], expected: 1 }]);
    assert.equal(result.pass, false);
    assert.equal(result.reason, 'no code returned');
  });

  test('rejects an empty/whitespace-only solution string', () => {
    const result = gradeCode('   \n  ', [{ input: [], expected: 1 }]);
    assert.equal(result.pass, false);
    assert.equal(result.reason, 'no code returned');
  });

  test('an empty testCases array trivially passes (0/0)', () => {
    const result = gradeCode('function main() { return 1; }', []);
    assert.equal(result.pass, true);
    assert.equal(result.reason, '0/0 cases passed');
  });

  test('fails with a parse error reason on invalid JS syntax', () => {
    const result = gradeCode('function main( { return', [{ input: [], expected: 1 }]);
    assert.equal(result.pass, false);
    assert.match(result.reason, /parse error/);
  });

  test('fails cleanly (not a thrown exception) when the solution defines neither main nor run', () => {
    const result = gradeCode('const x = 1;', [{ input: [], expected: 1 }]);
    assert.equal(result.pass, false);
    assert.equal(result.reason, 'no callable main/run exported');
  });

  test('reports the throw message and stops at the first failing case', () => {
    const result = gradeCode('function main() { throw new Error("boom"); }', [{ input: [], expected: 1 }]);
    assert.equal(result.pass, false);
    assert.match(result.reason, /threw on \[\]: boom/);
  });

  test('RegExp-valued expected matches against the stringified return value', () => {
    const result = gradeCode('function main() { return "hello world"; }', [{ input: [], expected: /^hello/ }]);
    assert.equal(result.pass, true);
  });

  test('fails fast on the first failing case, reporting that case (not a running tally)', () => {
    const result = gradeCode('function main(x) { return x === 1 ? "ok" : "bad"; }', [
      { input: [1], expected: 'ok' },
      { input: [2], expected: 'ok' },
    ]);
    assert.equal(result.pass, false);
    assert.match(result.reason, /expected "ok" got "bad"/);
  });

  // FIXED BUG: an object-returning solution (e.g. the word-count task, whose
  // expected output is a plain object like {the:2, cat:1, ...}) was compared
  // with JSON.stringify(got) !== JSON.stringify(expected) — a correct
  // implementation that happens to build the result object in a different
  // key order (e.g. by iterating a Map, or sorting keys before returning)
  // was scored as a failure even though the two objects are equal. This is
  // a real class of solution an LLM worker plausibly produces, not a
  // contrived edge case.
  test('an object return value with the same keys in a different order passes (was a false failure)', () => {
    const result = gradeCode('function main() { return { cat: 1, and: 1, dog: 1, the: 2 }; }', [
      { input: [], expected: { the: 2, cat: 1, and: 1, dog: 1 } },
    ]);
    assert.equal(result.pass, true);
  });

  test('object return value still fails on genuinely different content, not just reordered', () => {
    const result = gradeCode('function main() { return { cat: 1, the: 3 }; }', [
      { input: [], expected: { the: 2, cat: 1 } },
    ]);
    assert.equal(result.pass, false);
  });

  test('array return value order still matters (unaffected by the object-order fix)', () => {
    const result = gradeCode('function main() { return [3, 1, 2]; }', [{ input: [], expected: [1, 2, 3] }]);
    assert.equal(result.pass, false);
  });
});

// --- gradeExact() ---------------------------------------------------------
// Previously had zero direct coverage.

describe('gradeExact', () => {
  test('passes on an exact match', () => {
    const result = gradeExact('paris', 'paris');
    assert.equal(result.pass, true);
  });

  test('is case-insensitive and trims/collapses whitespace', () => {
    const result = gradeExact('  Paris   is  Nice ', 'paris is nice');
    assert.equal(result.pass, true);
  });

  test('fails on a genuine mismatch and reports both values', () => {
    const result = gradeExact('london', 'paris');
    assert.equal(result.pass, false);
    assert.equal(result.reason, 'expected "paris" got "london"');
  });

  test('treats a null/undefined answer as empty string for comparison, without throwing', () => {
    const result = gradeExact(undefined, 'paris');
    assert.equal(result.pass, false);
  });

  test('null answer against a null answerKey both normalize to empty string and match', () => {
    const result = gradeExact(null, null);
    assert.equal(result.pass, true);
  });
});

// --- makeTask() ------------------------------------------------------------
// Previously had zero direct coverage — every other test file constructs
// tasks via makeTask() but nothing verifies its own default-filling behavior.

describe('makeTask', () => {
  test('fills in all flag defaults (false) when flags is empty', () => {
    const task = makeTask({ id: 't', category: 'reasoning', prompt: 'x', flags: {}, answerKey: 'x', grader: () => {} });
    assert.deepEqual(task.flags, {
      unverifiable: false,
      ambiguous: false,
      blast: false,
      crossCutting: false,
      novel: false,
      formatStrict: false,
    });
  });

  test('preserves explicitly-set flags and only defaults the rest', () => {
    const task = makeTask({
      id: 't',
      category: 'mechanical',
      prompt: 'x',
      flags: { blast: true, formatStrict: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(task.flags.blast, true);
    assert.equal(task.flags.formatStrict, true);
    assert.equal(task.flags.unverifiable, false);
    assert.equal(task.flags.ambiguous, false);
  });

  test('passes through id, category, prompt, answerKey, and grader unchanged', () => {
    const grader = () => ({ pass: true, reason: '' });
    const task = makeTask({ id: 'abc', category: 'code', prompt: 'do the thing', flags: {}, answerKey: 'key', grader });
    assert.equal(task.id, 'abc');
    assert.equal(task.category, 'code');
    assert.equal(task.prompt, 'do the thing');
    assert.equal(task.answerKey, 'key');
    assert.equal(task.grader, grader);
  });
});
