# Undercut Hooks (ships with the Claude Code plugin, on by default)

Not part of the skill itself. The free skill's promise — a policy file the
agent reads, zero infrastructure — doesn't change if you turn all of this
off.

`hooks/hooks.json` registers these with the plugin, so `/plugin install
firstpass@firstpass` turns them on; there is nothing to paste into
`settings.json` any more (`settings-snippet.json` remains for anyone
installing without the plugin; if you pasted it *and* installed the plugin,
the ledger de-duplicates the double fire).

This is a small local Claude Code hooks package that does four things:

1. **Guarantees the rubric is in context** every session, instead of relying
   on the skill matcher to surface it (a companion-skill audit found a
   structurally similar skill self-activated in 0 of 10 sessions without
   forced injection).
2. **Answers "is this even doing anything"** with a session-end receipt, an
   at-most-once-a-day digest, and a status line. What actually ran is always
   real local token/cost data, never a guess; the "savings" figure alongside
   it is explicitly labeled an estimate (same token counts, priced at
   frontier rates as a counterfactual) — never presented as a real number.
3. **Puts Undercut's name on the work it routed.** Commits get a
   `Routed-With: Undercut (getundercut.sh)` trailer (Claude Code's own
   `Co-Authored-By` line is kept), pull requests get a one-line footer with a
   badge and, when the agent routed work, the real tier counts. The
   `Routing:` line in the transcript ends with a link to Undercut.
4. **Keeps the ledger.** `~/.undercut/ledger.jsonl`, written to and read from
   this machine only.

The first session after install says exactly what was added to your Claude
Code settings and how to turn it off.

## Settings (all on unless noted)

Set in `~/.claude/settings.json` under an `undercut` key (a project's
`.claude/settings.json` overrides it), as an env var `UNDERCUT_<NAME>=0`, or
with `undercut config <setting> off|on`.

| Setting | What it does |
|---|---|
| `branding` | Master switch. Off turns off every byline, tip and generated-file header below. Routing, the ledger, the receipt and the status line keep working |
| `attribution` | Commit trailer and PR footer (master for the next three) |
| `attributionPr` | The PR description footer. Off leaves Claude Code's own PR line in place |
| `attributionBadge` | The badge image in the PR footer (footer text stays) |
| `attributionStats` | The "N of M units ran cheap/standard" line under the PR footer |
| `statusLine` | The Undercut status line |
| `statusLineSession` | This session's dispatches and estimated savings in the status line |
| `statusLineLifetime` | Lifetime estimated savings in the status line |
| `statusLineTips` | A rotating one-line tip in the status line |
| `narrationTag` | The link at the end of the `Routing:` line |
| `spinnerVerbs` | Four extra spinner verbs (Tiering, Verifying, Escalating on evidence, Undercutting) |
| `receipt` | The session-end receipt |
| `shareHint` | Once a week, the receipt mentions `undercut share` |
| `updateNotice` | One line at session start, once per version, when the marketplace copy Claude Code already keeps locally is newer than the running plugin. No network call |
| `generatedFileHeaders` | A one-line header on files Undercut itself writes (for example the cached `policy.md`). Never on your source code |

Undercut only writes or removes an entry in `settings.json` if that entry is
absent or still exactly what Undercut last wrote (tracked in
`~/.undercut/managed.json`). If you already have an `attribution`, a
`statusLine` or `spinnerVerbs`, they are left alone and the first-session
message says so. A `settings.json` that doesn't parse is never touched.

`undercut statusline` prints the status line so you can chain it from your
own.

## Everything here is local

No network calls, no telemetry, no second model. The ledger only ever gets
written to and read from this machine. The one place a byline reaches us is
the PR badge: it is a static image at `getundercut.sh/badge.svg`, fetched by
whoever views the pull request (through GitHub's image proxy), so we can see
request counts for the image — never who you are, your repo, or your code.
See [getundercut.sh/data](https://getundercut.sh/data). Turn it off with
`undercut config attributionBadge off`. (Pro's policy sync — a separate
mechanism — is the one network call your machine makes: an authenticated
licence check, not telemetry about your work.)

## What's in here

- `lib/pricing.js` — per-model $/MTok table + cost/tier lookup helpers,
  plus a frontier-rate counterfactual for the savings estimate.
- `lib/ledger.js` — local JSONL read/write, first-activation and
  daily-digest marker files, plan-cost config.
- `lib/savings.js` — shared "real cost vs. frontier-equivalent" math used
  by both the receipt and the digest.
- `lib/links.js` — never print a bare URL; hyperlink the app name instead
  (markdown link in injected context, terminal OSC 8 hyperlink in the
  printed receipt — both degrade to plain text, never a raw URL).
- `session-start.js` — injects a condensed rubric via `additionalContext`;
  also shows the one-time first-activation message and the daily digest.
- `subagent-stop.js` — reads the completed subagent's own transcript,
  sums real token usage per model, computes real dollar cost, appends one
  ledger row.
- `statusline.js` — the status line: one line from the local ledger.
- `lib/settings.js`, `lib/install.js`, `lib/branding.js` — settings
  resolution, the managed `settings.json` entries, and every byline string.
- `stop.js` — prints a session-end receipt when the session had ≥1
  dispatch (never on a session with nothing to route).

## Optional: express savings against your plan cost

By default, the savings estimate is plan-independent (`est. $X saved vs.
running everything at frontier`). If you set `UNDERCUT_PLAN_MONTHLY_USD`
(e.g. `export UNDERCUT_PLAN_MONTHLY_USD=200` for a $200/mo plan) in your
shell profile, the receipt and digest instead frame it as a share of that
cost (`est. $X in frontier-rate value saved -- Y% of your $200/mo plan`).

This is never framed as "we reduced your bill by $X" — Claude subscription
plans are flat-rate, so token savings don't literally reduce an invoice.
It's an honest "value delivered relative to what you pay," not a refund
claim. There's no API for a hook to detect which plan you're on, so this
is opt-in and self-reported.

## Install without the plugin (per machine)

Plugin users skip this; `hooks.json` already registers everything.

1. Copy this `hooks/` directory somewhere stable (or leave it in a clone of
   this repo).
2. Add the hook registrations from `settings-snippet.json` to your
   `~/.claude/settings.json` (or a project's `.claude/settings.json`),
   replacing `/absolute/path/to/hooks/...` with the real path.
3. That's it — no build step, no dependencies beyond Node (uses only
   built-in `fs`/`readline`/`path`/`os`).

## Turn it off / uninstall

- One piece: `undercut config <setting> off`.
- Every byline and tip: `undercut config branding off`.
- All of it: `/plugin disable firstpass@firstpass` (or delete the hook
  entries from `settings.json` if you installed manually), then
  `undercut config attribution off` and `undercut config statusLine off`
  first if you want Undercut's entries removed from `settings.json` too.
  Optionally `rm -rf ~/.undercut` to remove the local ledger.

## Status

Shipped, on by default with the plugin. Dogfooded on our own usage first (see
`business/undercut-hooks-design-2026-09-07.md`, internal repo, for the
design rationale and guardrails) — two real bugs found and fixed that way
before this went out. The free skill's promise doesn't change either way:
turn it off and the core skill works exactly as it always has.
