---
title: "Undercut — tiered dispatch for coding agents"
description: "A routing policy your coding agent follows — cheap tier first, escalate only on evidence. Measured up to −95% cost on public benchmarks at equal-or-better pass rate."
canonical: "https://getundercut.sh/"
last-updated: "2026-09-14"
---

# Undercut — cut your AI coding bill up to 71%. Not your pass rate.

> Markdown twin of https://getundercut.sh/ for agents and crawlers that don't execute JavaScript. The canonical page has the full interactive calculator, benchmark tables, and FAQ accordion; this is the same content in plain prose.

A routing policy your coding agent follows — cheap tier first, escalate only on evidence, never on a vibe. Measured on public benchmarks, not promised. Free for individuals, forever · MIT · Pro plan in development.

Install: `npx skills add undercutsh/firstpass`

How much routing can save you depends on which models your tool lets the skill route between — a Claude Code + Claude-subscription setup reaches Anthropic's tiers only; bring-your-own-key tools reach every vendor. Two questions, then the honest answer for your setup: https://getundercut.sh/setup (full matrix: https://getundercut.sh/compatibility.md).

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

## Example run

A representative batch of 8 units, dispatched under the shipped policy:

- unit 041 — 0 flags → cheap — pass
- unit 042 — 0 flags → cheap — pass
- unit 043 — 1 flag → standard — pass
- unit 044 — 0 flags → cheap — pass
- unit 045 — fail ×2 → escalate +1 → standard
- unit 045 — residue → standard — pass
- unit 046 — 0 flags → cheap — pass
- unit 047 — 2 flags → standard — pass
- batch — 96% resolved at cheap tier — −71% cost

## How it works

A six-flag rubric scores each unit of work and assigns a base tier (0–1 flags → cheap, 1–2 → standard, 3+ or own-code → frontier). On failure — a failed check twice, a disagreement between two cheap-tier runs, or explicit uncertainty — escalate exactly one tier, residue only. Still unresolved after that: a single batched apex tie-break.

Even when the rubric flags are scored imperfectly (stock dispatchers: Haiku 90% flag agreement, Sonnet 93%), the shipped policy still routes 100% of units to the correct tier — a wrong flag only ever costs one extra cheap attempt, never a wrong answer or a big bill.

## What this optimizes

Two payrolls hide in every request. Only one gets tiered. "Build me a minimum-viable CRM" isn't one job — it's a planning phase (what should this even do, which tradeoffs matter) billed at judgment rates, then an execution phase (schema, endpoints, screens, tests) that doesn't need to be. The rubric above tiers the second phase only; it has no opinion on the first, and judgment tokens are usually the expensive half to begin with.

Stop doing this: one frontier model handles the PRD, the schema, and every CRUD screen and test — a staffing mistake before it's a cost one. Do this instead: the judgment slice stays at frontier (nobody's claiming otherwise), and the execution slice — usually most of the token volume — gets tiered like every other verifiable unit.

| | Judgment tokens | Execution tokens | Blended |
|---|---|---|---|
| Share of the request | 50% | 50% | 100% |
| Does the rubric apply? | not yet proven | yes | — |
| Measured reduction (GSM8K/OpenAI, see "The proof" above) | 0% | 71% | ~36% |

The measured up to −71% is on execution work. Half your tokens at that reduction is ~36% off the whole session — not 71%. Skew more execution-heavy than 50/50 and the blended number moves toward 71%; more planning-heavy, and it moves toward 0%.

## What this doesn't do

- Not a proxy. Doesn't enforce anything at the network layer.
- Not a gateway or compression proxy. Composes with those — routes first, they compress second.
- Doesn't auto-flag in production. The dispatching agent scores the flags itself.
- Doesn't help when the cheapest tier lacks the capability entirely (OpenAI + Python is the documented case).
- Doesn't replace the planning decision — this ladder is for execution units, see "What this optimizes" above.
- Doesn't promise a dollar figure for your workload — real workloads escalate more than benchmarks.
- Doesn't prove your number until you run it — every figure here is an observation from our tasks and graders, not a guarantee about your codebase.

## Pro (in development)

Real-time/pooled model testing (a central vetting ledger tests new frontier-lab and openweights models to statistical significance and keeps the tier→model map current automatically, vs. manual on Free), effort-level routing (a second, empirically-tested rubric dimension), category-segmented pass-rate and cost-per-pass reporting, and a hosted dashboard. Priced for individuals — freelance, solo, indie — not bundled with Teams.

## Teams (coming soon)

The identical feature bundle as Pro, per seat, plus a shared team dashboard, org-wide tier policy enforcement, and seat management (SSO/directory sync and an audit log are a stretch goal). Free for individuals stays free — Pro and Teams are a paid layer above it, not a gate in front of it. Teams is coming soon on a waitlist, not a launch-day tier — it ships after Pro.

