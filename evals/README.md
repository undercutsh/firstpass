# tiered-dispatch evals (`@undercut/evals`)

Controlled A/B harness for the tiered-dispatch skill: does routing work to the
cheapest tier that can pass verification cost less than "one model for
everything", **without** sacrificing pass rate?

## Public API

The harness itself (`src/main.js`, `src/runner.js`, `src/suites/`, …) is an
internal CLI tool, run here and in CI — it isn't part of this package's public
API. The one thing meant to be consumed by other packages is `src/stats.js`,
the confidence-interval / significance-testing module the harness uses to
decide whether an A/B result is real rather than noise:

- **`wilsonInterval(successes, total, { confidence })`** — Wilson score
  confidence interval for a binomial proportion (pass rate). Stays inside
  `[0, 1]` and doesn't collapse to zero width at `p = 0` or `p = 1`, unlike
  the naive Wald interval.
- **`newcombeDiffInterval(successes1, total1, successes2, total2, { confidence })`**
  — confidence interval for the *difference* between two proportions (a
  candidate arm's pass rate vs. an incumbent's), via Newcombe's hybrid-score
  method (built from two `wilsonInterval` calls). `.significant` is `true`
  iff the interval excludes 0.
- **`seedBootstrapCI(seedGroups, statisticFn, { iterations, confidence, seed })`**
  — percentile bootstrap CI for continuous/ratio metrics (cost, $/pass),
  resampling whole seed-clusters rather than individual units so clustered
  variance isn't understated.
- **`summarizeWithCI(units, { seedKey, confidence, iterations, bootstrapSeed })`**
  — composes the two proportion/ratio statistics above over a flat unit list.

`package.json`'s `exports` field is the enforced boundary: only `.` (the
package root, re-exporting all of the above from `src/index.js`) and
`./stats` resolve. Everything else under `src/` (the CLI, suites, task
fixtures, OpenRouter client, …) is an implementation detail of the harness
and isn't importable from outside this package.

```js
import { wilsonInterval, newcombeDiffInterval } from '@undercut/evals';
// or, equivalently:
import { wilsonInterval, newcombeDiffInterval } from '@undercut/evals/stats';
```

## Consumed by the private backend

`undercut-app` (the private Pro/Teams backend)'s vetting pipeline uses this
exact `wilsonInterval`/`newcombeDiffInterval` pair for its tier-swap
significance gate — deciding whether a candidate model's pass-rate edge over
an incumbent is real before a tier swap is allowed. That's the reason this
statistics module is structured as this package's public surface rather than
staying purely internal to the eval harness.

**Today**, this package has not been published to a registry (no publish
workflow exists yet, and this repo carries no npm credentials), so
`undercut-app`'s `src/vetting/stats.ts` and `src/policy` carry a verbatim
TypeScript port of this file instead, each flagged with a
`TODO: replace with a published @undercut/evals package once available`
comment pointing back here.

**Once published**, the intended consumption pattern is a normal pinned
`npm install` from `undercut-app`'s (private) `package.json`:

```json
{
  "dependencies": {
    "@undercut/evals": "1.0.0"
  }
}
```

Pinned to an exact version (no `^`/`~` range) — this module backs a
significance *gate*, so a silent minor/patch bump changing its math
shouldn't be able to change gating behavior without a deliberate version
bump and re-test on the consuming side. `undercut-app` would then delete its
local TS port and its `TODO` comments, and import directly:

```ts
import { wilsonInterval, newcombeDiffInterval } from '@undercut/evals';
```

This package versions independently of `undercut-app`'s own release cadence;
a breaking change to `wilsonInterval`/`newcombeDiffInterval`'s signature or
return shape is a major version bump here, same as any other public npm
package.

## Why this methodology is reputable

