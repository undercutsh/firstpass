// --ablation: rubric + verification-gated escalation vs. a static single-model
// pick, side by side, on one vendor + one suite.
//
// Motivation (business/kilo-auto-model-vs-undercut-2026-09-16.md): up-front
// pickers (Kilo Auto Model, openrouter/auto) choose ONE model per task from a
// classifier guess and ship whatever it produces. The ablation nobody has
// published is whether checking the output and escalating on failure beats
// the BEST such static pick — not just the cheapest one — at what cost.
//
// Arms:
//   static-<tier>  every task pinned to that tier, no escalation, the same
//                  per-tier attempt budget the ladder gives one tier
//                  (MAX_TIER_RETRIES + 1). One arm per tier in TIER_ORDER
//                  (cheap, standard, frontier, apex) — the apex arm is what
//                  "just always use the biggest model" costs.
//   tiered         the real policy: rubric -> base tier, verification-gated
//                  escalation, hysteresis, batched apex tie-break.
//
// Per arm: pass rate (Wilson CI), total cost, cost per COMPLETED task (the
// metric Kilo's "72% cheaper" headline skips — it divides by attempts, not
// completions), esc%, apex count. Then, for each static arm, the Newcombe
// diff-CI of tiered's pass rate minus that arm's, and the cost-per-pass
// ratio. The headline is tiered vs. the BEST static arm by pass rate.
//
// Pure functions except runAblation, which just loops runSuite over the
// arms — every statistic comes from stats.js.

import { runSuite, STATIC_ARMS, staticArmTier } from './runner.js';
import { newcombeDiffInterval, summarizeWithCI } from './stats.js';

export const ABLATION_ARMS = [...STATIC_ARMS, 'tiered'];

/**
 * Run every ablation arm over one suite for one vendor.
 * `makeAttempt(arm)` builds a fresh attempter per arm (the mock attempter
 * keeps per-(task,tier) retry state, so arms must not share one).
 * `onArmDone(arm, units)` fires after each arm completes, for checkpointing.
 */
export async function runAblation({ vendor, suite, seeds = 1, concurrency = 8, policy, makeAttempt, apexChat, apexModel, arms = ABLATION_ARMS, onArm = null, onArmDone = null }) {
  const byArm = {};
  for (const arm of arms) {
    if (onArm) onArm(arm);
    byArm[arm] = await runSuite({
      arm,
      vendor,
      suite,
      attempt: makeAttempt(arm),
      apexChat: arm === 'tiered' ? apexChat : null,
      apexModel,
      seeds,
      concurrency,
      policy,
    });
    // Let the caller checkpoint after every arm: a live run that dies
    // mid-sweep (rate limit, 402, network) keeps every finished arm.
    if (onArmDone) onArmDone(arm, byArm[arm]);
  }
  return byArm;
}

function armRow(arm, units, { confidence, iterations, bootstrapSeed }) {
  const ci = summarizeWithCI(
    units.map((u) => ({ pass: u.passed, cost: u.cost, seed: u.seed ?? 0 })),
    { confidence, iterations, bootstrapSeed },
  );
  const n = units.length;
  return {
    arm,
    tier: arm === 'tiered' ? null : staticArmTier(arm),
    n,
    passes: ci.passes,
    passRate: ci.passRate,
    cost: ci.totalCost,
    costPerPass: ci.costPerPass,
    costPerPassCI: ci.costPerPassCI,
    escalated: units.filter((u) => u.escalated).length,
    apexResolved: units.filter((u) => u.apexResolved).length,
    tokens: units.reduce((s, u) => s + (u.tokensIn ?? 0) + (u.tokensOut ?? 0), 0),
  };
}

/**
 * Summarize an ablation run: { arms: [...rows], diffs: [...], bestStatic,
 * headline, perCategory }. `byArm` is { [arm]: units[] } from runAblation.
 */
