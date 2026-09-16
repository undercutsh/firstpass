// The eval runner: wires the policy engine, the LLM client, and deterministic
// graders into the three arms. Includes a MOCK LLM for plumbing validation
// without spending money.
//
// Apex fidelity: per SKILL.md, everything unresolved after frontier goes to a
// SINGLE batched apex tie-break call (all residual items), never per-item apex
// calls. runSuite() collects all needsApex units in a suite and makes exactly
// ONE apex call, then grades every residual item against it.

import { chat } from './llm.js';
import { VENDORS, TIER_ORDER, MAX_ATTEMPTS_PER_UNIT, MAX_TIER_RETRIES } from './config.js';
import { extractJson } from './tasks.js';
import { WORKER_CONTRACT } from './types.js';

/** Parse a worker response into { status, reason, answer }. */
function parseWorkerOutput(text) {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'uncertain', reason: 'unparseable output', answer: text };
  }
  return {
    status: parsed.status === 'grounded' ? 'grounded' : 'uncertain',
    reason: parsed.reason ?? null,
    answer: parsed.answer,
  };
}

/**
 * A single attempt at a given tier. Returns structured result + cost.
 *
 * `runMeta.effort` is a single value applied to every tier (back-compat: a
 * flat A/B on the whole run). `runMeta.effortByTier` (e.g. { frontier:
 * 'high', apex: 'high' }) overrides it per tier for the effort-level test
 * matrix — reasoning effort is expected to matter most at frontier/apex,
 * where the model actually has a reasoning mode worth tuning; cheap/standard
 * tiers are usually run with effort omitted (provider default) or 'low'.
 */
export function makeAttempter({ model, runMeta, policy }) {
  return async (tier, task, payload) => {
    const slug = model.tiers[tier];
    const system = 'You are a worker in a tiered-dispatch pipeline. Follow the output contract exactly.';
    const effort = runMeta.effortByTier?.[tier] ?? runMeta.effort ?? null;
    const res = await chat(slug, system, policy.workerPrompt(task, payload), { temperature: runMeta.temperature, effort });
    const parsed = parseWorkerOutput(res.content);
    const verdict = await task.grader(parsed.answer);
    return {
      answer: parsed.answer,
      status: parsed.status,
      uncertaintyReason: parsed.reason,
      verdict,
      cost: res.usage.costUsd ?? 0,
      usage: res.usage,
    };
  };
}

/**
 * Batched apex tie-break: ONE apex call resolving all residual items.
 * Implemented as rawApexCall below; apexBatch kept as a guard against
 * accidentally calling 'attempt' for the batched path.
 */
async function apexBatch() {
  throw new Error('apexBatch: use rawApexCall, not attempt');
}

/**
 * Raw single apex call that returns per-item answers for a residue batch.
 * `chat` is injected for testability.
 */
export async function rawApexCall(chatFn, apexModel, residual, runMeta) {
  const items = residual.map(({ task }) => ({ item: task.id, prompt: task.prompt }));
  const system = `You are the apex tie-break agent. A batch of items below defeated lower tiers. Resolve EACH item. Return ONLY JSON matching: {"items": [{"item": "<id>", "answer": <final answer>}]}. Do not skip any item.`;
  const res = await chatFn(apexModel, system, JSON.stringify(items), { temperature: runMeta.temperature });
  const parsed = extractJson(res.content);
  const byId = new Map();
  for (const it of parsed?.items ?? []) byId.set(it.item, it.answer);
  return { raw: res, byId };
}

/** Run `n` promises with at most `limit` in flight at once. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Run a whole suite under a given arm. */
export async function runSuite({ arm, vendor, suite, attempt, apexChat, apexModel, seeds = 1, concurrency = 8, policy }) {
  const perUnit = [];
  for (let seed = 0; seed < seeds; seed++) {
    // Run all tasks in the seed concurrently (bounded) — the dominant speedup.
    const seedUnits = await mapLimit(suite, concurrency, (task) => runUnitForArm(arm, task, attempt, policy));
    // Tag each unit with the seed it ran under — stats.js's seed-cluster
    // bootstrap resamples whole seeds, so it needs this to group by.
    for (const u of seedUnits) u.seed = seed;
    // Batched apex: one call resolving ALL residual items across the suite.
    if (arm === 'tiered' && apexChat) {
      const residual = [];
      for (const u of seedUnits) {
        const task = suite.find((t) => t.id === u.id);
        if (u.needsApex && task) residual.push({ task, payload: u.apexPayload });
      }
      if (residual.length) {
        const { byId, raw } = await rawApexCall(apexChat, apexModel, residual, { temperature: 0.2 });
        for (const u of seedUnits) {
          if (u.needsApex && byId.has(u.id)) {
            const answer = byId.get(u.id);
            const task = suite.find((t) => t.id === u.id);
            const verdict = await task.grader(answer);
            u.attemptLog.push({
              tier: 'apex',
              answer,
              status: 'grounded',
              uncertaintyReason: null,
              verdict,
              cost: (raw.usage.costUsd ?? 0) / residual.length,
              usage: { in: Math.ceil((raw.usage.in ?? 0) / residual.length), out: Math.ceil((raw.usage.out ?? 0) / residual.length) },
            });
            u.apexResolved = true;
            u.passed = verdict.pass;
            u.finalTier = 'apex';
            u.reason = verdict.reason;
            u.attempts = u.attemptLog.length;
            u.tiersUsed = [...new Set(u.attemptLog.map((a) => a.tier))];
            recomputeCost(u);
          }
        }
      }
    }
    perUnit.push(...seedUnits);
  }
  return perUnit;
}

