// Self-activation measurement harness.
//
// Every number elsewhere in evals/ answers "when the tiered-dispatch policy
// runs, does it help?" This file answers a different, prior question: "does
// a real coding agent's own skill-matcher ever load skills/firstpass/SKILL.md
// on its own, with nobody telling it to?" See business/roadmap.md's Trust &
// rigor section and testing/README.md caveat #6 for why this matters — a
// third-party audit (JetBrains AI Blog, 2026-07) found a structurally
// identical plain-SKILL.md-no-hook product self-activated zero times across
// ten installed-but-unmentioned sessions.
//
// WHY THIS CANNOT BE A DETERMINISTIC GRADER (unlike suites/*.js): whether a
// skill's description-matcher fires is a property of the live host agent
// (Claude Code, Codex, Cursor, ...) reading SKILL.md's frontmatter and
// deciding to load it — that decision happens inside a real, paid, agentic
// session this harness cannot spawn or observe. So this module does NOT
// score anything by itself. It:
//
//   1. Defines the task set and the two conditions (buildPrompt / TASKS).
//   2. Scaffolds a results file with every trial slot pre-populated as
//      "pending" (scaffoldResults) — nothing here is ever pre-filled with a
//      guessed or fabricated activation outcome.
//   3. Once a human (or a live-agent operator) has actually run the trials
//      and recorded real yes/no observations into that file, computes the
//      self-activation rate with Wilson confidence intervals
//      (summarizeSelfActivation), reusing the same statistic main.js already
//      uses for pass rates.
//
// TWO REPORTING HAZARDS THIS MODULE IS BUILT TO MAKE IMPOSSIBLE, NOT MERELY
// DISCOURAGED:
//
//   (a) INSTALL SHAPE. This repo ships two install shapes, and one of them
//       has a self-activation rate of ~100% *by construction*:
//       hooks/session-start.js force-injects a condensed rubric via
//       SessionStart `additionalContext`, so the rubric is in context whether
//       or not the host's matcher ever looked at SKILL.md. (hooks/README.md
//       is clear that hooks are opt-in and not part of the shipped skill —
//       that answers the product question, but it does nothing about the
//       reporting hazard: a percentage published without saying which shape
//       produced it would flatter us.) So every trial carries `installShape`
//       (INSTALL_SHAPES), and summarizeSelfActivation partitions on it. There
//       is no field anywhere in its output that blends shapes, because a
//       blended field cannot be misread if it does not exist.
//
//   (b) DENOMINATOR. The rate is only defined for hosts that *discover*
//       skills by matching SKILL.md's `description:` (HOST_KINDS
//       'skill-discovering'). For instruction-file hosts — GitHub Copilot,
//       Gemini CLI, the generic root-AGENTS.md path — the documented install
//       appends the policy to a file the host loads unconditionally. There is
//       no matcher, so there is no decision to observe: the "rate" is neither
//       0% nor 100%, it is undefined. Those hosts are reported as
//       notApplicable, never scored, and never folded into anyone else's
//       denominator. The denominator is *skill-discovering hosts, per host* —
//       a single blended cross-client percentage would be a fabrication
//       dressed as a mean, so no code path here can emit one.
//
// Consequence of (a)+(b): summarizeSelfActivation returns a LIST OF STRATA,
// one per (host × installShape), and no cross-stratum aggregate. Trials
// missing either label are `unlabeled` and — exactly like `activated: null`
// — excluded from every numerator and every denominator. Nothing in this
// file ever supplies a default host, install shape, or activation outcome.
//
// See evals/self-activation/README.md for the full protocol.

import { wilsonInterval } from './stats.js';

export const SKILL_ID = 'firstpass';

// Verbatim from skills/firstpass/SKILL.md's `description:` frontmatter
// (quoted trigger list at the end of the field). Keep this in sync with that
// file — a mismatch here silently invalidates the "trigger" task category.
export const TRIGGER_PHRASES = [
  'fan out',
  'swarm',
  'parallel agents',
  'which model',
  'assign tiers',
  'dispatch',
  'model routing',
  'token cost',
];

