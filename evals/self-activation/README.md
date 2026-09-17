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
`SessionStart` hook force-injected it. This is the harness for measuring our
own rate before someone else publishes it for us. `testing/README.md` caveat
#6 already discloses this gap; this directory is what closes it once real
trials are run.

### The premise this harness used to state, and why it was wrong

Earlier versions of this file (and of `src/selfactivation.js`) described what
was being measured as Undercut installed with "no hook, no forced injection."
**That is no longer true of this repo.** `hooks/session-start.js` emits a
condensed rubric as `hookSpecificOutput.additionalContext` on every
`SessionStart` — its own header comment names the 0/10 finding above as the
reason it does so. There are therefore now **two install shapes**, and in one
of them the rubric is in context whether or not the host's matcher ever looked
at `SKILL.md`:

| install shape | what's installed | what a "self-activation rate" means there |
| --- | --- | --- |
| `skill-only` | `skills/firstpass/SKILL.md` via the host's normal path. No hook registered, nothing force-injected. | A real matcher decision. **This is the shape the headline number is about.** |
| `skill-plus-hook` | the above, plus `hooks/` registered in `settings.json`. | ~**100% by construction** — it measures the hook, not the description-matcher. |

`hooks/README.md` is explicit that hooks are opt-in, are not part of the
shipped skill, and that the free skill's promise doesn't change either way.
That is a fair answer to the *product* question ("is the advertised mechanism
secretly a crutch?" — no). It is not an answer to the *reporting* question: a
percentage published without recording which shape produced it would flatter
us, and averaging the two shapes would be worse. So install shape is a
recorded, validated field on every trial, and the report cannot blend shapes
— see "Install shape is recorded per trial" below.

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

**Two conditions**, one install shape per trial, one host per trial, same
tasks:

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

### Install shape is recorded per trial

`installShape` is a **required-to-score field on every trial**, validated
against the closed `INSTALL_SHAPES` map in `src/selfactivation.js`
(`skill-only` / `skill-plus-hook`), in the same style as `TRIGGER_PHRASES`:
one authoritative list, checked against, never inferred.

It is deliberately *not* a third condition. Condition A/B is a property of the
prompt text inside one session; install shape is a property of the
environment the session starts in. Modelling the hook as "condition C" would
conflate two different axes, and — worse — would leave a pooled `overall`
rate sitting there inviting someone to average a matcher decision with a
force-injected rubric. Instead:

- `scaffoldResults({ host, installShape })` stamps and validates both, and
  rejects an unknown value outright.
- Unstamped is `null`, which behaves exactly like `activated: null`: the trial
  is **excluded from both the numerator and the denominator** and counted as
  `unlabeled`. Nothing is ever defaulted to the shipped shape — including in
  results files written before this field existed.
- `summarizeSelfActivation` returns a **list of strata**, one per (host ×
  install shape), and **no cross-stratum aggregate of any kind**. A blended
  number can't be misread off the report because it isn't in the object the
  report is printed from. `src/selfactivation.test.js` asserts this
  (`the summary exposes NO cross-stratum aggregate to misread`), so
  reintroducing a pooled figure or a defaulted shape fails the test suite.
- The `skill-plus-hook` stratum prints with a warning on its own heading
  saying the rate is a property of the hook and must not be published as a
  self-activation rate.

### The denominator: skill-discovering hosts, per host

The rate is only defined for hosts that **discover** skills — that read
`SKILL.md`'s `description:` and decide, per session, whether to load it.
Those are the hosts where there is an actual decision to observe.

For **instruction-file hosts** the measurement is meaningless, not merely
low. The documented install for GitHub Copilot (`>>
.github/copilot-instructions.md`), Gemini CLI (`>> .gemini/GEMINI.md`) and
the generic root `AGENTS.md` path appends the policy to a file the host loads
**unconditionally**. There is no matcher, so there is no self-activation rate:
it is not 0%, not 100%, it is undefined. Reporting those hosts at 100%
("it's always in context!") would be as false as reporting them at 0%.

Consequences, enforced in code (`HOSTS` / `HOST_KINDS`):

- `scaffoldResults` **throws** if you hand it an instruction-file host — you
  cannot even create a results file for a number that doesn't exist.
- Any such trial that reaches `summarizeSelfActivation` anyway is listed
  under `notApplicable`, with the reason, and is never scored.
- **There is no blended cross-host percentage, and no code path can emit
  one.** The denominator is *skill-discovering hosts, per host* — one number
  per host, each with its own Wilson interval. A single cross-client figure
  would be a fabrication dressed as a mean: it would pool hosts with
  different matchers, weight them by however many trials each happened to
  get, and (if instruction-file hosts were included) average a defined
  quantity with an undefined one.
- An empty cell prints as `no trials (0/0)`, never as `0%` — a zero
  denominator is an absence of measurement, not a measured zero.

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
#    this test is answering. One file per (host × install shape), named for
#    both, because that is the granularity the report scores at.
node src/main.js --selfactivation-init self-activation/results/run-<host>-<shape>-<date>.json --selfactivation-n 10

# 3. For EACH trial slot in that file (24 tasks×conditions × N trials each):
#      a. Start a FRESH session — no prior context, no memory of earlier
#         trials in this sweep. Contamination from a prior trial (the agent
#         "remembering" it should route) invalidates the run.
#      b. Set `host` to the host id you are running on (one of the
#         skill-discovering ids: claude-code, codex, cursor, opencode, junie,
#         amp, devin — `--selfactivation` prints the list). Copilot / Gemini /
#         generic AGENTS.md are instruction-file hosts and are not measurable
#         at all; see "The denominator" above.
#      c. Set `installShape`, and make the machine match it:
#           skill-only       SKILL.md present via its normal install path, and
#                            hooks/ NOT registered in settings.json — verify
#                            this, don't assume it. If hooks/session-start.js
#                            is registered, the rubric is force-injected and
#                            the trial is `skill-plus-hook`, not `skill-only`.
#           skill-plus-hook  hooks/ registered. Measures the hook, not the
#                            matcher; useful as an upper bound, never as the
#                            published self-activation rate.
#         A trial left unlabeled (`host` or `installShape` null) is excluded
#         from every rate — it is not scored as a miss, it is not scored.
#      d. Paste that trial's exact `prompt` field verbatim.
#      e. Watch the transcript. Record `activated: true|false` per the
#         operational definition above, and a one-line `evidence` quoting or
#         describing what you saw (or didn't).
#    Edit the JSON file directly — it's just the scaffold with `host`,
#    `installShape`, `activated` and `evidence` filled in per trial.
#    (`--selfactivation-init` stamps host/installShape as null; main.js has no
#    flag to pre-stamp them yet, so fill them in with your editor's
#    find-and-replace, or keep one file per host × shape and set them once.)

# 4. Once trials are filled in (partially-filled is fine — pending trials are
#    excluded from the rates, not scored as failures):
node src/main.js --selfactivation-report self-activation/results/run-<agent>-<date>.json
```

The report prints **one block per (host × install shape)**, each with Wilson
95% CIs: that stratum's rate for A vs B, its rate by category (`trigger` vs
`control`) × condition, and its rate per task × condition. It also prints the
counts it refused to score — pending, unlabeled, and instruction-file hosts —
and a closing note that the strata are deliberately not pooled.

The headline number for the roadmap item is **condition A's rate in the
`skill-only` stratum of one named host** — that's the unprompted
self-activation rate, and it is always reported with the host and the install
shape attached. Condition B and the `trigger`-vs-`control` split are there to
interpret it (is a low A rate a broken matcher, or just a matcher that needs
the literal words?).

Run the same protocol on every skill-discovering host you want a number for
(Claude Code, Codex, Cursor, ...) — save one results file per host and shape
(`run-<host>-<shape>-<date>.json`), matching this repo's existing
`evals/results/run-<policy>-<vendor>-<arm>-<timestamp>.json` naming instinct.
Report those numbers **per host**. Do not average them: there is no blended
cross-client self-activation percentage, and the code will not produce one.
Results files are gitignored (`evals/self-activation/results/*.json`), same
as `evals/results/` — same reasoning: they're run artifacts, not source.

## What "done" looks like

This directory ships the harness, not a number. The roadmap item stays open
until real trials have actually been run and a results file with genuine
`activated` values exists — at that point, fold the headline rate into
`testing/README.md` caveat #6 (replacing "until we publish our own
measurement" with the actual figure and a link to the results file) and flip
the roadmap checkbox.

Whatever gets published has to carry three things with it or it isn't the
number: **the host**, **the install shape**, and the fact that the
denominator is that host's skill-discovering sessions — not "our clients."
`— % on <host>, skill-only install, n=<N>` is a claim. `— % self-activation`
is not.

Also excluded from the numerator and the denominator by the
`Ambiguous → activated: null` rule above: the harness never converts "we
couldn't tell" into a result. An unlabeled or pending trial costs you sample
size, which is the honest price.
