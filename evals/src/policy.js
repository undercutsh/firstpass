// The tiered-dispatch POLICY ENGINE — mirrors skills/tiered-dispatch/SKILL.md.
//
// Versioned so the harness can A/B the CURRENT policy against the original
// v1 (pre-formatStrict) — the cross-vendor "does the principle carry over?"
// test. Pure logic: rubric → base tier, cheap-to-verify override, escalation
// triggers (verify fail x2, disagreement, uncertainty flag), hysteresis
// (max 1 retry per tier, never de-escalate), residue-only payload schema,
// single batched apex tie-break. No I/O — the runner injects `attempt()`.

import { TIER_ORDER, MAX_TIER_RETRIES } from './config.js';
import { WORKER_CONTRACT } from './types.js';

/** Count rubric flags on a task. */
export function countFlags(task) {
  return Object.entries(task.flags).filter(([k, v]) => v === true).length;
}

/**
 * Build a policy engine for a given version.
 *
 * v1      — original rubric. No formatStrict concept: any mechanically
 *           verifiable task starts cheap, ladder caps at frontier.
 * latest  — round 2-3 findings: formatStrict tasks start at standard (cheap
 *           death-spirals on strict schema output) and CAP at standard
 *           (frontier is *worse* than standard on format-constrained work:
 *           Opus 5 35/50 vs Sonnet 5 42/50 on mechanical).
 * probe   — round 5 cross-vendor finding: formatStrict rules are
 *           vendor-dependent (Gemini's cheap model formats better than
 *           Anthropic's Haiku, so forcing standard wasted 17x). So formatStrict
 *           tasks START cheap (let the cheap tier prove itself) but CAP at
 *           standard (never spend frontier on format work). Adaptive: cheap
 *           passes → cheapest; cheap fails → standard, then batched apex.
 */
