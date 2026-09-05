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

## Versioning

[Semantic Versioning 2.0.0](https://semver.org/) — `MAJOR.MINOR.PATCH`.
Still pre-1.0 (`0.y.z`) — the whole project is beta until an explicit
graduation decision (see MAJOR below), but this repo doesn't take
semver's pre-1.0 license to move the contract loosely: MINOR vs. PATCH is
gated by the same rule it would be post-1.0, just without a MAJOR bump
yet available to mark a breaking change. That's a deliberate tightening,
not an oversight.

- **PATCH** (`0.y.Z`) — a fix that adds no new capability: bug fixes,
  copy/doc corrections, a11y/contrast fixes, CI-only changes, dependency
  bumps, internal refactors with no user-visible change.
- **MINOR** (`0.Y.0`) — additive new capability: a new page, a new
  install-client entry, a new benchmark suite, a new site section, a new
  CLI flag, anything that changes what the product can do or who it
  visibly supports. This is the one most day-to-day feature PRs here hit.
- **MAJOR** — reserved. The first MAJOR bump is `1.0.0`, a deliberate,
  one-time graduation out of beta (candidate trigger: Teams ships +
  independent replication lands — see the internal roadmap's "Trust &
  rigor" section) — not a routine event. After `1.0.0`, MAJOR bumps only
  for breaking changes to the six-flag rubric's contract, `SKILL.md`'s
  public interface, or `models.md`'s tier-mapping *shape* (not its
  values — those already update on their own cadence, see below).

**This is separate from two other version axes already in this repo —
don't conflate them:**
- The **rubric spec version** inside `SKILL.md` itself (currently `v1`)
  — bumps only when the six-flag rubric or escalation ladder's actual
  rules change (a new flag, a different cap), independent of the package
  version above.
- **`models.md`'s tier→model mapping** — no version number of its own,
  updates on its own cadence when a new model beats an incumbent on the
  reference benchmarks, tracked via its "Last updated" date.

**Process:** every merged PR gets a bullet under `CHANGELOG.md`'s
`[Unreleased]` section (Added/Changed/Fixed — [Keep a
Changelog](https://keepachangelog.com/) format, already in use here) as
part of that PR, not deferred to a later release-prep pass. When cutting
a release: move `[Unreleased]`'s content under a new `[X.Y.Z] - date`
header per the rules above, then create the matching git tag in the same
pass — `git tag vX.Y.Z && git push origin vX.Y.Z`. A changelog entry
without a matching tag is a phantom release (happened once already, for
0.2.1 — fixed as part of adopting this policy); don't let it happen
again. `.claude-plugin/plugin.json`'s `"version"` field must match this
same package version — CI (`scripts/check-plugin-version.js`) guards it
against drift.

## Where to look first

- Product/what-it-is questions → `README.md`, `skills/firstpass/SKILL.md`
- Methodology/numbers questions → `testing/README.md`
- Routing logic questions → `skills/firstpass/SKILL.md` + `skills/firstpass/models.md`
- Site copy/positioning questions → `site/llms.txt` (agent-facing) or `site/index.md` (full page, markdown)

## Client install matrix

**Requirements:** none beyond the coding agent itself — no API key, no
account, no build step. `npx skills add` needs Node.js/npm (for `npx`) and
network access to the skills.sh registry; the manual `cp -r` copy below
needs neither.

Undercut is a plain `SKILL.md` — every client below reads that file, or
some project-wide instructions equivalent, from its own directory
convention. Two install paths work everywhere:

```sh
npx skills add undercutsh/firstpass       # generic skills.sh installer
```

or clone the repo and copy `skills/firstpass/` by hand into the exact
directory your client scans (below, per client). The manual copy is also
the fallback when `npx skills add` can't reach the network (see
Troubleshooting).

The 10 clients detailed in full below are sourced from this repo's own
verified companion pages (`site/claude-code.html`, `site/codex.html`,
`site/cursor.html`, `site/copilot.html`, `site/opencode.html`,
`site/gemini-cli.html`, `site/windsurf.html`, `site/junie.html`,
`site/amp.html`, `site/devin.html`) — read those for the full reasoning and
citations. Gemini CLI, Windsurf, JetBrains Junie, Amp, and Devin were
researched fresh for this section (dated 2026-08); their companion pages
and the sources inlined below each one carry the citations. A further 23
clients have companion pages with the same research-and-citation bar but
are summarized only in the table further down (see "Additional clients")
rather than expanded here — read each one's page for its full reasoning.

<details>
<summary><strong>Claude Code</strong></summary>

Reads `SKILL.md` files under `.claude/skills/<name>/`. Three install
paths — the plugin is the fewest keystrokes, but all three end up at
the same `SKILL.md`, so pick whichever fits:

```sh
# Plugin (this repo doubles as its own marketplace — .claude-plugin/)
/plugin marketplace add undercutsh/firstpass
/plugin install firstpass@firstpass
```
```sh
# or, the generic installer
npx skills add undercutsh/firstpass
```
```sh
# or, manual copy — no network dependency
mkdir -p .claude/skills && cp -r firstpass/skills/firstpass ./.claude/skills/firstpass
```

Source: `site/claude-code.html`.

</details>

<details>
<summary><strong>Codex CLI</strong></summary>

Per Codex's own skills docs, scans repo-scoped `.agents/skills/` (working
directory up to repo root) or user-level `$HOME/.agents/skills/` — a
different convention from Claude Code's `.claude/skills/`.

```sh
npx skills add undercutsh/firstpass -a codex
# or
mkdir -p .agents/skills && cp -r firstpass/skills/firstpass ./.agents/skills/firstpass
```

Source: `site/codex.html` (cites https://learn.chatgpt.com/docs/build-skills).

</details>

<details>
<summary><strong>Cursor</strong></summary>

Cursor's Agent Skills layer loads `SKILL.md` from
`.cursor/skills/<name>/SKILL.md`, where the folder name must match the
`name:` field in the skill's frontmatter (Undercut's is `firstpass`, so it
copies straight across). Cursor's own docs also say it reads
`.claude/skills/`, `.codex/skills/`, and `.agents/skills/` for
compatibility — unverified end-to-end by this repo, but if you already
installed for Claude Code or Codex, Cursor may pick it up with nothing
extra.

```sh
mkdir -p .cursor/skills && cp -r firstpass/skills/firstpass ./.cursor/skills/firstpass
# or
npx skills add undercutsh/firstpass
```

Source: `site/cursor.html`.

</details>

<details>
<summary><strong>GitHub Copilot (VS Code / coding agent)</strong></summary>

Copilot has no skills directory — no auto-discovery of `SKILL.md`. It
reads repository **custom instructions** in full instead: a single
`.github/copilot-instructions.md` at the repo root (Copilot Chat, code
review, and the coding agent all apply it), or, as of August 2025,
`AGENTS.md` (root or nearest nested file). Deliver the policy as
instruction content, not a discovered skill.

```sh
mkdir -p .github && curl -fsSL https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md >> .github/copilot-instructions.md
# or, as a scoped instructions file (add your own `applyTo: "**"` frontmatter — the raw SKILL.md doesn't ship one):
mkdir -p .github/instructions && curl -fsSL https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md -o .github/instructions/firstpass.instructions.md
```

Source: `site/copilot.html` (cites GitHub Docs custom-instructions page and
the 2025-08-28 Copilot coding-agent AGENTS.md changelog entry).

</details>

<details>
<summary><strong>OpenCode</strong></summary>

OpenCode's native `skill` tool discovers `SKILL.md` under
`.opencode/skills/<name>/SKILL.md` (walking up to the git worktree root),
and — for compatibility — the same layout under `.claude/skills/` and
`.agents/skills/`, plus the equivalent global paths under
`~/.config/opencode/`, `~/.claude/`, and `~/.agents/`.

```sh
npx skills add undercutsh/firstpass
# or, to target OpenCode's own path directly:
mkdir -p .opencode/skills && cp -r firstpass/skills/firstpass ./.opencode/skills/firstpass
```

Source: `site/opencode.html` (cites https://opencode.ai/docs/skills/). Note:
this repo hasn't independently verified which directory the `skills` CLI
writes to for OpenCode — use the manual copy if you want to be sure it
lands in `.opencode/skills/`.

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

Gemini CLI's reliable, verified mechanism is **`GEMINI.md`**, read
hierarchically: `~/.gemini/GEMINI.md` (global) first, then from the
project root down to the current directory, then a downward scan of
subdirectories (docs:
https://geminicli.com/docs/cli/gemini-md/,
https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md).
Gemini CLI also has an **Agent Skills** feature, but per its own docs it
auto-discovers `SKILL.md` only when bundled inside a full **extension**
package (`skills/<name>/SKILL.md` inside the extension directory,
https://geminicli.com/docs/extensions/writing-extensions/) — we found no
documented plain `.gemini/skills/` auto-discovery path outside of an
extension. skills.sh states it supports installing for Gemini
(https://www.skills.sh/agent/gemini) but doesn't publish which directory
it writes to, so treat that as unverified too.

```sh
mkdir -p .gemini && curl -fsSL https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md >> .gemini/GEMINI.md
```

Source: `site/gemini-cli.html`. Researched fresh 2026-08 — mechanism for
true Agent Skills discovery (outside an extension) not independently
verified; the `GEMINI.md` route above is the confirmed one.

</details>

<details>
<summary><strong>Windsurf (Cascade)</strong></summary>

Windsurf was acquired by Cognition and its docs now live under
`docs.devin.ai`, branded as part of Devin Desktop — `docs.windsurf.com`
redirects there. Confirmed paths for workspace rules: `.devin/rules/*.md`
(preferred) with `.windsurf/rules/*.md` and the legacy `.windsurfrules`
kept as fallbacks for backward compatibility; global rules at
`~/.codeium/windsurf/memories/global_rules.md` (6,000-char limit,
workspace files 12,000 chars). A root-level `AGENTS.md` is also read
automatically as "location-scoped rules with zero config." We could not
independently verify whether Windsurf/Cascade shares the `.devin/skills/`
Agent Skills discovery path documented for Devin CLI (see below) — if in
doubt, use `AGENTS.md`, which is confirmed.

```sh
# most portable, confirmed path:
echo "" >> AGENTS.md && curl -fsSL https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md >> AGENTS.md
```

Source: `site/windsurf.html` (cites https://docs.devin.ai/desktop/cascade/memories).
Researched fresh 2026-08.

</details>

<details>
<summary><strong>JetBrains AI Assistant / Junie</strong></summary>

Junie supports Agent Skills. Confirmed discovery paths (per
https://junie.jetbrains.com/docs/agent-skills.html):
project-level `<projectRoot>/.junie/skills/<name>/`, user-level
`~/.junie/skills/<name>/` (Windows: `%USERPROFILE%\.junie\skills\<name>\`),
and the cross-agent `.agents/skills/` convention. Project-level wins on a
name collision. Junie also reads plain guidelines from
`.junie/guidelines.md` or `AGENTS.md` if no skill applies.

```sh
mkdir -p .junie/skills && cp -r firstpass/skills/firstpass ./.junie/skills/firstpass
# or, the cross-agent convention Junie also scans:
mkdir -p .agents/skills && cp -r firstpass/skills/firstpass ./.agents/skills/firstpass
```

Source: `site/junie.html`. Researched fresh 2026-08.

</details>

<details>
<summary><strong>Amp</strong></summary>

Amp's Agent Skills default to `.agents/skills/<name>/SKILL.md` at the
workspace root, with `~/.config/agents/skills/` for user-level skills, and
`.claude/skills/` / `~/.claude/skills/` read for compatibility with
existing Claude skills (https://ampcode.com/news/agent-skills). Amp also
reads a root `AGENTS.md` for plain repository instructions.

```sh
mkdir -p .agents/skills && cp -r firstpass/skills/firstpass ./.agents/skills/firstpass
```

Source: `site/amp.html`. Researched fresh 2026-08.

</details>

<details>
<summary><strong>Devin (CLI / Desktop)</strong></summary>

Devin CLI supports Agent Skills at `.devin/skills/<name>/SKILL.md`
(project-scoped) or `~/.config/devin/skills/` (macOS/Linux) /
`%APPDATA%\devin\skills\` (Windows), per
https://docs.devin.ai/cli/extensibility/skills/creating-skills. For plain
instructions, Devin reads a root `AGENTS.md` automatically and treats it
as always-on (recommended over piling everything into Rules — Devin's own
docs say to prefer Skills for anything task-conditional):
https://docs.devin.ai/cli/extensibility/rules. Devin also auto-pulls
`.rules`, `.cursorrules`, `.windsurf`, and `CLAUDE.md` if present, so an
existing Claude Code or Cursor install may already be picked up.

```sh
mkdir -p .devin/skills && cp -r firstpass/skills/firstpass ./.devin/skills/firstpass
```

Source: `site/devin.html`. Researched fresh 2026-08.

</details>

### Additional clients

23 more companion pages landed on 2026-09-05, each independently
researched and cited on its own page — same bar as the 10 above, just not
expanded inline here. Read the linked page for the confirmed discovery
path, honest limits, and citations before assuming the summary below is
the whole story.

| Client | Discovery mechanism (summary) | Source |
| --- | --- | --- |
| Cline | Reads `SKILL.md` under `.cline/skills/<name>/` | `site/cline.html` |
| Zed | Reads `SKILL.md` under `.agents/skills/<name>/` (cross-agent convention) | `site/zed.html` |
| Warp | No skills directory; append policy text to root `AGENTS.md` | `site/warp.html` |
| Cody | No always-on auto-read file; save as a Sourcegraph Prompt (explicit-invoke) or append to a shared repo's `AGENTS.md` for other clients | `site/cody.html` |
| Continue | Reads a rule dropped into `.continue/rules/` | `site/continue.html` |
| Roo Code | Reads `SKILL.md` under `.roo/skills/<name>/` | `site/roo-code.html` |
| Kiro | Reads `SKILL.md` under `.kiro/skills/<name>/` | `site/kiro.html` |
| Void | No skills directory; append policy text to `.voidrules` | `site/void.html` |
| Trae | Reads `SKILL.md` under `.trae/skills/<name>/` | `site/trae.html` |
| Bolt | No filesystem path; import via Bolt's own Skills panel ("Import from GitHub" or "Import from file") | `site/bolt.html` |
| Factory | Reads `SKILL.md`/`models.md` from `.factory/skills/firstpass/` | `site/factory.html` |
| Lovable | No skills directory; append policy text to root `AGENTS.md` | `site/lovable.html` |
| Qoder | Reads `SKILL.md` under `.qoder/skills/<name>/` | `site/qoder.html` |
| Tabnine | Reads `SKILL.md`/`models.md` from `.tabnine/agent/skills/firstpass/` | `site/tabnine.html` |
| Jules | No skills directory; append policy text to root `AGENTS.md` | `site/jules.html` |
| JetBrains AI Assistant | No skills directory; save as a rule at `.aiassistant/rules/firstpass.md` | `site/jetbrains-ai.html` |
| Amazon Q Developer | No skills directory; save as a rule at `.amazonq/rules/undercut.md` | `site/amazon-q.html` |
| Firebase Studio | No skills directory; append policy text to `.idx/airules.md` | `site/firebase-studio.html` |
| Aider | No Agent Skills directory; load `CONVENTIONS.md` explicitly via `--read`/`/read`, or set a `read:` entry in `.aider.conf.yml` for it to load automatically every session | `site/aider.html` |
| OpenHands | Reads `SKILL.md` under `.agents/skills/<name>/` (Agent Skills spec); legacy `.openhands/skills/` still works | `site/openhands.html` |
| Kilo Code | Reads `SKILL.md` under `.kilo/skills/<name>/` (own convention, not shared with Roo Code); custom rules separately via `.kilo/rules/` | `site/kilo-code.html` |
| Augment Code | Hierarchical `AGENTS.md`/`CLAUDE.md` discovery, or an explicit Workspace Rule in `.augment/rules/` (`type: always_apply`) | `site/augment-code.html` |
| Goose | Reads `SKILL.md` under `.agents/skills/<name>/` (built-in Skills extension, Agent Skills spec); legacy `.goose/skills/`, `.claude/skills/` still work; separate `.goosehints` for always-on preferences | `site/goose.html` |

Note: JetBrains AI Assistant (above) is a separate product from JetBrains
Junie (detailed in full above) — don't conflate the two when reading the
matrix.

### Verify your install

Paste this into your agent after installing:

> Read SKILL.md (or the routing policy in AGENTS.md/copilot-instructions.md,
> whichever you loaded) and tell me: for the next 3 things I ask you to do,
> what tier would each get routed to under the 6-flag rubric, and why —
> name the flags that fired.

If the agent can't find any routing policy to describe, the skill wasn't
picked up — see Troubleshooting below.

### Troubleshooting

- **Skill not picked up.** The single most common cause is copying
  `skills/firstpass/` into the wrong directory for your specific client —
  each one scans a different path (see the matrix above). Double-check
  against your client's entry before assuming the skill itself is broken.
- **`npx skills add` does nothing / times out.** It needs network access to
  the skills.sh registry. In a sandboxed, offline, or restricted CI
  environment, use the manual `cp -r` copy for your client instead — it has
  no network dependency.
- **Installed correctly, but the agent never seems to use it.** This is a
  different problem from the one above — the skill is present and loadable,
  but the host's own skill-matcher never decided a given task was relevant
  enough to load it. Every client that discovers skills this way (not the
  instruction-file clients like Copilot/Cursor's `AGENTS.md` fallback,
  which load unconditionally) matches on `SKILL.md`'s `description:` field,
  and matching is the host's judgment call, not a guarantee — a task that
  doesn't closely resemble the description's trigger phrases ("fan out",
  "which model", "dispatch", etc.) may never surface the skill at all, even
  installed correctly. If routing doesn't seem to be happening: (1) ask the
  agent directly to read and apply `skills/firstpass/SKILL.md` for the
  current task — that always works regardless of auto-matching; (2) add an
  explicit one-line pointer to it in your own project `AGENTS.md`/
  `CLAUDE.md` ("apply the routing policy in skills/firstpass/SKILL.md to
  every unit of work") so it's not depending on match-quality alone; (3) use
  the "Verify your install" prompt above on a task that doesn't obviously
  resemble the trigger phrases, not just an obvious one, to get an honest
  read on whether auto-matching is working for your actual workload.

### Uninstall

Zero lock-in either way — it's a policy file, not infrastructure, so
removal is always "delete the thing you added":

| Install method | Command |
|---|---|
| Claude Code plugin | `/plugin remove firstpass` |
| `npx skills add` / manual copy | Delete the client's skill/rule directory (e.g. `rm -rf .claude/skills/firstpass`) |

No config, no state, nothing else to clean up.