function recomputeCost(u) {
  u.cost = u.attemptLog.reduce((s, a) => s + (a.cost ?? 0), 0);
  u.tokensIn = u.attemptLog.reduce((s, a) => s + (a.usage?.in ?? 0), 0);
  u.tokensOut = u.attemptLog.reduce((s, a) => s + (a.usage?.out ?? 0), 0);
}

async function runUnitForArm(arm, task, attempt, policy) {
  if (arm === 'tiered') {
    // Ambiguous cheap work: dual-run disagreement. Otherwise straight ladder.
    if (task.flags.ambiguous && policy.baseTier(task) === 'cheap') {
      const dual = await policy.runUnitDual(task, attempt);
      if (!dual.escalated) return summarize(task, dual, policy);
      // disagree → continue the ladder from standard
      const rest = await policy.runUnitLadder(task, async (tier, t, p) => {
        if (tier === 'cheap') return { answer: null, status: 'uncertain', uncertaintyReason: 'disagreement', verdict: { pass: false, reason: 'dual-run disagree' }, cost: 0, usage: {} };
        return attempt(tier, t, p);
      });
      return summarize(task, { attempts: [...dual.attempts, ...rest.attempts], finalTier: rest.finalTier, escalated: rest.escalated, needsApex: rest.needsApex, apexPayload: rest.apexPayload }, policy);
    }
    const trace = await policy.runUnitLadder(task, attempt);
    return summarize(task, trace, policy);
  }

  // Static arms (`static-<tier>`, the --ablation baselines): ONE pinned
  // tier, no escalation, and the SAME per-tier attempt budget the ladder
  // gives any single tier (MAX_TIER_RETRIES + 1), so "tiered vs static-X"
  // is apples-to-apples — the ladder never gets more tries at tier X than
  // the static arm does. This is what an up-front classifier that guessed
  // tier X would deliver: whatever X produces, shipped as-is.
  if (isStaticArm(arm)) {
    const tier = staticArmTier(arm);
    const trace = { attempts: [], finalTier: null, escalated: false, needsApex: false };
    for (let i = 0; i < MAX_TIER_RETRIES + 1; i++) {
      const r = await attempt(tier, task, null);
      trace.attempts.push({ ...r, tier });
      if (r.verdict.pass) { trace.finalTier = tier; break; }
    }
    return summarize(task, trace, policy);
  }

  // Baseline arms: same unit, single tier, no escalation.
  const tier = arm === 'all-frontier' ? 'frontier' : 'standard';
  const trace = { attempts: [], finalTier: null, escalated: false, needsApex: false };
  for (let i = 0; i < MAX_ATTEMPTS_PER_UNIT; i++) {
    const r = await attempt(tier, task, null);
    trace.attempts.push({ ...r, tier });
    if (r.verdict.pass) { trace.finalTier = tier; break; }
  }
  return summarize(task, trace, policy);
}

/** `static-<tier>` arm helpers (see --ablation in main.js / ablation.js). */
export const STATIC_ARMS = TIER_ORDER.map((t) => `static-${t}`);
export function isStaticArm(arm) {
  return typeof arm === 'string' && arm.startsWith('static-') && TIER_ORDER.includes(arm.slice('static-'.length));
}
export function staticArmTier(arm) {
  if (!isStaticArm(arm)) throw new Error(`not a static arm: ${arm}`);
  return arm.slice('static-'.length);
}

