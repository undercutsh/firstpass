# Task-label audit — rubric flags, tier reachability, and a proposed relabeling

**Status: PROPOSAL. Nothing in this document has been applied.** No task label and
no line of `src/policy.js` was changed on this branch; the eval suite passes
unchanged (175/175, see [§6](#6-evidence-no-behaviour-changed)). Accepting any
part of §3 changes published benchmark numbers on the live site, which is the
product owner's call.

Every count below was produced by importing the suite files and counting, not by
estimating. The scripts are one-liners over `src/suites/*.js` and
`src/policy.js`; each section states what it counted.

---

## 0. What the labelled task set actually is

The rubric labels do **not** live in `src/tasks.js` — that file is the grading
framework (`makeTask`, `gradeCode`, `gradeExact`, `gradeJsonSubset`,
`gradeJudge`) and it supplies the all-false flag defaults in `makeTask`. The
hand-labelled tasks live in `src/suites/*.js`, seven suites:

| suite | tasks |
|---|---|
| code | 10 |
| reasoning | 11 |
| mechanical | 10 |
| debug | 10 |
| refactor | 8 |
| documentation | 10 |
| security | 10 |
| **total** | **69** |

So the hand-labelled set is **69 tasks**, not ~100. The external benchmark
loaders in `src/benchmarks.js` (GSM8K, MBPP, HumanEval) mint tasks at load time
with a hardcoded all-false flag object at lines 42, 109 and 133 — they carry no
hand labels at all, and they do not even set `formatStrict`, so it falls to the
`makeTask` default of `false`. They are excluded from every count below and
noted where it matters.

The published results in `RESULTS.md` were measured on **31 of these 69** tasks
(`code` + `reasoning` + `mechanical`; RESULTS.md says "30 tasks, 10 per suite" —
`reasoning` has since grown to 11 with `reasoning:apex-tiebreak`).

---

## 1. Measured base rate of all six flags

Counted over all 69 tasks in `src/suites/*.js`.

| Flag | count | % of 69 |
|---|---|---|
| `unverifiable` | **0 / 69** | **0.0%** |
| `ambiguous` | **0 / 69** | **0.0%** |
| `blast` | 6 / 69 | 8.7% |
| `crossCutting` | 7 / 69 | 10.1% |
| `novel` | 11 / 69 | 15.9% |
| `formatStrict` | 44 / 69 | 63.8% |

**The two constant-false flags are `unverifiable` and `ambiguous`.** Neither is
set to `true` on any of the 69 tasks, and neither is set to `true` by any
benchmark loader either.

Per suite, for review:

| Flag | code | reasoning | mechanical | debug | refactor | documentation | security |
|---|---|---|---|---|---|---|---|
| `unverifiable` | 0/10 | 0/11 | 0/10 | 0/10 | 0/8 | 0/10 | 0/10 |
| `ambiguous` | 0/10 | 0/11 | 0/10 | 0/10 | 0/8 | 0/10 | 0/10 |
| `blast` | 0/10 | 0/11 | 0/10 | 0/10 | 0/8 | 0/10 | 6/10 |
| `crossCutting` | 0/10 | 0/11 | 0/10 | 5/10 | 0/8 | 0/10 | 2/10 |
| `novel` | 1/10 | 2/11 | 0/10 | 2/10 | 2/8 | 2/10 | 2/10 |
| `formatStrict` | 0/10 | 0/11 | 10/10 | 10/10 | 5/8 | 9/10 | 10/10 |

Flag-count distribution (how many flags each task carries):

| flags on task | 0 | 1 | 2 | 3 | 4+ |
|---|---|---|---|---|---|
| tasks | 20 | 33 | 13 | 3 | 0 |

No task in the set carries more than three flags.

### 1a. Restricted to the tasks the published results actually ran

Over the 31 `code` + `reasoning` + `mechanical` tasks:

| Flag | count | % of 31 |
|---|---|---|
| `unverifiable` | 0 / 31 | 0.0% |
| `ambiguous` | 0 / 31 | 0.0% |
| `blast` | 0 / 31 | 0.0% |
| `crossCutting` | 0 / 31 | 0.0% |
| `novel` | 3 / 31 | 9.7% |
| `formatStrict` | 10 / 31 | 32.3% |

Two flags are constant-false across the whole 69-task set; on the 31-task subset
the published numbers were measured on, **four of the six are constant-false**
and only `novel` and `formatStrict` vary. That is a sharper version of the same
finding, not a contradiction of it: a measured experiment on the published
suites could distinguish at most two flags, and `novel` is inert in the
current code (§2), so in practice only `formatStrict` did any work.

### 1b. Why `unverifiable` is empty is a design property, not sloppiness

Every one of the 69 tasks ships a mechanical grader — `gradeCode` (sandboxed
`vm` exec), `gradeExact` (normalised exact match) or `gradeJsonSubset` (schema
subset). By the rubric's own wording ("Can output be checked mechanically … flag
it when it cannot"), `unverifiable: false` is the **correct** label on all 69.
`src/tasks.js` exports `gradeJudge` for exactly the unverifiable case, and
`grep -rn gradeJudge src/` finds **no task using it** — the only reference
outside tests is its own definition. The set contains no unverifiable work
because the harness admits none. This matters for §5: you cannot fix the
reachability defect by relabelling `unverifiable`, only by adding
judge-graded tasks or by changing what the flag means.

---

## 2. Reachability proof, tier by tier

The code under test, `createPolicy(version).baseTier` in `src/policy.js`:

```js
if (!isV1 && !isProbe && task.flags.formatStrict) return 'standard';   // L1
if (!task.flags.unverifiable) return 'cheap';                          // L2
const flags = countFlags(task);
if (flags >= 3 || task.flags.blast) return 'frontier';                 // L3
if (flags >= 1) return 'standard';                                     // L4
return 'cheap';                                                        // L5
```

with `TIER_ORDER = ['cheap','standard','frontier','apex']` and
`capTier = (!isV1 && formatStrict) ? 'standard' : TIER_ORDER[len-2]` (=
`'frontier'`).

Measured base-tier distribution over the 69 tasks, per policy version:

| version | cheap | standard | frontier | apex |
|---|---|---|---|---|
| `latest` | 25 | 44 | **0** | **0** |
| `v1` | 69 | **0** | **0** | **0** |
| `probe` (the published arm) | 69 | **0** | **0** | **0** |

### cheap — REACHABLE
Decided by **L2**, `if (!task.flags.unverifiable) return 'cheap'`. Since
`unverifiable` is false on all 69 tasks (§1), L2 fires for every task that gets
past L1: 25 tasks under `latest` (the non-`formatStrict` ones) and all 69 under
`v1` and `probe`. L5 — the rubric's own "0 flags → cheap" line — is **dead**: L2
already returned for every task L5 could see.

### standard — REACHABLE as a base tier only under `latest`, and only via L1
Decided by **L1**, the `formatStrict ⇒ standard` rule: 44 tasks, exactly the
`formatStrict` count. **L4** (`flags >= 1 → standard`), the rubric line that is
supposed to assign standard, is **dead** for the same reason as L5 — L2 returns
first. Under `v1` and `probe`, `isV1`/`isProbe` short-circuit L1, so **no task
starts at standard**: standard is reached only by escalation from cheap
(`escalate('cheap')`), which is what the probe design intends. The published
arm is `probe`, so no published unit was ever *assigned* standard by the rubric.

### frontier — UNREACHABLE as a base tier, under every version and every label
**L3 is never evaluated.** `if (!task.flags.unverifiable) return 'cheap'` (L2)
returns unconditionally for all 69 tasks, because `unverifiable` is false
everywhere. **L2 is the line that makes frontier unreachable.** This holds for
`latest`, `v1` and `probe` alike, and it would still hold if every other flag on
every task were flipped to `true`: only `unverifiable: true` on some task can
let control reach L3.

For the record, L3's *condition* is not vacuous — it is merely unreached. With
current labels, `countFlags(task) >= 3 || task.flags.blast` is satisfied by **6
tasks** (`countFlags >= 3` on 3 tasks, `blast` on 6, union 6 — the 3-flag tasks
are all `blast` security tasks). So a reordering would move exactly 6 tasks to a
frontier base today.

Frontier is still reachable *at runtime* by escalation: `runUnitLadder` climbs
cheap → standard → frontier for the 25 tasks whose `capTier` is `'frontier'`
(the non-`formatStrict` ones). The 44 `formatStrict` tasks cap at standard and
can never touch frontier under `latest`/`probe`.

### apex — UNREACHABLE as a base tier, by construction; reachable only as the batched tie-break
`baseTier` has no branch that can return `'apex'`: its highest return is
`'frontier'` at L3, and L3 is itself unreached. `capTier` returns at most
`TIER_ORDER[len-2] === 'frontier'`, so the ladder's `if (tier === cap)` always
fires at frontier or below and returns `needsApex: true` rather than calling
`escalate` again. `escalate('frontier') === 'apex'` is therefore dead code
inside `runUnitLadder` — `policy.test.js:278` asserts exactly that ("ladder must
never call apex directly"). Apex enters only through `runSuite`'s single batched
tie-break in `src/runner.js`, which sets `finalTier = 'apex'` for the residue.
That path is live and is not affected by any label in §3.

**Summary:** of the four tiers, one (`cheap`) is assigned by the rubric today,
one (`standard`) is assigned only by a hardcoded non-rubric rule under `latest`
and never under the published `probe` arm, and two (`frontier`, `apex`) are
never assigned by the rubric at all. Published results measure L1 plus the
escalation ladder. They do not measure the rubric.

---

## 3. Proposed relabeling — reviewable table, NOT applied

Rubric criteria as written in `skills/firstpass/SKILL.md`, referenced by tag below:

- **R-UNV** — UNVERIFIABLE: flag it when output *cannot* be checked mechanically.
- **R-AMB** — AMBIGUOUS: flag it when there are multiple defensible answers.
- **R-BLA** — BLAST: flag it when irreversible, or it touches money / auth / user data / production / deletes.
- **R-CRO** — CROSS-CUTTING: flag it when reasoning spans many files/sources rather than one.
- **R-NOV** — NOVEL: flag it when it is genuinely new design rather than pattern-following.
- **R-FMT** — FORMAT-STRICT: flag it when output must match an exact schema/format and free-form output fails.

Two reading conflicts have to be settled before some rows can be decided; they
are named once here and referenced per row.

- **C-AMB1 vs C-AMB2.** Does R-AMB apply to the output the task *asks the worker
  for*, or only to the portion the grader *checks*? Several tasks request a
  free-text or free-choice field and then strip it before grading
  (`documentation`'s `reduceForGrading`; `gradeJsonSubset` iterating only
  `answerKey` keys). Under **C-AMB1** (graded portion) no task in the set is
  ambiguous and the flag stays empty. Under **C-AMB2** (asked portion) every
  task with an ungraded free-text field is ambiguous.
- **C-FMT-narrow vs C-FMT-broad.** Is R-FMT about *JSON/schema* output, or about
  any grader that rejects free-form prose? The file is internally inconsistent
  here: exact-match tasks are labelled `formatStrict: true` in `debug` and
  `security` but `false` in `reasoning` and `refactor`. Narrow reading =
  JSON-shaped output only; broad reading = any `gradeExact`/schema grader.

### 3a. Confident calls (proposal **P1**)

| task id | flag | current | proposed | criterion | justification from the task's own prompt |
|---|---|---|---|---|---|
| `documentation:harder-multi-param-multi-raise` | `formatStrict` | `false` | **`true`** | R-FMT | Prompt dictates the full JSON object — `params` in signature order, `returns`, and `raises` "in the exact order the conditions are described above" — and is graded by `gradeJsonSubset`. Its nine siblings in the same suite, with the identical prompt shape and grader, are all `true`. This is a transcription slip, not a judgment. |
| `security:hardcoded-api-key` | `blast` | `false` | **`true`** | R-BLA | The snippet is `const PAYMENT_API_SECRET = '…'` used by `paymentClient.charge({amount, apiKey})` — a committed payment credential, i.e. money *and* a secret, the two clearest items in R-BLA's list. Every other vulnerable snippet in the suite (`sql-string-concat`, `xss-innerhtml`, `path-traversal-join`, `insecure-pickle-deserialize`, `missing-auth-admin-route`, `sql-fstring-python`) is already `blast: true`; this one is the only vulnerable snippet that is not. |
| `refactor:extract-helper` | `ambiguous` | `false` | **`true`** | R-AMB, C-AMB2 | The prompt asks for `"helperName": "<a descriptive camelCase name for computing an area>"` — `computeArea`, `calculateArea`, `areaOf` and `rectArea` are all defensible, which is precisely why the `answerKey` is `{paramCount: 2}` and leaves `helperName` ungraded. Multiple defensible answers is R-AMB verbatim. Depends on C-AMB2; under C-AMB1 this row is dropped. |
| `refactor:smell-conditional-polymorphism` | `crossCutting` | `false` | **`true`** | R-CRO | The prompt states the type-switch "is copy-pasted in several other functions across the codebase (perimeter, render, etc.)" — the smell is only diagnosable by reasoning over many sites, which is R-CRO's "many". Compare `debug:root-cause-not-throw-site`, already `crossCutting: true` for reasoning across just two functions. |
| `code:two-sum` | `novel` | `true` | **`false`** | R-NOV | "Write a function `main(nums, target)` that returns the indices of the two numbers that add up to target" is the single most-reproduced interview exercise in the training corpus — pure pattern-following, the opposite pole of R-NOV's "genuinely new design". It is also the only `novel` task in the `code` suite, and it is not harder than its nine unflagged siblings. |

### 3b. Ambiguous — competing readings stated, no call made

These are **not** included in P1's projection. Each needs the owner (or a
reviewer) to settle a criterion, not a fact.

| task id(s) | flag | current | competing readings |
|---|---|---|---|
| `security:sql-parameterized-safe`, `security:xss-textcontent-safe`, `security:auth-checked-safe` | `blast` | `false` | **By subject matter:** each snippet is auth/SQL/DOM code on the same sensitive surfaces as its vulnerable twin, and R-BLA asks about the surface — so all three should be `true`, matching their twins. **By consequence of the unit:** the task is "classify this snippet", the right answer is `"none"`, and getting it wrong ships nothing and deletes nothing — so `false` is right and the *vulnerable* twins are the ones flagged, correctly, because a missed finding ships a hole. Flipping all three would add 3 `blast` tasks. |
| `security:sql-fstring-python` | `formatStrict` | `true` | **C-FMT-narrow:** output is a bare category string (`gradeExact`), not JSON, so it should be `false` like the `refactor` and `reasoning` exact-match tasks. **C-FMT-broad:** "Return only the category string" against a fixed enum rejects any free-form answer, so `true` is right — and then 14 other tasks are mislabelled instead (next row). |
| `reasoning:*` (all 11), `refactor:smell-long-parameter-list`, `refactor:smell-conditional-polymorphism`, `refactor:smell-feature-envy` | `formatStrict` | `false` | **C-FMT-broad:** all 14 are `gradeExact` against a fixed answer or a fixed enum ("Answer with a single number", "Answer with the exact pattern name from the list") — free-form prose fails, so R-FMT applies and all 14 become `true`. **C-FMT-narrow:** R-FMT means structured/JSON output with specific keys, and these are single scalars, so `false` is right. This is the highest-impact unresolved row in the document: it moves 14 tasks (§4, P2). |
| `code:*` (all 10) | `formatStrict` | `false` (via `makeTask` default) | **C-FMT-broad:** `policy.js`'s `workerPrompt` injects a mandatory ANSWER FORMAT clause for `category === 'code'` ("MUST be the raw JavaScript function source as a plain string… wrapped objects are rejected by the mechanical grader"), which is an exact output-shape requirement enforced at grade time. **C-FMT-narrow:** the grader is exec-based; any source that runs passes, so the *answer* is not format-constrained, only its envelope. Note the `code` suite never passes `formatStrict` at all — it inherits the default. |
| `documentation:*` (all 10 request a free-text `description`), `refactor:dead-code`, `refactor:pure-rename-*` | `ambiguous` | `false` | Under **C-AMB2** every task that asks for a field it then strips is ambiguous, which would flag most of the `documentation` suite ("descriptions may be any reasonable short phrasing"). Under **C-AMB1** none of them is. Settling C-AMB2 broadly, rather than only for `refactor:extract-helper`, has a large cost consequence — see the dual-run note in §4. |
| `reasoning:apex-tiebreak` | `ambiguous` | `false` | **As written:** "Two expert reviewers disagree… does it change observable behavior?" presents no refactor to inspect; from the prompt alone both answers are defensible, which is R-AMB. **As intended:** the comment above it says it is a `--mock` plumbing fixture, deliberately unresolvable by local tiers so the batched apex path gets exercised; flagging it `ambiguous` would route it through `runUnitDual` and change the very path it exists to test. |
| `reasoning:clock`, `reasoning:transport` | `novel` | `true` | **As labelled:** these are the two hardest reasoning items (clock-hand angle; two-train meeting time) and `novel` is being used as a difficulty marker. **By R-NOV:** both are textbook exercises with standard solution patterns — no new design — so `false`. Same tension as `code:two-sum`, but without that task's extreme corpus saturation, so the call is genuinely contestable. |
| `documentation:novel-varargs-kwargs`, `documentation:novel-generic-type` | `novel` | `true` | **As labelled:** `*args`/`**kwargs` `kind` tagging and preserving `List[T]`/`T` notation are the two shapes the other eight tasks never exercise. **By R-NOV:** they are the same docstring schema with different type strings — pattern-following. Deciding these two together with the row above would settle whether `novel` means "new design" (R-NOV) or "hard/unseen variant" (current usage). Worth resolving explicitly, because under a reordered policy `novel` starts contributing to the flag count. |
| `documentation:harder-multi-param-multi-raise` | `blast` | `false` | **By subject matter:** the documented function is `transfer(from_acct, to_acct, amount, accounts)` and raises on insufficient balance — money. **By what the unit does:** it writes a docstring object about a function; it moves no money and touches no account. Leaning `false`, listed for completeness because it is the only money-adjacent task outside `security`. |
| `refactor:dead-code`, `refactor:unused-import`, `refactor:smell-feature-envy` | `crossCutting` | `false` | **By R-CRO:** `dead-code` requires tracing call relationships across four functions plus `main()`; `unused-import` spans an import statement and a separate code body; `feature-envy` spans `Invoice` and `Customer`. **Against:** each is presented as a single self-contained snippet with all the facts stated inline, so there is one "source" to reason over. The suite is inconsistent either way — `debug` flags two-function reasoning as cross-cutting, `refactor` does not. |
| all 69 | `unverifiable` | `false` | **No relabeling is defensible.** §1b: every task has a mechanical grader, so `false` is correct under R-UNV for all 69. Making `unverifiable` non-empty requires *new* judge-graded tasks (`gradeJudge` already exists and is unused) or a semantics change (§5 Option B) — not a label edit. This is the row that actually blocks the frontier branch. |

---

## 4. Predicted effect on tier distribution

The number the decision turns on. Two proposal variants are projected:

- **P1** = the five confident calls in §3a.
- **P2** = P1 plus the C-FMT-broad resolution (the 14 `gradeExact` tasks in
  `reasoning` and `refactor` become `formatStrict: true`). `code` is left out of
  P2; add it and `formatStrict` reaches 69/69.

All numbers are base-tier counts over the 69 tasks, computed by running
`baseTier` against relabelled copies of the suites.

### 4a. Under the current `policy.js` (no code change)

Published arm, `probe`:

| | cheap | standard | frontier | apex |
|---|---|---|---|---|
| current | **69** | 0 | 0 | 0 |
| P1 | **69** | 0 | 0 | 0 |
| P2 | **69** | 0 | 0 | 0 |

`latest`:

| | cheap | standard | frontier | apex |
|---|---|---|---|---|
| current | 25 | 44 | 0 | 0 |
| P1 | 24 | 45 | 0 | 0 |
| P2 | 10 | 59 | 0 | 0 |

**The headline: with the reachability defect in place, the relabeling moves the
base-tier distribution by nothing at all on the published arm.** `probe`
short-circuits L1 and L2 catches everything, so every task starts cheap
regardless of its labels. Under `latest` only the `formatStrict` edits move
anything — one task under P1, fifteen under P2 — because L1 is the only live
rubric line. `blast`, `crossCutting`, `novel` and `ambiguous` edits are inert
for base-tier purposes under all three versions.

Two things do move on the published arm even without a code change, and they are
the reason "inert" is not the same as "safe":

1. **`capTier`.** `formatStrict` decides the ladder cap under `probe` and
   `latest`. Current: 44 capped at standard / 25 at frontier. P1: 45 / 24.
   P2: 59 / 10. A task moved from a frontier cap to a standard cap can no
   longer escalate to frontier, and reaches the batched apex tie-break one
   rung earlier — this changes cost and pass-rate cells directly.
2. **`ambiguous` triggers dual-run.** `runner.js:151` sends any
   `ambiguous` task with a cheap base through `runUnitDual`, which runs it
   **twice** at cheap. Today 0 tasks take that path; P1 makes it 1
   (`refactor:extract-helper`, outside the published suites). Resolving
   C-AMB2 broadly instead would put most of `documentation` — and, if
   `reasoning:apex-tiebreak` were included, a published-suite task — on a
   double-call path, raising measured cost.

### 4b. If the reachability defect is also fixed

Projections for the two §5 options, so the interaction is visible:

**Option A, guards reordered** (rubric/`blast` test moved above the
cheap-to-verify override, override retained for everything else):

| | cheap | standard | frontier | apex |
|---|---|---|---|---|
| current labels | 63 | 0 | **6** | 0 |
| P1 | 62 | 0 | **7** | 0 |
| P2 | 61 | 0 | **8** | 0 |

Frontier becomes reachable and is entered by 6 tasks today — all `security`:
`sql-string-concat`, `xss-innerhtml`, `path-traversal-join`,
`insecure-pickle-deserialize`, `missing-auth-admin-route`, `sql-fstring-python`.
P1 adds `security:hardcoded-api-key` (7). P2 adds
`refactor:smell-conditional-polymorphism`, which reaches 3 flags (8). Standard
stays empty because L4 is still shadowed by the retained override.

**Option B, pure rubric** (the cheap-to-verify override no longer blankets every
task — i.e. `unverifiable` semantics changed so L2 stops being universally true):

| | cheap | standard | frontier | apex |
|---|---|---|---|---|
| current labels | 20 | 43 | **6** | 0 |
| P1 | 20 | 42 | **7** | 0 |
| P2 | 10 | 51 | **8** | 0 |

This is the largest move in the document: 43–51 tasks start at standard instead
of cheap, which is the direct opposite of the skill's central claim that
cheap-first routing is what produces the 31–96% cost reduction. Apex remains 0
as a base tier under every combination — nothing in the rubric mapping can
return it.

---

## 5. The two candidate fixes for the reachability defect

Presented as options with trade-offs. **No recommendation is made here.**

### Option A — reorder the guards in `baseTier`

Move the ownership/judgment test above the cheap-to-verify override, so L3 is
evaluated before L2 returns:

```js
if (!isV1 && !isProbe && task.flags.formatStrict) return 'standard';
if (countFlags(task) >= 3 || task.flags.blast) return 'frontier';   // was L3
if (!task.flags.unverifiable) return 'cheap';                       // was L2
if (countFlags(task) >= 1) return 'standard';
return 'cheap';
```

- **What it costs:** one line move; `unverifiable` keeps its plain meaning
  (R-UNV) and the label set needs no edits to make frontier live.
- **What it changes in behaviour:** 6 tasks (7 under P1, 8 under P2) start at
  frontier instead of cheap. All 6 today are `security` tasks, i.e. outside the
  three published suites — so `RESULTS.md`'s cost and pass-rate tables for
  code/reasoning/mechanical would **not** move, because `blast` is 0/31 on
  those suites (§1a).
- **What it does change in the published claims:**
  - **Finding #2 ("Flags steer; verification + escalation decide")** and its
    "100% of units routed to the correct tier" claim: that was measured where
    only `formatStrict` could vary. Once `blast` reaches a tier decision, a
    dispatcher's flag errors are no longer absorbed by "at most one extra cheap
    attempt" — a false `blast` costs a frontier call outright. The claim needs
    remeasuring on a suite that contains `blast` tasks.
  - **The "cheapest tier that can pass verification" headline**: it stops being
    literally true of the policy, since `blast` now routes high before any
    verification runs. The *measured* percentages stand; the description of what
    produced them does not.
  - **The rubric's own advertised mapping** ("3+ flags, or any
    ownership/judgment call → frontier") becomes true of the code for the first
    time. Under the current code that row of the SKILL.md table describes
    nothing.
- **What it leaves alone:** the escalation ladder, the caps, the batched apex
  path, and every number in the RESULTS.md tables.
- **Risk:** re-runs on `security`/`debug`/`refactor`/`documentation` become more
  expensive; the frontier tier gets exercised for the first time, so any latent
  bug on that path surfaces in the same change.

### Option B — change the `unverifiable` semantics

Narrow the cheap-to-verify override so it stops swallowing every task: e.g.
apply it only to 0-flag tasks, or invert the flag to a positive
`mechanicallyVerifiable` that the suites must set deliberately, or add
judge-graded tasks (using the already-present, currently-unused `gradeJudge`) so
`unverifiable: true` exists in the data and L2 stops being universally true.

- **What it costs:** touches the semantics of a rubric flag, so
  `skills/firstpass/SKILL.md`, the label set and the harness must move together.
  Adding judge-graded tasks also breaks the "deterministic graders, never an LLM
  judge" methodology guarantee that `RESULTS.md` leans on as property #2 — a
  judge-graded task cannot be defended the same way.
- **What it changes in behaviour:** the largest move available. 43 tasks
  (42 under P1, 51 under P2) move from a cheap base to a standard base, and
  frontier opens to 6–8 tasks. This lands squarely on the published suites: 10
  of the 31 measured tasks carry `formatStrict`, and the 1–2 flag tasks among
  them would start at standard.
- **What it does change in the published claims:**
  - **The headline "31–96% cost reduction"**: directly. Cheap-first is the
    mechanism that produced it; a rubric that starts most work at standard
    removes the mechanism. Expect the cost advantage over `all-standard` to
    shrink toward zero on any suite where most tasks are 1–2 flag.
  - **Finding #1 ("Format-strict rules are vendor-dependent; cheap-first is
    not")** and the round-5 `probe` conclusion: `probe` is *defined* as
    cheap-first, so narrowing the override reopens the round 1–3 vs round 5
    question the iteration history says was settled.
  - **The caveat "Routing reads flags, not category"**: becomes materially more
    load-bearing, since flags would then decide much more than they do now.
- **What it buys:** the rubric is what the published numbers measure. Today they
  measure L1 plus the ladder, and any claim of the form "the six-flag rubric
  produces these savings" is unsupported by the current harness. Option B is the
  only one of the two that makes all four rubric mapping rows live.
- **Risk:** highest. It is a policy change dressed as a semantics change, and it
  moves the headline number rather than a secondary finding.

**Shared note.** Neither option makes `apex` a base tier — no branch of the
rubric mapping returns it, by design ("only when you can write one sentence
stating why the marginal intelligence pays"). Apex stays reachable only through
`runSuite`'s single batched tie-break. If the owner wants apex to be rubric-
assignable, that is a third change, not part of either option.

---

## 6. Evidence: no behaviour changed

The existing suite, run unchanged on this branch:

```
$ cd evals && node --test 'src/**/*.test.js'
# tests 175
# suites 40
# pass 175
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

175/175 passing, matching the expected count. The diff against `origin/main` is
this one added file and nothing else:

```
$ git diff --stat origin/main
 evals/LABEL-AUDIT.md | 458 ++++++++++++++++++
 1 file changed, 458 insertions(+)
```

No task label, no grader, no policy line, and no published result was modified.
