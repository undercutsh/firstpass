---
title: "Undercut — pricing"
description: "Free for individuals, forever. Pro $9/month, illustrative (in development). Teams $29/seat/month, illustrative — coming soon, waitlist open. Enterprise contact-only (in development)."
canonical: "https://getundercut.sh/pricing.md"
last-updated: "2026-09-14"
---

# Undercut — pricing

> Machine-readable pricing for agents comparing costs. Prose version with full feature comparison: https://getundercut.sh/#pricing

## Free

- **Price:** $0, forever, per individual
- **Status:** live now
- **Includes:** the full six-flag rubric and escalation ladder as an MIT-licensed SKILL.md; works with Claude Code, Codex, Cursor, Copilot, OpenCode; audit/fork/keep forever; community support via GitHub issues; tier→model mapping is a static, self-maintained `models.md` — you pull updates yourself
- **Install:** `npx skills add undercutsh/firstpass`

## Pro

- **Price:** $9 / month, per individual — illustrative, TBD
- **Status:** in development — not yet live; join the waitlist at https://getundercut.sh/#pricing
- **Includes:** everything in Free, plus real-time/pooled model testing (a central vetting ledger continuously tests new frontier-lab and openweights models to statistical significance and keeps your tier→model map current automatically, instead of you pulling `testing/` by hand), effort-level routing (a second, empirically-tested rubric dimension for reasoning effort per work unit), category-segmented routing and reporting (pass rate and cost-per-pass broken out by code/debug/docs/mechanical/reasoning/refactor/security, not just blended), and a hosted dashboard (value curves, cost-per-pass by category, full model-swap history); email support
- **Why it's basically free:** a DIY user testing the last 30 days' worth of new frontier-lab and openweights models to statistical significance spends roughly $0.54/month in raw compute, plus an illustrative $15–$45/month in "latency loss" — missed savings during the gap before they get around to testing a new release. That's ≈$15.50–$45.50/month DIY. Pro is $9/month, roughly a third of the low end of that range. Full math: https://getundercut.sh/#math

## Teams

- **Price:** $29 / seat / month, billed monthly — illustrative, TBD
- **Status:** coming soon — not yet live; join the waitlist at https://getundercut.sh/#pricing. Not a launch-day tier: Teams ships after Pro, once the multi-seat and org-admin layer is ready.
- **Includes:** everything in Pro, for every seat — the same feature bundle, not a different one — plus a shared team dashboard, org-wide tier policy enforcement, and seat management; SSO/directory sync and an audit log are a stretch goal; email support
- **Note:** Teams is not a bigger product than Pro. A solo dev and a five-person team get identical routing intelligence; Teams only adds the collaboration and admin surface a team needs on top.

## Enterprise

- **Price:** contact-only, no public list price, sales-led
- **Status:** in development — not yet live
- **Includes:** everything in Teams, plus an on-prem/self-hosted deployment option, a SOC 2 compliance path and data residency, dedicated support and onboarding, and custom integrations
- **Contact:** https://github.com/undercutsh/firstpass/issues

## Notes

- Pricing and feature scope for Pro/Teams/Enterprise are the current build target, not a signed rate card — they may firm up before launch. The $9/mo Pro and $29/seat/mo Teams figures are illustrative and intentionally conservative, meant to be checked and refined.
- Teams is explicitly coming-soon/waitlist, not a launch-day tier — it lands after Pro, once the multi-seat and org-admin layer is built.
- No new vendor contract or network-layer access is required at any tier — Undercut is a policy file your agent reads, never a proxy sitting between your agent and its model calls.
