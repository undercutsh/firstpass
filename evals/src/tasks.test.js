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
import { extractJson, gradeJsonSubset } from './tasks.js';

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
});
