---
title: "Undercut — pricing"
description: "Pro $9/month or $59/year, available now — starts with a trial of the full bundle. Teams $349/month or $2,988/year, includes 12 seats, +$29/month per additional seat — coming soon, join the waitlist for founder-run onboarding. Free for individuals, forever. Enterprise contact-only (SSO, SCIM, access logs, HIPAA with BAA, uptime SLA — scoped per contract). Money-back guarantee, no questions asked: 30 days on monthly, days 90–120 on annual."
canonical: "https://getundercut.sh/pricing.md"
last-updated: "2026-09-14"
---

# Undercut — pricing

> Machine-readable pricing for agents comparing costs. Prose version with full feature comparison: https://getundercut.sh/#pricing

Tiers, in the order the page presents them: Pro (the primary plan for individuals — start with a trial), Teams, Enterprise, then Free as the no-account, no-upkeep option beneath them.

## Pro

- **Price:** $9 / month, or $59 / year (≈$4.92/month equivalent, billed once — 45% off the monthly rate), per individual
- **Status:** available now — starts with a trial of the full Pro bundle. Enter your email at https://getundercut.sh/#pricing ("Start your Pro trial") and we follow up from there by email; nothing is charged during the trial
- **Guarantee:** money back, no questions asked — within 30 days of any monthly charge; on annual, the window opens at day 90 and runs to day 120 (see https://getundercut.sh/#guarantee). The guarantee is separate from the trial: the trial comes before the first charge, the guarantee covers the charges after it
- **Includes:** everything in Free, plus real-time/pooled model testing (a central vetting ledger continuously tests new frontier-lab and openweights models to statistical significance and keeps your tier→model map current automatically, instead of you pulling `testing/` by hand), every new release vetted on arrival (frontier-lab and open-weight releases are detected the moment they ship and run through the full methodology; a newcomer that beats the roster for a tier or task category is swapped in, and one that doesn't is recorded too — no tracking on your side, and no roster moves on launch-day hype), effort-level routing (a second, empirically-tested rubric dimension for reasoning effort per work unit), category-segmented routing and reporting (pass rate and cost-per-pass broken out by code/debug/docs/mechanical/reasoning/refactor/security, not just blended), and a hosted dashboard (value curves, cost-per-pass by category, full model-swap history); email support
- **Two extra routing dimensions, not just one (Pro only):** Free picks a tier. Pro's vetting pipeline also tests which task category a unit belongs to and how much reasoning effort actually helps for that specific combination — "think harder" helps in a handful of cases and wastes money or hurts accuracy in most others — and the routing map Pro keeps current is built from those results, re-tested as models ship. See "Routing dimensions" below.
- **Account security (included, not a differentiator):** GitHub, social, and passkey/biometric sign-in; multi-factor authentication including SMS; custom password requirements and session-lifetime controls; machine authentication (API keys and M2M tokens) for CI and scripts. Delivered by the auth provider the account layer is built on, from your first sign-in. Free needs no account at all.
- **Value depends on your provider setup:** Claude Code on a Claude subscription with no other keys routes only within Anthropic's own tier ladder — real but bounded value. Adding a provider key (OpenRouter is the common one) reaches openweights tiers where the biggest savings are; in Claude Code that key replaces subscription auth for the session (a real trade-off), while Cursor/Windsurf/Copilot can add it alongside their subscription, and OpenCode/Cline/Continue/Aider/Roo Code are already on API billing, so adding a key there is pure upside.
- **Why it's basically free:** a DIY user testing the last 30 days' worth of new frontier-lab and openweights models to statistical significance spends roughly $0.54/month in raw compute, plus an illustrative $15–$45/month in "latency loss" — missed savings during the gap before they get around to testing a new release. That's ≈$15.50–$45.50/month DIY. Pro is $9/month ($4.92/month on annual), well under the low end of that range. Full math: https://getundercut.sh/#math

## Teams

- **Price:** $349 / month, includes 12 seats; or $2,988 / year for the same 12 seats (≈$249/month equivalent, 29% off monthly). Each additional seat is +$29 / month ($290 / year on the annual plan). Priced as a 12-seat minimum on purpose: a team under ~12 people rarely needs org-wide policy enforcement — Pro per person covers them.
- **Status:** coming soon — join the waitlist at https://getundercut.sh/#pricing: a three-field intake (company email, team size, LLM provider setup), then optionally request one of the founder's published onboarding windows. Onboarding is not live yet; it will be run personally by the founder once it opens, and requests are worked through in the order they arrive, confirmed or re-proposed by email. No card up front — billing will be set up on the onboarding call.
- **Guarantee:** same as Pro — 30 days on monthly, days 90–120 on annual, no questions asked
- **Includes:** everything in Pro, for every seat — the same feature bundle, not a different one — plus a shared team dashboard, org-wide tier policy enforcement, and seat management (organization roles — admin/member — invitations, and custom permissions); SSO/directory sync and an audit log are not part of Teams — they are Enterprise line items; email support, onboarding run by the founder
- **Note:** Teams is not a bigger product than Pro. A solo dev and a fifty-person team get identical routing intelligence; Teams only adds the collaboration and admin surface a team needs on top.

## Enterprise

- **Price:** contact-only, no public list price, sales-led; annual committed-use discounts and custom invoicing/billing options are negotiated per contract
- **Status:** in development — not yet live; scoped per contract
- **Includes:** everything in Teams, plus dedicated support (premium support SLA with a dedicated Slack channel) and onboarding/migration support; enterprise SSO via SAML and OIDC (Okta, Microsoft Entra ID, custom SAML/OIDC providers); directory sync (SCIM) with automated provisioning/deprovisioning; HRIS integrations (BambooHR, Rippling, and similar); advanced RBAC with department-level workspaces for separate product groups; application and admin access logs with custom retention and SIEM log-sink streaming; data controls (retention policy, redaction/data masking, advanced encryption, custom data-residency options); HIPAA compliance available with a signed BAA; SOC 2 Type II starting soon (tell us your timeline when you reach out); a 99.99% uptime SLA; custom security questionnaires; custom integrations; an on-prem/self-hosted deployment option
- **Honest note:** the sign-in, directory, and logging capabilities above come from the auth provider the product is built on; "available" means deliverable under your agreement, not a compliance certification Undercut holds today. SOC 2 Type II is starting soon, not yet complete — no certification (SOC 2, ISO, or otherwise) is held today.
- **Contact:** the "Contact us" form on https://getundercut.sh/#pricing (work email, goes to the founder) or https://github.com/undercutsh/firstpass/issues

## Free

- **Price:** $0, forever, per individual
- **Status:** live now — no account, no email
- **Position:** the secondary option beneath the paid tiers on the page. The skill itself is free and complete — nothing in the rubric is held back to make Pro look better; what Free leaves out is the upkeep
- **Includes:** the full six-flag rubric and escalation ladder as an MIT-licensed SKILL.md; works with 34 verified coding agents (Claude Code, Codex, Cursor, Copilot, OpenCode, and more); audit/fork/keep forever; community support via GitHub issues; tier→model mapping is a static, self-maintained `models.md` — you pull updates yourself, and it drifts between pulls
- **Not included:** real-time/pooled model testing, effort-level routing, category-segmented reporting, hosted dashboard — nothing in the rubric itself is held back
- **Install:** `npx skills add undercutsh/firstpass`

## Routing dimensions (Pro only)

Most routers stop at "which tier." Free does that much — pick the cheapest model that can pass verification for this unit. Pro's vetting pipeline tests two dimensions further, and the routing map it keeps current is built from what those tests show — re-tested as models ship, not hand-tuned once.

- **Dimension 2 — task category.** On one vendor's ladder, the cheapest tier won 6 of 7 task categories outright on cost per completed task — except security, where it failed 70% of the time and the mid tier was both more reliable and cheaper per completed task. A category-blind router either overpays everywhere to stay safe on security, or gets burned on security to stay cheap everywhere else.
- **Dimension 3 — reasoning effort.** Across 210 test runs (every vendor, every tier, every task category, two effort settings), raising effort produced a statistically confirmed win in exactly one cell (an open-weight model on documentation, +70 percentage points) and a confirmed loss in three others. Everywhere else it just cost more for no measurable difference.

Three of the seven task categories — the ones where the extra dimensions change the answer most:

| Task category | Free — tier only | Pro — tier + category + effort | What the testing showed |
|---|---|---|---|
| Documentation | Cheapest tier, provider-default effort | Cheapest tier, with the effort setting chosen per category and per model | Same category, opposite effect: one open-weight model went from 30% to 100% when effort was raised; one frontier-lab cheapest tier went from 100% to 60%. Both statistically confirmed — a category-and-model fact, not a global rule. |
| Security | Cheapest tier, provider-default effort — moves up only after two failed checks | Starts one tier up for this category | Two vendors' cheapest tiers failed 70–90% of security tasks, at either effort setting. Paying for the mid tier up front was cheaper per completed task than failing first and escalating. |
| Reasoning | Cheapest tier, provider-default effort | Cheapest tier by default, with the mid tier's reliability edge reported for this category so the trade is explicit | The cheapest tier still won on cost per completed task, but by its narrowest margin — the one category where paying for the mid tier's reliability is a real judgment call, and a data-driven one instead of a guess. |

- **How Pro applies it:** the same policy-file mechanism as Free. The tier→model map Pro keeps current carries a per-category recommendation, effort setting included, derived from these tests; Free's map has one entry per tier and no category or effort dimension. Nothing decides per call on the network path — still not a proxy.
- **Sample sizes, plainly:** roughly ten tasks per category per cell, single seed. The effort figures quoted (one win, three losses) are the cells that cleared a 95% confidence test; the category figures (6 of 7, 70–90%) are gaps large enough to trust as a shape, not precise to the point. Larger re-runs are in progress before any of it becomes a shipped default.

## Money-back guarantee (Pro and Teams)

- **Mechanism:** no-questions-asked refund — no "prove it didn't pay for itself" audit, no retention call, no reason field. Reply to any receipt or billing email with "refund."
- **Monthly plans:** within 30 days of any monthly charge.
- **Annual plans:** the window opens at day 90 and runs 30 days, to day 120. Why not day 1: an annual plan is a bigger up-front ask, and nothing could have paid for itself on day 1 — the window opens once there has been real time to see value. Stated as fairness, not fine print.
- **Separate from Pro's trial:** the trial comes before the first charge; the guarantee covers the charges after it. Nothing is metered against you during either.
- Refunding never removes the free skill — the MIT rubric stays installed regardless.

## Notes

- Prices above are the launch rate card, not illustrative placeholders. Annual discounts are deliberately unequal: Pro's is steep (45%) because at $9/mo the monthly→annual switch has to look like a bargain to be worth making; Teams' is shallower (29%) because Teams buyers anchor on contract value and the plan carries real per-seat cost. Additional Teams seats keep the ~17% annual discount, not the base plan's 29%.
- Pro starts from the pricing card: enter an email, we follow up from there, and the trial runs on the full bundle before the first charge. Teams is coming soon and bought through founder-handled onboarding once it opens — there is no self-serve Teams checkout; billing will be set up on the onboarding call, and the page says so.
- No new vendor contract or network-layer access is required at any tier — Undercut is a policy file your agent reads, never a proxy sitting between your agent and its model calls.
