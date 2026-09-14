---
title: "Undercut — pricing"
description: "Free for individuals, forever. Pro $9/month or $59/year (launching with account sign-in). Teams $349/month or $2,988/year, includes 12 seats, +$29/month per additional seat — available now, founder-onboarded. Enterprise contact-only (SSO, SCIM, access logs, HIPAA with BAA, uptime SLA — scoped per contract). Money-back guarantee, no questions asked: 30 days on monthly, days 90–120 on annual."
canonical: "https://getundercut.sh/pricing.md"
last-updated: "2026-09-14"
---

# Undercut — pricing

> Machine-readable pricing for agents comparing costs. Prose version with full feature comparison: https://getundercut.sh/#pricing

## Free

- **Price:** $0, forever, per individual
- **Status:** live now
- **Includes:** the full six-flag rubric and escalation ladder as an MIT-licensed SKILL.md; works with 34 verified coding agents (Claude Code, Codex, Cursor, Copilot, OpenCode, and more); audit/fork/keep forever; community support via GitHub issues; tier→model mapping is a static, self-maintained `models.md` — you pull updates yourself, and it drifts between pulls
- **Not included:** real-time/pooled model testing, effort-level routing, category-segmented reporting, hosted dashboard — nothing in the rubric itself is held back
- **Install:** `npx skills add undercutsh/firstpass`

## Pro

- **Price:** $9 / month, or $59 / year (≈$4.92/month equivalent, billed once — 45% off the monthly rate), per individual
- **Status:** launching soon — Pro opens with account sign-in. Reserve a spot at https://getundercut.sh/#pricing (email only, nothing charged now)
- **Guarantee:** money back, no questions asked — within 30 days of any monthly charge; on annual, the window opens at day 90 and runs to day 120 (see https://getundercut.sh/#guarantee)
- **Includes:** everything in Free, plus real-time/pooled model testing (a central vetting ledger continuously tests new frontier-lab and openweights models to statistical significance and keeps your tier→model map current automatically, instead of you pulling `testing/` by hand), every new release vetted on arrival (frontier-lab and open-weight releases are detected the moment they ship and run through the full methodology; a newcomer that beats the roster for a tier or task category is swapped in, and one that doesn't is recorded too — no tracking on your side, and no roster moves on launch-day hype), effort-level routing (a second, empirically-tested rubric dimension for reasoning effort per work unit), category-segmented routing and reporting (pass rate and cost-per-pass broken out by code/debug/docs/mechanical/reasoning/refactor/security, not just blended), and a hosted dashboard (value curves, cost-per-pass by category, full model-swap history); email support
- **Account security (included, not a differentiator):** GitHub, social, and passkey/biometric sign-in; multi-factor authentication including SMS; custom password requirements and session-lifetime controls; machine authentication (API keys and M2M tokens) for CI and scripts. Delivered by the auth provider the account layer is built on, from the day Pro opens. Free needs no account at all.
- **Value depends on your provider setup:** Claude Code on a Claude subscription with no other keys routes only within Anthropic's own tier ladder — real but bounded value. Adding a provider key (OpenRouter is the common one) reaches openweights tiers where the biggest savings are; in Claude Code that key replaces subscription auth for the session (a real trade-off), while Cursor/Windsurf/Copilot can add it alongside their subscription, and OpenCode/Cline/Continue/Aider/Roo Code are already on API billing, so adding a key there is pure upside.
- **Why it's basically free:** a DIY user testing the last 30 days' worth of new frontier-lab and openweights models to statistical significance spends roughly $0.54/month in raw compute, plus an illustrative $15–$45/month in "latency loss" — missed savings during the gap before they get around to testing a new release. That's ≈$15.50–$45.50/month DIY. Pro is $9/month ($4.92/month on annual), well under the low end of that range. Full math: https://getundercut.sh/#math

## Teams

- **Price:** $349 / month, includes 12 seats; or $2,988 / year for the same 12 seats (≈$249/month equivalent, 29% off monthly). Each additional seat is +$29 / month ($290 / year on the annual plan). Priced as a 12-seat minimum on purpose: a team under ~12 people rarely needs org-wide policy enforcement — Pro per person covers them.
- **Status:** available now, founder-onboarded — start at https://getundercut.sh/#pricing: a three-field intake (company email, team size, LLM provider setup), then request one of the founder's published onboarding windows. Onboarding is handled personally by the founder and is currently backlogged; a requested window is confirmed or re-proposed by email, in the order requests arrive. No card up front — billing is set up on the onboarding call.
- **Guarantee:** same as Pro — 30 days on monthly, days 90–120 on annual, no questions asked
- **Includes:** everything in Pro, for every seat — the same feature bundle, not a different one — plus a shared team dashboard, org-wide tier policy enforcement, and seat management (organization roles — admin/member — invitations, and custom permissions); SSO/directory sync and an audit log are a stretch goal, not promised — they are Enterprise line items; email support, onboarding run by the founder
- **Note:** Teams is not a bigger product than Pro. A solo dev and a fifty-person team get identical routing intelligence; Teams only adds the collaboration and admin surface a team needs on top.

## Enterprise

- **Price:** contact-only, no public list price, sales-led; annual committed-use discounts and custom invoicing/billing options are negotiated per contract
- **Status:** in development — not yet live; scoped per contract
- **Includes:** everything in Teams, plus dedicated support (premium support SLA with a dedicated Slack channel) and onboarding/migration support; enterprise SSO via SAML and OIDC (Okta, Microsoft Entra ID, custom SAML/OIDC providers); directory sync (SCIM) with automated provisioning/deprovisioning; HRIS integrations (BambooHR, Rippling, and similar); advanced RBAC with department-level workspaces for separate product groups; application and admin access logs with custom retention and SIEM log-sink streaming; data controls (retention policy, redaction/data masking, advanced encryption, custom data-residency options); HIPAA compliance available with a signed BAA; a 99.99% uptime SLA; custom security questionnaires; custom integrations; an on-prem/self-hosted deployment option
- **Honest note:** the sign-in, directory, and logging capabilities above come from the auth provider the product is built on; "available" means deliverable under your agreement, not a compliance certification Undercut holds today. No certification (SOC 2, ISO, or otherwise) is claimed.
- **Contact:** the "Contact us" form on https://getundercut.sh/#pricing (work email, goes to the founder) or https://github.com/undercutsh/firstpass/issues

## Money-back guarantee (Pro and Teams)

- **Mechanism:** no-questions-asked refund — no "prove it didn't pay for itself" audit, no retention call, no reason field. Reply to any receipt or billing email with "refund."
- **Monthly plans:** within 30 days of any monthly charge.
- **Annual plans:** the window opens at day 90 and runs 30 days, to day 120. Why not day 1: an annual plan is a bigger up-front ask, and nothing could have paid for itself on day 1 — the window opens once there has been real time to see value. Stated as fairness, not fine print.
- Refunding never removes the free skill — the MIT rubric stays installed regardless.

## Notes

- Prices above are the launch rate card, not illustrative placeholders. Annual discounts are deliberately unequal: Pro's is steep (45%) because at $9/mo the monthly→annual switch has to look like a bargain to be worth making; Teams' is shallower (29%) because Teams buyers anchor on contract value and the plan carries real per-seat cost. Additional Teams seats keep the ~17% annual discount, not the base plan's 29%.
- Pro is not yet buyable: it opens with account sign-in, and the reserve form is email-only. Teams is buyable now via founder-handled onboarding — there is no self-serve Teams checkout yet, and the page says so.
- No new vendor contract or network-layer access is required at any tier — Undercut is a policy file your agent reads, never a proxy sitting between your agent and its model calls.
