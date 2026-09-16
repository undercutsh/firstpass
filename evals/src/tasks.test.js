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
import { extractJson, gradeJsonSubset, gradeCode, gradeExact, gradeJudge, gradeShell, makeTask } from './tasks.js';

// --- gradeShell (agentic suite): sandboxed bash execution ---------------
describe('gradeShell', () => {
  test('passes when stdout matches exactly (trailing whitespace/newlines ignored) and exit is 0', () => {
    const v = gradeShell('sort -u words.txt', { 'words.txt': 'b\na\nb\n' }, 'a\nb\n\n');
    assert.equal(v.pass, true, v.reason);
  });

  test('fails on stdout mismatch, naming both sides', () => {
    const v = gradeShell('echo nope', {}, 'yes');
    assert.equal(v.pass, false);
    assert.match(v.reason, /stdout mismatch/);
  });

  test('fails on a non-zero exit even when stdout matches', () => {
    const v = gradeShell('echo ok; exit 2', {}, 'ok');
    assert.equal(v.pass, false);
    assert.match(v.reason, /exit 2/);
  });

  test('rejects an empty or non-string script without spawning anything', () => {
    assert.equal(gradeShell('', {}, '').pass, false);
    assert.equal(gradeShell(null, {}, '').pass, false);
    assert.equal(gradeShell({ script: 'echo hi' }, {}, 'hi').pass, false);
  });

  test('kills an infinite loop at the timeout instead of hanging the run', () => {
    const t0 = Date.now();
    const v = gradeShell('while true; do :; done', {}, '');
    assert.equal(v.pass, false);
    assert.match(v.reason, /timed out/);
    assert.ok(Date.now() - t0 < 10_000, 'timeout should bound the call');
  });

  test('runs in a throwaway directory holding only the fixtures, with a scrubbed env', () => {
    const v = gradeShell(
      'ls -A | sort; echo "key=${OPENROUTER_API_KEY:-unset}"; echo "proxy=${HTTPS_PROXY:-unset}"',
      { 'a.txt': '', 'sub/b.txt': '' },
      'a.txt\nsub\nkey=unset\nproxy=unset',
    );
    assert.equal(v.pass, true, v.reason);
  });

  test('the solution script is not visible from the working directory', () => {
    // A `grep -r` over the cwd must not be able to match the solution's own
    // source (which would let a regex-search task match itself).
    const v = gradeShell("grep -rl 'NEEDLE_xyz' . | sort", { 'has.txt': 'NEEDLE_xyz\n' }, './has.txt');
    assert.equal(v.pass, true, v.reason);
  });

  test('refuses fixture paths that escape the sandbox', () => {
    assert.throws(() => gradeShell('true', { '../escape.txt': 'x' }, ''), /escapes sandbox/);
  });

  test('is deterministic: same script + fixtures => same verdict every time', () => {
    const fx = { 'n.txt': '3\n1\n2\n' };
    const runs = Array.from({ length: 3 }, () => gradeShell('sort -n n.txt | tail -1', fx, '3'));
    assert.ok(runs.every((r) => r.pass), runs.map((r) => r.reason).join('; '));
  });
});

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

  test('fails gracefully (does not throw) when the parsed answer is a bare number', () => {
    // Regression: a model answering `7` instead of `{"line": 7}` used to crash
    // the whole run with "Cannot use 'in' operator to search for 'line' in 7"
    // -- a bare non-object JSON value is valid JSON but not gradeable as key
    // subset, so this must fail cleanly, not throw.
    assert.doesNotThrow(() => gradeJsonSubset(7, { line: 7 }));
    const result = gradeJsonSubset(7, { line: 7 });
    assert.equal(result.pass, false);
    assert.equal(result.reason, 'non-object JSON output');
  });

  test('fails gracefully on a bare-number JSON string too', () => {
    assert.doesNotThrow(() => gradeJsonSubset('7', { line: 7 }));
    const result = gradeJsonSubset('7', { line: 7 });
    assert.equal(result.pass, false);
    assert.equal(result.reason, 'non-object JSON output');
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

  // FIXED BUG: the vm `timeout` option passed to vm.runInContext only bounds
  // THAT synchronous script run. The old implementation used runInContext
  // once to extract the `main`/`run` function object, then invoked it
  // directly (`fn(...tc.input)`) from plain JS — a call that happens
  // completely outside any vm timeout. A worker-submitted solution with an
  // infinite loop (or unbounded recursion) would hang gradeCode, and with it
  // the whole eval run, forever instead of grading as a failure. This is a
  // real edge case a grader must handle: nothing in the worker contract
  // stops a model from emitting `while(true){}`, and mechanical graders are
  // exactly the layer supposed to fail closed instead of joining the loop.
  test('a solution with an infinite loop times out as a failure instead of hanging forever', () => {
    const start = Date.now();
    const result = gradeCode('function main(x) { while (true) { x = x + 1; } }', [{ input: [1], expected: 1 }]);
    const elapsedMs = Date.now() - start;
    assert.equal(result.pass, false);
    assert.match(result.reason, /timed out/);
    // Must resolve near the per-call vm timeout (3000ms), not hang.
    assert.ok(elapsedMs < 10000, `expected gradeCode to time out quickly, took ${elapsedMs}ms`);
  });

  test('a solution with unbounded recursion times out as a failure instead of hanging or crashing', () => {
    const result = gradeCode('function main(x) { return main(x + 1); }', [{ input: [1], expected: 1 }]);
    assert.equal(result.pass, false);
    // Either the vm timeout or a stack-overflow-as-thrown-error is an
    // acceptable graceful failure — what matters is it never resolves as a
    // pass and never propagates an uncaught exception out of gradeCode.
    assert.match(result.reason, /timed out|threw on/);
  });

  test('each test case still gets the correct args after a timing/invocation change (regression against arg mix-up)', () => {
    const result = gradeCode('function main(a, b) { return a + b; }', [
      { input: [1, 2], expected: 3 },
      { input: [10, 20], expected: 30 },
      { input: [-5, 5], expected: 0 },
    ]);
    assert.equal(result.pass, true);
    assert.equal(result.reason, '3/3 cases passed');
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

// --- gradeJudge() --------------------------------------------------------
// Regression coverage for business/openrouter-live-routing-research-
// 2026-09-12.md Finding #8: a malformed/truncated judge response must
// retry the JUDGE call, never read as a worker failure.

describe('gradeJudge', () => {
  test('passes on a valid high score, first attempt, no retries used', async () => {
    const callJudge = async () => JSON.stringify({ score: 5, reason: 'clearly correct' });
    const result = await gradeJudge('rubric', callJudge);
    assert.equal(result.pass, true);
    assert.equal(result.score, 5);
    assert.equal(result.judgeRetries, 0);
    assert.match(result.reason, /clearly correct/);
  });

  test('fails on a valid low score — a real graded failure, not a judge failure', async () => {
    const callJudge = async () => JSON.stringify({ score: 1, reason: 'missed the requirement' });
    const result = await gradeJudge('rubric', callJudge);
    assert.equal(result.pass, false);
    assert.equal(result.score, 1);
    assert.equal(result.judgeFailure, undefined);
  });

  test('respects a custom passThreshold', async () => {
    const callJudge = async () => JSON.stringify({ score: 3, reason: 'partially there' });
    const lenient = await gradeJudge('rubric', callJudge, { passThreshold: 3 });
    const strict = await gradeJudge('rubric', callJudge, { passThreshold: 4 });
    assert.equal(lenient.pass, true);
    assert.equal(strict.pass, false);
  });

  test('retries the JUDGE call on a malformed response, then passes — never touches the worker', async () => {
    let calls = 0;
    const callJudge = async () => {
      calls++;
      if (calls === 1) return '{"score":null}'; // e.g. truncated mid-field
      return JSON.stringify({ score: 4, reason: 'good on retry' });
    };
    const result = await gradeJudge('rubric', callJudge);
    assert.equal(calls, 2);
    assert.equal(result.pass, true);
    assert.equal(result.judgeRetries, 1);
  });

  test('reports judgeFailure (not a graded fail) when every attempt is malformed', async () => {
    let calls = 0;
    const callJudge = async () => {
      calls++;
      return '{}'; // no usable score/reason on any attempt
    };
    const result = await gradeJudge('rubric', callJudge, { maxRetries: 2 });
    assert.equal(calls, 3); // initial attempt + 2 retries
    assert.equal(result.pass, false);
    assert.equal(result.judgeFailure, true);
    assert.equal(result.score, null);
    assert.match(result.reason, /judge failure, not a graded worker failure/);
  });

  test('defaults to zero retries when maxRetries is not set explicitly to more', async () => {
    let calls = 0;
    const callJudge = async () => {
      calls++;
      return JSON.stringify({ score: 5, reason: 'ok' });
    };
    await gradeJudge('rubric', callJudge, { maxRetries: 0 });
    assert.equal(calls, 1);
  });
});