export function summarizeAblation(byArm, { confidence = 0.95, iterations = 2000, bootstrapSeed = 42 } = {}) {
  const armNames = Object.keys(byArm);
  if (!armNames.includes('tiered')) throw new Error('summarizeAblation: byArm must include the tiered arm');
  const rows = armNames.map((arm) => armRow(arm, byArm[arm], { confidence, iterations, bootstrapSeed }));
  const tiered = rows.find((r) => r.arm === 'tiered');
  const statics = rows.filter((r) => r.arm !== 'tiered');

  // tiered − static, per static arm.
  const diffs = statics.map((s) => {
    const d = newcombeDiffInterval(tiered.passes, tiered.n, s.passes, s.n, { confidence });
    return {
      arm: s.arm,
      tier: s.tier,
      passDiff: d, // {point, lower, upper, significant}
      costRatio: s.cost > 0 ? tiered.cost / s.cost : Infinity,
      costPerPassRatio: Number.isFinite(s.costPerPass) && s.costPerPass > 0 && Number.isFinite(tiered.costPerPass)
        ? tiered.costPerPass / s.costPerPass
        : null,
    };
  });

  // Best static pick = highest pass rate; ties broken by lower $/pass. This
  // is the strongest baseline an oracle up-front classifier could reach by
  // guessing one tier for the whole suite.
  const bestStatic = statics.length
    ? statics.reduce((best, r) => {
        if (!best) return r;
        if (r.passRate.point > best.passRate.point) return r;
        if (r.passRate.point === best.passRate.point && r.costPerPass < best.costPerPass) return r;
        return best;
      }, null)
    : null;
  const headline = bestStatic
    ? {
        bestStatic: bestStatic.arm,
        diff: diffs.find((d) => d.arm === bestStatic.arm),
        tieredPass: tiered.passRate.point,
        bestStaticPass: bestStatic.passRate.point,
        tieredCostPerPass: tiered.costPerPass,
        bestStaticCostPerPass: bestStatic.costPerPass,
      }
    : null;

  // Per-category pass counts per arm — the agentic suite sets task.category
  // to the existing taxonomy so this slots into the per-category ledger.
  const perCategory = {};
  for (const arm of armNames) {
    for (const u of byArm[arm]) {
      const cat = u.category ?? 'unknown';
      perCategory[cat] ??= {};
      perCategory[cat][arm] ??= { n: 0, passes: 0, cost: 0 };
      perCategory[cat][arm].n++;
      if (u.passed) perCategory[cat][arm].passes++;
      perCategory[cat][arm].cost += u.cost ?? 0;
    }
  }

  return { arms: rows, diffs, bestStatic: bestStatic?.arm ?? null, headline, perCategory, confidence };
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const pp = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}pp`;
const money = (v) => (Number.isFinite(v) ? `$${v.toFixed(4)}` : '∞');

/** Print one vendor/suite ablation summary. */
export function printAblation(summary, { vendor, suite, seeds = 1, policyVersion = 'latest', mock = false } = {}) {
  const conf = `${(summary.confidence * 100).toFixed(0)}%`;
  console.log('\n' + '='.repeat(78));
  console.log(`ABLATION · ${vendor} / ${suite} · policy ${policyVersion} · ${seeds} seed(s)${mock ? ' · MOCK' : ''}`);
  console.log('rubric + verification-gated escalation (tiered) vs. static single-tier picks');
  console.log('='.repeat(78));
  console.log(`${'arm'.padEnd(17)}${'pass'.padEnd(9)}${`${conf} CI`.padEnd(11)}${'cost$'.padEnd(10)}${'$/completed'.padEnd(13)}${'esc%'.padEnd(6)}apex`);
  for (const r of summary.arms) {
    console.log(
      `${r.arm.padEnd(17)}${`${r.passes}/${r.n}`.padEnd(9)}${`${pct(r.passRate.lower)}–${pct(r.passRate.upper)}`.padEnd(11)}${r.cost.toFixed(4).padEnd(10)}${money(r.costPerPass).padEnd(13)}${pct(r.n ? r.escalated / r.n : 0).padEnd(6)}${r.apexResolved}`,
    );
  }

  console.log(`\ntiered − static (pass-rate diff, Newcombe ${conf} CI)`);
  console.log(`${'vs'.padEnd(17)}${'Δpass'.padEnd(10)}${'CI'.padEnd(20)}${'sig'.padEnd(5)}${'cost×'.padEnd(8)}$/completed×`);
  for (const d of summary.diffs) {
    const ci = `[${pp(d.passDiff.lower)}, ${pp(d.passDiff.upper)}]`;
    const cpp = d.costPerPassRatio == null ? '—' : `${d.costPerPassRatio.toFixed(2)}×`;
    console.log(
      `${d.arm.padEnd(17)}${pp(d.passDiff.point).padEnd(10)}${ci.padEnd(20)}${(d.passDiff.significant ? 'yes' : 'no').padEnd(5)}${(Number.isFinite(d.costRatio) ? `${d.costRatio.toFixed(2)}×` : '∞').padEnd(8)}${cpp}`,
    );
  }

  if (summary.headline) {
    const h = summary.headline;
    const d = h.diff.passDiff;
    const cppNote = Number.isFinite(h.tieredCostPerPass) && Number.isFinite(h.bestStaticCostPerPass)
      ? `${money(h.tieredCostPerPass)} vs ${money(h.bestStaticCostPerPass)} per completed task (${(h.tieredCostPerPass / h.bestStaticCostPerPass).toFixed(2)}×)`
      : 'cost per completed task undefined for one arm (zero completions)';
    console.log(
      `\nHEADLINE: tiered ${pct(h.tieredPass)} vs best static pick ${h.bestStatic} ${pct(h.bestStaticPass)} → ${pp(d.point)} [${pp(d.lower)}, ${pp(d.upper)}]${d.significant ? ', significant' : ', not significant'} at ${conf}; ${cppNote}.`,
    );
  }

  const cats = Object.keys(summary.perCategory).sort();
  if (cats.length > 1) {
    const arms = summary.arms.map((r) => r.arm);
    console.log(`\nper-category pass (n per arm = tasks × seeds)`);
    console.log(`${'category'.padEnd(15)}${arms.map((a) => a.replace('static-', 's-').padEnd(11)).join('')}`);
    for (const cat of cats) {
      const cells = arms.map((a) => {
        const c = summary.perCategory[cat][a];
        return (c ? `${c.passes}/${c.n}` : '—').padEnd(11);
      });
      console.log(`${cat.padEnd(15)}${cells.join('')}`);
    }
  }
}