// Condition B's explicit nudge. Deliberately names the skill by concept, not
// by exact invocation syntax, since that syntax differs across hosts (Claude
// Code, Codex, Cursor, ...) — the point is "an explicit instruction a
// reasonable user would actually type," not a magic incantation.
export const EXPLICIT_INSTRUCTION =
  'Use your routing skill (the tiered-dispatch / firstpass skill) to handle this.';

// ---------------------------------------------------------------------------
// Install shape — the environment property that decides whether the question
// is even being asked. Declared as a closed map (same instinct as
// TRIGGER_PHRASES: one authoritative list, validated against, never inferred).
// ---------------------------------------------------------------------------

/**
 * @typedef {'skill-only'|'skill-plus-hook'} InstallShape
 */

export const INSTALL_SHAPES = Object.freeze({
  'skill-only': Object.freeze({
    label: 'skill only (as shipped)',
    // The shape the headline number is about: SKILL.md present via the host's
    // normal install path, nothing registered that puts the rubric in context
    // on its own. Activation here is a real matcher decision.
    detail:
      "skills/firstpass/SKILL.md installed via the host's normal path; no SessionStart hook registered, nothing force-injected. Activation is the host matcher's own decision.",
    forcedInjection: false,
  }),
  'skill-plus-hook': Object.freeze({
    label: 'skill + hooks/ installed',
    // hooks/session-start.js writes RUBRIC_CONTEXT into every session via
    // hookSpecificOutput.additionalContext. The rubric is therefore in
    // context unconditionally, so a "self-activation rate" measured in this
    // shape is ~100% by construction and measures the hook, not the matcher.
    detail:
      'hooks/ registered in settings.json, so hooks/session-start.js force-injects the condensed rubric via SessionStart additionalContext. The rubric is in context unconditionally; any rate measured here is a property of the hook, not of the description-matcher.',
    forcedInjection: true,
  }),
});

/** @returns {InstallShape[]} */
export function installShapeIds() {
  return Object.keys(INSTALL_SHAPES);
}

// ---------------------------------------------------------------------------
// Hosts and host kinds — the denominator.
// ---------------------------------------------------------------------------

export const HOST_KINDS = Object.freeze({
  'skill-discovering': Object.freeze({
    label: 'skill-discovering',
    scorable: true,
    why: "host reads SKILL.md's description: frontmatter and decides, per session, whether to load the skill — there is an actual decision to observe.",
  }),
  'instruction-file': Object.freeze({
    label: 'instruction-file',
    scorable: false,
    why: 'documented install appends the policy to an instruction file the host loads unconditionally (copilot-instructions.md / GEMINI.md / root AGENTS.md). There is no matcher and no per-session decision, so a self-activation rate is undefined here — not 0%, not 100%, undefined.',
  }),
});

/**
 * Every host in site/index.html's INSTALL_CLIENTS, classified by whether a
 * self-activation rate is defined for it at all. Keep the ids in sync with
 * that list (and with README.md/AGENTS.md's client table, which
 * scripts/validate-client-list.js guards) — an id missing here is rejected
 * rather than silently scored.
 * @type {Readonly<Record<string, {label: string, kind: keyof typeof HOST_KINDS, note: string}>>}
 */
export const HOSTS = Object.freeze({
  'claude-code': { label: 'Claude Code', kind: 'skill-discovering', note: 'plugin/marketplace or .claude/skills/' },
  codex: { label: 'Codex CLI', kind: 'skill-discovering', note: '.agents/skills/' },
  cursor: { label: 'Cursor', kind: 'skill-discovering', note: '.cursor/skills/' },
  opencode: { label: 'OpenCode', kind: 'skill-discovering', note: '.opencode/skills/' },
  junie: { label: 'JetBrains Junie', kind: 'skill-discovering', note: '.junie/skills/' },
  amp: { label: 'Amp', kind: 'skill-discovering', note: '.agents/skills/' },
  devin: { label: 'Devin', kind: 'skill-discovering', note: '.devin/skills/' },
  copilot: { label: 'GitHub Copilot', kind: 'instruction-file', note: 'appends to .github/copilot-instructions.md' },
  gemini: { label: 'Gemini CLI', kind: 'instruction-file', note: 'appends to .gemini/GEMINI.md' },
  windsurf: { label: 'Windsurf / generic AGENTS.md', kind: 'instruction-file', note: 'appends to root AGENTS.md' },
});

