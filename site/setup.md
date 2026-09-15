---
title: "Undercut — which segment are you?"
description: "Undercut's value depends on your editor and how you pay for models today. Four honest segments, from Claude Code's bounded-but-real value to the zero-downside pitch for open/BYO-model tools already on API billing. Zed is explicitly flagged unverified for OpenRouter."
canonical: "https://getundercut.sh/setup.md"
last-updated: "2026-09-15"
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

## All 4 segments, at a glance

Plain reference table — the full per-segment story is below; this is the quick-scan version for
docs, per `reference_table` in segments.json.

| Segment | Tools | How you pay today | What Undercut adds | OpenRouter pitch |
|---|---|---|---|---|
| A | Claude Code | Claude Pro/Max subscription only | Escalation rubric + effort-level tuning within Anthropic's own tier ladder | Additive second lane, same tool/subscription — reaches tiers your subscription can't |
| B | Cursor, Windsurf, GitHub Copilot | Tool's native multi-vendor subscription | Escalation logic on top, plus the openweights tier the subscription doesn't include | Unlocks a tier you don't have |
| C | OpenCode, Continue.dev, Cline, Aider, Roo Code, Kilo Code | Per-token API billing (no subscription in the mix) | Full category-aware routing across whatever vendors you add | Zero-downside, pure upside — the strongest pitch of any segment |
| D | Zed | Bundled Zed Pro subscription | Routing within Zed's own available models | Unverified for this editor — no claim made either way |

## Segment A — Claude Code + Claude subscription, no other keys

Undercut routes within Anthropic's own tier ladder (haiku → sonnet → opus → fable) on your
existing subscription — that's real, non-trivial value on its own: the escalation rubric still
catches over-escalation within that ladder, and Pro's real-time pooled testing and effort-level
tuning still apply to Anthropic's tiers specifically. Your subscription alone doesn't reach the
biggest dollar swings — openweights tiers run 5-10x cheaper again than Anthropic's own cheapest
tier on the task categories where they hold up, per our own cost data.

- **OpenRouter framing:** additive, not a replacement. You don't have to leave Claude Code or your
  Claude subscription — the unlock is connecting OpenRouter as a second, API-billed lane alongside
  it, the same pattern Undercut already uses for its own internal subagent routing. Your
  subscription keeps handling whatever it already handles well; OpenRouter access is what lets the
  same routing logic also reach the tiers your subscription can't. Connect OpenRouter (one click,
  your own account, your own billing) and nothing about your subscription changes — it's additive,
  never a replacement, and never implied to be inferior. We still do not recommend the unofficial
  `ANTHROPIC_BASE_URL` proxy workaround to reach other vendors from inside Claude Code itself — it's
  ToS-gray, fragile, and could break without notice; the OpenRouter connect flow (below) is the
  supported path.
- **Honesty caveat:** this is the lower-value-ceiling segment of the four on your subscription
  alone, stated plainly rather than oversold. We also never compare this to Undercut's own
  subscription pricing or unit economics — that's Anthropic's pricing to explain, not ours to
  characterize.
- **Connect OpenRouter:** adds a second lane on top of your Claude subscription; nothing about the
  subscription lane changes, and declining keeps you on your current setup permanently, not a nag
  state. See "Connecting OpenRouter" below for the current status of this button.

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

## Connecting OpenRouter

The interactive page shows a "Connect OpenRouter" button on Segments A, B, and C (not D — see
Segment D above). As of this writing it is a disabled placeholder, not a live control: the OAuth
PKCE connect flow that mints an OpenRouter key scoped to *your* account and billing is being built
concurrently (`build-backlog-2026-09-15-ecosystem-ladder.md` Phase 3) and hasn't shipped its
initiate-redirect route yet. We show the button so the shape of the flow is honest and visible
now, and disclose plainly that it doesn't do anything yet rather than linking to a guessed or
undocumented path. It will go live once Phase 3 merges.

## Open questions (re-verify before relying on this for a specific claim)

- Windsurf's exact BYOK settings-field names weren't fully confirmed (the live settings page
  couldn't be fully rendered during research).
- Whether Zed's own BYOK reaches OpenRouter specifically is unconfirmed — see Segment D.
- GitHub Copilot's current BYOK model roster changes often and should be re-checked before any
  Copilot-specific model list is published.

## Notes

- Every segment's copy above is reproduced from `site/segments.json`, which is itself derived
  verbatim from the internal compatibility research doc dated 2026-09-14 (Segment A's OpenRouter
  framing was updated 2026-09-15 per the reframed pitch in
  `openrouter-provisioning-and-segment-a-pitch-2026-09-14.md` Part 2). If this page and
  segments.json ever disagree, segments.json is the source of truth — file an issue.
- This page has no account, no email, and makes no network call other than fetching this same
  static content — same posture as the rest of the free tier.
- Full pricing and feature comparison: https://getundercut.sh/pricing.md · prose version:
  https://getundercut.sh/#pricing
