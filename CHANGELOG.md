# Changelog

All notable changes to Undercut (firstpass) are documented here. Follows
[Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Claude Code plugin distribution** (`.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`) — this repo doubles as its own
  plugin marketplace, so `/plugin marketplace add undercutsh/firstpass`
  + `/plugin install firstpass@firstpass` installs the skill in two
  prompts instead of a shell command. No hooks, no lifecycle
  enforcement — the plugin just declares `skills/` for auto-discovery,
  same `SKILL.md` every other install path already uses. Added as an
  "Option 1" alongside the existing `npx skills add` and manual-copy
  paths (not a replacement) on `site/claude-code.html`, the homepage
  install picker, and `AGENTS.md`'s client matrix, plus an `AGENTS.md`
  Uninstall section (`/plugin remove firstpass`).

## [0.3.0] - 2026-09-03

Versioning policy formalized this release (see `AGENTS.md` → Versioning)
— Semantic Versioning, gated the same way pre- and post-1.0. Everything
below was already shipped and merged; this is the first release cut
under the new "log at PR time, tag at release time" process, backfilled
from #14 through #39.

### Added

- **`/api/lead` serverless function** (#26) — the hero/audit/pricing
  lead-capture forms POST to a real endpoint instead of only logging to
  the console. Destination is operator-configured via `LEAD_WEBHOOK_URL`
  (any webhook-accepting service) rather than a vendor picked in code —
  see `site/api/lead.js`. Requires that env var set in Vercel before it
  does anything; responds `501` otherwise rather than silently succeeding.
- **MBPP public benchmark suite** (#28) — a third public code-generation
  benchmark alongside GSM8K/HumanEval (`--benchmark mbpp`), a fixed,
  embedded 30-problem subset (CC-BY-4.0, google-research/mbpp) so `--mock`
  and CI stay offline. No live/paid vendor run yet (mock-only).
- **5 per-client companion/integration pages** (#17-19, #21, #23) —
  dedicated pages for Claude Code, GitHub Copilot, Codex CLI, OpenCode,
  and Cursor, each with verified install steps and citations.
- **Per-client install matrix in `AGENTS.md`** (#34) — 10 clients total
  (the 5 above plus Gemini CLI, Windsurf, JetBrains Junie, Amp, Devin,
  researched fresh), a "Verify your install" prompt, and a Troubleshooting
  section.
- **Eval-harness statistical rigor** (#20, #29) — Wilson confidence
  interval on pass rate, seed-cluster bootstrap on cost-per-pass, wired
  into `main.js`'s report output; default seeds bumped 5→10.
- **Accessibility statement page** (#25) and **unit tests for
  `policy.js`/`tasks.js`** (#15).
- **Markdown content negotiation** (#27) — a Vercel Edge Middleware
  serving `/index.md`-equivalent markdown to agents that request it.
- **Requirements line + auto-generated `models.md`** (#36) — install docs
  now state up front that nothing beyond the coding agent is required;
  `models.md`'s tier→model table is now generated from
  `evals/src/config.js` via `scripts/sync-models-md.js`, with a CI check
  that fails the build if the two drift.
- **Floating "Star on GitHub" CTA** (#39) — bottom-right, scroll-triggered,
  dismissible.
- **Self-activation disclosure** (#38) — an honest caveat in
  `testing/README.md` and expanded `AGENTS.md` troubleshooting for the
  (real, third-party-confirmed-possible-for-similar-tools) case where the
  skill is installed but a host's own matcher never loads it unprompted.

### Changed

- **Hero + install section redesign** (#37) — primary CTA is now
  "Install now," an auto-scrolling strip of supported agents replaces the
  old Team-trial-first hero layout, and the install section gained a
  "pick your agent" client picker with a per-client command.
- **Design UI token pass** (#31, #32) — Inter for body text, 32px/10px
  button sizing, badge and switch components, applied to the main page
  and all companion pages.

### Fixed

- **Real production outage: self-hosted React/ReactDOM/Babel** (#33) — a
  CDN-blocking failure on a real visitor's network was taking the whole
  page down; vendor scripts now ship from `site/vendor/`, no third-party
  CDN single point of failure. (#24 was an earlier, narrower mitigation
  attempt superseded by this fix.)
- **Real production bug: pricing table rendered blank** (#35) — an
  HTML5 table-parsing foster-parenting bug (found via the user's own
  local `chrome-devtools-mcp` session against the live site), plus
  unparsed-template-literal warnings on the calculator's number inputs
  and missing `id`/`name`/`autocomplete` on 5 form fields.
- **2 WCAG AA contrast fixes** (#16, #22) on signal/escalate text, form
  inputs, and a companion-page link hover state.
- **Design Canvas static-parity gaps** (#30) — the no-JS fallback's demo
  log and a pricing-copy drift between the fallback and the live page.

## [0.2.1] - 2026-08-28

### Added

- **`/.well-known/security.txt`** (#12) — RFC 9116 vulnerability-disclosure
  contact, referenced from `robots.txt`.
- **Landing page: "The landscape"** — category-level positioning section
  between "vs. cap-based routers" and the benchmark tables, comparing
  compression, gateways, observability, and all-in-one platforms against
  Undercut's verified-routing mechanism on a benefit-led table. Concedes
  the rows where a narrower tool wins (compression, gateway access)
  instead of overclaiming across the board.
- **FAQPage JSON-LD expanded to all 15 FAQs** (#10) — the structured-data
  block previously mirrored only 6 of the 15 FAQ entries rendered on the
  page; crawlers reading JSON-LD now see the same FAQ content visitors do.
- **`/developers` placeholder page** (#11) — `site/developers.html`, in the
  same visual pattern as `/about`.
- **`/developers` added to `sitemap.xml`** (#12) — the placeholder page
  shipped in #11 wasn't yet discoverable via the sitemap; crawlers can now
  find it.
- **AGENTS.md** at the repo root, linked from README.md and llms.txt.
- **`/.well-known/ai-catalog.json`** and **`/.well-known/agent-skills/index.json`**
  agent-discovery catalogs, upgraded to the `ai-catalog` domain-anchored
  `urn:air:...` scheme and the `agent-skills` v0.2.0 schema (with a real
  sha256 digest of SKILL.md), plus an honest `trustManifest.identity` block
  per entry — no fabricated attestations.
- New static pages/files for crawlers: `/about.html`, `/pricing.md`,
  `/index.md` (+ `/llms.md` alias), `/sitemap.xml`, `/404.html` with
  recovery links.

### Changed

- Real `<title>`/meta description/canonical/OG/Twitter/`lang="en"` moved
  into the actual `<head>` — they were previously stuck inside an inert
  Design Canvas block in `<body>`, invisible to non-JS crawlers per strict
  HTML5 parsing.
- Extended JSON-LD: `sameAs` (broadened to the maintainer's existing
  profile links), `Offer` entries for Free/Teams with real prices, a
  WebPage/speakable block, a minimal BreadcrumbList, and the FAQPage block
  above.
- `robots.txt`: explicit allow list for answer-engine crawlers
  (OAI-SearchBot, Claude-User, Perplexity-User, Applebot-Extended, etc.),
  CCBot/Bytespider disallowed, real sitemap pointer.
- `llms.txt`: markdown link syntax, a "when to use this" section.
- `index.md`/`llms.md`/`pricing.md` now open with `---` frontmatter
  (title, description, canonical, last-updated).
- `vercel.json`: Link headers (sitemap, markdown alternate, ai-catalog)
  and correct Content-Type on the new `.md` files.
- toolname/tooldescription WebMCP attributes on the two real
  lead-capture forms (Teams waitlist, cost-audit email).
- **`type="button"` hardening on all 3 lead-capture buttons** (#12) — the
  two WebMCP-attributed lead-capture buttons plus the third pricing-card
  button (now also labeled) explicitly declare `type="button"`, preventing
  accidental form submission and giving WebMCP a consistent, unambiguous
  target across all three.

### Fixed

- Two orank agent-readiness rescan passes (29/100 -> 38/100, targeting
  Discovery/Access): the head-tag/meta fix above, plus `ai-catalog.json`
  entries corrected from `urn:ai:...` to the spec-required `urn:air:...`
  identifiers.

## [0.2.0] - 2026-08-18

Rebranded to Undercut; moved to the undercutsh org; shipped a live landing
page on getundercut.sh; added public-benchmark validation and trust
infrastructure.

### Added

- **Public benchmark validation** — GSM8K and HumanEval, fetched live from
  HuggingFace, graded against official test cases. Full tables in
  `testing/README.md`; raw results published in `testing/results/`.
- **probe policy** (shipped) — FORMAT-STRICT work starts cheap (model-agnostic)
  and caps at standard. Replaces the vendor-specific "format → standard" rule
  that round-5 cross-vendor testing showed was brittle.
- **Flagging-reliability test** — proves stock dispatchers route 100% of units
  to the correct tier despite ~90% flag accuracy. No custom flagging model
  required.
- **Landing page** — getundercut.sh (Vercel + Cloudflare DNS), canonical to
  the full domain, privacy/terms, robots/humans/llms.txt.
- **CI** — GitHub Actions runs the mock eval harness on every push/PR.
- **Trust backlog** (`testing/trust-backlog.md`) — earn-then-add roadmap for
  status page, stars, independent replication, accessibility statement.
- **GitHub hygiene** — CONTRIBUTING, issue + PR templates.

### Changed

- Repo moved from `justinwinter/tiered-dispatch` to **`undercutsh/firstpass`**;
  skill renamed to `firstpass`; install is `npx skills add undercutsh/firstpass`.
- SKILL.md: FORMAT-STRICT added as 6th rubric flag; ladder cap for
  format-strict work at standard; documented "flags steer, verification +
  escalation decide" property.
- `models.md`: replaced placeholder tier descriptions with the exact verified
  OpenRouter slugs used by the eval harness.

### Fixed

- Grader/prompt bugs in the synthetic suites (wrong transport answer key,
  under-specified semver-sort prompt, HTTP method classification) that were
  inflating failure rates and skewing every round.

## [0.1.0] - 2026-08-15

Initial public release.

### Added

- Tiered Dispatch skill (`skills/tiered-dispatch/SKILL.md`): rubric-based base
  tier assignment (cheap → standard → frontier → apex), objective escalation
  triggers (verification failure ×2, low-tier disagreement, uncertainty flags),
  hysteresis rules, residue-only escalation with a structured handoff payload,
  verification patterns, and an end-of-run calibration loop.
- Model-agnostic tier naming with `models.md` mapping tiers to concrete model
  IDs per agent (Claude Code, Codex, Cursor/other).
- README documenting the generator–verifier gap, install via skills.sh, prior
  art, and the benchmark-triggered mapping roadmap.

[unreleased]: https://github.com/undercutsh/firstpass/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/undercutsh/firstpass/releases/tag/v0.3.0
[0.2.1]: https://github.com/undercutsh/firstpass/releases/tag/v0.2.1
[0.2.0]: https://github.com/undercutsh/firstpass/releases/tag/v0.2.0
[0.1.0]: https://github.com/undercutsh/firstpass/releases/tag/v0.1.0