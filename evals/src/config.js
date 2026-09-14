// Model roster for the eval harness.
//
// Slugs verified against the OpenRouter /models endpoint on 2026-08-17.

export const VENDORS = {
  anthropic: {
    label: 'Anthropic',
    tiers: {
      cheap: 'anthropic/claude-haiku-4.5',
      standard: 'anthropic/claude-sonnet-5',
      frontier: 'anthropic/claude-opus-5',
      apex: 'anthropic/claude-fable-5',
    },
  },
  openai: {
    label: 'OpenAI',
    tiers: {
      cheap: 'openai/gpt-5-nano',
      standard: 'openai/gpt-5.6-terra',
      frontier: 'openai/gpt-5.6-sol',
      apex: 'openai/gpt-5.6-sol-pro',
    },
  },
  gemini: {
    label: 'Google (Gemini)',
    tiers: {
      cheap: 'google/gemini-3.5-flash-lite',
      standard: 'google/gemini-3.5-flash',
      frontier: 'google/gemini-3.1-pro-preview',
      apex: 'google/gemini-3.1-pro-preview',
    },
  },
  openweights: {
    label: 'Open-weight',
    tiers: {
      // Was qwen/qwen3-coder-30b-a3b-instruct. Swapped 2026-09-14 after a
      // cheap-tier isolation experiment on 90 real, mechanically-graded
      // tasks (code+mechanical+documentation, 3 seeds) found the incumbent
      // passed only 41/90 (46%) at $0.000129/pass, while poolside/laguna-
      // s-2.1 passed 80/90 (89%) at $0.000073/pass (1.77x cheaper per
      // passing task despite a higher per-run token cost). Margin 43.3pp,
      // N=90, diff-CI [0.302, 0.544] at 95% confidence — statistically
      // decisive (Newcombe interval; see evals/src/stats.js). See
      // undercutsh/internal tools/vetting-ledger.json and
      // business/daily-sweep-runbook.md.
      cheap: 'poolside/laguna-s-2.1',
      // Was deepseek/deepseek-v4-flash. Swapped 2026-09 after a standard-tier
      // isolation experiment (cheap tier held constant across both arms,
      // 15/25 tasks escalated past cheap identically in each) found
      // deepseek-v4-flash-0731 resolved only 2/15 (13%) of what reached
      // standard before escalating further, at $0.01020/task, vs.
      // glm-5.3-flash resolving 11/15 (73%) at $0.00316/task (3.2x
      // cheaper) — same 100% eventual pass rate either way. See
      // undercutsh/internal business/openrouter-live-routing-research-
      // 2026-09-12.md, Finding #6.
      standard: 'z-ai/glm-5.3-flash',
      // Was deepseek/deepseek-v4-pro. Swapped 2026-09-14 after a frontier-tier
      // isolation experiment on 21 real, mechanically-graded tasks (security +
      // reasoning suites — the categories that actually reach frontier under
      // the real ladder) found deepseek-v4-pro passed only 13/21 (62%) at
      // $0.0203/task total, while deepseek-v4.1-flash passed 20/21 (95%) at
      // $0.0040/task (5x cheaper) on the identical task set. A second
      // candidate, z-ai/glm-5.3, also beat the incumbent (17/21, $0.0145) but
      // v4.1-flash won outright on both cost and pass rate. The incumbent
      // frontier pick was mis-tiered: it scored worse than this vendor's own
      // standard-tier pick on both intelligence_index and value. See
      // undercutsh/internal business/openrouter-live-routing-research-
      // 2026-09-12.md, Open Question #4's follow-up isolation test.
      frontier: 'deepseek/deepseek-v4.1-flash',
      // Was z-ai/glm-5.2. Swapped 2026-09-14 after a maintainer-side audit
      // found the apex tier had ZERO isolation-test coverage since it was
      // first assigned during the original benchmark-ranking research --
      // the pipeline only ever tested CHALLENGERS against the incumbent,
      // never independently verified the incumbent itself. A baseline
      // measurement found glm-5.2 scoring 9/21 (43%) on security+reasoning,
      // worse than this vendor's OWN frontier tier at higher cost. A
      // follow-up isolation test (63 tasks, 3 seeds) found z-ai/glm-5.3
      // passing 53/63 (84%) vs. the incumbent's 19/63 (30%) -- margin 54pp,
      // diff-CI [0.376, 0.661], decisive at 95% confidence, 2.87x cheaper
      // per passing task. See undercutsh/internal
      // business/daily-sweep-runbook.md's "Postmortem: openweights/apex
      // shipped untested" section for the full root-cause writeup.
      apex: 'z-ai/glm-5.3',
    },
  },
};

export const TIER_ORDER = ['cheap', 'standard', 'frontier', 'apex'];

export const ARMS = {
  'all-frontier': { description: 'every unit on the frontier tier (status quo)' },
  'all-standard': { description: 'every unit on the standard tier (cheap status quo)' },
  'tiered': { description: 'tiered-dispatch skill policy with escalation' },
};

// Bumped 5 -> 10 (build-backlog-2026-08-20-round3.md §2): safe now that
// stats.js's seed-cluster bootstrap CI is wired into the report, so headline
// cost/pass-rate cells carry a confidence interval wide/narrow enough to be
// informative. Confirmed --mock runtime scales ~linearly and stays
// reasonable at 10 (full default run: ~1s; --benchmark gsm8k,humaneval: ~80s).
// Does NOT retroactively change any already-published 5-seed result — those
// stay as recorded; this only affects new runs going forward.
export const DEFAULT_SEEDS = 10;
export const MAX_TIER_RETRIES = 1; // hysteresis: max ONE retry per tier
export const MAX_ATTEMPTS_PER_UNIT = 8; // hard safety cap against runaway escalation