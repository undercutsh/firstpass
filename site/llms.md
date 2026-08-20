# Undercut — cut your AI coding bill up to 71%. Not your pass rate.

> Markdown twin of https://getundercut.sh/ for agents and crawlers that don't execute JavaScript. The canonical page has the full interactive calculator, benchmark tables, and FAQ accordion; this is the same content in plain prose.

A routing policy your coding agent follows — cheap tier first, escalate only on evidence, never on a vibe. Measured on public benchmarks, not promised. Free for individuals, forever · MIT · Team plan in development.

Install: `npx skills add undercutsh/firstpass`

## The problem

Claude Code, Codex, Cursor, and Copilot let you set a model once per session. That session then handles trivial, mechanical work at the same tier as genuinely hard reasoning. One Claude Code Max subscriber's self-reported usage data showed 93.8% of their tokens going to the top-tier model, with nothing pulling cheap, mechanical work back down.

The obvious fix — ask the model how confident it is, and route on that — doesn't work. LLM self-reported confidence is poorly calibrated; a model that's wrong is often just as "confident" as one that's right.

Undercut replaces confidence with three objective triggers: a failed verification, a measured disagreement between two cheap-tier runs, or an explicit uncertainty flag. Nothing escalates on a vibe.

## vs. cap-based routers

Most "cost control" tooling watches the meter: every unit still runs at the top tier until a budget cap stops the whole session — it throttles spend, it never questions it. Undercut decides the tier per unit, before it runs. They compose: Undercut routes first, your gateway's caps and compression still apply to whatever runs.

## The landscape

Four categories show up under "cut your AI bill": context compression (shrinks what's sent to a fixed model tier), multi-provider gateways (one API, many vendors — you still pick the model), spend observability (shows you the bill after the fact), and all-in-one platforms (bundle several of the above). Undercut does none of those — it verifies a cheap answer before trusting it, with no proxy and no new infrastructure. Full comparison: https://getundercut.sh/#the-landscape

## The proof — measured, not modeled

Controlled A/B: same tasks, same grader, only the routing policy changes. Vendor-constant (every arm compared within one vendor, never across), deterministic graders (code executed against official test cases; math is exact-match, no LLM judge), 5 seeds per arm.

**GSM8K (math reasoning, 250 units/cell):** OpenAI −71% cost (+8 pass) · Gemini −59% (−2, seed noise) · Anthropic −4% (+1) · Open-weights +228%* (+5) — *open-weights price ladders can invert, absolute overhead ~$0.01–0.02.

**HumanEval (Python code, 100 units/cell):** Gemini −95% cost (same pass) · Anthropic −61% (same) · OpenAI NA* (same) · Open-weights +77%* (same) — *OpenAI's cheapest tier can't write Python, so every task escalates the full ladder; quality holds at 100/100.

Secondary evidence (our own 30-task synthetic suite, clearly labeled ours): tiered was never worse than all-standard on any cell, beat it on 6 of 12.

Full data: https://github.com/undercutsh/firstpass/tree/main/testing

## How it works

A six-flag rubric scores each unit of work and assigns a base tier (0–1 flags → cheap, 1–2 → standard, 3+ or own-code → frontier). On failure — a failed check twice, a disagreement between two cheap-tier runs, or explicit uncertainty — escalate exactly one tier, residue only. Still unresolved after that: a single batched apex tie-break.

Even when the rubric flags are scored imperfectly (stock dispatchers: Haiku 90% flag agreement, Sonnet 93%), the shipped policy still routes 100% of units to the correct tier — a wrong flag only ever costs one extra cheap attempt, never a wrong answer or a big bill.

## What this doesn't do

- Not a proxy. Doesn't enforce anything at the network layer.
- Not a gateway or compression proxy. Composes with those — routes first, they compress second.
- Doesn't auto-flag in production. The dispatching agent scores the flags itself.
- Doesn't help when the cheapest tier lacks the capability entirely (OpenAI + Python is the documented case).
- Doesn't replace the planning decision — this ladder is for execution units.
- Doesn't promise a dollar figure for your workload — real workloads escalate more than benchmarks.
- Doesn't prove your number until you run it — every figure here is an observation from our tasks and graders, not a guarantee about your codebase.

## For teams (in development)

Org-wide routing policy enforcement, per-account savings metering, a verifiable escalation ledger, an always-updated tier→model map, and SSO/directory sync. Free for individuals stays free — Teams is a paid layer above it, not a gate in front of it.

## Pricing

Machine-readable version: https://getundercut.sh/pricing.md

- **Free** — $0 forever, per individual. Live now.
- **Teams** — $29/user/month, 14-day trial. In development, not yet live — join the waitlist.
- **Enterprise** — contact-only, sales-led. In development.

## Install and verify

```
npx skills add undercutsh/firstpass
```

Or copy `skills/firstpass/` straight into your agent's skills directory. To validate: read `testing/README.md` and `testing/results/`, reproduce for free with `node src/main.js --mock`, or run live on your own vendor with an OpenRouter key (~$4–5 for a full run).

## Links

- Landing page: https://getundercut.sh/
- Source repo: https://github.com/undercutsh/firstpass
- SKILL (the product): https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md
- Agent-facing index: https://getundercut.sh/llms.txt
- About: https://getundercut.sh/about
- Pricing (markdown): https://getundercut.sh/pricing.md
