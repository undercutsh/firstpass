# @undercut/cli

`undercut` is the command that pairs a local machine with an Undercut Pro
account, syncs the signed policy artifact that overrides the free static
model map, and reports connection status. This package is a **structural
scaffold** built ahead of the backend it talks to (`undercut-app`, the
private service repo — see the PRD's [§5.1.5, "The pairing
problem"](../business) for the full design and rationale, not committed to
this public repo).

If you're evaluating what's real here, read this file before the code.

## What's real today

- **`undercut status`** — reads `~/.undercut/credentials.json` and
  `~/.undercut/policy.json` and reports pairing state, policy version,
  cache age, and staleness. No network calls. Works right now.
- **`undercut logout`** — deletes `~/.undercut/credentials.json`,
  `policy.json`, and `policy.md`. No network calls. Works right now.
- **File handling.** Credentials and the cached policy are written with
  `0600` permissions via `src/lib/fs-secure.js` (temp file + atomic
  rename, so a crash mid-write can't leave a truncated file). This is
  real, tested code, not a stub — see `src/lib/fs-secure.js` if you want
  to verify the permission bits yourself.
- **The `login` control flow's shape.** `undercut login` genuinely: opens
  your default browser, starts a local HTTP server on an OS-assigned
  random port, waits for a `GET /callback` on it, validates a CSRF
  `state` param, and writes whatever it receives to
  `~/.undercut/credentials.json`. This is the real localhost-callback
  pattern (`vercel login` / `wrangler login` style) described in the
  PRD's session-4 addendum as the v1 default, replacing the original
  manual device-code design. See `src/commands/login.js`.

## What's stubbed — and will error out on purpose

- **The backend it talks to does not exist.** `app.getundercut.sh` and
  `policy.getundercut.sh` are placeholder hostnames (see
  `src/lib/config.js`). `undercut login` will open a browser to a URL
  that 404s (or won't resolve at all), and will then sit waiting for a
  callback that never arrives until it times out after 5 minutes.
  `undercut sync` fails immediately with an explicit error explaining
  why, rather than pretending to succeed.
- **Signature verification is a stub.** `src/lib/verify.js`'s
  `verifyPolicySignature()` always returns `{ verified: false, reason:
  "stub" }`. There is no Ed25519 signing key yet — the PRD's design (see
  the TODO comments in that file) calls for the backend to sign policy
  artifacts server-side and this CLI to ship pinned with only the
  corresponding *public* key. Building that out is explicitly **not**
  done here; do not wire up real verification without the key existing
  and the boundary review the PRD calls for (§5.5: this package should
  carry the public key and verification logic and nothing about
  entitlement evaluation, the vetting pipeline, or cost economics).
- **`sync`'s fetch** (`src/commands/sync.js`) is a function that throws a
  clear "not wired up yet" error instead of making a request. Once
  `policy.getundercut.sh` exists, that's the one function to replace.

Every stub in this package is marked with a `TODO` comment that says
exactly what to build and points at the relevant PRD section — search for
`TODO` in `src/` to find them all.

## Why it's structured this way

The point of building this now, before the backend exists, is that the
*hard* parts of a CLI auth/sync flow — a correctly-shaped local callback
server, CSRF state validation, atomic 0600 file writes, a status command
that never lies about what's cached, a logout that actually cleans up —
are backend-independent and worth getting right and testable today. The
thin, clearly-marked seams (`config.js`'s placeholder URLs, `sync.js`'s
`fetchPolicy`, `verify.js`'s stub) are exactly the surface area that
needs to change once `undercut-app` ships, and nothing else should.

## Usage

```
npm install
node bin/undercut.js --help

node bin/undercut.js status   # real — reads local cache
node bin/undercut.js logout   # real — deletes local cache
node bin/undercut.js login    # structurally real, points at a placeholder backend
node bin/undercut.js sync     # structurally real, points at a placeholder backend
```

Once published, the intended entry point is `npx @undercut/cli <command>`
per the PRD's design (`bin.undercut` in `package.json`).

## Where things live

```
cli/
├── bin/undercut.js          # shebang entry point
├── src/
│   ├── cli.js                # commander program + command wiring
│   ├── commands/
│   │   ├── login.js           # localhost-callback pairing (placeholder backend)
│   │   ├── sync.js            # policy fetch + cache (placeholder backend)
│   │   ├── status.js          # REAL — reads local cache
│   │   └── logout.js          # REAL — deletes local cache
│   └── lib/
│       ├── paths.js           # ~/.undercut/* path helpers
│       ├── fs-secure.js       # REAL — 0600 atomic JSON/text writes
│       ├── verify.js          # STUB — Ed25519 signature verification
│       └── config.js          # PLACEHOLDER backend URLs + TODOs
└── README.md                  # this file
```

`~/.undercut/` is already owned by [`firstpass/hooks/`](../hooks) (the
opt-in, zero-network local telemetry package). This CLI is the second
citizen of that directory, adding a Pro credential and a cached policy
artifact alongside the hooks package's ledger — see `hooks/README.md` and
PRD §5.1.5 for why they share a directory instead of each owning their
own.
