# Changelog

All notable changes to Undercut (firstpass) are documented here. Follows
[Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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