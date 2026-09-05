# Self-activation measurement

Answers a question none of the other numbers in `evals/` or `testing/README.md`
answer: **does a real coding agent's own skill-matcher ever load
`skills/firstpass/SKILL.md` on its own, with nobody telling it to?**

Every other suite in this harness invokes the tiered-dispatch *policy*
directly (`policy.js`'s `baseTier`, escalation, etc.) and measures how well it
routes once it's running. That's a real, useful measurement, but it silently
assumes the policy is active. It says nothing about whether a host agent
(Claude Code, Codex, Cursor, ...) actually reads `description:` in
`skills/firstpass/SKILL.md` and decides to load it, unprompted, on an
arbitrary real task.

## Why this exists

`business/roadmap.md`'s Trust & rigor section flags this as untested: a
third-party audit (JetBrains AI Blog, 2026-07, cited in
`business/competitive-landscape.md`) found a structurally identical
plain-`SKILL.md`-no-hook product self-activated **zero times** across ten
sessions where it was merely installed and available — it only fired when a
`SessionStart` hook force-injected it. Undercut ships exactly that mechanism:
a `description:`-matched `SKILL.md`, no hook, no forced injection. This is
the harness for measuring our own rate before someone else publishes it for
us. `testing/README.md` caveat #6 already discloses this gap; this directory
is what closes it once real trials are run.

## What this harness can and cannot do

**Cannot**: spawn or observe a real Claude Code / Codex / Cursor session.
Skill-matching happens inside a live, paid, agentic host this sandbox has no
way to orchestrate or introspect. So this code does **not** produce a
self-activation percentage by itself, and nothing in this repo pretends
otherwise — no fabricated numbers, no synthetic "example results" that could
be mistaken for real ones.

**Can**: define the exact task set and two conditions, generate a
ready-to-run trial protocol, scaffold an honest "all pending" results file so
a human/operator has a structured place to record real observations trial by
trial, and — once that file is filled in with genuine yes/no outcomes —
compute the self-activation rate with the same Wilson confidence interval the
rest of this harness uses for pass rates.

## The design

**Two conditions**, same skill installation, same tasks:

- **A — no mention.** The skill is installed. The task is given as a plain,
  realistic user request. No reference to the skill, routing, tiers, or
  dispatch by name.
- **B — explicit mention.** The identical task, plus one added sentence:
  > "Use your routing skill (the tiered-dispatch / firstpass skill) to handle
  > this."

  B is the positive control: if the skill doesn't activate even when
  explicitly asked for, something is broken in the install/matcher, not just
  the description-triggering. A's rate relative to B's is the real signal —
  "self-activation lift," how much of B's engagement A recovers unprompted.

**Two task categories**, 6 tasks each (`src/selfactivation.js`'s `TASKS`):

- **`trigger`** — phrased to naturally contain one or more of the exact
  trigger phrases quoted in `SKILL.md`'s `description:` field ("fan out",
  "swarm", "parallel agents", "which model", "assign tiers", "dispatch",
  "model routing", "token cost"). This is the best case for a
  description-matcher — the words it's supposed to match on are right there.
- **`control`** — plausible work with no overlap with those phrases,
  including one deliberate near-miss (delegating tickets to *people*, not
  models — same shape, none of the vocabulary). This is where a
  description-matcher has nothing lexical to grab onto, and where a false
  negative would be most expected — and most costly, since undercut's whole
  pitch is routing help that shows up when it's actually needed, not only
  when the user already knows to ask for it by name.

12 tasks × 2 conditions = 24 prompts per full trial sweep. `--selfactivation`
prints every one, ready to paste.

## Operational definition of "activated"

**Activated (yes):** the agent's own tool-use transcript shows it invoking
the `firstpass` skill — a `Skill` tool call (or the host's equivalent
explicit skill-load event) naming `firstpass`/tiered-dispatch, visible in the
transcript before it starts the substantive work.

**Not activated (no):** no such invocation appears, even if the agent's
final answer happens to *resemble* what the skill would have produced (e.g.
it informally mentions "using a cheaper model for the easy parts" without
ever having loaded `SKILL.md`). Semantic similarity to the skill's advice is
not evidence of activation — only an actual skill-load event is. This
distinction matters: an agent can independently reinvent "use a cheaper model
for easy parts" without ever reading the routing rubric, escalation rules, or
handoff payload format the skill actually defines.

**Ambiguous:** transcript is inconclusive (e.g. host doesn't surface skill
invocations in a way you can inspect). Record it as `activated: null` (still
pending) with an evidence note explaining why, and treat it as excluded from
the rate rather than guessing — `summarizeSelfActivation` already excludes
`null` trials from both `n` and the computed rates.

## Running it for real

All commands run from `evals/`.

```sh
# 1. Print the protocol: every task, both condition prompts, ready to paste.
node src/main.js --selfactivation

# 2. Scaffold a results file — N trials per task per condition, all pending.
#    N=10 mirrors the ten-session count in the JetBrains/Ponytail finding
#    this test is answering.
node src/main.js --selfactivation-init self-activation/results/run-<agent>-<date>.json --selfactivation-n 10

# 3. For EACH trial slot in that file (24 tasks×conditions × N trials each):
#      a. Start a FRESH session — no prior context, no memory of earlier
#         trials in this sweep. Contamination from a prior trial (the agent
#         "remembering" it should route) invalidates the run.
#      b. Confirm the skill is installed exactly as shipped: SKILL.md present
#         via its normal install path, no SessionStart hook, no forced
#         injection — the actual shipped mechanism, not a debugging aid.
#      c. Paste that trial's exact `prompt` field verbatim.
#      d. Watch the transcript. Record `activated: true|false` per the
#         operational definition above, and a one-line `evidence` quoting or
#         describing what you saw (or didn't).
#    Edit the JSON file directly — it's just the scaffold with `activated`
#    and `evidence` filled in per trial.

# 4. Once trials are filled in (partially-filled is fine — pending trials are
#    excluded from the rates, not scored as failures):
node src/main.js --selfactivation-report self-activation/results/run-<agent>-<date>.json
```

The report prints, each with Wilson 95% CIs: overall rate for A vs B, rate by
category (`trigger` vs `control`) × condition, and rate per task × condition.
The headline number for the roadmap item is **condition A's overall rate** —
that's the unprompted self-activation rate. Condition B and the
`trigger`-vs-`control` split are there to interpret it (is a low A rate a
broken matcher, or just a matcher that needs the literal words?).

Run the same protocol across every host agent you want a number for
(Claude Code, Codex, Cursor, ...) — save one results file per agent
(`run-<agent>-<date>.json`), matching this repo's existing
`evals/results/run-<policy>-<vendor>-<arm>-<timestamp>.json` naming instinct.
Results files are gitignored (`evals/self-activation/results/*.json`), same
as `evals/results/` — same reasoning: they're run artifacts, not source.

## What "done" looks like

This directory ships the harness, not a number. The roadmap item stays open
until real trials have actually been run and a results file with genuine
`activated` values exists — at that point, fold the headline rate into
`testing/README.md` caveat #6 (replacing "until we publish our own
measurement" with the actual figure and a link to the results file) and flip
the roadmap checkbox.
