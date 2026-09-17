---
title: "Undercut — llms.md"
description: "A routing policy your coding agent follows — cheap tier first, escalate only on evidence. Measured up to −71% cost on public benchmarks at equal-or-better pass rate."
canonical: "https://getundercut.sh/"
last-updated: "2026-09-14"
---

# Undercut — cut your AI coding bill up to 71%. Not your pass rate.

> Markdown twin of https://getundercut.sh/ for agents and crawlers that don't execute JavaScript. The canonical page has the full interactive calculator, benchmark tables, and FAQ accordion; this is the same content in plain prose.

A routing policy your coding agent follows — cheap tier first, escalate only on evidence, never on a vibe. Measured on public benchmarks, not promised. Free for individuals, forever · MIT · Pro from $59/yr.

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

Secondary evidence (our own 30-task synthetic suite, clearly labeled ours): tiered was never worse than all-standard on any cell, beat it on 7 of 12.

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

## Pro (available now — starts with a trial)

Real-time/pooled model testing (a central vetting ledger tests new frontier-lab and openweights models to statistical significance and keeps the tier→model map current automatically), effort-level routing (a second, empirically-tested rubric dimension), category-segmented pass-rate and cost-per-pass reporting, and a hosted dashboard. Every new frontier-lab or open-weight release is detected the moment it ships and run through the full methodology — a newcomer that beats the roster for a tier or task category is swapped in, one that doesn't is recorded too, so nothing is missed and nothing moves on launch-day hype. Account security is included, not a differentiator: GitHub/social/passkey sign-in, MFA (including SMS), password and session-lifetime policies, and API keys/M2M tokens for CI. Priced for individuals — freelance, solo, indie — not bundled with Teams. Value scales with your provider setup: Claude Code on a Claude subscription alone routes within Anthropic's own tiers; an OpenRouter key opens the cross-vendor savings.

### Two extra routing dimensions, not just one (Pro only)

Most routers stop at "which tier." Free does that much — pick the cheapest model that can pass verification for this unit. Pro's vetting pipeline tests two dimensions further, and the routing map it keeps current is built from what those tests show — re-tested as models ship, not hand-tuned once.

- **Dimension 2 — task category.** On one vendor's ladder, the cheapest tier won 6 of 7 task categories outright on cost per completed task — except security, where it failed 70% of the time and the mid tier was both more reliable and cheaper per completed task. A category-blind router either overpays everywhere to stay safe on security, or gets burned on security to stay cheap everywhere else.
- **Dimension 3 — reasoning effort.** Across 210 test runs (every vendor, every tier, every task category, two effort settings), raising effort produced a statistically confirmed win in exactly one cell (an open-weight model on documentation, +70 percentage points) and a confirmed loss in three others. Everywhere else it just cost more for no measurable difference.

Three of the seven task categories — the ones where the extra dimensions change the answer most:

| Task category | Free — tier only | Pro — tier + category + effort | What the testing showed |
|---|---|---|---|
| Documentation | Cheapest tier, provider-default effort | Cheapest tier, with the effort setting chosen per category and per model | Same category, opposite effect: one open-weight model went from 30% to 100% when effort was raised; one frontier-lab cheapest tier went from 100% to 60%. Both statistically confirmed — a category-and-model fact, not a global rule. |
| Security | Cheapest tier, provider-default effort — moves up only after two failed checks | Starts one tier up for this category | Two vendors' cheapest tiers failed 70–90% of security tasks, at either effort setting. Paying for the mid tier up front was cheaper per completed task than failing first and escalating. |
| Reasoning | Cheapest tier, provider-default effort | Cheapest tier by default, with the mid tier's reliability edge reported for this category so the trade is explicit | The cheapest tier still won on cost per completed task, but by its narrowest margin — the one category where paying for the mid tier's reliability is a real judgment call, and a data-driven one instead of a guess. |

How Pro applies it: the same policy-file mechanism as Free. The tier→model map Pro keeps current carries a per-category recommendation, effort setting included, derived from these tests; Free's map has one entry per tier and no category or effort dimension. Nothing decides per call on the network path — still not a proxy. Sample sizes, plainly: roughly ten tasks per category per cell, single seed. The effort figures quoted (one win, three losses) are the cells that cleared a 95% confidence test; the category figures (6 of 7, 70–90%) are gaps large enough to trust as a shape, not precise to the point. Larger re-runs are in progress before any of it becomes a shipped default.

## Teams (coming soon — join the waitlist)

The identical feature bundle as Pro, on every seat, plus a shared team dashboard, org-wide tier policy enforcement, and seat management (SSO/directory sync and an audit log are Enterprise line items, not part of Teams). Free for individuals stays free — Pro and Teams are a paid layer above it, not a gate in front of it. Teams is coming soon: the intake is a three-field waitlist form, then optionally a request for one of the founder's published onboarding windows. Onboarding is not live yet; once it opens it will be handled personally by the founder, currently backlogged, so a requested window is confirmed or re-proposed by email. No card up front — billing will be set up on the onboarding call.

## Pricing

Machine-readable version: https://getundercut.sh/pricing.md

- **Pro** — $9/month or $59/year (≈$4.92/month equivalent, 45% off), per individual. Available now; starts with a trial of the full Pro bundle (enter an email and we follow up from there; nothing charged during the trial).
- **Teams** — $349/month including 12 seats, or $2,988/year for the same 12 seats (29% off). Additional seats +$29/month each ($290/year on annual). Coming soon — join the waitlist; onboarding is founder-run once it opens, billing set up on the onboarding call.
- **Enterprise** — contact-only, sales-led. In development, scoped per contract. Everything in Teams plus SAML/OIDC SSO (Okta, Microsoft Entra ID, custom), SCIM directory sync and HRIS integrations, advanced RBAC with department-level workspaces, application/admin access logs with custom retention and SIEM streaming, data controls (retention, redaction/masking, encryption, custom residency), HIPAA compliance available with a signed BAA, SOC 2 Type II starting soon (tell us your timeline when you reach out), 99.99% uptime SLA, premium support SLA with a dedicated Slack channel, onboarding/migration support, security questionnaires, custom invoicing and annual committed-use discounts. Honest note: "available" means deliverable under a contract — SOC 2 Type II is starting soon, not yet complete; no compliance certification is held today.
- **Free** — $0 forever, per individual. Live now, no account. Presented beneath the paid tiers as the no-upkeep option: the full rubric, nothing held back, but a static tier→model map you update yourself.
- **Money-back guarantee (Pro and Teams), no questions asked** — within 30 days of any monthly charge; on annual plans the window opens at day 90 and runs to day 120, because a year's value can't fairly be judged on day 1. Separate from Pro's trial, which comes before the first charge.

## Which segment are you?

Undercut's value depends on your editor and how you pay for models today. Machine-readable version: https://getundercut.sh/setup.md — Claude Code on a Claude subscription with no other keys gets real but bounded value; Cursor/Windsurf/Copilot can unlock an openweights tier their subscription doesn't include; OpenCode/Continue.dev/Cline/Aider/Roo Code/Kilo Code users are already on API billing, so adding an OpenRouter key is pure upside; Zed's OpenRouter compatibility is explicitly unverified, not asserted.

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
- Which segment are you? (markdown): https://getundercut.sh/setup.md
