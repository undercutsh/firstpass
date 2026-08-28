# Changelog

All notable changes to Undercut (firstpass) are documented here. Follows
[Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

[unreleased]: https://github.com/undercutsh/firstpass/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/undercutsh/firstpass/releases/tag/v0.2.0
[0.1.0]: https://github.com/undercutsh/firstpass/releases/tag/v0.1.0