function summarize(task, trace, policy) {
  const passed = trace.attempts.some((a) => a.verdict.pass);
  const cost = trace.attempts.reduce((s, a) => s + (a.cost ?? 0), 0);
  const tokensIn = trace.attempts.reduce((s, a) => s + (a.usage?.in ?? 0), 0);
  const tokensOut = trace.attempts.reduce((s, a) => s + (a.usage?.out ?? 0), 0);
  const tiersUsed = [...new Set(trace.attempts.map((a) => a.tier))];
  return {
    id: task.id,
    category: task.category,
    passed,
    passRate: passed ? 1 : 0,
    cost,
    tokensIn,
    tokensOut,
    attemptLog: trace.attempts, // full trace, used by apex batching
    attempts: trace.attempts.length,
    tiersUsed,
    finalTier: trace.finalTier,
    escalated: trace.escalated,
    needsApex: trace.needsApex,
    apexResolved: false,
    apexPayload: trace.apexPayload ?? policy.buildPayload(task, trace.attempts),
    reason: trace.attempts[trace.attempts.length - 1]?.verdict.reason ?? '',
  };
}

/* ------------------------------------------------------------------ */
/* MOCK LLM — deterministic, keyless, for plumbing validation.         */
/* ------------------------------------------------------------------ */

// Reference solutions used only by the mock, so plumbing validation can show
// code tasks passing. Keyed by task id suffix.
const MOCK_SOLUTIONS = {
  'even-sum': 'function main(arr){ return arr.filter(x => x % 2 === 0).reduce((a,b)=>a+b, 0) }',
  fizzbuzz: 'function main(n){ const r=[]; for(let i=1;i<=n;i++){ r.push(i%15===0?"FizzBuzz":i%3===0?"Fizz":i%5===0?"Buzz":String(i)) } return r }',
  anagram: 'function main(a,b){ const c=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"").split("").sort().join(""); return c(a)===c(b) }',
  dedupe: 'function main(arr){ return arr.filter((v,i)=>arr.indexOf(v)===i) }',
  'matrix-transpose': 'function main(m){ return m[0].map((_,c)=>m.map(r=>r[c])) }',
  // Deliberately builds the result object with keys in reverse-alphabetical
  // order rather than first-occurrence order. code:word-count's expected
  // fixtures (see suites/code.js) happen to list keys in first-occurrence
  // order, so a first-occurrence-order solution here would coincidentally
  // match key-for-key and never exercise gradeCode's deepEqual against an
  // object-shaped answer with a *different* key order — i.e. `--mock` runs
  // would give zero regression coverage for the exact bug class PR #105
  // fixed (JSON.stringify-based comparison spuriously failing a correct
  // answer whose object keys enumerate in a different order).
  'word-count': 'function main(t){ const m={}; t.toLowerCase().replace(/[^a-z0-9\\s]/g,"").split(/\\s+/).filter(Boolean).forEach(w=>m[w]=(m[w]||0)+1); const o={}; Object.keys(m).sort().reverse().forEach(k=>o[k]=m[k]); return o }',
  clamp: 'function main(v,min,max){ return Math.max(min, Math.min(max, v)) }',
  'csv-sum': 'function main(c){ return c.split(/\\n/).flatMap(r=>r.split(",").map(Number)).filter(n=>!isNaN(n)).reduce((a,b)=>a+b,0) }',
  'two-sum': 'function main(n,t){ const m={}; for(let i=0;i<n.length;i++){ const d=t-n[i]; if(d in m) return [m[d],i]; m[n[i]]=i } }',
  palindrome: 'function main(s){ const c=s.toLowerCase().replace(/[^a-z0-9]/g,""); return c===c.split("").reverse().join("") }',
};

// Tasks that must fail at EVERY local tier (cheap, standard, frontier) in
// --mock mode, so the ladder genuinely exhausts its cap and marks needsApex
// — the only way the single batched apex tie-break (runner.js's
// rawApexCall, wired via mockApex in main.js) gets exercised in a mock run.
// Without an id in this set, mockAttempter's generic branch below passes on
// any tier !== 'cheap', so every mock task resolves by 'standard' and never
// even reaches 'frontier', let alone apex — the same "coincidentally never
// triggers the real path" gap PR #110 fixed for key-order sensitivity, here
// for hysteresis's escalation ceiling / the apex tie-break. See
// suites/reasoning.js's 'apex-tiebreak' task and rawApexCall's test coverage
// in runner.test.js.
const APEX_PROBE_IDS = new Set(['reasoning:apex-tiebreak']);

// Per-tier mock cost for tasks carrying a `mock` difficulty profile (the
// agentic suite). Roughly the real cheap:standard:frontier:apex price ladder
// so the --mock --ablation cost columns aren't all identical — the report's
// cost-per-completed-task ordering is meaningless if every tier costs the
// same. Tasks without a profile keep the flat 0.001 the other suites use.
const MOCK_TIER_COST = { cheap: 0.0005, standard: 0.003, frontier: 0.015, apex: 0.03 };