The skill is a **routing policy** (a system harness), not an agent. Public
benchmarks (SWE-bench, Terminal-Bench) score a model inside a single fixed
harness and cannot express a routing policy — a July 2026 arXiv position paper
([2606.17799](https://arxiv.org/abs/2606.17799)) shows the same model swings
15–20 points across harnesses. So the only honest test is a **controlled A/B
that holds the harness fixed and varies only the routing policy**.

Three properties make the results defensible:

1. **Vendor-constant comparison.** The skill is vendor-agnostic, so each arm is
   compared *within* a vendor: Anthropic-tiered vs Anthropic-frontier,
   OpenAI-tiered vs OpenAI-frontier, etc. Vendor quality differences never leak
   into the measurement.
2. **Deterministic graders, never an LLM judge.** Code is executed in a
   sandboxed `vm` against hidden test cases. Reasoning is exact-match.
   Mechanical tasks are schema/exact-match. The benchmark's own grader is the
   ground truth — the same independence rule the skill itself requires.
3. **Seeds for stochasticity.** Every arm runs `--seeds N` times with
   temperature > 0 and reports pass rate + cost across runs, so single-run luck
   doesn't drive the conclusion.

## Arms

| Arm | What it does |
|---|---|
| `all-frontier` | every unit on the vendor's frontier tier — the status quo |
| `all-standard` | every unit on the vendor's standard tier — the cheap status quo |
| `tiered` | the skill: rubric → base tier, cheap-to-verify override, escalation on verification failure ×2 / disagreement / uncertainty, hysteresis, residue-only payload, batched apex |
| `static-<tier>` | `--ablation` only: every unit pinned to one tier (`cheap`/`standard`/`frontier`/`apex`), no escalation, same per-tier attempt budget the ladder gives one tier — what an up-front classifier that guessed that tier would deliver |

## Metrics

- **pass rate** — % of units whose deterministic grader passed
- **cost$** — sum of OpenRouter-reported per-call cost
- **$/pass** — cost divided by correct units (the headline: cost at fixed quality)
- **esc%** — % of units that escalated at least one tier
- **apex** — count of units resolved via the single batched apex tie-break

## Usage

```sh
# validate plumbing without spending money (mock LLM)
node src/main.js --mock

# check model slugs resolve on OpenRouter (do this first)
OPENROUTER_API_KEY=sk-or-... node src/main.js --verify-only

# smoke test: 1 seed, all vendors/arms/suites
OPENROUTER_API_KEY=sk-or-... node src/main.js --smoke

# full run (saves results/run-*.json)
OPENROUTER_API_KEY=sk-or-... node src/main.js

# full run with a specific policy version
OPENROUTER_API_KEY=sk-or-... node src/main.js --policy latest

# run a public benchmark instead of the built-in suites (gsm8k, humaneval
# fetch live from HuggingFace; mbpp is embedded, so this one also works with
# --mock and needs no network access)
node src/main.js --mock --benchmark mbpp
OPENROUTER_API_KEY=sk-or-... node src/main.js --benchmark mbpp --policy probe

# iterate cheaply: reuse a saved all-standard baseline (it never changes
# between policy versions), run only the tiered arm
OPENROUTER_API_KEY=sk-or-... node src/main.js --arms tiered --baseline <saved-run.json>

# compare two saved runs (policy versions, or before/after)
node src/main.js --compare <run-a.json>,<run-b.json>

# ablation: rubric + verification-gated escalation vs. every static
# single-tier pick, side by side, on the TB2-shaped agentic suite
node src/main.js --mock --ablation --suites agentic
OPENROUTER_API_KEY=sk-or-... node src/main.js --ablation --suites agentic --vendors anthropic --seeds 5
```

Flags: `--mock`, `--verify-only`, `--smoke`, `--vendors anthropic,openai,gemini,openweights`,
`--arms all-frontier,all-standard,tiered`, `--suites code,reasoning,mechanical,debug,refactor,documentation,security,agentic`,
`--seeds N`, `--policy v1|latest|probe`, `--baseline <file>`, `--compare a,b`,
`--concurrency N`, `--benchmark gsm8k,humaneval,mbpp`, `--flagtest` (measure
dispatcher flag-reproduction accuracy; needs `OPENROUTER_API_KEY`),
`--dispatcher cheap|<model slug>` (dispatcher model for `--flagtest`, default `cheap`),
`--ablation` (static-vs-tiered ablation, see below).

### `--ablation`: static single-model pick vs. rubric + escalation

Up-front routers (Kilo Auto Model, `openrouter/auto`) pick ONE model per
task from a classifier guess and ship whatever it produces; nothing checks
the output. The one ablation none of them publish is whether checking the
output and escalating on failure beats the *best* static pick — not just
the cheapest — and at what cost per completed task. `--ablation` runs that,
per vendor × suite:

- one `static-<tier>` arm per tier in `TIER_ORDER` (cheap, standard,
  frontier, apex): every task pinned to that tier, no escalation,
  `MAX_TIER_RETRIES + 1` attempts (the same budget the ladder gives any one
  tier, so the comparison is apples-to-apples);
- the `tiered` arm: the real policy.

It reports, per arm, pass rate with a Wilson CI, total cost, **cost per
completed task** (Kilo's "72% cheaper" divides by attempts, which silently
drops the 53% of TB2 tasks its cheap pick never completed), esc% and apex
count; then for each static arm the Newcombe diff-CI of tiered's pass rate
minus that arm's and the cost ratios; then a per-category ledger (the
agentic suite spans all seven categories). The headline line is tiered vs.
the best static arm by pass rate: "rubric + escalation beats the best
static pick by X pp [CI] at Y× the cost per completed task". Defaults to
`--suites agentic`; any suite works. Live runs save a snapshot in the usual
`results[vendor][arm][suite]` shape, so `--compare` works on them.

### Policy versions

The policy engine is versioned so the harness can A/B the current policy
against the original v1 — the cross-vendor "does the principle carry over?"
test:

| Version | Behavior |
|---|---|
| `v1` | original rubric: any mechanically verifiable task starts cheap; ladder caps at frontier |
| `latest` | round 1–3 findings: `formatStrict` tasks start at standard and cap at standard (frontier is *worse* on format-constrained output) |
| `probe` | round 5 finding: formatStrict was vendor-specific (Gemini cheap formats better than Anthropic Haiku), so it STARTs cheap (cheap proves itself) but CAPs at standard. Adaptive, model-agnostic |

Every live run persists a JSON snapshot to `evals/results/` (gitignored).
`--compare` diffs two snapshots (pass/cost/`$/pass` per vendor·arm·suite)
without re-running — this is how iteration rounds are diffed against the
baseline.

## Task suites

Original, publishable tasks with deterministic graders — no copyrighted
benchmark content. See `src/suites/`.

| Suite | Grader | Skill sweet spot |
|---|---|---|
| `code` | exec in sandboxed `vm` against hidden test cases | coding |
| `reasoning` | exact-match on ground truth | reasoning |
| `mechanical` | JSON schema / exact-match | cheap-verifiable batch work |
| `debug` | JSON schema / exact-match | bug diagnosis — root-causing, not just locating the throw site |
| `refactor` | JSON schema / exact-match | refactoring judgment (dead code, pure-rename vs behavior-change, code-smell → pattern) |
| `documentation` | JSON schema (structural fields only, free-text descriptions ungraded) | generating structured docstrings from a signature + behavior description |
| `security` | JSON schema / exact-match | vulnerability classification against a fixed enum (`sql-injection`, `xss`, `path-traversal`, `hardcoded-secret`, `insecure-deserialization`, `missing-auth-check`, `none`) |
| `agentic` | bash script executed in a sandbox (temp dir, scrubbed env, SIGKILL timeout, no network where `unshare -rn` is permitted) with exact stdout match; JS in the `vm` sandbox; JSON schema / exact-match for plans, manifests and resolutions | Terminal-Bench-2.0-shaped multi-step work that is still offline-gradable: log forensics across services, shell pipelines over fixture trees, config/manifest generation, dependency/migration resolution with a stated tie-break, multi-file refactor plans, repo secret scans. 31 tasks; each sets `category` to one of the seven above so results land in the per-category ledger. See the header of `src/suites/agentic.js` for the design constraint and what was cut to keep graders deterministic |

## Public benchmark suites (`--benchmark`)

Separate from the original suites above — see `src/benchmarks.js`. These
score against third-party, uncontested test cases instead of our own graders:

| Benchmark | Tasks | Grader | Source | Network in `--mock`? |
|---|---|---|---|---|
| `gsm8k` | 50 | exact-match on final number | fetched live from `openai/gsm8k` on HuggingFace | yes (fetch always runs) |
| `humaneval` | 20 | official test cases, `python3` subprocess | fetched live from `openai/openai_humaneval` on HuggingFace | yes (fetch always runs) |
| `mbpp` | 30 | official test asserts, `python3` subprocess | embedded in `src/data/mbpp-subset.js` (see its header for citation/license) | **no** — fully offline |

`mbpp` is the odd one out on purpose: it's a fixed, pinned subset committed to
the repo rather than fetched at run time, so `--mock` and CI never depend on
HuggingFace being reachable. Source: the official
[google-research/mbpp](https://github.com/google-research/google-research/tree/master/mbpp)
`sanitized-mbpp.json` (the hand-verified subset from Austin et al. 2021,
[2108.07732](https://arxiv.org/abs/2108.07732)), also mirrored on HuggingFace
as
[`google-research-datasets/mbpp`](https://huggingface.co/datasets/google-research-datasets/mbpp).
Licensed CC-BY-4.0, which permits redistributing this subset with
attribution — provided in `src/data/mbpp-subset.js`'s header.

## Self-activation measurement (`evals/self-activation/`)

Everything above measures the tiered-dispatch *policy* once it's running.
It says nothing about whether a real host agent's own skill-matcher ever
loads `skills/firstpass/SKILL.md` unprompted — a different, previously
untested question flagged in `business/roadmap.md`'s Trust & rigor section.
See `evals/self-activation/README.md` for the full methodology; in short:

```sh
node src/main.js --selfactivation                                  # print the task set + both condition prompts
node src/main.js --selfactivation-init <file> --selfactivation-n 10  # scaffold a blank (all-pending) results file
node src/main.js --selfactivation-report <file>                     # rate + Wilson CI, once a human has filled it in
```

This one requires no `OPENROUTER_API_KEY` and makes no LLM calls — the
activation event it measures can only happen inside a real live agent
session, which this harness cannot spawn. It ships the protocol, task set,
and scoring, not a number; the number requires someone to actually run the
trials.

## Model roster

`src/config.js` maps each vendor's tiers to OpenRouter slugs (August 2026
research). Slugs change fast — always run `--verify-only` first. Gemini is
included as the third closed vendor; open-weight leaders (GLM-5.2, DeepSeek
V4-Pro, Qwen3-Coder) are the `openweights` vendor.