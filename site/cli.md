---
title: "Undercut — @undercutsh/cli reference"
description: "@undercutsh/cli pairs a machine with Undercut Pro and syncs the signed policy file. status and logout are real today — no network calls. login and sync are structurally real but point at a backend that hasn't shipped yet. Full command reference, credential file locations, and 0600 permissions."
canonical: "https://getundercut.sh/cli.md"
last-updated: "2026-09-15"
---

# @undercutsh/cli

> Machine-readable reference for `@undercutsh/cli`, the command that pairs a
> local machine with an Undercut Pro account, syncs the signed policy
> artifact that overrides the free static model map (`models.md`), and
> reports connection status. Source: [`cli/`](https://github.com/undercutsh/firstpass/tree/main/cli)
> in the main repo — read [`cli/README.md`](https://github.com/undercutsh/firstpass/blob/main/cli/README.md)
> for the full, longer-form honesty writeup this page summarizes.

**Honest status up front:** two of the four commands (`status`, `logout`)
work completely today, with no network calls. The other two (`login`,
`sync`) are real, tested control flow pointed at a backend
(`undercut-app`) that doesn't exist yet — they fail on purpose, with a
clear error, rather than pretending to succeed. See
[What's real vs. stubbed](#whats-real-vs-stubbed) below before you decide
whether this is useful to you yet.

## Install

`@undercutsh/cli` is **not published to npm yet** (`package.json` is marked
`"private": true`). The intended entry point, once it ships, is:

```
npx @undercutsh/cli <command>
```

Until then, run it from a clone of the repo:

```
git clone https://github.com/undercutsh/firstpass
cd firstpass/cli
npm install
node bin/undercutsh.js <command>
```

Requirements: Node.js ≥ 22 (see `cli/package.json`'s `engines` field). No
API key or account is needed to run `status` or `logout`.

## Commands

### `undercutsh login`

Pairs this machine with your Undercut Pro account using a localhost-callback
flow (`vercel login` / `wrangler login` style — see
[`cli/src/commands/login.js`](https://github.com/undercutsh/firstpass/blob/main/cli/src/commands/login.js)):
opens your default browser, starts a local HTTP server on an OS-assigned
random port, waits for a `GET /callback` on it, validates a CSRF `state`
param, and writes the result to `~/.undercut/credentials.json`.

```
$ node bin/undercutsh.js login
Undercut: pairing this machine with your Pro account.

  Opening https://app.getundercut.sh/activate?callback_port=54213&state=…

  If your browser doesn't open automatically, open that URL yourself.
  [PLACEHOLDER: this endpoint does not exist yet — undercut-app has not shipped. See cli/README.md.]

Waiting for approval...
```

**This is the honest, current output.** `app.getundercut.sh` is a
placeholder hostname that 404s or won't resolve. The command then waits
for a callback that never arrives, and times out after 5 minutes with
`Error: timed out waiting for browser approval`. The control flow — CSRF
`state` generation, the OS-assigned callback port, browser auto-open with a
silent fallback to printing the URL — is real and tested; only the far end
(the backend redirecting a real browser back to that port) doesn't exist
yet.

Options: `--port <port>` forces the local callback server to a specific
port instead of an OS-assigned one (for testing). `--code <code>` is
reserved for a pre-bound pairing code flow and is not yet wired up.

### `undercutsh sync`

Fetches the signed policy artifact and caches it at
`~/.undercut/policy.json` and a human-readable render at
`~/.undercut/policy.md` (see
[`cli/src/commands/sync.js`](https://github.com/undercutsh/firstpass/blob/main/cli/src/commands/sync.js)).

```
$ node bin/undercutsh.js sync
Fetching policy from https://policy.getundercut.sh/v2/pro [PLACEHOLDER — see cli/README.md]...
sync is not wired to a real backend yet: https://policy.getundercut.sh/v2/pro does not exist. This is expected until undercut-app ships (see cli/README.md and TODOs in src/commands/sync.js).
Falling back to the free static model map (models.md) — sync never fails a dispatch.
```

`policy.getundercut.sh` is another placeholder hostname. `fetchPolicy()`
throws a clear, explicit error instead of pretending to succeed, and the
command exits `1` — but nothing about *dispatch* breaks, because a coding
agent following the skill always has the free static model map
(`models.md`) as its fallback if there's no verified, current policy
cached.

Options: `--if-stale` no-ops if the cached policy is still within its TTL
(24h, `POLICY_TTL_MS` in `cli/src/lib/config.js`) instead of re-fetching.
`--ci` is meant to exchange a machine API key for a short-lived access
token instead of reusing a paired-session credential, for CI/postinstall
use — also not wired up yet, since it needs the same nonexistent backend.

### `undercutsh status` — real, works today

Reads the two local cache files and reports what's actually on disk. No
network calls.

Not paired yet:

```
$ node bin/undercutsh.js status
Connection state: not paired

Run `undercutsh login` to pair this machine, then `undercutsh sync`.
Until then, dispatch uses the free static model map (models.md).
```

Paired, with a cached (but always-unverified-today) policy:

```
$ node bin/undercutsh.js status
Connection state: paired
  Device:    my-laptop
  Paired at: 2026-09-15T04:12:33.000Z

Policy:
  Channel:         pro
  Policy version:  3
  Age:             2h (stale — run `undercutsh sync`)
  Signature:       NOT verified (stub)

  Unverified policy is not trusted for dispatch; falling back to models.md.
```

`status` never lies about what's cached: it shows real cache age (via
`formatAge()`), flags staleness once age exceeds the 24h TTL, and — because
signature verification is a stub today (see below) — always reports
`NOT verified (stub)` and tells you dispatch is falling back to the free
static model map regardless of what's in the cache.

### `undercutsh logout` — real, works today

Deletes `~/.undercut/credentials.json`, `~/.undercut/policy.json`, and
`~/.undercut/policy.md`. No network calls — there's no server-side session
to invalidate yet, and even once there is, deleting the local files is
what makes the CLI behave as logged-out regardless of server state.

```
$ node bin/undercutsh.js logout
Removed local credentials and cached policy.
Reverted to the free static model map (models.md).
```

Running it again with nothing left to remove:

```
$ node bin/undercutsh.js logout
Already logged out (no local credentials or policy cache found).
```

## Credential and cache files

All four commands read or write inside `~/.undercut/`, a directory already
owned by [`hooks/`](https://github.com/undercutsh/firstpass/tree/main/hooks)
(the opt-in, zero-network local telemetry package) — this CLI is the
second citizen of it, adding a Pro credential and a cached policy artifact
alongside the hooks package's ledger.

| File | Written by | Contents |
|---|---|---|
| `~/.undercut/credentials.json` | `login` | `{ version, token, paired_at, device_name }` |
| `~/.undercut/policy.json` | `sync` | The cached policy artifact as returned by the backend |
| `~/.undercut/policy.md` | `sync` | A human/agent-readable render of `policy.json` |

All three are written and deleted, never just created — `login`/`sync`
always overwrite the previous version, and `logout` removes all three
(each independently — `logout` doesn't fail if only some exist).

**Permissions: `0600` (owner read/write only), directory `0700`.** This is
real, tested code — see
[`cli/src/lib/fs-secure.js`](https://github.com/undercutsh/firstpass/blob/main/cli/src/lib/fs-secure.js).
Every write goes to a `<file>.<pid>.tmp` temp file first, then an atomic
`fs.rename()` into place, then an explicit `chmod 0600` (belt-and-suspenders
— rename usually preserves the temp file's mode, but the code doesn't rely
on that). A crash mid-write can't leave a truncated credentials or policy
file behind, and the files are never world- or group-readable at any point
after the write completes.

## What's real vs. stubbed

| | Status |
|---|---|
| `undercutsh status` | **Real.** Reads local cache, reports pairing state/policy age/staleness. No network calls. |
| `undercutsh logout` | **Real.** Deletes the three cache files. No network calls. |
| File handling (`fs-secure.js`) | **Real, tested.** `0600` atomic writes, as described above. |
| `undercutsh login`'s control flow | **Real shape**, placeholder backend. Local callback server, CSRF `state`, browser auto-open — all genuine. `PLACEHOLDER_ACTIVATE_URL` (`https://app.getundercut.sh/activate`) doesn't resolve. |
| `undercutsh sync`'s control flow | **Real shape**, placeholder backend. Cache write, TTL check, markdown render — all genuine. `fetchPolicy()` throws on purpose; `PLACEHOLDER_POLICY_URL` (`https://policy.getundercut.sh/v2/pro`) doesn't resolve. |
| Signature verification | **Stub.** `verifyPolicySignature()` in `cli/src/lib/verify.js` always returns `{ verified: false, reason: "stub" }`. There is no Ed25519 signing key yet — the backend is meant to sign policy artifacts server-side and this CLI ship pinned with only the corresponding public key. Not built. |
| npm publish | **Not done.** `package.json` is `"private": true`; `npx @undercutsh/cli` is the intended future entry point, not a working command today. |

Every stub in the source is marked with a `TODO` comment naming exactly
what to build and pointing at the relevant PRD section.

## Why build it this way

The point of shipping this CLI ahead of the backend it talks to is that
the *hard* parts of a CLI auth/sync flow — a correctly-shaped local
callback server, CSRF state validation, atomic `0600` file writes, a
status command that never lies about what's cached, a logout that
actually cleans up — are backend-independent and worth getting right and
testable today. The thin, clearly-marked seams (placeholder URLs in
`cli/src/lib/config.js`, `sync.js`'s `fetchPolicy`, `verify.js`'s stub)
are exactly the surface area that needs to change once the backend ships,
and nothing else should.

## More

- Full write-up, including "where things live" and the module map:
  [`cli/README.md`](https://github.com/undercutsh/firstpass/blob/main/cli/README.md)
- What Pro's policy sync reveals once the backend exists (an authenticated
  licence check, not telemetry): [getundercut.sh/data](https://getundercut.sh/data)
- Pricing: [getundercut.sh/pricing.md](https://getundercut.sh/pricing.md)
- The routing skill itself, which works today with no CLI and no account:
  [getundercut.sh/llms.md](https://getundercut.sh/llms.md)