/**
 * Build a mock attempter. For known-correct answers it returns the task's
 * answerKey at any tier (so cheap passes fast); unknown answers fail on the
 * cheap tier and pass on standard+ (exercises escalation). APEX_PROBE_IDS
 * fail at every local tier so they exercise the apex path instead.
 */
export function mockAttempter({ alwaysPass = false } = {}) {
  const attempts = [];
  // Per (task, tier) attempt counter for the agentic suite's
  // `mock.retryAtMinTier` profile — "fails once at its solve tier, then
  // passes", which is the hysteresis retry path (max ONE retry per tier).
  const seen = new Map();
  return async (tier, task) => {
    let shouldPass;
    if (alwaysPass) shouldPass = true;
    else if (task.mock?.minTier) {
      // Agentic-suite difficulty profile: the mock "solves" the task at
      // `minTier` and above ('none' = never), and — when `retryAtMinTier` — only on its
      // SECOND attempt at that tier. The answer it returns is the task's
      // reference solution, so the REAL grader (bash sandbox, vm, JSON)
      // still runs end to end; a cheap-fail returns a deliberately wrong
      // answer of the right general shape. This is what gives --mock
      // --ablation a varied pass/fail surface per arm: static-cheap fails
      // everything above cheap, static-frontier passes everything except
      // apex-only tasks, tiered climbs exactly as far as each task needs.
      const key = `${task.id}@${tier}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      const tierIdx = TIER_ORDER.indexOf(tier);
      // minTier 'none' = the mock never solves it at any local tier (and
      // main.js's mockApex declines it too), so the "exhausted the whole
      // ladder and still failed" path is exercised in --mock.
      const minIdx = task.mock.minTier === 'none' ? Infinity : TIER_ORDER.indexOf(task.mock.minTier);
      const strongEnough = tierIdx >= minIdx;
      const retryGate = task.mock.retryAtMinTier && tierIdx === minIdx ? n >= 2 : true;
      shouldPass = strongEnough && retryGate;
      const answer = shouldPass ? task.answerKey : typeof task.answerKey === 'string' ? 'echo mock-wrong-answer' : { wrong: 'mock-fail' };
      attempts.push(tier);
      return {
        answer,
        status: 'grounded',
        uncertaintyReason: null,
        verdict: await task.grader(answer),
        cost: MOCK_TIER_COST[tier] ?? 0.001,
        usage: { in: 100, out: 50, costUsd: MOCK_TIER_COST[tier] ?? 0.001 },
      };
    } else if (task.category === 'code') {
      // Mock code tasks always pass (reference solution) regardless of tier —
      // in the real run cheap models genuinely solve them.
      const sol = MOCK_SOLUTIONS[task.id.replace('code:', '')];
      const answer = sol ?? `function main(){ return ${JSON.stringify(task.answerKey)} }`;
      attempts.push(tier);
      return {
        answer,
        status: 'grounded',
        uncertaintyReason: null,
        verdict: await task.grader(answer),
        cost: 0.001,
        usage: { in: 100, out: 50, costUsd: 0.001 },
      };
    } else if (task.category === 'mbpp') {
      // Mock MBPP tasks always pass regardless of tier: answerKey is the
      // dataset's own reference solution (real Python), so this exercises
      // the real python3 grader end-to-end without spending money or
      // touching the network — no mock-solution table needed, unlike the
      // JS `code` suite above.
      const answer = task.answerKey;
      attempts.push(tier);
      return {
        answer,
        status: 'grounded',
        uncertaintyReason: null,
        verdict: await task.grader(answer),
        cost: 0.001,
        usage: { in: 100, out: 50, costUsd: 0.001 },
      };
    } else {
      shouldPass = alwaysPass || (tier !== 'cheap' && !APEX_PROBE_IDS.has(task.id));
    }
    const answer = shouldPass ? task.answerKey : { wrong: 'mock-cheap-fail' };
    attempts.push(tier);
    return {
      answer,
      status: 'grounded',
      uncertaintyReason: null,
      verdict: await task.grader(answer),
      cost: 0.001,
      usage: { in: 100, out: 50, costUsd: 0.001 },
    };
  };
}

/**
 * Mock apex resolver — mimics the `chat()` LLM shape ({content, usage}) so it
 * can be passed as the apexChat. Answers every residual item with its
 * answerKey so the batched apex path is exercised end-to-end in plumbing.
 */
export function mockApex(resolve) {
  return async (model, system, body) => {
    const items = JSON.parse(body);
    return {
      content: JSON.stringify({ items: items.map((i) => ({ item: i.item, answer: resolve(i.item) })) }),
      usage: { in: 100, out: 50, costUsd: 0.001 },
    };
  };
}