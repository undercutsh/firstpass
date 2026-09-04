# Security / dependency audit

## Dependency audit (2026-09-04)

Checked every `package.json` in the repo (`evals/package.json` is the only
one — there is none at the repo root or under `site/api/`) and grepped
`site/api/*.js` and `evals/src/**/*.js` for imports.

**Finding: zero external npm dependencies anywhere in the repo.**

- `evals/package.json` declares no `dependencies` and no `devDependencies`
  fields at all — just `name`, `version`, `type`, `private`, `description`,
  and `scripts`.
- `site/api/lead.js` / `lead.test.js` and the `scripts/*.js` maintenance
  scripts import only relative paths and Node built-ins (`node:*`), no
  npm packages.
- There is no `node_modules/` and no lockfile (`package-lock.json`,
  `npm-shrinkwrap.json`, etc.) anywhere in the tree.

Because there is no lockfile, `npm audit` refuses to run
(`ENOLOCK` / "This command requires an existing lockfile") — that error
itself is confirmation there's nothing installed to audit, not a sandbox
limitation being papered over. There is no vulnerable-version advisory to
reason about because no third-party package is pinned anywhere.

This is an honest "nothing to fix" result, not an unchecked assumption.

## Node engine pinning (fixed)

Before this change, nothing in the repo pinned a Node version:
`evals/package.json` had no `engines` field and there was no `.nvmrc`
anywhere, even though `.github/workflows/evals.yml` explicitly sets up
**Node 22** (`actions/setup-node@v4` with `node-version: 22`) for both the
`evals/` test/harness steps and the root-level `scripts/*.js` checks.

Added:
- `evals/package.json`: `"engines": { "node": ">=22" }`, matching CI.
- Root `.nvmrc` containing `22`, covering `scripts/*.js` (which run from
  the repo root, outside `evals/`, and have no package.json of their own
  to carry an `engines` field).

No dependency versions were changed since none exist.
