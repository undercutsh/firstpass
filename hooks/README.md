# Undercut Hooks (experimental, opt-in)

Not part of the shipped skill. The free skill's promise — a policy file the
agent reads, zero infrastructure — doesn't change if you never install this.

This is a small local Claude Code hooks package that does two things:

1. **Guarantees the rubric is in context** every session, instead of relying
   on the skill matcher to surface it (a companion-skill audit found a
   structurally similar skill self-activated in 0 of 10 sessions without
   forced injection).
2. **Answers "is this even doing anything"** with a session-end receipt and
   an at-most-once-a-day digest, built from real local token/cost data —
   never an estimate, never a guess.

Everything here is local. No network calls, no telemetry, no second model.
The ledger (`~/.undercut/ledger.jsonl`) only ever gets written to and read
from this machine.

## What's in here

- `lib/pricing.js` — per-model $/MTok table + cost/tier lookup helpers.
- `lib/ledger.js` — local JSONL read/write, first-activation and
  daily-digest marker files.
- `session-start.js` — injects a condensed rubric via `additionalContext`;
  also shows the one-time first-activation message and the daily digest.
- `subagent-stop.js` — reads the completed subagent's own transcript,
  sums real token usage per model, computes real dollar cost, appends one
  ledger row.
- `stop.js` — prints a session-end receipt when the session had ≥1
  dispatch (never on a session with nothing to route).

## Install (opt-in, per machine)

1. Copy this `hooks/` directory somewhere stable (or leave it in a clone of
   this repo).
2. Add the hook registrations from `settings-snippet.json` to your
   `~/.claude/settings.json` (or a project's `.claude/settings.json`),
   replacing `/absolute/path/to/hooks/...` with the real path.
3. That's it — no build step, no dependencies beyond Node (uses only
   built-in `fs`/`readline`/`path`/`os`).

## Uninstall

Delete the hook entries from `settings.json`. Optionally `rm -rf
~/.undercut` to remove the local ledger. Nothing else on the machine
changes.

## Status

Experimental — dogfooding on our own usage before this is offered to
anyone else. See `business/undercut-hooks-design-2026-09-07.md` (internal
repo) for the design rationale, guardrails, and what "done" looks like
before this ships more broadly.
