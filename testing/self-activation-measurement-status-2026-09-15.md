# Self-activation measurement — status report (2026-09-15)

Backlog item: "Measure self-activation rate (now launch-blocking)," follow-up
to "Design and build self-activation-rate test harness" (already shipped —
`evals/self-activation/`).

**Bottom line: no self-activation percentage exists yet, and this report
does not invent one.** The harness runs correctly end-to-end on everything
that doesn't require a live agent session. The one thing it cannot do from
inside this sandbox — the thing the number actually depends on — is spawn or
observe a real Claude Code / Codex / Cursor session and watch whether its own
skill-matcher loads `skills/firstpass/SKILL.md` unprompted. That gap is not
new information; `evals/self-activation/README.md` and `testing/README.md`
caveat #6 already said so. What's new here is verification that the harness
itself is sound, plus a concrete unblock path.

## What was verified today (runnable standalone, no live agent needed)

All commands below were run from `evals/` against a fresh clone at HEAD
(`ac53c4f`):

1. **`node src/main.js --selfactivation`** — prints all 12 tasks (6
   `trigger`, 6 `control`) × 2 conditions (A/B) = 24 ready-to-paste prompts.
   Output matches `TASKS` in `src/selfactivation.js` and the trigger-phrase
   list in `SKILL.md`'s `description:` field. Confirmed correct.

2. **`node src/main.js --selfactivation-init <file> --selfactivation-n 2`** —
   scaffolds a results file: 12 tasks × 2 conditions × N trials, every trial
   `activated: null` (pending), no field pre-filled with a guessed outcome.
   Confirmed the scaffold is honest-by-construction — there is no code path
   that emits a default `true`/`false`.

3. **`node src/main.js --selfactivation-report <file>`** on that untouched
   scaffold — correctly reports "No completed trials yet. This is a
   scaffold, not a result" and flags all trials as pending, excluded from
   the rate. Confirmed pending trials never silently score as failures.

4. **Unit tests** — `node --test evals/src/selfactivation.test.js` (18/18
   pass) and `evals/src/cli.test.js` (17/17 pass, includes CLI wiring for
   the `--selfactivation*` flags). Cover: prompt-building for both
   conditions, scaffold shape, `validateResults` rejecting malformed
   `activated` values, and `summarizeSelfActivation`'s Wilson-CI math
   including the exact "0/10 self-activation, 10/10 explicit-mention"
   scenario the harness exists to check for.

Scratch files from this verification pass were not committed (results files
are gitignored under `evals/self-activation/results/*.json` by design —
they're run artifacts, not source, per the harness's own README).

**Conclusion of this section:** the harness is not the blocker. It is
correctly built, its scoring logic is tested, and it will produce a real
Wilson-CI'd rate the moment genuine trial data exists.

## What genuinely cannot be measured today, and why

The measurement this backlog item asks for — "what fraction of the time does
`firstpass` load itself in a real coding agent, unprompted" — requires an
input this repo and this sandbox do not have: **a live, paid, agentic host
(Claude Code, Codex, Cursor, ...) with the skill installed exactly as
shipped, given a task with no mention of the skill, whose tool-use transcript
can be inspected for a `Skill` invocation.** Three specific things are
missing, all upstream of anything code-level:

- **No fresh, uncontaminated sessions.** The harness's own protocol requires
  each of the 24 prompts to run in a session with zero prior context — no
  memory of the skill being discussed, installed, or explained in that
  conversation. Any session that has already been told what this task is
  about (including this one) is disqualified as a condition-A trial by the
  harness's own contamination rule.
- **No standardized "installed exactly as shipped" precondition across
  hosts.** The real product installs via `/plugin install firstpass@firstpass`
  (Claude Code plugin) or a manual copy into `.claude/skills/` (or the
  equivalent path for Codex/Cursor/other clients per `AGENTS.md`'s client
  install matrix). Producing a defensible number means running that exact
  install path per host, not a sandbox-specific approximation of it —
  otherwise a null result is ambiguous between "the description-matcher
  doesn't fire" and "the install path in the test rig doesn't match
  production."
- **No real users yet.** Per `business/roadmap.md`, the beta cohort
  (5-10 people, prerequisite backlog item) hasn't run. Self-activation in
  the sense that ultimately matters — a stranger installs the skill and it
  helps them without being asked — can only be observed once that cohort, or
  an equivalent set of fresh live sessions, exists.

None of this is a code defect. It's the harness correctly refusing to
fabricate a number it has no way to observe, exactly as its own design
intent states: *"this code does not produce a self-activation percentage by
itself, and nothing in this repo pretends otherwise."*

## Minimum viable real measurement, once trials are possible

This is the smallest version of "actually run it" that would produce a
citable number, using the harness as it exists today — no new code needed:

1. Pick one host to start with (Claude Code, since it's the primary target
   and has the plugin install path already built and documented).
2. Install `firstpass` in a clean environment exactly per
   `AGENTS.md`'s Claude Code install steps — no `SessionStart` hook, no
   forced injection.
3. Run `node src/main.js --selfactivation-init
   self-activation/results/run-claude-code-<date>.json --selfactivation-n 10`
   (N=10 mirrors the JetBrains/Ponytail citation this harness is answering).
4. For each of the 240 trial slots (12 tasks × 2 conditions × 10 trials):
   open a **new, empty session**, paste that trial's exact `prompt`, watch
   the transcript, record `activated: true|false|null` with a one-line
   `evidence` note per the operational definition in
   `evals/self-activation/README.md`. Partial completion is fine — pending
   trials are excluded from rates, not scored as failures.
5. Run `node src/main.js --selfactivation-report <file>` and fold condition
   A's overall rate into `testing/README.md` caveat #6, replacing "no number
   yet" with the real figure and a link to the results file.

Realistically this is 2-4 hours of an operator's attention (240 trials is
the full design; even a partial run — say the 6 `trigger`-category tasks at
N=5, condition A only, 30 trials — would produce a real (if wide-CI) rate
and is a reasonable first slice if the full sweep is too costly to run
before other launch-blockers clear). This can run in parallel with, or
independent of, the personal-network beta cohort — it doesn't require real
users, just real fresh agent sessions with the skill actually installed.

## What this backlog item should NOT do

Report a percentage derived from this session, from a handful of ad hoc
trials run inside a task-runner sandbox environment (not a genuine
"install-then-fresh-session" Claude Code context), or from any other source
that doesn't follow the protocol above. A single-digit-N, non-blinded,
sandbox-run number would be worse than no number: it would look precise
while measuring something other than what the roadmap item asks for, and
once published in `testing/README.md` it would carry the same "measured"
weight as the GSM8K/HumanEval numbers that are genuinely rigorous. The
honest state to ship with is: harness built and verified working (this
report), number still pending real trials.
