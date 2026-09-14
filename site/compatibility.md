---
title: "Undercut — editor × LLM-provider compatibility reference"
description: "Tool-by-tool matrix of what Undercut can route between in each coding agent: vendor lock, whether a subscription and other-vendor calls can be combined, whether a Claude subscription is usable at all, the OpenRouter key mechanism, and what still needs re-verification."
canonical: "https://getundercut.sh/compatibility.md"
last-updated: "2026-09-14"
---

# Undercut — editor × LLM-provider compatibility reference

> Dense reference version of https://getundercut.sh/setup. The page asks two
> questions and shows one of four setup stories; this file is the full matrix
> behind it, for docs and agents. Every row traces to the compatibility
> research dated 2026-09-14. Items marked **re-verify** were flagged by that
> research as not fully confirmed — treat them as claims to check, not facts.

## The fact that shapes the whole table

**As of 2026-01-09 (formalized in Anthropic's Consumer Terms of Service on
2026-02-19), Claude Pro/Max subscription auth tokens are blocked in
third-party tools.** This covers OpenCode, Cline, Roo Code, Continue, and the
broader open-tool ecosystem. Subscription reuse in those tools only ever
worked pre-crackdown, or via terms-violating proxy tricks. Practically:
anyone routing Claude traffic through a non-Claude-Code tool today is already
paying Anthropic API rates, not subscription rates — regardless of whether
they have configured Undercut or added an OpenRouter key.

## Segments

| Segment | Tools | Undercut's reach | Recommendation | How to pitch the OpenRouter key |
|---|---|---|---|---|
| **A** | Claude Code + Claude subscription (or Anthropic API key) | Anthropic's tier ladder only (Haiku → Sonnet → Opus → Fable) | Install the free skill; bounded but real value. Do **not** recommend the unofficial `ANTHROPIC_BASE_URL` proxy workaround (terms-gray, fragile). If cross-vendor savings matter, the honest path is a tool switch to Segment C, with the tradeoff stated: give up subscription pricing for Claude, gain full routing flexibility. | Not applicable in-tool — requires a tool switch, real tradeoff |
| **B** | Cursor, Windsurf, GitHub Copilot | Every frontier-lab vendor the subscription includes (Claude/GPT/Gemini — exact roster varies by tool and changes often), plus open-weight tiers via BYOK | Install the skill. Optionally add an OpenRouter key in the tool's BYOK settings specifically to reach the open-weight tier that no native subscription includes. | "Unlocks a tier your subscription doesn't have" — optional, never required |
| **C** | OpenCode, Continue, Cline, Aider, Roo Code, Kilo Code | Every vendor and tier you hold a key for; one OpenRouter key covers all four columns | Install the skill. Optionally add an OpenRouter key — pure upside, zero tradeoff, because no subscription is (or can be) in use here. Strongest, cleanest pitch of any segment. | "Already paying API rates? Add an OpenRouter key and there's no downside — only savings" — optional |
| **D** | Zed | Whatever models Zed exposes to its agent through its own bundled Zed Pro plan | Install the skill. **Do not** make the OpenRouter recommendation until Zed's BYOK path to OpenRouter is confirmed. | Withheld — **re-verify** first |

## Full matrix