/** Host ids for which a self-activation rate is defined at all. */
export function scorableHostIds() {
  return Object.keys(HOSTS).filter((id) => HOST_KINDS[HOSTS[id].kind].scorable);
}

/** @returns {keyof typeof HOST_KINDS} throws on an unknown host id. */
export function hostKindOf(hostId) {
  const host = HOSTS[hostId];
  if (!host) {
    throw new Error(
      `unknown host "${hostId}" — must be one of: ${Object.keys(HOSTS).join(', ')} (see HOSTS in evals/src/selfactivation.js)`
    );
  }
  return host.kind;
}

/**
 * @typedef {Object} SelfActivationTask
 * @property {string} id
 * @property {'trigger'|'control'} category  'trigger': prompt naturally uses
 *   one or more of TRIGGER_PHRASES. 'control': plausible, sometimes
 *   agent-orchestration-adjacent work that does NOT use any of them — the
 *   counterfactual for whether the description match (vs. the task's general
 *   shape) is what would drive activation.
 * @property {string[]} phrasesUsed  which TRIGGER_PHRASES appear verbatim in
 *   `prompt` (empty for 'control').
 * @property {string} prompt  condition-A task text, verbatim, no mention of
 *   the skill.
 */

/** @type {SelfActivationTask[]} */
export const TASKS = [
  // --- trigger: naturally uses the description's own trigger phrases ---
  {
    id: 'trigger-fanout-lint',
    category: 'trigger',
    phrasesUsed: ['fan out', 'swarm', 'parallel agents'],
    prompt:
      "I need to fan out this repo's ~40 lint-error fixes to a swarm of parallel agents. Set it up.",
  },
  {
    id: 'trigger-which-model',
    category: 'trigger',
    phrasesUsed: ['which model'],
    prompt:
      'I have 15 PR-description-writing tasks queued up. Which model should handle each one before we kick them off?',
  },
  {
    id: 'trigger-dispatch-bugfixes',
    category: 'trigger',
    phrasesUsed: ['dispatch'],
    prompt:
      "We're about to dispatch six independent bugfix tickets to sub-agents. Get them assigned and started.",
  },
  {
    id: 'trigger-assign-tiers-review',
    category: 'trigger',
    phrasesUsed: ['assign tiers'],
    prompt:
      'Help me assign tiers to this backlog of 20 code-review tasks before we run them.',
  },
  {
    id: 'trigger-token-cost-routing',
    category: 'trigger',
    phrasesUsed: ['model routing', 'token cost'],
    prompt:
      "Our OpenRouter bill is way too high this month. Figure out where our model routing is wasting token cost across the agent pipeline.",
  },
  {
    id: 'trigger-swarm-migration',
    category: 'trigger',
    phrasesUsed: ['swarm'],
    prompt:
      'This migration breaks down into ~30 independent file-rewrite units. Plan how to farm these out across a swarm of agents efficiently.',
  },
  // --- control: plausible work, no trigger phrase overlap ---
  {
    id: 'control-fix-failing-test',
    category: 'control',
    phrasesUsed: [],
    prompt: 'Please fix the failing test in evals/src/runner.test.js.',
  },
  {
    id: 'control-summarize-commits',
    category: 'control',
    phrasesUsed: [],
    prompt: 'Write a summary of what changed in the last 5 commits to this repo.',
  },
  {
    id: 'control-fix-typos',
    category: 'control',
    phrasesUsed: [],
    prompt: 'There are a dozen typos scattered through site/about.html. Go through and fix them.',
  },
  {
    id: 'control-review-pr-diff',
    category: 'control',
    phrasesUsed: [],
    prompt: 'Review this pull request diff and leave comments on anything risky.',
  },
  {
    id: 'control-triage-tickets',
    category: 'control',
    // Deliberate near-miss: delegating work to PEOPLE, not models, with none
    // of the exact trigger phrases — the interesting question is whether the
    // shape of "distribute N units of work" alone is enough, absent the
    // literal phrases the description matches on.
    phrasesUsed: [],
    prompt:
      'We have 25 customer support tickets to triage today. Go through them and figure out who on the team should work each one.',
  },
  {
    id: 'control-ci-workflow',
    category: 'control',
    phrasesUsed: [],
    prompt: 'Set up a GitHub Actions workflow that runs our test suite on every PR.',
  },
];

