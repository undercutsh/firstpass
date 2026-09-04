// Debug task suite — deterministic graders (JSON schema or exact-match).
// Tests bug-diagnosis skills: root-causing (not just locating the throw
// site), off-by-one repair, hypothesis selection against repro steps, and
// fixed-enum root-cause classification. Every task has one unambiguous,
// machine-checkable correct answer — never a matter of taste.

import { makeTask, gradeJsonSubset, gradeExact } from '../tasks.js';

const TJ = (id, prompt, flags, answerKey) =>
  makeTask({
    id: `debug:${id}`,
    category: 'debug',
    prompt,
    flags,
    answerKey,
    grader: (answer) => gradeJsonSubset(answer, answerKey),
  });

const TE = (id, prompt, flags, answerKey) =>
  makeTask({
    id: `debug:${id}`,
    category: 'debug',
    prompt,
    flags,
    answerKey,
    grader: (answer) => gradeExact(answer, answerKey),
  });

export const debugSuite = [
  TJ(
    'root-cause-not-throw-site',
    'This code throws "Cannot read properties of undefined (reading \'total\')" at line 4:\n' +
      '1: function orderTotal(order) {\n' +
      '2:   const items = order.items;\n' +
      '3:   const summary = buildSummary(items);\n' +
      '4:   return summary.total;\n' +
      '5: }\n' +
      '6: function buildSummary(items) {\n' +
      '7:   if (items.length === 0) return undefined;\n' +
      '8:   return { total: items.reduce((a, b) => a + b.price, 0) };\n' +
      '9: }\n' +
      'The throw site is line 4, but that is a symptom, not the bug. Which line contains the actual root cause (the missing empty-list handling)? Return JSON {"line": N}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: true, novel: false, formatStrict: true },
    { line: 7 },
  ),
  TE(
    'off-by-one-loop-fix',
    'This loop is meant to sum all elements of a zero-indexed array of length n, but it skips the last element:\n' +
      '"for (let i = 0; i < n - 1; i++) { sum += arr[i]; }"\n' +
      'Return only the corrected loop condition (the part between the parentheses of the for-statement), as a single line of code, e.g. "let i = 0; i < n; i++".',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    'let i = 0; i < n; i++',
  ),
  TJ(
    'hypothesis-matches-repro',
    'A web app shows stale data after a user edits their profile and immediately reloads the page. Three hypotheses:\n' +
      'A: The database write is asynchronous and the page reload races ahead of the write completing.\n' +
      'B: The CSS for the profile page is cached by the browser and never updates.\n' +
      'C: The user does not have permission to edit their profile, so the edit silently fails.\n' +
      'Repro steps: (1) edit profile, server responds 200 OK with the updated fields in the response body, (2) reload immediately, (3) old values are shown, (4) reload again a few seconds later, (5) new values are shown.\n' +
      'Which hypothesis is consistent with all five repro steps? Return JSON {"hypothesis": "A"} (or "B" or "C").',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: true, formatStrict: true },
    { hypothesis: 'A' },
  ),
  TJ(
    'race-condition-classify',
    'Two threads share a counter. Thread A reads the counter, computes counter + 1, then writes it back with no synchronization at any step. Thread B does the same concurrently. Classify the root cause of the resulting lost updates from this fixed set: "missing-lock", "wrong-lock-scope", "TOCTOU", "none". Return JSON {"cause": "..."}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: true, novel: false, formatStrict: true },
    { cause: 'missing-lock' },
  ),
  TJ(
    'race-condition-classify-toctou',
    'A function checks "if (!fileExists(path)) { createFile(path); }" with no lock held between the check and the create call; another process can create the same file in between, causing a crash on the create call. Classify the root cause from this fixed set: "missing-lock", "wrong-lock-scope", "TOCTOU", "none". Return JSON {"cause": "..."}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: true, novel: false, formatStrict: true },
    { cause: 'TOCTOU' },
  ),
  TJ(
    'race-condition-classify-scope',
    'A cache class acquires a lock only inside its `get` method but not inside its `set` method, so a `set` call can mutate the underlying map while a concurrent `get` call is iterating it. Classify the root cause from this fixed set: "missing-lock", "wrong-lock-scope", "TOCTOU", "none". Return JSON {"cause": "..."}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: true, novel: false, formatStrict: true },
    { cause: 'wrong-lock-scope' },
  ),
  TJ(
    'bisect-regression',
    'A test passed on commit C1 and C2, then started failing on C3 and stayed failing on C4. Commit messages: C1 "add pagination", C2 "fix typo in README", C3 "refactor sort comparator to use string compare", C4 "add caching layer". Which commit introduced the regression? Return JSON {"commit": "C1"} (or "C2"/"C3"/"C4").',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { commit: 'C3' },
  ),
  TJ(
    'memory-leak-classify',
    'A single-page app adds a "resize" event listener on `window` every time a modal component mounts, but never removes it when the modal unmounts. After opening and closing the modal 100 times, memory usage keeps climbing. Classify the root cause from this fixed set: "event-listener-not-removed", "closure-retains-large-object", "global-variable-accumulation", "none". Return JSON {"cause": "..."}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: true, novel: false, formatStrict: true },
    { cause: 'event-listener-not-removed' },
  ),
  TJ(
    'null-check-order',
    'This function crashes with a null-pointer error in production but not in the test suite:\n' +
      '1: function getDiscount(user) {\n' +
      '2:   const tier = user.profile.tier;\n' +
      '3:   if (user.profile == null) return 0;\n' +
      '4:   return tier === "gold" ? 0.2 : 0.1;\n' +
      '5: }\n' +
      'Test data always has a populated `profile`; production data sometimes has `profile: null`. Which line must be moved above line 2 to fix the crash? Return JSON {"line": N}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { line: 3 },
  ),
  TE(
    'binary-search-bound-fix',
    'This binary search never finds the target when it is the last element of the array, because the high bound excludes it:\n' +
      '"let lo = 0, hi = arr.length - 1; while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (arr[mid] < target) lo = mid + 1; else hi = mid; }"\n' +
      'The loop and bounds are actually correct as written for an inclusive [lo, hi] search. The real bug is that the function returns `lo` unconditionally after the loop, even when `arr[lo] !== target` (the target is not in the array at all). What boolean expression (using `arr`, `lo`, and `target`) must be true for `lo` to be a valid match? Return only that expression, e.g. "arr[lo] === target".',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: true, formatStrict: true },
    'arr[lo] === target',
  ),
];
