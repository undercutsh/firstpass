# Changelog

All notable changes to Undercut (firstpass) are documented here. Follows
[Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **5 new FAQ entries on `site/index.html`** — addressing gateway/routing-tool
  coexistence, what happens when the cheap tier is wrong, whether code leaves
  the machine, the 10-client support matrix, and the honest self-activation
  caveat. Added to both the visible FAQ accordion and the `FAQPage` JSON-LD
  block in the same commit, keeping the two in sync (the JSON-LD/visible-FAQ
  drift fixed in #10 stays fixed).
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
- **5 remaining per-client companion pages**: Windsurf/Cascade (#42),
  Amp/Sourcegraph (#44), Devin CLI/Desktop (#48), Gemini CLI (#49), and
  JetBrains AI Assistant/Junie (#50) — completing the 10-client set
  documented in `AGENTS.md`'s install matrix, each following the
  established companion-page pattern (hero, compatibility bar,
  mechanism-grounding sourced from `AGENTS.md`, install steps, shared
  how-it-works/why-it-holds-up/footer blocks) and added to
  `sitemap.xml`.
- **CI guard for `plugin.json` version drift** (#43) —
  `scripts/check-plugin-version.js`, wired into the evals workflow,
  catching drift between `.claude-plugin/plugin.json`'s `version` field
  and the package version (mirrors the existing `sync-models-md.js`
  drift guard for `models.md`).
- **Refactor eval suite** (#45) — 8 synthetic tasks (dead-code and
  unused-import detection, pure-rename-vs-behavior-change
  classification, extract-helper signature, code-smell-to-refactor
  classification), deterministic grading only, wired into `main.js`'s
  SUITES map.
- **Debug eval suite** (#46) — 10 synthetic bug-diagnosis tasks
  (root-causing past the throw site, off-by-one repair, hypothesis
  selection against repro steps, race-condition/memory-leak/regression
  classification against a fixed enum), same deterministic-grading
  pattern as `mechanical.js`.
- **Security-review eval suite** (#54) — 10 vulnerability-classification
  tasks against a fixed enum (SQL injection, XSS, path traversal,
  hardcoded secrets, insecure deserialization, missing auth check, plus
  3 "none"/safe-code tasks), graded deterministically, no LLM judge.
- **Documentation eval suite** (#55) — a new synthetic suite category,
  wired into `main.js`'s SUITES map and `evals/README.md`.
- **`/status` build-status page** (#62) — `site/status.html` shows the
  last 20 runs of the evals GitHub Actions workflow, pulled live from
  GitHub's public Actions API, with a pass/fail dot history and
  current-run badge; framed honestly as CI/build status rather than a
  service-uptime claim, with a plain-link fallback if the API is
  unreachable. Linked from the footer, added to `sitemap.xml`.
- **JSON-LD structured data validator** (#63) —
  `scripts/validate-jsonld.js`, wired into the evals CI workflow.
- **`CONTRIBUTING.md` Local development section** (#60) — documents
  running the eval harness locally (`--mock --seeds N`), the unit test
  command, the suite-authoring pattern (`mechanical.js`/`refactor.js`/
  `debug.js`), and previewing the static site locally; every documented
  command was run against the repo to confirm it works.
- **Generated RSS feed for CHANGELOG.md releases** (#64) —
  `site/changelog.xml`, built by `scripts/generate-changelog-feed.js`
  from CHANGELOG.md's dated release entries (`[Unreleased]` skipped, no
  date yet), with a `--check` CI step that fails the build if the
  committed feed drifts from CHANGELOG.md. Every page's `<head>` gets a
  matching `rel="alternate"` RSS link, plus a footer link on the
  homepage.
- **Sitemap drift checker, wired into CI** (#66) —
  `scripts/validate-sitemap.js` diffs the real pages in `site/*.html`
  against `sitemap.xml`'s `<url><loc>` entries, so a new companion page
  can't land without a sitemap entry (this exact drift caused merge
  conflicts across several of tonight's companion-page PRs).
- **Live GitHub star count in the footer** (#67) — a "★ N stars on
  GitHub" chip on `index.html` and all 10 companion pages, fetched
  client-side from GitHub's public REST API and cached in
  `sessionStorage` for an hour; fails closed to a plain "View on
  GitHub" link on any error rather than showing a stale/fake number.
- **Spellcheck pass for `site/*.html`, wired into CI** (#69) —
  `scripts/spellcheck.js`, a dependency-free Node script checking
  extracted visible text against a standard wordlist with a curated
  brand/technical-term allowlist. No copy changed — 333 raw hits, all
  false positives after fixing an entity-decoding bug and tuning the
  allowlist.

### Changed

- **HTTP security headers hardened** (#61) — `site/vercel.json` gains
  `X-Frame-Options: DENY`, `Strict-Transport-Security`, a locked-down
  `Permissions-Policy`, and an enforced (not report-only)
  `Content-Security-Policy` traced against every real resource the site
  loads (dc-runtime's `unsafe-eval`/`unsafe-inline`, Google Fonts,
  `cdn.simpleicons.org`, same-origin-only `connect-src`) — an OWASP
  Secure Headers baseline pass.
- **`lead.js` hardened** (#56) — input validation, a payload size cap,
  and no error-detail leakage on the `/api/lead` serverless function,
  plus a new `site/api/lead.test.js`.
- **README documents the plugin install path** (#59) — the Install
  section previously listed only `npx skills add` and the manual `cp -r`
  copy; now also covers the `.claude-plugin/` marketplace path already
  shipped in #41, verified in sync with `AGENTS.md`'s client matrix and
  the current CHANGELOG version.
- **Node engine pinned; dependency audit documented** (#65) —
  `evals/package.json` gets `"engines": {"node": ">=22"}` matching CI's
  Node version, a root `.nvmrc` (22) covers `scripts/*.js`; `SECURITY.md`
  documents that `evals/` has zero external npm dependencies (nothing
  for `npm audit` to check).

### Fixed

- **Design Canvas install-picker parity gap** (#47) — a follow-up audit
  (same methodology as the 0.3.0 Design Canvas audit) found the "pick
  your agent" install-client picker added since had no JS-independent
  equivalent; added the full 10-client command/note matrix to
  `#dc-fallback` and `site/index.md`.
- **Site-wide WCAG 2.1 AA audit** (#52) — first systematic full-site
  pass (previously only 2 spot-fix PRs on individual elements) across
  `index.html` and all 10 companion pages: muted-gray text/background
  mismatches between the dark- and light-panel gray variants, signal-
  green/escalate-amber text below 4.5:1 contrast in tables and form
  copy, an effectively-invisible border-colored "not applicable" em
  dash in the feature-comparison table, per-agent Copy buttons now
  `aria-label`led with the specific command each copies, decorative
  icons marked `aria-hidden="true"`, and the GitHub-star dismiss button
  bumped to the 24×24 target size.
- **`windsurf.html` copy-paste bug** (#53) — three body paragraphs and
  the Option 2 install command referenced `.devin/rules/` instead of
  `.windsurf/rules/`.
- **Stray CI-trigger comment removed** (#51) — leftover from working
  around a CI-webhook delay while merging #48; whitespace/comment-only,
  no behavior change.
- **`summarizeWithCI([])` crash** (#57) — an empty `seedGroups` array
  fed into `seedBootstrapCI` (which rejects empty input) crashed the
  whole reporting path for any suite/category/arm with zero units; now
  short-circuits to a degenerate zero-width summary for `n=0`, matching
  `wilsonInterval`'s own documented `n=0` behavior, with a regression
  test. Same PR closes missing edge-case test coverage for `tasks.js`
  (`gradeCode`/`gradeExact`/`makeTask`) and `policy.js`
  (`runUnitLadder`/`runUnitDual` hysteresis and escalation paths).
- **Canonical URL trailing-slash mismatch** (#68) — `privacy.html` and
  `terms.html` self-referenced `/privacy/` and `/terms/` with a
  trailing slash, mismatching `vercel.json`'s `cleanUrls`
  (`trailingSlash: false`) and `sitemap.xml`; audited all 17
  `site/*.html` pages' canonical/`og:url`/`twitter:url` tags, these
  were the only two mismatches.
- **Missing favicons on 6 pages** (#70) — `404`, `about`,
  `accessibility`, `developers`, `privacy`, and `terms` had no favicon
  link at all; every `site/*.html` page now links `favicon.svg` plus
  `apple-touch-icon`/`mask-icon` references for browsers without SVG
  favicon support.
- **Mobile overflow on the GSM8K/HumanEval benchmark tables** (#71) —
  unlike the site's other wide tables, they had no `overflow-x: auto`
  wrapper, so their multi-column nowrap cells forced the whole page to
  scroll horizontally below ~375px; wrapped to match the existing
  pattern.
- **`AGENTS.md` client-matrix intro/footers stale after tonight's 5
  companion pages shipped** — the intro paragraph still said only
  Claude Code/Codex/Cursor/Copilot/OpenCode had verified companion
  pages, and Gemini CLI/Windsurf/Junie/Amp/Devin's "Researched fresh"
  footers had no `Source:` line, even though `site/gemini-cli.html`,
  `site/windsurf.html`, `site/junie.html`, `site/amp.html`, and
  `site/devin.html` (added in #42, #44, #48, #49, #50) now back all 10
  entries the same way the original 5 do. Updated both to match.

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