/** Build the exact prompt text for one task under one condition. */
export function buildPrompt(task, condition) {
  if (condition !== 'A' && condition !== 'B') {
    throw new Error(`buildPrompt: condition must be 'A' or 'B', got ${condition}`);
  }
  return condition === 'A' ? task.prompt : `${task.prompt}\n\n${EXPLICIT_INSTRUCTION}`;
}

/**
 * @typedef {Object} SelfActivationTrial
 * @property {string} taskId
 * @property {'trigger'|'control'} category
 * @property {'A'|'B'} condition
 * @property {number} trial
 * @property {string} prompt
 * @property {string|null} host  a HOSTS id. Required to score; `null` means
 *   unlabeled, which is excluded from every rate (see summarizeSelfActivation).
 * @property {InstallShape|null} installShape  an INSTALL_SHAPES id. Required
 *   to score; `null` is unlabeled and likewise excluded. A rate whose install
 *   shape is unknown is not a rate — hooks/session-start.js force-injects the
 *   rubric, so 'skill-plus-hook' is ~100% by construction.
 * @property {boolean|null} activated  true/false only from an observed
 *   transcript; `null` = pending. Never defaulted.
 * @property {string} evidence
 */

/**
 * Build an empty results scaffold: every task × condition × trial slot,
 * `activated: null` (pending — never a guessed true/false). `host` and
 * `installShape` are stamped on every trial when supplied and validated
 * against HOSTS / INSTALL_SHAPES; left out, they are stamped `null`, which is
 * unscorable in exactly the way `activated: null` is — an unlabeled trial can
 * never end up inside a number. A human or live-agent operator fills these in
 * per evals/self-activation/README.md, then feeds the file to
 * summarizeSelfActivation / printSelfActivationReport.
 */
export function scaffoldResults({ n = 10, host = null, installShape = null } = {}) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`scaffoldResults: n must be a positive integer, got ${n}`);
  if (host !== null) {
    const kind = hostKindOf(host); // throws on an unknown id
    if (!HOST_KINDS[kind].scorable) {
      throw new Error(
        `scaffoldResults: host "${host}" is an ${kind} host — ${HOST_KINDS[kind].why} Scaffolding a results file for it would invite a number that cannot exist. Scorable hosts: ${scorableHostIds().join(', ')}.`
      );
    }
  }
  if (installShape !== null && !Object.hasOwn(INSTALL_SHAPES, installShape)) {
    throw new Error(
      `scaffoldResults: unknown installShape "${installShape}" — must be one of: ${installShapeIds().join(', ')}`
    );
  }
  const trials = [];
  for (const task of TASKS) {
    for (const condition of ['A', 'B']) {
      for (let trial = 1; trial <= n; trial++) {
        trials.push({
          taskId: task.id,
          category: task.category,
          condition,
          trial,
          prompt: buildPrompt(task, condition),
          host, // a HOSTS id; null = unlabeled = excluded from every rate
          installShape, // an INSTALL_SHAPES id; null = unlabeled = excluded
          activated: null, // fill with true/false after running it for real
          evidence: '', // e.g. "Skill tool invoked: firstpass" or "no skill invocation in transcript"
        });
      }
    }
  }
  return {
    meta: {
      skill: SKILL_ID,
      n,
      host,
      hostKind: host === null ? null : hostKindOf(host),
      installShape,
      tasks: TASKS.length,
      generated: new Date().toISOString(),
      note:
        'Scaffold only — every trial starts pending (activated: null). Run each prompt in a FRESH live agent session per evals/self-activation/README.md, then set activated to true/false and fill evidence before reporting. Every trial must also carry the host it ran on and the install shape it ran under (skill-only vs skill-plus-hook); trials missing either are excluded from all rates, because a rate whose install shape is unknown is not a rate.',
    },
    trials,
  };
}

