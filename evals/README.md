# tiered-dispatch evals

Controlled A/B harness for the tiered-dispatch skill: does routing work to the
cheapest tier that can pass verification cost less than "one model for
everything", **without** sacrificing pass rate?

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
```

Flags: `--vendors anthropic,openai,gemini,openweights`,
`--arms all-frontier,all-standard,tiered`, `--suites code,reasoning,mechanical,debug,refactor,documentation`,
`--seeds N`, `--policy v1|latest`, `--baseline <file>`, `--compare a,b`,
`--concurrency N`.

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

## Model roster

`src/config.js` maps each vendor's tiers to OpenRouter slugs (August 2026
research). Slugs change fast — always run `--verify-only` first. Gemini is
included as the third closed vendor; open-weight leaders (GLM-5.2, DeepSeek
V4-Pro, Qwen3-Coder) are the `openweights` vendor.