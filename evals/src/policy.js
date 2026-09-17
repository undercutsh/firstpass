// The tiered-dispatch POLICY ENGINE — mirrors skills/tiered-dispatch/SKILL.md.
//
// Versioned so the harness can A/B the CURRENT policy against the original
// v1 (pre-formatStrict) — the cross-vendor "does the principle carry over?"
// test. Pure logic: rubric → base tier (cheap-to-verify is one rubric flag,
// not an override — see baseTier), escalation
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
 * v1      — original rubric. No formatStrict concept: formatStrict is just
 *           another counted flag and the ladder caps at frontier.
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
 *
 * CONSEQUENCE of correcting the cheap-to-verify semantics (see baseTier):
 * because FORMAT-STRICT is itself one of the six rubric flags, any
 * formatStrict unit now scores >= 1 flag and so bases at 'standard' (or
 * higher, clamped to its cap) on its own. `probe`'s "formatStrict starts
 * cheap" reversal therefore no longer has any reachable input that
 * distinguishes it from `latest`: over the 69 hand-labelled suite tasks the
 * two arms now produce IDENTICAL base tiers and identical caps. The
 * `latest`-only guard below is kept because it is `latest`'s definition, but
 * it is currently subsumed by the rubric. Restoring a real probe/latest
 * contrast would mean changing what FORMAT-STRICT contributes to the count —
 * a separate, unmade decision.
 */
export function createPolicy(version = 'latest') {
  const isV1 = version === 'v1';
  const isProbe = version === 'probe';

  const capTier = (task) =>
    !isV1 && task.flags.formatStrict
      ? 'standard'
      : TIER_ORDER[TIER_ORDER.length - 2];

  const baseTier = (task) => {
    // GUARD ORDER, part 1 — `latest` only: formatStrict ⇒ standard base. This
    // stays FIRST because it is `latest`'s defining rule (a hardcoded
    // "format work starts at standard" that round 5 found vendor-specific and
    // probe reverses). It also has to precede the rubric so `latest` can never
    // emit a base tier above its own formatStrict cap of 'standard'.
    if (!isV1 && !isProbe && task.flags.formatStrict) return 'standard';

    // GUARD ORDER, part 2 — the rubric (SKILL.md Step 1), which now actually
    // runs. It used to be preceded by
    //     if (!task.flags.unverifiable) return 'cheap';
    // an unconditional clamp reading "if this unit's output is mechanically
    // checkable, start at the lowest tier no matter what else is flagged."
    // Because every task in every suite is mechanically graded by
    // construction (`unverifiable` is false on all 69 hand-labelled tasks,
    // and false is also makeTask()'s default), that clamp returned before the
    // flag count was ever consulted: 69/69 tasks based at 'cheap' under v1
    // and probe, and the 'frontier' arm below had never once executed.
    //
    // CORRECTED SEMANTICS: "cheap-to-verify ⇒ cheap-to-generate" is a reason
    // to *try cheap first*, not a veto over the rubric. UNVERIFIABLE is one of
    // the six rubric flags, so mechanical verifiability already lowers a
    // unit's flag count by one — that is where it belongs, and it is why a
    // verifiable unit with nothing else flagged still lands at 'cheap' below.
    // The cheap-first bias is then carried by the ladder itself: a unit starts
    // at this tier and only moves up when verification actually fails
    // (runUnitLadder, never de-escalating). BLAST / 3+ flags are ownership and
    // judgment calls; being checkable afterwards does not make them cheap to
    // get right, so they are no longer clamped down to 'cheap'.
    const flags = countFlags(task);
    const rubricTier =
      flags >= 3 || task.flags.blast
        ? 'frontier' // ownership/judgment
        : flags >= 1
        ? 'standard'
        : 'cheap';

    // INVARIANT: base tier <= ladder cap. Without this clamp a formatStrict +
    // BLAST unit under v1-less versions bases at 'frontier' while capTier() is
    // 'standard'; runUnitLadder then never reaches `tier === cap`, escalates
    // past 'frontier' to 'apex', and spins there forever (escalate() saturates
    // at the last tier while the cap check never matches). Verified: such a
    // unit made 200+ attempts without terminating before this clamp existed.
    const cap = capTier(task);
    return TIER_ORDER[Math.min(TIER_ORDER.indexOf(rubricTier), TIER_ORDER.indexOf(cap))];
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
        : task.category === 'mbpp' || task.category === 'humaneval'
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