/** Validate a results file's shape without requiring trials to be complete. */
export function validateResults(data) {
  if (!data || typeof data !== 'object') throw new Error('results: not an object');
  if (!Array.isArray(data.trials)) throw new Error('results: missing trials array');
  const taskIds = new Set(TASKS.map((t) => t.id));
  for (const [i, t] of data.trials.entries()) {
    if (!taskIds.has(t.taskId)) throw new Error(`results: trial ${i} has unknown taskId ${t.taskId}`);
    if (t.condition !== 'A' && t.condition !== 'B') throw new Error(`results: trial ${i} has invalid condition ${t.condition}`);
    if (t.activated !== null && typeof t.activated !== 'boolean') {
      throw new Error(`results: trial ${i} (${t.taskId}/${t.condition}) activated must be true, false, or null (pending) — got ${JSON.stringify(t.activated)}`);
    }
    // host / installShape: absent-or-null is allowed (unlabeled, and
    // therefore unscorable), but a *present* value has to be a real id. A
    // typo'd host would otherwise become its own silent stratum.
    if (t.host !== undefined && t.host !== null && !Object.hasOwn(HOSTS, t.host)) {
      throw new Error(
        `results: trial ${i} (${t.taskId}/${t.condition}) has unknown host ${JSON.stringify(t.host)} — must be null or one of: ${Object.keys(HOSTS).join(', ')}`
      );
    }
    if (t.installShape !== undefined && t.installShape !== null && !Object.hasOwn(INSTALL_SHAPES, t.installShape)) {
      throw new Error(
        `results: trial ${i} (${t.taskId}/${t.condition}) has unknown installShape ${JSON.stringify(t.installShape)} — must be null or one of: ${installShapeIds().join(', ')}`
      );
    }
  }
  return true;
}

function wilsonOf(rows) {
  const yes = rows.filter((r) => r.activated === true).length;
  return { ...wilsonInterval(yes, rows.length, { confidence: 0.95 }), yes, total: rows.length };
}

/** Rates for one (host × installShape) stratum. Never spans two of either. */
function summarizeStratum(run) {
  const byCategory = {};
  for (const category of ['trigger', 'control']) {
    byCategory[category] = {
      A: wilsonOf(run.filter((t) => t.category === category && t.condition === 'A')),
      B: wilsonOf(run.filter((t) => t.category === category && t.condition === 'B')),
    };
  }
  const byTask = {};
  for (const task of TASKS) {
    const taskRows = run.filter((t) => t.taskId === task.id);
    if (!taskRows.length) continue;
    byTask[task.id] = {
      category: task.category,
      A: wilsonOf(taskRows.filter((t) => t.condition === 'A')),
      B: wilsonOf(taskRows.filter((t) => t.condition === 'B')),
    };
  }
  return {
    n: run.length,
    // Per-stratum only. Deliberately NOT named the same as a cross-stratum
    // total, because there is no cross-stratum total in this object.
    overall: {
      A: wilsonOf(run.filter((t) => t.condition === 'A')),
      B: wilsonOf(run.filter((t) => t.condition === 'B')),
    },
    byCategory,
    byTask,
  };
}

/**
 * Compute self-activation rates (Wilson 95% CI) from a filled results file's
 * `trials` array, **partitioned by (host × installShape)**.
 *
 * Exclusions, all of which keep a trial out of BOTH the numerator and the
 * denominator rather than scoring it as a miss:
 *   - `activated === null` — pending, not yet observed → `pending`.
 *   - `host` or `installShape` missing/null — unlabeled → `unlabeled`. A
 *     rate whose install shape is unknown is not a rate: 'skill-plus-hook'
 *     force-injects the rubric and is ~100% by construction.
 *   - host is an instruction-file host → `notApplicable`. Its install path
 *     appends to a file the host loads unconditionally; there is no matcher,
 *     so the rate is undefined, not zero.
 *
 * The return value has NO cross-host and NO cross-shape aggregate. That
 * absence is the point: the headline figure is condition A's rate for the
 * 'skill-only' shape **of one named host**, and a blended cross-client
 * percentage cannot be read off this object because it is not in it.
 */
