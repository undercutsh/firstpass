// Confidence-interval tooling for the eval harness.
// See business/build-backlog-2026-08-20-round3.md §2 for the design spec
// this implements. Two statistics:
//
//   - wilsonInterval    — proportion CI (pass rate). Well-behaved near 0/100%,
//                         unlike the normal (Wald) approximation many cells
//                         sit near.
//   - seedBootstrapCI   — CI for continuous/ratio metrics (cost, $/pass) via
//                         percentile bootstrap, resampling whole SEEDS (not
//                         individual units). runner.js's apex-batching path
//                         splits one batched call's cost across all residual
//                         units in a seed, so units within a seed aren't
//                         independent draws — unit-level resampling would
//                         understate variance.
//
// summarizeWithCI() composes both over a flat unit list. Not yet wired into
// main.js/runner.js — see the PR description for why.

// Standard normal critical values for common two-sided confidence levels.
const Z_SCORES = {
  0.8: 1.2815515655446004,
  0.9: 1.6448536269514722,
  0.95: 1.959963984540054,
  0.99: 2.5758293035489004,
};

function zFor(confidence) {
  const z = Z_SCORES[confidence];
  if (z === undefined) {
    throw new Error(`unsupported confidence level ${confidence}; add it to Z_SCORES`);
  }
  return z;
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * successes/total -> {point, lower, upper}, all in [0, 1]. Unlike the naive
 * p ± z*sqrt(p(1-p)/n) (Wald) interval, this stays inside [0, 1] and doesn't
 * collapse to a zero-width interval at p = 0 or p = 1.
 */
export function wilsonInterval(successes, total, { confidence = 0.95 } = {}) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 0 || successes > total) {
    throw new Error(`wilsonInterval: invalid successes/total (${successes}/${total})`);
  }
  if (total === 0) {
    return { point: 0, lower: 0, upper: 0, n: 0, confidence };
  }

  const z = zFor(confidence);
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  // Wilson center: the MLE p pulled toward 0.5 by z²/(2n), then renormalized
  // by (1 + z²/n) — this recentering (not just the margin) is what keeps the
  // interval inside [0, 1] at the extremes.
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;

  return {
    point: p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    n: total,
    confidence,
  };
}

// Deterministic PRNG (mulberry32) so re-runs with the same `seed` reproduce
// identical bootstrap bounds. Not cryptographic — just needs to be fast,
// seedable, and reasonably well-distributed for resampling indices.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Percentile bootstrap CI for a statistic computed on pooled units, resampling
 * whole seed-clusters with replacement (not individual units).
 *
 * @param {Array<Array<any>>} seedGroups - one array of unit-records per seed.
 * @param {(units: any[]) => number} statisticFn - reduces a pooled unit array
 *   (e.g. concatenated resampled seeds) to a single number, e.g. total cost /
 *   total passes. Ratio statistics like $/pass MUST be computed on the pooled
 *   array, not averaged from a per-seed ratio, or the estimate is biased
 *   toward whichever seed has fewer passes.
 * @param {object} [opts]
 * @param {number} [opts.iterations=2000] - bootstrap replicate count.
 * @param {number} [opts.confidence=0.95]
 * @param {number} [opts.seed=42] - PRNG seed; same seed + data => same bounds.
 */
export function seedBootstrapCI(seedGroups, statisticFn, opts = {}) {
  const { iterations = 2000, confidence = 0.95, seed = 42 } = opts;
  if (!Array.isArray(seedGroups) || seedGroups.length === 0) {
    throw new Error('seedBootstrapCI: seedGroups must be a non-empty array of per-seed arrays');
  }
  if (iterations < 1) {
    throw new Error('seedBootstrapCI: iterations must be >= 1');
  }

  const k = seedGroups.length;
  const point = statisticFn(seedGroups.flat());

  const rng = mulberry32(seed);
  const replicates = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const resampled = [];
    for (let j = 0; j < k; j++) {
      const idx = Math.floor(rng() * k);
      resampled.push(...seedGroups[idx]);
    }
    replicates[i] = statisticFn(resampled);
  }
  replicates.sort((a, b) => a - b);

  const alpha = 1 - confidence;
  // Percentile method: clamp so a single-seed / tiny-iterations input can't
  // index out of bounds.
  const lowerIdx = Math.max(0, Math.min(iterations - 1, Math.floor((alpha / 2) * iterations)));
  const upperIdx = Math.max(0, Math.min(iterations - 1, Math.ceil((1 - alpha / 2) * iterations) - 1));

  return {
    point,
    lower: replicates[lowerIdx],
    upper: replicates[upperIdx],
    iterations,
    seed,
    confidence,
  };
}

/**
 * Groups a flat unit list by seed, keyed by `keyFn` (default: u.seed).
 * Returns an array of arrays in first-seen seed order.
 */
function groupBySeed(units, keyFn) {
  const order = [];
  const byKey = new Map();
  for (const unit of units) {
    const key = keyFn(unit);
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key).push(unit);
  }
  return order.map((key) => byKey.get(key));
}

/**
 * Pass rate (Wilson CI) + cost-per-pass (seed-cluster bootstrap CI) over a
 * flat unit list. Each unit is expected to carry a boolean-ish `pass`, a
 * numeric `cost`, and a `seed` field (or pass `seedKey` to name a different
 * field — units don't carry `seed` yet as of this change; see PR body).
 */
export function summarizeWithCI(units, opts = {}) {
  const { seedKey = 'seed', confidence = 0.95, iterations = 2000, bootstrapSeed = 42 } = opts;

  const n = units.length;
  const passes = units.filter((u) => !!u.pass).length;
  const totalCost = units.reduce((sum, u) => sum + (u.cost ?? 0), 0);

  // Empty unit list (e.g. a suite/category with nothing in it): short-circuit
  // before seedBootstrapCI, which requires a non-empty seedGroups array and
  // would otherwise throw. Degenerate zero-width summary, matching
  // wilsonInterval's own n=0 behavior instead of crashing the caller.
  if (n === 0) {
    return {
      n: 0,
      passes: 0,
      passRate: wilsonInterval(0, 0, { confidence }),
      totalCost: 0,
      costPerPass: Infinity,
      costPerPassCI: { point: Infinity, lower: Infinity, upper: Infinity, iterations, seed: bootstrapSeed, confidence },
    };
  }

  const costPerPassStat = (pooled) => {
    const cost = pooled.reduce((sum, u) => sum + (u.cost ?? 0), 0);
    const pass = pooled.filter((u) => !!u.pass).length;
    return pass > 0 ? cost / pass : Infinity;
  };

  const seedGroups = groupBySeed(units, (u) => u[seedKey]);
  const costPerPassCI = seedBootstrapCI(seedGroups, costPerPassStat, {
    iterations,
    confidence,
    seed: bootstrapSeed,
  });

  return {
    n,
    passes,
    passRate: wilsonInterval(passes, n, { confidence }),
    totalCost,
    costPerPass: passes > 0 ? totalCost / passes : Infinity,
    costPerPassCI,
  };
}