## Pricing

Machine-readable version: https://getundercut.sh/pricing.md

- **Free** — $0 forever, per individual. Live now.
- **Pro** — $9/month, per individual, illustrative. In development, not yet live — join the waitlist.
- **Teams** — $29/seat/month, illustrative. Coming soon, not yet live — join the waitlist.
- **Enterprise** — contact-only, sales-led. In development.

## Install and verify

```
npx skills add undercutsh/firstpass
```

Or copy `skills/firstpass/` straight into your agent's skills directory. To validate: read `testing/README.md` and `testing/results/`, reproduce for free with `node src/main.js --mock`, or run live on your own vendor with an OpenRouter key (~$4–5 for a full run).

### Install for your agent

Per-client commands (same set the interactive picker at https://getundercut.sh/#install offers):

| Agent | Command | Note |
|---|---|---|
| Claude Code | `/plugin marketplace add undercutsh/firstpass` | Then `/plugin install firstpass@firstpass` — fewest keystrokes, this repo is its own marketplace. Or `npx skills add undercutsh/firstpass`, or copy `skills/firstpass/` to `.claude/skills/firstpass/` by hand. |
| Codex CLI | `npx skills add undercutsh/firstpass -a codex` | Reads `.agents/skills/` (repo-scoped) or `$HOME/.agents/skills/`. Manual copy: `mkdir -p .agents/skills && cp -r firstpass/skills/firstpass ./.agents/skills/firstpass` |
| Cursor | `mkdir -p .cursor/skills && cp -r firstpass/skills/firstpass ./.cursor/skills/firstpass` | Folder name must match the `name:` field in SKILL.md (`firstpass`). `npx skills add undercutsh/firstpass` also works. |
| GitHub Copilot | `mkdir -p .github && curl -fsSL https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md >> .github/copilot-instructions.md` | Copilot has no skills directory — it reads repo custom instructions instead. |
| OpenCode | `npx skills add undercutsh/firstpass` | Reads `.opencode/skills/firstpass/SKILL.md`, and `.claude/skills/` / `.agents/skills/` for compatibility. |
| Gemini CLI | `mkdir -p .gemini && curl -fsSL https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md >> .gemini/GEMINI.md` | Appends the policy to GEMINI.md, read hierarchically from the project root down. |
| Windsurf | `echo "" >> AGENTS.md && curl -fsSL https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md >> AGENTS.md` | Windsurf/Cascade (now under docs.devin.ai) reads a root AGENTS.md automatically. |
| JetBrains Junie | `mkdir -p .junie/skills && cp -r firstpass/skills/firstpass ./.junie/skills/firstpass` | Project-level `.junie/skills/firstpass/` wins on a name collision with the user-level copy. |
| Amp | `mkdir -p .agents/skills && cp -r firstpass/skills/firstpass ./.agents/skills/firstpass` | Reads `.agents/skills/firstpass/SKILL.md` at the workspace root. |
| Devin | `mkdir -p .devin/skills && cp -r firstpass/skills/firstpass ./.devin/skills/firstpass` | Devin CLI/Desktop skills live at `.devin/skills/firstpass/SKILL.md`. |

Client-specific setup guide, one page per agent: [Claude Code](https://getundercut.sh/claude-code) · [Codex CLI](https://getundercut.sh/codex) · [Cursor](https://getundercut.sh/cursor) · [GitHub Copilot](https://getundercut.sh/copilot) · [OpenCode](https://getundercut.sh/opencode) · [Gemini CLI](https://getundercut.sh/gemini-cli) · [Windsurf](https://getundercut.sh/windsurf) · [JetBrains Junie](https://getundercut.sh/junie) · [Amp](https://getundercut.sh/amp) · [Devin](https://getundercut.sh/devin)

### Optional, for Claude Code — hooks

A local, opt-in package (`hooks/` in the repo) guarantees the rubric is in context every session and prints a session-end receipt with real token/cost data — never a guess. No network calls, no telemetry, nothing leaves your machine. Skip it entirely and the core skill works exactly as described above. Install steps: https://github.com/undercutsh/firstpass/tree/main/hooks

## Links

- Landing page: https://getundercut.sh/
- Source repo: https://github.com/undercutsh/firstpass
- SKILL (the product): https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md
- Agent-facing index: https://getundercut.sh/llms.txt
- About: https://getundercut.sh/about
- Pricing (markdown): https://getundercut.sh/pricing.md
- Build status (live CI history): https://getundercut.sh/status
- Changelog (RSS): https://getundercut.sh/changelog.xml