export function summarizeSelfActivation(trials) {
  const labeled = (t) =>
    t.host !== null && t.host !== undefined && t.installShape !== null && t.installShape !== undefined;

  const pending = trials.filter((t) => t.activated === null);
  const observed = trials.filter((t) => t.activated !== null);

  const unlabeled = observed.filter((t) => !labeled(t));
  const withLabels = observed.filter(labeled);

  // Instruction-file hosts are counted, named and explained — never scored.
  const notApplicable = [];
  const scorable = [];
  for (const t of withLabels) {
    if (Object.hasOwn(HOSTS, t.host) && HOST_KINDS[HOSTS[t.host].kind].scorable) scorable.push(t);
    else notApplicable.push(t);
  }
  const naByHost = {};
  for (const t of notApplicable) {
    const entry = (naByHost[t.host] ??= {
      host: t.host,
      hostKind: Object.hasOwn(HOSTS, t.host) ? HOSTS[t.host].kind : 'unknown',
      trials: 0,
    });
    entry.trials++;
  }

  const groups = new Map();
  for (const t of scorable) {
    // Ids are validated against closed sets, so a JSON key pair is an
    // unambiguous grouping key (no separator a host id could contain).
    const key = JSON.stringify([t.host, t.installShape]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const strata = [...groups.entries()]
    .map(([key, rows]) => {
      const [host, installShape] = JSON.parse(key);
      return {
        host,
        hostLabel: HOSTS[host].label,
        hostKind: HOSTS[host].kind,
        installShape,
        installShapeLabel: INSTALL_SHAPES[installShape].label,
        forcedInjection: INSTALL_SHAPES[installShape].forcedInjection,
        ...summarizeStratum(rows),
      };
    })
    .sort((a, b) => a.host.localeCompare(b.host) || a.installShape.localeCompare(b.installShape));

  return {
    // Counts of trials, for provenance. Deliberately not rates: `scored` is
    // how many observations went into the strata, not a pooled numerator.
    scored: scorable.length,
    pending: pending.length,
    unlabeled: unlabeled.length,
    notApplicable: Object.values(naByHost),
    strata,
  };
}

/** Print the protocol: every prompt an operator needs to paste into a fresh live session, per condition. */
export function printSelfActivationTasks() {
  console.log('\nSELF-ACTIVATION PROTOCOL — see evals/self-activation/README.md for the full methodology.\n');
  console.log(
    `Preconditions: run each trial on a named skill-discovering host (${scorableHostIds().join(', ')}), and record which install shape it ran under:`
  );
  for (const id of installShapeIds()) {
    console.log(`  ${id.padEnd(16)} ${INSTALL_SHAPES[id].detail}`);
  }
  console.log(
    `\nBoth shapes are real: hooks/ is opt-in and not part of the shipped skill, but this repo does ship hooks/session-start.js, which force-injects the rubric. A rate recorded without its install shape is unusable, so the report excludes any trial that lacks one.`
  );
  console.log(
    `Not measurable at all (instruction-file hosts — install appends to a file the host loads unconditionally, so there is no matcher decision to observe): ${Object.keys(
      HOSTS
    )
      .filter((id) => !HOST_KINDS[HOSTS[id].kind].scorable)
      .join(', ')}\n`
  );
  console.log(`Trigger phrases (from SKILL.md's description:): ${TRIGGER_PHRASES.join(', ')}\n`);
  for (const task of TASKS) {
    console.log(`── ${task.id} [${task.category}]${task.phrasesUsed.length ? ` (uses: ${task.phrasesUsed.join(', ')})` : ''} ──`);
    console.log(`  A (no mention):       ${buildPrompt(task, 'A')}`);
    console.log(`  B (explicit mention): ${buildPrompt(task, 'B')}`);
    console.log('');
  }
  console.log('Run each prompt in a FRESH session (no prior context) for N trials per condition, record activation yes/no with evidence plus the host and install shape it ran under, then run --selfactivation-report on the filled file.');
}

function fmtPct(w) {
  // An empty cell prints as "no trials", never as "0%". A zero denominator is
  // an absence of measurement, and rendering it as a percentage is the same
  // class of mistake as blending strata: a number where there is no number.
  if (w.total === 0) return 'no trials (0/0)';
  return `${(w.point * 100).toFixed(0)}% (${w.yes}/${w.total}, 95% CI ${(w.lower * 100).toFixed(0)}–${(w.upper * 100).toFixed(0)}%)`;
}

/**
 * Print a human-readable self-activation report from
 * summarizeSelfActivation()'s output: one block per (host × install shape),
 * and no pooled figure anywhere — there is nothing in the summary to pool.
 */
export function printSelfActivationReport(summary) {
  console.log('\nSELF-ACTIVATION REPORT');
  console.log('='.repeat(72));
  if (summary.pending > 0) {
    console.log(`⚠ ${summary.pending} trial(s) still pending (activated: null) — excluded from the rates below.`);
  }
  if (summary.unlabeled > 0) {
    console.log(
      `⚠ ${summary.unlabeled} observed trial(s) missing a host and/or installShape — excluded from every rate. ` +
        `A rate whose install shape is unknown is not a rate: '${INSTALL_SHAPES['skill-plus-hook'].label}' force-injects the rubric and is ~100% by construction. ` +
        `Label them (host: one of ${scorableHostIds().join('/')}, installShape: one of ${installShapeIds().join('/')}) and re-run.`
    );
  }
  for (const na of summary.notApplicable) {
    const kind = Object.hasOwn(HOST_KINDS, na.hostKind) ? HOST_KINDS[na.hostKind] : null;
    console.log(
      `ⓘ ${na.trials} trial(s) on ${na.host} — NOT SCORED (${na.hostKind}). ${kind ? kind.why : 'unrecognised host kind.'}`
    );
  }
  if (summary.strata.length === 0) {
    console.log('\nNo scorable completed trials yet. This is a scaffold, not a result — see evals/self-activation/README.md.');
    return;
  }

  for (const s of summary.strata) {
    console.log(`\n── ${s.hostLabel} (${s.host}) · install shape: ${s.installShape} — ${s.installShapeLabel} ──`);
    if (s.forcedInjection) {
      console.log(
        '   ⚠ This shape force-injects the rubric via SessionStart additionalContext. Any rate below is a property of the hook, NOT of the description-matcher. Do not publish it as a self-activation rate.'
      );
    }
    console.log(`   n=${s.n} completed trials`);
    console.log(`   Condition A (no mention):       ${fmtPct(s.overall.A)}`);
    console.log(`   Condition B (explicit mention): ${fmtPct(s.overall.B)}`);
    console.log('   By category:');
    for (const category of ['trigger', 'control']) {
      const c = s.byCategory[category];
      if (!c) continue;
      console.log(`     ${category.padEnd(9)} A: ${fmtPct(c.A)}`);
      console.log(`     ${''.padEnd(9)} B: ${fmtPct(c.B)}`);
    }
    console.log('   By task:');
    for (const [id, t] of Object.entries(s.byTask)) {
      console.log(`     ${id.padEnd(28)} [${t.category.padEnd(7)}] A: ${fmtPct(t.A)}   B: ${fmtPct(t.B)}`);
    }
  }

  console.log(
    `\n${summary.strata.length} stratum/strata reported separately and deliberately NOT pooled. There is no blended cross-host or ` +
      'cross-install-shape percentage here, and none can be computed from this report: the denominator is skill-discovering ' +
      'hosts, per host, per install shape. Averaging strata would mix a matcher decision with a force-injected rubric, and ' +
      'would put hosts that have no matcher at all into a denominator they do not belong in.'
  );
  console.log('');
}
