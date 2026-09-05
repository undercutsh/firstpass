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
 * Build an empty results scaffold: every task × condition × trial slot,
 * `activated: null` (pending — never a guessed true/false). A human or
 * live-agent operator fills these in per evals/self-activation/README.md,
 * then feeds the file to summarizeSelfActivation / printSelfActivationReport.
 */
export function scaffoldResults({ n = 10, agent = null } = {}) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`scaffoldResults: n must be a positive integer, got ${n}`);
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
      agent,
      tasks: TASKS.length,
      generated: new Date().toISOString(),
      note:
        'Scaffold only — every trial starts pending (activated: null). Run each prompt in a FRESH live agent session per evals/self-activation/README.md, then set activated to true/false and fill evidence before reporting.',
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
  }
  return true;
}

function wilsonOf(rows) {
  const yes = rows.filter((r) => r.activated === true).length;
  return { ...wilsonInterval(yes, rows.length, { confidence: 0.95 }), yes, total: rows.length };
}

/**
 * Compute self-activation rates (Wilson 95% CI) from a filled results file's
 * `trials` array. Trials with `activated === null` (still pending) are
 * excluded from every rate and counted in `pending` instead — a partially
 * run set never silently gets scored as 0% on the unrun slots.
 */
export function summarizeSelfActivation(trials) {
  const pending = trials.filter((t) => t.activated === null);
  const run = trials.filter((t) => t.activated !== null);

  const byCondition = { A: run.filter((t) => t.condition === 'A'), B: run.filter((t) => t.condition === 'B') };
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
    pending: pending.length,
    overall: { A: wilsonOf(byCondition.A), B: wilsonOf(byCondition.B) },
    byCategory,
    byTask,
  };
}

/** Print the protocol: every prompt an operator needs to paste into a fresh live session, per condition. */
export function printSelfActivationTasks() {
  console.log('\nSELF-ACTIVATION PROTOCOL — see evals/self-activation/README.md for the full methodology.\n');
  console.log(`Precondition: ${SKILL_ID} is installed exactly as shipped (description-matched SKILL.md, no SessionStart hook, no forced injection) in the agent under test.\n`);
  console.log(`Trigger phrases (from SKILL.md's description:): ${TRIGGER_PHRASES.join(', ')}\n`);
  for (const task of TASKS) {
    console.log(`── ${task.id} [${task.category}]${task.phrasesUsed.length ? ` (uses: ${task.phrasesUsed.join(', ')})` : ''} ──`);
    console.log(`  A (no mention):       ${buildPrompt(task, 'A')}`);
    console.log(`  B (explicit mention): ${buildPrompt(task, 'B')}`);
    console.log('');
  }
  console.log('Run each prompt in a FRESH session (no prior context) for N trials per condition, record activation yes/no with evidence, then run --selfactivation-report on the filled file.');
}

function fmtPct(w) {
  return `${(w.point * 100).toFixed(0)}% (${w.yes}/${w.total}, 95% CI ${(w.lower * 100).toFixed(0)}–${(w.upper * 100).toFixed(0)}%)`;
}

/** Print a human-readable self-activation report from summarizeSelfActivation()'s output. */
export function printSelfActivationReport(summary) {
  console.log('\nSELF-ACTIVATION REPORT');
  console.log('='.repeat(72));
  if (summary.pending > 0) {
    console.log(`⚠ ${summary.pending} trial(s) still pending (activated: null) — excluded from the rates below.`);
  }
  if (summary.n === 0) {
    console.log('No completed trials yet. This is a scaffold, not a result — see evals/self-activation/README.md.');
    return;
  }
  console.log(`\nOverall (n=${summary.n} completed trials):`);
  console.log(`  Condition A (no mention):       ${fmtPct(summary.overall.A)}`);
  console.log(`  Condition B (explicit mention): ${fmtPct(summary.overall.B)}`);

  console.log(`\nBy category:`);
  for (const category of ['trigger', 'control']) {
    const c = summary.byCategory[category];
    if (!c) continue;
    console.log(`  ${category.padEnd(9)} A: ${fmtPct(c.A)}`);
    console.log(`  ${''.padEnd(9)} B: ${fmtPct(c.B)}`);
  }

  console.log(`\nBy task:`);
  for (const [id, t] of Object.entries(summary.byTask)) {
    console.log(`  ${id.padEnd(28)} [${t.category.padEnd(7)}] A: ${fmtPct(t.A)}   B: ${fmtPct(t.B)}`);
  }
  console.log('');
}
