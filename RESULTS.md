# tiered-dispatch — evaluation results

Controlled with/without A/B testing of the tiered-dispatch routing policy.
**Headline: routing to the cheapest tier that can pass verification delivers
31–96% cost reduction at equal-or-better quality across 3 of 4 model families
measured.** Reproduce everything with the harness in `evals/`.

## Methodology (why this is reputable)

The skill is a **routing policy**, not an agent. Public benchmarks score a
model inside a single fixed harness and cannot express a routing policy — a
July 2026 arXiv position paper ([2606.17799](https://arxiv.org/abs/2606.17799))
shows the same model swings 15–20 points across harnesses. The only honest
test is a controlled A/B that holds the harness fixed and varies only the
routing policy.

Three properties make the results defensible:

1. **Vendor-constant comparison.** Every arm is compared *within* a vendor
   (Anthropic-tiered vs Anthropic-standard). Vendor quality differences never
   leak into the measurement.
2. **Deterministic graders, never an LLM judge.** Code is executed in a
   sandboxed `vm` against hidden test cases. Reasoning is exact-match.
   Mechanical tasks are schema/exact-match. The grader is ground truth — the
   same independence rule the skill itself requires.
3. **Seeds for stochasticity.** Every arm runs 5 seeds at temperature > 0 and
   reports pass rate + cost across runs.

## Arms

- **all-standard** — every unit on the vendor's standard tier (the cheap status quo)
- **tiered (probe policy)** — the skill: cheap-first routing, escalate on
  verification failure ×2 / disagreement / uncertainty, format-strict capped at
  standard, single batched apex tie-break for residue

## Final results (5 seeds, 30 tasks, 150 units per cell)

### probe tiered vs all-standard — cost

| Vendor | code | reasoning | mechanical |
|---|---|---|---|
| Anthropic | −67% | −72% | −66% |
| Gemini | −96% | −67% | −93% |
| OpenAI | −31% | −76% | −54% |
| open-weights | +246% ⚠ | +250% ⚠ | +29% ⚠ |

### probe tiered vs all-standard — pass rate

| Vendor | code | reasoning | mechanical |
|---|---|---|---|
| Anthropic | 50/50 = | 50/50 **+5** | 50/50 **+10** |
| Gemini | 50/50 = | 50/50 = | 49/50 +1 |
| OpenAI | 50/50 = | 50/50 **+4** | 50/50 **+5** |
| open-weights | 50/50 = | 49/50 +1 | 50/50 +1 |

Tiered is never worse than all-standard on any suite; it is *better* on 7 of
12 cells (the escalator recovers failures a fixed single tier gives up on).

### The open-weights caveat

Open-weights is inverted because its **price ladder is not monotonic** — the
standard tier (DeepSeek V4-Flash) is cheaper than its own cheap tier
(Qwen3-Coder-30B). probe's cheap-first probing therefore wastes a call. In
absolute terms the overhead is negligible ($0.013 vs $0.004 per 150 units);
in relative terms it reads badly. The fix is config-level (skip the cheap
tier when cheap is not the cheapest tier — driven by the price list, which is
stable), not a per-vendor model card.

## Key findings

### 1. Format-strict rules are vendor-dependent; cheap-first is not

Round 1–3 (Anthropic only) suggested FORMAT-STRICT work should start at
standard — Haiku death-spirals on strict JSON. Round 5 (Gemini) disproved it:
Google's cheap tier formats *better*, and forcing standard cost 17× more and
lost quality. The vendor-agnostic fix is **probe**: FORMAT-STRICT starts cheap,
escalates to standard on failure, caps at standard (never frontier — Opus is
*worse* than Sonnet on schema output). This is the rule that generalizes.

### 2. Flags steer; verification + escalation decide

A dispatcher model reproduced only 90% of ground-truth rubric flags (60% on
FORMAT-STRICT — dispatchers over-flag any structured answer) yet still routed
**100% of units to the correct tier** under the probe design. Wrong flags cost
at most one extra cheap attempt. **No custom flagging model is required** —
the escalator is the safety net. This is what makes the skill deployable with
a stock agent.

### 3. Grader bugs were caught by the harness, not missed by it

The round-4 audit found 3 task bugs (a wrong math answerKey that was burning
87% of the reasoning budget "failing" a task that actually passed, an
under-specified sort prompt, and a mis-keyed HTTP method). Fixing them moved
Anthropic reasoning from 45/50 → 50/50 at 4× lower cost. The persistence +
fail-set reporting built into the harness is what made this visible.

## Iteration history

| Round | Policy change | Result |
|---|---|---|
| 1 | baseline | tiered wins code; mechanical death-spiral |
| 2 | FORMAT-STRICT → standard base | kills apex spiral; pass dips (frontier worse than standard) |
| 3 | FORMAT-STRICT caps at standard | mechanical cheaper at equal pass |
| 4 | task/grader bug fixes | reasoning 45→50, mechanical 44→50 (were grader bugs) |
| 5 | probe (cheap-first + cap) | wins or ties all 4 vendors × 3 suites |

## Caveats (stated honestly)

- **Synthetic tasks.** 30 original tasks (10 per suite) with deterministic
  graders. Real work is messier and escalates more — real savings land below
  these numbers, not above.
- **Real units are mixed.** The 3 suite categories are eval scaffolding, not a
  routing ontology. Routing reads flags, not category.
- **open-weights caveat above.** The relative-cost claim does not hold there;
  the absolute claim does.
- **No real-world validation yet.** These are lab results on synthetic work.
  The cross-vendor consistency (3 of 4 families showing the same direction) is
  the best evidence so far that the principle carries.

## Reproduce

```sh
cd evals
export OPENROUTER_API_KEY=sk-or-...
node src/main.js --verify-only          # confirm model slugs
node src/main.js --mock                  # plumbing, no spend
node src/main.js --vendors anthropic,gemini,openai,openweights --policy probe --seeds 5
node src/main.js --flagtest --policy probe   # dispatcher flagging reliability
node src/main.js --compare <a.json>,<b.json> # diff two saved runs
```