export function createPolicy(version = 'latest') {
  const isV1 = version === 'v1';
  const isProbe = version === 'probe';

  const capTier = (task) =>
    !isV1 && task.flags.formatStrict
      ? 'standard'
      : TIER_ORDER[TIER_ORDER.length - 2];

  const baseTier = (task) => {
    // latest only: formatStrict ⇒ standard base (hardcoded rule that proved
    // vendor-specific and was REJECTED in round 5 — probe restores cheap-first).
    if (!isV1 && !isProbe && task.flags.formatStrict) return 'standard';

    // Override: cheap-to-verify ⇒ cheap-to-generate. If output is
    // mechanically verifiable AND free-form (exec or exact-match), assign the
    // LOWEST tier regardless of apparent difficulty.
    if (!task.flags.unverifiable) return 'cheap';

    const flags = countFlags(task);
    if (flags >= 3 || task.flags.blast) return 'frontier'; // ownership/judgment
    if (flags >= 1) return 'standard';
    return 'cheap';
  };

  /** Step 2 — the single escalation trigger: one tier up, never down. */
  const escalate = (tier) => {
    const idx = TIER_ORDER.indexOf(tier);
    return TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)];
  };

  /** Build the worker prompt for a unit: task prompt + OUTPUT CONTRACT. */
  const workerPrompt = (task, payload) => {
    const extras = payload?.context_refs?.length
      ? `\nContext for decision: ${payload.context_refs.join('; ')}`
      : '';
    // Category-specific answer guidance. Code workers must return the raw
    // function source as a plain string — wrapped objects (implementation,
    // language, explanation) are rejected by the mechanical grader.
    const categoryNote =
      task.category === 'code'
        ? '\nANSWER FORMAT: the "answer" field MUST be the raw JavaScript function source code as a plain string. Do NOT wrap it in an object, do not add explanation. Example: {"status": "grounded", "reason": null, "answer": "function main(arr){ ... }"}'
        : task.category === 'mbpp'
        ? '\nANSWER FORMAT: the "answer" field MUST be the raw Python function source code as a plain string. Do NOT wrap it in an object, do not add explanation, do not include markdown fences. Example: {"status": "grounded", "reason": null, "answer": "def foo(x):\\n    return x"}'
        : '';
    return `${task.prompt}\n\n${extras}\n${categoryNote}\n\n${WORKER_CONTRACT}`;
  };

  /** Escalation payload schema (what flows up to a higher tier). */
  const buildPayload = (task, attempts) => {
    const last = attempts[attempts.length - 1];
    return {
      item: task.id,
      attempted_tier: last?.tier ?? null,
      attempts: attempts.map((a) => ({
        answer: a.answer,
        verification: a.verdict.pass ? 'pass' : 'failed',
        notes: a.verdict.reason,
      })),
      uncertainty_reason: last?.uncertaintyReason ?? null,
      decision_needed: 'resolve the item correctly',
      context_refs: [],
    };
  };

  /**
   * Run one unit through the ladder: cheap → standard → frontier.
   * The ladder CAP is per-task (see capTier). When a task exhausts its cap it
   * is marked `needsApex` — the RUNNER batches all such units into ONE apex
   * tie-break call (the skill's ladder cap). Never makes per-item apex calls.
   * `attempt(modelTier, task, payload)` is injected by the harness and returns
   *   { answer, status, uncertaintyReason, verdict, cost, usage }.
   * Returns the full trace: attempts, finalTier, needsApex.
   */
  const runUnitLadder = async (task, attempt) => {
    const trace = { attempts: [], finalTier: null, escalated: false, needsApex: false };
    const cap = capTier(task);

    let tier = baseTier(task);
    let payload = null;
    let retriesAtTier = 0;

    while (true) {
      const r = await attempt(tier, task, payload);
      trace.attempts.push({ ...r, tier });

      // Uncertainty flag is an immediate escalation trigger.
      if (r.status === 'uncertain') {
        trace.escalated = true;
        if (tier === cap) {
          trace.finalTier = tier;
          trace.needsApex = true;
          return trace;
        }
        payload = buildPayload(task, trace.attempts);
        tier = escalate(tier);
        retriesAtTier = 0;
        continue;
      }

      // Pass → done at this tier.
      if (r.verdict.pass) {
        trace.finalTier = tier;
        return trace;
      }

      // Fail: hysteresis — max ONE retry per tier, then escalate.
      retriesAtTier++;
      if (retriesAtTier > MAX_TIER_RETRIES) {
        trace.escalated = true;
        if (tier === cap) {
          // Ladder cap: mark for the single batched apex tie-break.
          trace.finalTier = tier;
          trace.needsApex = true;
          return trace;
        }
        payload = buildPayload(task, trace.attempts);
        tier = escalate(tier);
        retriesAtTier = 0;
        continue;
      }
    }
  };

  /**
   * Dual-run disagreement for ambiguous cheap work:
   * run the unit TWICE at the low tier; disagree → escalate.
   */
  const runUnitDual = async (task, attempt, lowTier = 'cheap') => {
    const [r1, r2] = [await attempt(lowTier, task, null), await attempt(lowTier, task, null)];
    const agree =
      r1.verdict.pass === r2.verdict.pass &&
      JSON.stringify(r1.answer) === JSON.stringify(r2.answer);
    if (agree && r1.verdict.pass) {
      return {
        attempts: [{ ...r1, tier: lowTier }, { ...r2, tier: lowTier }],
        finalTier: lowTier,
        escalated: false,
        apexBatched: false,
      };
    }
    return {
      attempts: [{ ...r1, tier: lowTier }, { ...r2, tier: lowTier }],
      finalTier: null,
      escalated: true,
      apexBatched: false,
      disagreement: true,
    };
  };

  return {
    version,
    baseTier,
    capTier,
    escalate,
    workerPrompt,
    buildPayload,
    runUnitLadder,
    runUnitDual,
  };
}