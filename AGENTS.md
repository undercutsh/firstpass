# AGENTS.md — instructions for AI coding agents working in this repo

This repo (`undercutsh/firstpass`) is the source for **Undercut**: a free,
MIT-licensed routing policy (`skills/firstpass/SKILL.md`) and the eval
harness that measures it. See `README.md` for what the product is and
`CONTRIBUTING.md` for the human contribution process — this file is the
agent-specific quick reference.

## Repo layout

- `skills/firstpass/SKILL.md` — the product. The six-flag rubric and
  escalation ladder a coding agent follows at dispatch time.
- `skills/firstpass/models.md` — the tier→model mapping, versioned
  separately from the rubric.
- `evals/` — the A/B eval harness (Node, `evals/src/main.js`). Deterministic
  graders only — never an LLM judging another LLM.
- `testing/` — published methodology and raw benchmark results.
- `site/` — the marketing site (static HTML, deployed to Vercel at
  getundercut.sh). Not a framework app — plain files, hand-edited.
- `scripts/` — repo maintenance scripts.

## Build, test, verify

```sh
cd evals
node src/main.js --mock            # plumbing check, no API key, no spend — this is what CI runs
node src/main.js --verify-only     # confirm model slugs resolve (needs a key)
node src/main.js --flagtest        # dispatcher flagging reliability
node src/main.js --compare a.json b.json   # diff two saved runs
```

There is no build step for `site/` — it's served as static files. Changes
there don't need a build/compile step, just valid HTML/JSON/txt.

## Hard rules (same ones CONTRIBUTING.md states for humans)

- **No unearned trust signals.** Don't add badges, ratings, "as seen in"
  rows, or compliance claims not backed by a real, checkable artifact.
- **Deterministic graders only** in `evals/` — never an LLM judging another
  LLM's output.
- **Any claim on `site/` or in docs traces to published data.** If you
  change a number, methodology, or the routing policy itself, point to
  what in `testing/` supports it.
- **Don't fabricate machine-readable metadata either** — the same rule
  applies to `.well-known/` files, `llms.txt`, JSON-LD, etc. Only list
  capabilities that actually exist (no API, MCP server, or auth flow exists
  yet — don't add discovery files implying they do).

## Where to look first

- Product/what-it-is questions → `README.md`, `skills/firstpass/SKILL.md`
- Methodology/numbers questions → `testing/README.md`
- Routing logic questions → `skills/firstpass/SKILL.md` + `skills/firstpass/models.md`
- Site copy/positioning questions → `site/llms.txt` (agent-facing) or `site/index.md` (full page, markdown)