| Tool | Segment | Locked to one vendor? | Subscription + other-vendor calls combinable? | Personal Claude subscription usable? | OpenRouter key mechanism | Undercut can route between | Notes / re-verify |
|---|---|---|---|---|---|---|---|
| **Claude Code** | A | No, but only via the unofficial `ANTHROPIC_BASE_URL` proxy trick | **No — mutually exclusive.** Setting an API key or proxy overrides subscription auth for the whole session | Yes (this is the only tool in the table where it is) | None in-tool; the proxy route is not recommended | Anthropic tiers only | Measured on Anthropic's ladder alone: −61% cost on HumanEval (same pass), −4% on GSM8K (see testing/README.md). Lowest-ceiling segment; copy must not oversell it. |
| **Cursor** | B | No — native multi-vendor + official BYOK (5 providers) | Yes, via two separate tracks: subscription-included models on quota; BYOK calls bypass quota | Not applicable (Cursor's own plan) | BYOK settings field | Subscription-included frontier-lab models; open-weight tiers with an OpenRouter key | — |
| **Windsurf** | B | No — native multi-vendor + BYOK (expanded to individual plans in 2025) | Yes, same two-track pattern as Cursor | Not applicable (Windsurf's own plan) | BYOK settings field | As Cursor | **Re-verify:** exact settings field names — the research pass could not fully render the live settings page. |
| **GitHub Copilot** | B | No — native multi-vendor + official BYOK (expanded January 2026) | Yes; BYOK is billed separately and does not touch Copilot quota | Not applicable (Copilot's own plan) | BYOK settings field | As Cursor | **Re-verify:** current included model roster (changes often). The tier logic does not depend on it. |
| **OpenCode** | C | No — genuinely open / bring-your-own-model | N/A post-2026-01-09 — Claude subscription can't be used here at all; already on API billing | **No** (blocked since 2026-01-09) | Single settings-UI field, paste key, no OAuth, local JSON config | Every vendor/tier you hold a key for; all four columns with OpenRouter | Companion page: https://getundercut.sh/opencode |
| **Continue** | C | No — bring-your-own-model (`config.yaml`) | N/A, as OpenCode | **No** | Single settings field / config entry, no OAuth | As OpenCode | Companion page: https://getundercut.sh/continue |
| **Cline** | C | No — bring-your-own-model | N/A, as OpenCode | **No** | Single settings-UI field, no OAuth | As OpenCode | Companion page: https://getundercut.sh/cline |
| **Aider** | C | No — bring-your-own-model | N/A, as OpenCode | **No** | Single settings field / config entry, no OAuth | As OpenCode | Companion page: https://getundercut.sh/aider |
| **Roo Code** | C | No — bring-your-own-model (Cline fork) | N/A, as OpenCode | **No** | Single settings-UI field, no OAuth | As OpenCode | Companion page: https://getundercut.sh/roo-code |
| **Kilo Code** | C | No — bring-your-own-model | N/A, as OpenCode | **No** | Single settings-UI field, no OAuth | As OpenCode | Companion page: https://getundercut.sh/kilo-code |
| **Zed** | D | No for other vendors, but has its **own** bundled "Zed Pro" subscription | N/A | **No** — cannot use a personal Claude subscription at all, crackdown or not | **Re-verify:** whether Zed's BYOK reaches OpenRouter specifically was not confirmed | Models Zed exposes; open-weight via OpenRouter unverified | Do not write Zed-specific OpenRouter copy until confirmed. Companion page: https://getundercut.sh/zed |
| **Other supported clients** (23 more) | — | Varies | Varies | Not researched per tool | Varies | The skill installs per each tool's companion page; provider reach depends on whether the tool accepts a user-supplied API key (closer to C) or bundles access behind its own plan with no key field (closer to A/D) | Provider story not researched in depth for these; see https://getundercut.sh/#install for the full client list |

## Why the OpenRouter key is a single-field recommendation

Across the open-tool group (Segment C) the onboarding mechanism is consistent:
a single settings-UI field (paste an OpenRouter API key), no OAuth, backed by
local JSON config. Undercut's `models.md` already carries OpenRouter slugs for
every tier in every vendor column, so the key is the only new input. It is
always optional — the free skill works without it in every segment.

Caveat published everywhere Undercut discusses open-weight tiers: open-weight
price ladders can invert (a vendor's "standard" tier can be cheaper than its
"cheap" one). Check the provider's price list rather than assuming cheap is
cheapest — see testing/README.md.

## Re-verify before treating as fact

Flagged by the source research (2026-09-14):

1. **Windsurf** — exact settings field names for BYOK / API keys (live page
   could not be fully rendered).
2. **Zed** — whether Zed's own BYOK reaches OpenRouter specifically.
3. **GitHub Copilot** — current included model roster (changes often).

## Related

- Interactive version (two questions → one setup story): https://getundercut.sh/setup
- Per-client install pages: https://getundercut.sh/#install
- Tier → model mapping (OpenRouter slugs): https://github.com/undercutsh/firstpass/blob/main/skills/firstpass/models.md
- Benchmark methodology and raw results: https://github.com/undercutsh/firstpass/blob/main/testing/README.md
