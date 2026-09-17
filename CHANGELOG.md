# Changelog

All notable changes to Undercut (firstpass) are documented here. Follows
[Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Pricing section (`site/index.html` §13) restructured: trial-primary,
  Free demoted, CTAs inline, scannable feature lists, no more "launching
  soon".** Per the product owner's review of the live section. (1) Pro and
  Teams now read as live products: Pro's badge is "Available now", its CTA
  is "Start your Pro trial →" (still an email → `/api/lead` capture, now
  `intent: pro-trial`; sign-in details follow by email, nothing is charged
  during the trial — card-on-file vs. later is deliberately not stated,
  since it is undecided), and every "launching soon" / "reserve" / "opens
  with account sign-in" / "stretch goal" line for Pro and Teams is gone
  from the page, the JSON-LD `Offer`s (Pro and Teams `availability` →
  `InStock`), the FAQ (x-dc + JSON-LD), and the `pricing.md` / `index.md` /
  `llms.md` mirrors; Teams' SSO/audit-log line now says "Enterprise line
  items" instead of "stretch goal, not promised" (grid cells `Stretch` →
  `—`). (2) The primary row is Pro (featured) / Teams / Enterprise in equal
  columns; **Free moves to a low-key band beneath it** (`#free-plan`) with
  a ghost "Install the free skill →" button, replacing the full-height ink
  `price-hero` block that gave it more visual weight than Pro. The section
  heading is now "Start a Pro trial. From $59 a year." and the hero's
  secondary CTA points at it. (3) Each card's CTA sits in a `.price-cta`
  block pinned to the card's own bottom edge — the per-card boxed guarantee
  strip, the stacked disclaimer paragraphs under each button, and the
  bottom-of-section rate-card paragraph are removed (the guarantee line
  already lives on the billing-toggle row; the Enterprise "capabilities,
  not certifications" footnote moves inside the comparison-grid `<details>`
  it annotates; the Enterprise card's own honest note is unchanged).
  (4) Feature lists are grouped mini-sections — an eyebrow sub-head
  ("Everything in Free, plus" / "See it working" / "Account", etc.,
  echoing the comparison grid's groups) over two or three short icon-led
  labels with a muted clarifier — and each card carries one
  `<details>` "What's behind each line" holding the former long-form
  bullets, so the shape is scannable at a glance and the detail is one
  click away, not forced. Lists are real `<ul>`/`<dl>` markup; excluded
  items keep a distinct minus icon plus muted text (not color alone). The
  guarantee section's "Not a trial" line becomes "Separate from the trial";
  the FAQ's "is there a trial?" answer now says yes. A "Trial before first
  charge" row is added to the comparison grid. `privacy.html` and
  `about.html` are updated to name the trial form; `site/api/lead.js`'s
  intent comment documents `pro-trial` (with `pro-reserve` as the legacy
  value).

### Added

- **A per-page Open Graph card for every companion page.** All 45 pages
  under `site/` shared one `og-image.png`, so every link preview of the
  site looked identical no matter which of the 34 agent guides was
  shared. `scripts/build-og-images.py` now renders one 1200x630 card per
  companion page into `site/og/<slug>.png`, driven entirely off
  `site/clients.json` (the client's display name is `labels.llms`, the one
  variant that matches every companion page's own `<title>`), and each
  page's `og:image` / `twitter:image` points at its own card. Follows the
  brand kit's per-page template: dark `#1c2027` ground, the tier-ladder
  motif down the left 39%, a Fragment Mono eyebrow, "Undercut for
  <client>" in Bricolage Grotesque 500 at -0.028em, and a mono footer.
  Same `fc-list` font guard as `build-brand-rasters.py` — it warns loudly
  rather than silently rendering a fallback sans. Cards are 10–15KB each
  (401KB for all 34, against a 200KB-per-file budget), and they add
  nothing to any rendered page's weight: an OG image is fetched only by a
  crawler unfurling a link, never by a browser rendering the page. The
  non-companion utility pages (`404`, `about`, `privacy`, `terms`,
  `accessibility`, `status`, `setup`, `data`, `developers`, `brand`) and
  the home page keep the shared default on purpose.
  `scripts/validate-og-images.js --check` (new, in CI, unit-tested) holds
  the invariant, because the failure mode is a new companion page landing
  with the copy-pasted default meta still in its `<head>` — a
  wrong-but-valid OG image looks fine in every check that isn't a human
  sharing that exact link.

- **`/data` — "What we can see" public page (PRD §5.1.5f).** New
  `site/data.html` + `site/data.md` (registered as a real markdown twin in
  `middleware.ts`, same pattern as `/` and `/setup`) states plainly what
  Pro's periodic policy-file sync reveals — account ID, IP, timestamp,
  current policy version, nothing else — and draws the line between that
  (an entitlement check) and telemetry about your work. Includes a "what a
  proxy does vs. what Undercut does" comparison table, the 30-day
  raw-log / aggregate-only retention posture, and states that the default
  daily sync is a local, client-initiated check with no resident daemon —
  slow it, disable it, or run fully offline indefinitely, since nothing
  about the mechanism requires the daily default. Cross-linked from every
  existing "no telemetry" / "phone home" claim (`privacy.html`,
  `developers.html`, `index.md`, `pricing.md`, `README.md`,
  `hooks/README.md`) so the distinction is drawn from the existing claim,
  not asserted on a new page nobody finds.

- **`/setup` — public segment router (PRD §5.1.3).** New `site/segments.json`
  (public, MIT) is the single source of truth for: the editor question
  (reusing `site/clients.json`'s 34-client list, with a `segment` of `A`/
  `B`/`C`/`D`/`null`), the three provider-setup answers, the resolution
  matrix that combines both into a segment, and the four segment copy
  blocks (headline, body, OpenRouter framing, honesty caveat) — derived
  verbatim from the internal editor-provider-compatibility research.
  Segment D (Zed) carries an explicit `unverified_for_your_editor` flag
  instead of asserting OpenRouter connectivity, and any client the
  research pass didn't cover resolves to an honest "not yet researched"
  fallback rather than a guessed segment. `site/setup.html` (interactive,
  progressively enhanced — fetches `segments.json` client-side, but every
  segment's full copy is always present in the DOM so the page stays
  crawlable and complete without JS) and `site/setup.md` (the machine-
  readable twin) both render from that same file, so the two copies can't
  drift out of sync silently. Wired into `middleware.ts` (markdown content
  negotiation for `/setup`), `vercel.json` (`setup.md` content-type
  header), `sitemap.xml`, `llms.txt`/`llms.md`, and linked from
  `pricing.md`'s and `index.html`'s "value depends on your provider setup"
  copy, which previously had nowhere to send a reader for their own
  segment. `scripts/validate-client-list.js` now excludes `setup.html`
  from the companion-page check, same as `about.html`/`developers.html`.

- **Enterprise card built out on `site/index.html` §13, plus included-security
  and always-current-roster copy for Pro/Teams.** The Enterprise card now
  lists the org-plumbing line items (SAML/OIDC SSO — Okta, Microsoft Entra ID,
  custom; SCIM directory sync and HRIS integrations; advanced RBAC with
  department-level workspaces; application/admin access logs with custom
  retention and SIEM streaming; data controls — retention, redaction/masking,
  encryption, custom residency; HIPAA compliance *available* with a signed BAA;
  99.99% uptime SLA; premium support SLA with a dedicated Slack channel;
  onboarding/migration support; security questionnaires; custom invoicing and
  annual committed-use discounts) with a "Contact us" email form posting
  `intent: enterprise-contact` / `plan: enterprise` to the existing `/api/lead`
  allowlist — no price, no checkout, no new backend. Every compliance item is
  phrased as available/deliverable-per-contract; the card, grid footnote,
  FAQ, and `pricing.md` all state plainly that no certification is held. The
  Pro card, §12, the comparison grid, and a new FAQ entry gain two low-key
  lines: account security included at Pro/Teams (GitHub/social/passkey
  sign-in, MFA incl. SMS, password and session-lifetime policies, API keys /
  M2M tokens for CI, org roles on Teams — listed as table stakes, not a
  differentiator), and "every new release vetted on arrival" (frontier-lab
  and open-weight releases detected the moment they ship, swapped in only if
  they beat the roster for a tier or task category, the miss recorded too).
  The comparison grid gained an "Account & sign-in security" group. Mirrored
  in `site/pricing.md`, `site/index.md`, `site/llms.md`, the JSON-LD FAQ, and
  `site/privacy.html` (which now names the Enterprise form).

- **SOC 2 Type II "starting soon" line added to the Enterprise card,
  comparison grid, FAQ, and `pricing.md`/`index.md`/`llms.md` mirrors.**
  Distinct from the HIPAA-with-BAA line (deliverable today under
  contract): SOC 2 is not yet complete and no certification is claimed,
  but the card now invites prospects who need it on a timeline to raise
  it when they reach out, rather than staying silent on the topic.

- **"Two extra routing dimensions" illustration on `site/index.html` §12
  (`#routing-dimensions`), Pro-only, plus a matching Pro-card bullet.** A
  self-contained card below the §12 feature grid explains what Pro's
  vetting pipeline tests beyond tier — task category (on one vendor's
  ladder the cheapest tier won 6 of 7 categories on cost per completed
  task, but failed 70% of security tasks where the mid tier was cheaper
  per completed task) and reasoning effort (across a 210-run sweep,
  raising effort was a statistically confirmed win in exactly one cell —
  an open-weight model on documentation, +70 points — and a confirmed
  loss in three others, a wash everywhere else) — with a captioned
  `<table>` comparing Free (tier only) vs. Pro (tier + category + effort)
  on documentation, security, and reasoning. Written as
  testing-pipeline-derived routing recommendations delivered through the
  same policy-file mechanism as Free, not as live per-call routing:
  `evals/src/policy.js` reads `task.category` only for answer-format
  prompt notes and never reads effort, so no per-call category/effort
  routing is claimed. Carries a plain sample-size note (about ten tasks per
  cell, single seed; only the four effort deltas cleared a 95% confidence
  test) and a "Pro only" badge. The Pro card's "Effort-level routing"
  bullet became "Two extra routing dimensions, not just one" linking to
  the card. Mirrored in `site/pricing.md` (new "Routing dimensions"
  section), `site/index.md`, and `site/llms.md`. Numbers per
  `undercutsh/internal` `business/full-category-effort-matrix-2026-09-14.md`
  and `business/optimized-matrix-and-significance-2026-09-14.md`.

- **Pricing v2 on `site/index.html` (§13–§14)** — an annual/monthly billing
  toggle (annual preselected; Pro $9/mo or $59/yr, Teams $349/mo or
  $2,988/yr), a dedicated **money-back guarantee** section (`#guarantee`:
  no questions asked, 30 days on monthly, days 90–120 on annual, with the
  fairness rationale stated in plain copy), a `#math` block that finally
  backs the `#math` anchor `pricing.md` had been linking to, and a
  **Teams onboarding flow** (`#teams-signup`): three-field intake (company
  email, team-size bucket, multi-select LLM-provider setup) → pick one of the
  founder's published windows → an honest "founder is backlogged, this is a
  request he confirms by email" confirmation. Windows come only from the
  new `site/teams-availability.json`, which ships empty on purpose so the
  page can never show a slot the founder didn't publish. `/api/lead`
  gained a strict allowlist for the new intake fields (`intent`, `plan`,
  `billing`, `teamSize`, `providers`, `slot`) with tests. Numbers and terms
  per `undercutsh/internal` `business/pricing-v2-decisions-2026-09-14.md`.

### Changed

- **Teams is positioned as live and founder-onboarded, not "coming soon"**,
  and restructured from "$29/seat/mo" to "$349/mo, includes 12 seats,
  +$29/mo per additional seat" (a deliberate 12-seat floor). Pro's
  "illustrative, TBD" hedging is gone in favor of the launch rate card
  and a "launching soon with account sign-in" status; tier cards now show
  what Free lacks (muted rows) alongside what it includes, and the
  feature-by-feature grid is grouped and collapsed behind a disclosure.
  The Pro card and FAQ now carry the provider-setup honesty note (a Claude
  subscription alone routes within Anthropic's tiers; an OpenRouter key
  opens cross-vendor savings). Mirrored in `site/pricing.md`,
  `site/index.md`, `site/llms.md`, and the JSON-LD offers/FAQ.

- **Undercut Hooks (`hooks/`), shipped, opt-in** — a local Claude Code hooks
  package that (1) force-injects the condensed rubric every session instead
  of relying on skill-matcher self-activation, and (2) prints a session-end
  receipt plus an at-most-once-a-day digest, using real local token/cost
  data (never a guess) with any savings figure explicitly labeled an
  estimate. No network calls, no telemetry, nothing leaves the machine —
  architecturally separate from the core skill, so the free skill's
  zero-infrastructure promise holds whether or not this is installed.
  Previously sat as an unmerged draft PR labeled "experimental/dogfooding";
  now merged to `main` and referenced from `README.md`, `site/index.html`,
  `site/index.md`, and `site/llms.txt`. Two real bugs (a model-ID
  normalization gap and an escalated-count inversion in the savings math)
  were found and fixed during dogfooding before this went out — see
  `undercutsh/internal` `business/undercut-hooks-design-2026-09-07.md`.
- **`gradeJudge()` in `evals/src/tasks.js`** — a hardened, reusable judge-based
  grader for `unverifiable: true` tasks, joining the existing mechanical
  graders (`gradeCode`, `gradeExact`, `gradeJsonSubset`). Closes Open
  Question #1 from the live-routing research (Finding #8): a malformed or
  truncated judge response now retries the JUDGE call (never the worker),
  and reports `judgeFailure: true` distinctly from a real graded failure
  when the judge never produces a valid verdict — so a judge-plumbing bug
  can't silently masquerade as an escalation-worthy worker failure the way
  it did in the original pilot. 6 new unit tests.

### Changed

- **Open-weight cheap tier: `qwen/qwen3-coder-30b-a3b-instruct` → `poolside/laguna-s-2.1`**
  (`evals/src/config.js`, regenerated into `skills/firstpass/models.md`).
  A cheap-tier isolation test on 90 real, mechanically-graded tasks (code +
  mechanical + documentation, 3 seeds) found the prior pick passed only
  41/90 (46%) at $0.000129/pass, vs. 80/90 (89%) at $0.000073/pass (1.77x
  cheaper per passing task despite a higher per-run token cost) for the
  new pick. Margin 43.3pp, N=90, statistically significant at 95%
  confidence (Newcombe diff-interval; see `evals/src/stats.js`). See
  `undercutsh/internal` `tools/vetting-ledger.json`.
- **Open-weight apex tier: `z-ai/glm-5.2` → `z-ai/glm-5.3`**
  (`evals/src/config.js`, regenerated into `skills/firstpass/models.md`).
  A maintainer-side audit found the apex tier had zero isolation-test
  coverage since it was first assigned during the original
  benchmark-ranking research — the vetting pipeline only ever tested
  challengers against the incumbent, never independently verified the
  incumbent itself. A baseline measurement found the prior pick scoring
  9/21 (43%) on security+reasoning, worse than this vendor's own
  frontier tier at higher cost. A follow-up isolation test (63 tasks, 3
  seeds) found the new pick passing 53/63 (84%) vs. the prior pick's
  19/63 (30%) — margin 54pp, statistically significant at 95%
  confidence, 2.87x cheaper per passing task. See `undercutsh/internal`
  `business/daily-sweep-runbook.md`'s "Postmortem: openweights/apex
  shipped untested" section.
- **Open-weight frontier tier: `deepseek/deepseek-v4-pro` → `deepseek/deepseek-v4.1-flash`**
  (`evals/src/config.js`, regenerated into `skills/firstpass/models.md`).
  An isolation test on 21 real, mechanically-graded tasks (security +
  reasoning suites — the categories that actually reach frontier under the
  real ladder) found the prior pick passed only 13/21 (62%) at
  $0.0203/task, vs. 20/21 (95%) at $0.0040/task (5x cheaper) for the new
  pick on the identical task set. The prior frontier pick scored worse on
  both correctness and cost-efficiency than this vendor's own
  standard-tier pick — the tier meant to hold *more* capability was
  holding less. See `undercutsh/internal`
  `business/openrouter-live-routing-research-2026-09-12.md`, Open
  Question #4's follow-up isolation test.
- **Open-weight standard tier: `deepseek/deepseek-v4-flash` → `z-ai/glm-5.3-flash`**
  (`evals/src/config.js`, regenerated into `skills/firstpass/models.md`).
  Integrates the live-routing research's strongest result: a standard-tier
  isolation test (cheap tier held constant, 15/25 tasks escalated past cheap
  identically in both arms) found the prior pick resolved only 13% of what
  reached standard before escalating further, vs. 73% for the new pick, at
  3.2x lower cost and the same 100% eventual pass rate. See
  `undercutsh/internal` `business/openrouter-live-routing-research-
  2026-09-12.md`, Finding #6.
- **Numeric consistency pass on the judgment/execution split**
  (`site/index.html`, `README.md`, `site/index.md`): the "what this
  optimizes" worked example used an illustrative, rounded "70%" execution-
  reduction figure sitting a few sections away from the site's real,
  measured "up to −71%" headline (GSM8K/OpenAI) — two numbers close enough
  to read as inconsistent without being the same claim. Now the worked
  example cites and links directly to the measured −71% figure instead of
  a separate rounded number (blended result: ~36%, not ~35%), and "The
  proof" section links forward to the scoping section so the two read as
  one claim, not two.

### Added

- **New "What this optimizes" section** (`site/index.html` §08, plus
  matching content in `README.md`, `skills/firstpass/SKILL.md`,
  `site/index.md`, and `site/llms.txt`) making explicit what was previously
  only an implicit "planning tier vs. execution tier" split: a single
  request often mixes judgment work (planning, ambiguous tradeoffs) with
  verifiable execution work, and the rubric's measured savings apply only
  to the latter. Includes a worked example (a 50/50 judgment/execution
  token split with a 70% reduction on the execution half blends to ~35%
  overall, not 70%) and a "stop doing this / do this instead" illustration
  contrasting one frontier model handling 100% of a build request against
  tiered dispatch delegating the execution slice down the ladder.
  Renumbers site sections §08–§15 to §09–§16 accordingly.
- **Delegation-tree illustration** (`assets/readme/delegation-diagram.svg`,
  embedded in `README.md` and inlined as SVG in `site/index.html` §08,
  matching the dark diagram treatment already used in §07): an org-chart
  contrast of one frontier model handling every unit of a request (7/7 at
  frontier) against the frontier model keeping only the judgment call and
  delegating execution through Undercut's dispatch (1/7 at frontier, cheap
  by default, escalated only on evidence). Replaces the flat task-list card
  comparison §08 shipped with initially — same point, now illustrated
  rather than tabulated, and the earlier version's implicit "1 of 9 equal
  units" framing (which understated judgment's real ~50% token share) is
  gone in favor of a two-group split that matches the section's own math.

### Fixed

- **HumanEval tasks were told to answer in JavaScript.** `evals/src/benchmarks.js`'s
  `loadHumanEval()` tagged its (Python) tasks with `category: 'code'` — the
  same category the harness's own synthetic JS suite
  (`evals/src/suites/code.js`) uses. `policy.js`'s worker-prompt builder reads
  that category to append a mandatory "ANSWER FORMAT: raw JavaScript function
  source" instruction, directly contradicting each HumanEval task's own
  prompt ("Complete the following Python function..."). Found via an
  OpenRouter-`/benchmarks`-driven routing experiment where cheaper models'
  HumanEval failures traced back to this exact contradiction. Fixed by
  giving HumanEval its own `category: 'humaneval'` and adding the correct
  Python-format instruction for it (mirroring the existing `mbpp` case) —
  no change to `code`/`mbpp` behavior. `node --test` (155/155) and
  `node src/main.js --mock` both clean post-fix.

- **All 41 non-homepage `site/*.html` pages rebranded to the "instrument
  paper" visual system** shipped on `site/index.html`: Bricolage
  Grotesque/Fragment Mono replace JetBrains Mono/Inter (headings move to
  Bricolage, everything measured/labeled stays mono), the old
  marketing-green/mixed-gray palette is remapped one-for-one onto the
  current tokens (paper/ink/deep/rule/mute/cheap-teal/frontier-amber), and
  the nav/footer wordmark gets the same SVG logomark used on the homepage.
  Copy, links, and layout structure are unchanged — visual tokens only.
  Applied mechanically via a scripted find/replace over the exact
  old-token set (colors, font-family strings, the two shared logo-text
  snippets), verified with a before/after screenshot and the full
  validator suite. Fixes a spellcheck false-negative gap: `Menlo` is now
  allowlisted alongside the other design-system font names.

### Added

- **README rebrand** — new logo lockup, badges, and three inline SVG
  illustrations (`assets/readme/`) matching the site's "instrument paper"
  visual system: the escalation ladder, a routing-narration terminal
  example, and a cost-savings chart for the GSM8K/HumanEval results. Plugin
  `brandColor` updated from the old marketing green (`#2E9E5B`) to the
  current palette's cheap-tier teal (`#00959C`) to match.

- **`theme-color` meta tag on all 18 `site/*.html` pages** — colors the
  mobile browser chrome/status bar to match the site's dark panel
  background (`#15171c`, the existing dark-section color used
  site-wide) instead of leaving it default white/gray. Pure visual
  polish, not a PWA signal — no `manifest.json` or
  `apple-mobile-web-app-*` tags added; the site has none of those
  anywhere and stays that way.
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
- **CI reordered to fail-fast on cheap checks** (#79) —
  `.github/workflows/evals.yml` now runs the six sub-100ms static
  checks (plugin/CHANGELOG version sync, sitemap, JSON-LD, changelog
  feed, spellcheck, models.md sync) before the three heavier eval-
  harness steps, so a doc/content-only mistake fails in well under a
  second instead of waiting on the harness first.
- **`privacy.html` discloses client-side GitHub API calls and the
  lead-form data flow** (#89) — the footer star-count chip and
  `/status` make unauthenticated `GET`s to `api.github.com` from the
  visitor's browser, and the audit-calculator/Teams-waitlist forms send
  an email address to `/api/lead`; neither flow was previously
  disclosed, despite the page's "nothing tracking you" claim.
- **Google Fonts CSS switched to async-load on 16 pages** (#92) — the
  render-blocking `<link rel="stylesheet">` for Google Fonts now uses
  the preload + `media="print"` onload-swap pattern with a `<noscript>`
  fallback, on every static/companion page except `site/index.html`
  (excluded due to concurrent-edit contention on its `<head>`).
- **Google Fonts CSS async-load extended to `site/index.html`** (#93) —
  follow-up to #92 applying the identical preload/onload-swap pattern
  to the one page it deliberately excluded, now that edit contention
  had resolved.

### Fixed

- **Homepage rendered an HTML comment and the hidden CDN-failure panel
  above the real page** — `site/index.html`'s source comment describing
  `#dc-fallback` mentioned the page template's tag literally, in angle
  brackets. `support.js` re-fetches the page source after boot and finds
  the template by regex (first x-dc opening tag in the raw text, comments
  not skipped), so it re-rendered the root starting from inside that
  comment: visitors saw the tail of the comment as body text, then the
  "script didn't load" fallback panel, then the actual page. Reworded the
  three comments that spelled the tag out, and added a `validate-dc-drift`
  CI check (with unit tests) that fails on any x-dc opening tag inside an
  HTML comment so it can't ship again.
- **`site/.well-known/ai-catalog.json` two stale/inaccurate claims** —
  a content-accuracy pass (prior audit only checked well-formedness)
  found the `notes` field still said "no ... agentic plugin exists
  yet," which stopped being true once the Claude Code plugin
  distribution shipped (`.claude-plugin/`, documented in `README.md`'s
  Install section); reworded to match README's "no API/MCP server yet"
  framing and mention the plugin install path. Also fixed a trust
  attestation claiming benchmark methodology is public "at /testing" —
  no such route exists on the live site (every other page links the
  GitHub path `github.com/undercutsh/firstpass/tree/main/testing`
  instead); corrected to the real URL. `llms.txt` and `README.md` were
  cross-checked and found already accurate.
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
  companion pages shipped** (#83) — the intro paragraph still said only
  Claude Code/Codex/Cursor/Copilot/OpenCode had verified companion
  pages, and Gemini CLI/Windsurf/Junie/Amp/Devin's "Researched fresh"
  footers had no `Source:` line, even though `site/gemini-cli.html`,
  `site/windsurf.html`, `site/junie.html`, `site/amp.html`, and
  `site/devin.html` (added in #42, #44, #48, #49, #50) now back all 10
  entries the same way the original 5 do. Updated both to match.
- **`skills/firstpass/SKILL.md` YAML frontmatter parse failure** (#76) —
  an unescaped `: ` in the `description` field broke `npx skills add
  undercutsh/firstpass` end-to-end with a YAML scanner error; fixed by
  single-quoting the scalar, reproduced and re-verified the install
  path before and after.
- **`evals/README.md` terse `Flags:` summary missing 6 flags** (#77) —
  `--flagtest`, `--dispatcher`, `--benchmark`, `--mock`, `--verify-only`,
  and `--smoke` were documented only in usage examples; also corrected
  `--policy v1|latest` to `v1|latest|probe` to match the Policy versions
  table below it.
- **Static-mirror drift in `llms.txt`/`index.md`** (#78) — the 10
  client companion pages, `/status`, and `changelog.xml` were never
  linked from the crawler-facing markdown mirrors, only from the live
  HTML footer/install picker; added to both files.
- **Floating GitHub-star CTA had no Escape-to-dismiss** (#80) — a
  keyboard-nav audit of `index.html`'s interactive elements found the
  dismissible star CTA's × close button was keyboard-reachable but
  Escape did nothing; added an Escape listener, attached only while the
  CTA is visible.
- **Manual-copy skill install commands failed on a fresh checkout**
  (#81) — `cp -r firstpass/skills/firstpass ./.<client>/skills/firstpass`
  doesn't create missing parent directories; reproduced the failure for
  real, then fixed with an `mkdir -p <parent> &&` prefix in `AGENTS.md`
  (8 occurrences) and 7 companion pages (visible command + `data-copy`
  attribute).
- **Nav/footer link drift across companion + status pages** (#82) — the
  Accessibility, Status, and changelog.xml footer links added by #61,
  #62, and #64 only ever landed on `index.html`; `site/status.html`'s
  footer was also never built from the shared boilerplate at all
  (shipped as a 3-link stub). Brought all 11 non-home pages' footers to
  parity with `index.html`.
- **`gemini-cli.html` GEMINI.md discovery mechanism described
  inaccurately** (#84) — corrected to the real 3-tier hierarchy (global
  config, workspace-directory `GEMINI.md` files, just-in-time ancestor
  scan on file access), verified against Gemini CLI's own docs.
- **`site/index.html`/`index.md` install-picker had the same `cp -r`
  parent-dir bug as #81** (#85) — affected Cursor, JetBrains Junie,
  Amp, Devin, and the Codex CLI manual-copy note (list items and the
  `INSTALL_CLIENTS` JS array's `cmd`/`note` fields); fixed with the
  same `mkdir -p` prefix and re-verified each command end-to-end.
- **Stray design-token color drift** (#86) — `index.html`'s
  competitor-comparison table header used `#217443` for "signal-green"
  text where the other 56 occurrences across 13 pages use `#227644`;
  standardized to the canonical value.
- **Honest-limits caveats verified against current vendor docs** (#87)
  — `windsurf.html` was updated to reflect Cascade's own `.windsurf/`
  and `.codeium/` skill paths, `gemini-cli.html` now documents
  auto-discovered `.gemini/skills/` with no extension package required,
  and `devin.html`'s auto-read rules-file list was corrected against
  Devin's actual docs (`CLAUDE.md`, `.windsurfrules`,
  `.cursor/rules/*.md`, `.windsurf/rules/*.md`, `.claude/`).
- **GitHub stars-chip fetch had no request timeout** (#88) — unlike
  `/status`'s Actions-API fetch, the footer star-count chip on
  `index.html` and 11 companion/status pages had no `AbortController`;
  brought in line with the existing 8s-timeout pattern, falling back to
  a plain "View on GitHub" link on abort.
- **Two more path bugs found in a full-page re-audit** (#91) — a prior
  fix (#53) had incorrectly replaced `.devin/rules/` with
  `.windsurf/rules/` on `windsurf.html`; restored `.devin/rules/*.md` as
  primary per Devin Desktop's post-rebrand docs, with `.windsurf/`
  kept as a fallback. `gemini-cli.html`'s Install Option 1 wrote to
  `.gemini/GEMINI.md`, which Gemini CLI never reads for project-level
  config (`.gemini/` is global-only); fixed to append to root
  `GEMINI.md`, matching the page's own mechanism prose.

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