---
title: "Undercut — which segment are you?"
description: "Undercut's value depends on your editor and how you pay for models today. Four honest segments, from Claude Code's bounded-but-real value to the zero-downside pitch for open/BYO-model tools already on API billing. Zed is explicitly flagged unverified for OpenRouter."
canonical: "https://getundercut.sh/setup.md"
last-updated: "2026-09-14"
---

# Undercut — which segment are you?

> Machine-readable version of https://getundercut.sh/setup for agents. Source of truth for
> everything below: https://github.com/undercutsh/firstpass/blob/main/site/segments.json —
> both this page and the interactive one read from that same file.

Undercut's value is not identical for everyone. Which coding agent you use, and how you pay for
model access today, changes what Undercut actually adds — sometimes bounded, sometimes pure
upside. This page states the honest story per segment instead of a single generic pitch.

## The fact that reshapes the whole story

As of 2026-01-09 (formalized in Anthropic's Consumer ToS on 2026-02-19), Claude Pro/Max
subscription auth tokens are blocked in third-party tools. Practically: anyone routing Claude
traffic through a non-Claude-Code tool today is already paying per-token API rates for whichever
vendor, not subscription rates — regardless of whether they've configured Undercut or added an
OpenRouter key.

## How to find your segment

1. **Which tool do you use?** See the client list below — matched against the same 34-client list
   at https://getundercut.sh/clients.json. Most tools fall into one of four researched segments
   (A/B/C/D); everything else is marked "not yet researched" rather than guessed.
2. **How do you pay for model access today?**
   - `subscription_only` — just the subscription bundled with (or required for) this tool, no
     other provider key added
   - `subscription_plus_key` — that subscription, plus you've already added your own provider key
     (OpenRouter or similar)
   - `api_billing_only` — no subscription in the mix, you're already paying per-token API rates

**Resolution:** Zed always resolves to Segment D regardless of the provider-setup answer (its
OpenRouter compatibility is unverified, not tool-dependent). Otherwise, if you answered
`api_billing_only`, you get Segment C's "pure upside" story for that traffic regardless of tool —
that's the generalizable half of the key fact above. Otherwise your tool's own segment applies.
Full rule table: `resolution_matrix` in segments.json.

## Segment A — Claude Code + Claude subscription, no other keys

Undercut routes only within Anthropic's own tier ladder (haiku → sonnet → opus → fable). That's
real, non-trivial value: the escalation rubric still catches over-escalation within that ladder,
and Pro's real-time pooled testing and effort-level tuning still apply to Anthropic's tiers
specifically. It does not reach the biggest dollar swings — openweights tiers cost pennies
compared to dollars for Anthropic's tiers, per our own cost data.

- **OpenRouter framing:** requires a tool switch — a real tradeoff. If cross-vendor savings matter
  to you, the honest recommendation is switching to an open/BYO-model tool (see Segment C), with
  the tradeoff stated plainly: you'd give up Claude-specific subscription pricing for full routing
  flexibility. We do not recommend the unofficial `ANTHROPIC_BASE_URL` proxy workaround to reach
  OpenRouter from inside Claude Code itself — it's ToS-gray, fragile, and could break without
  notice.
- **Honesty caveat:** this is the lower-value-ceiling segment of the four, stated plainly rather
  than oversold — overstating value here is the specific trust problem this page exists to avoid.

## Segment B — Cursor / Windsurf / Copilot

Your native subscription already includes multi-vendor frontier-lab access (Claude, GPT, Gemini)
— that part isn't Undercut's value-add. What Undercut adds: evidence-based escalation logic on
top of whatever's already available, plus reaching openweights tiers (DeepSeek, GLM, and similar)
that native subscriptions don't include at all.

- **OpenRouter framing:** unlocks a tier you don't have. Add an OpenRouter key in your tool's own
  BYOK settings specifically to reach the cheap openweights tier — framed as unlocking access your
  subscription doesn't include, not a generic "add a key" instruction.
- **Honesty caveat:** the multi-vendor frontier-lab access you already have is not something
  Undercut is adding — we only claim the part that's genuinely new: the openweights tier and the
  routing logic on top of it.

## Segment C — OpenCode / Continue.dev / Cline / Aider / Roo Code / Kilo Code

As of 2026-01-09 (formalized in Anthropic's Consumer ToS on 2026-02-19), Claude Pro/Max
subscription auth tokens are blocked in third-party tools. Practically, anyone routing model
traffic through one of these tools today is already paying per-token API rates for whichever
vendor — there's no subscription being used here to give up. Adding an OpenRouter key to reach
openweights tiers is pure upside, zero tradeoff.

- **OpenRouter framing:** zero-downside, pure upside — the strongest, cleanest pitch of any
  segment. Already on your tool paying API rates? Add an OpenRouter key and there's no downside —
  only savings.
- **Honesty caveat:** this segment's story only holds because there was never a subscription being
  used here to trade away — it's not a special Undercut trick, it's a fact about how these tools
  already bill.

## Segment D — Zed

Zed bundles its own Zed Pro subscription and cannot use a personal Claude subscription at all,
regardless of Undercut.

- **OpenRouter framing:** **unverified for your editor.** Whether Zed's own BYOK settings can reach
  OpenRouter specifically was not confirmed in our research pass — flagged openly rather than
  asserted. Check Zed's own provider settings directly before assuming this path is available.
- **Honesty caveat:** we'd rather say we don't know than guess. This is the one segment where we
  explicitly withhold a specific recommendation until it's verified.
- **Flag:** `unverified_for_your_editor` — do not read this segment as asserting OpenRouter
  connectivity.

## Not yet researched (everything else)

Our compatibility research (last updated 2026-09-14) covered Claude Code, Cursor, Windsurf,
GitHub Copilot, the open/BYO-model group (OpenCode, Continue.dev, Cline, Aider, Roo Code, Kilo
Code), and Zed — 11 of the 34 clients Undercut's free skill works with. The other 23 (Codex CLI,
Gemini CLI, JetBrains Junie, Amp, Devin, Warp, Cody, Kiro, Void, Trae, Bolt, Factory, Lovable,
Qoder, Tabnine, Jules, JetBrains AI Assistant, Amazon Q Developer, Firebase Studio, OpenHands,
Augment Code, Goose, Replit Agent) are not yet mapped to a segment. Rather than guess, we say so
plainly.

- **OpenRouter framing:** no claim either way, with one exception that generalizes: if your tool
  bills you per-token with no subscription in the mix, the Segment C story (adding an OpenRouter
  key is pure upside) most likely applies to you too. If you're on a subscription for this tool,
  we don't yet know how it interacts with OpenRouter or other provider keys.
- **Honesty caveat:** we'd rather say "not yet researched" than assign a segment we can't back up.

## Open questions (re-verify before relying on this for a specific claim)

- Windsurf's exact BYOK settings-field names weren't fully confirmed (the live settings page
  couldn't be fully rendered during research).
- Whether Zed's own BYOK reaches OpenRouter specifically is unconfirmed — see Segment D.
- GitHub Copilot's current BYOK model roster changes often and should be re-checked before any
  Copilot-specific model list is published.

## Notes

- Every segment's copy above is reproduced from `site/segments.json`, which is itself derived
  verbatim from the internal compatibility research doc dated 2026-09-14. If this page and
  segments.json ever disagree, segments.json is the source of truth — file an issue.
- This page has no account, no email, and makes no network call other than fetching this same
  static content — same posture as the rest of the free tier.
- Full pricing and feature comparison: https://getundercut.sh/pricing.md · prose version:
  https://getundercut.sh/#pricing
