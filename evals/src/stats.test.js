// Unit tests for stats.js — wilsonInterval, seedBootstrapCI, summarizeWithCI.
// See business/build-backlog-2026-08-20-round3.md §2 for the design spec
// this implements.
//
// Reference values for wilsonInterval are the standard closed-form Wilson
// score formula evaluated independently (by hand / calculator, not by
// running this module) for well-known textbook cases — most notably
// n=100, x=50 -> (0.404, 0.596) at z=1.96, a figure widely cited in
// treatments of the Wilson interval (e.g. Wikipedia's "binomial proportion
// confidence interval" comparison table) precisely because p=0.5 keeps the
// arithmetic checkable by hand: z²/n = 3.8416/100 = 0.038416, so the interval
// half-width and recentering are easy to verify without a computer.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { wilsonInterval, seedBootstrapCI, summarizeWithCI } from './stats.js';

// --- wilsonInterval ----------------------------------------------------

describe('wilsonInterval', () => {
  test('textbook case: n=100, x=50 (p=0.5), z=1.96 -> (0.404, 0.596)', () => {
    const { point, lower, upper } = wilsonInterval(50, 100);
    assert.equal(point, 0.5);
    assert.ok(Math.abs(lower - 0.4038) < 1e-3, `lower=${lower}`);
    assert.ok(Math.abs(upper - 0.5962) < 1e-3, `upper=${upper}`);
  });

  test('n=20, x=10 (p=0.5), z=1.96 -> (0.299, 0.701)', () => {
    const { lower, upper } = wilsonInterval(10, 20);
    assert.ok(Math.abs(lower - 0.2993) < 1e-3, `lower=${lower}`);
    assert.ok(Math.abs(upper - 0.7007) < 1e-3, `upper=${upper}`);
  });

  test('interval is symmetric around p only when p=0.5; center still pulled toward 0.5 in general', () => {
    // n=50, x=33 (p=0.66): Wilson recenters below the raw proportion because
    // p > 0.5, so lower..upper does not straddle p symmetrically.
    const { point, lower, upper } = wilsonInterval(33, 50);
    assert.ok(Math.abs(point - 0.66) < 1e-9);
    assert.ok(upper - point < point - lower, 'upper margin should be smaller than lower margin when p > 0.5');
  });

  test('zero successes: lower bound is exactly 0, upper bound stays within [0,1]', () => {
    const { lower, upper } = wilsonInterval(0, 10);
    assert.equal(lower, 0);
    assert.ok(upper > 0 && upper < 1);
  });

  test('all successes: upper bound is 1 (within floating-point epsilon), lower bound stays within [0,1]', () => {
    const { lower, upper } = wilsonInterval(10, 10);
    assert.ok(Math.abs(upper - 1) < 1e-9, `upper=${upper}`);
    assert.ok(lower > 0 && lower < 1);
  });

  test('n=0 returns a degenerate zero-width interval at 0, not a throw or NaN', () => {
    const result = wilsonInterval(0, 0);
    assert.deepEqual(result, { point: 0, lower: 0, upper: 0, n: 0, confidence: 0.95 });
  });

  test('supports alternate confidence levels (90%) with a tighter interval than 95%', () => {
    const ci95 = wilsonInterval(50, 100, { confidence: 0.95 });
    const ci90 = wilsonInterval(50, 100, { confidence: 0.9 });
    assert.ok(ci90.upper - ci90.lower < ci95.upper - ci95.lower);
  });

  test('rejects an unsupported confidence level rather than silently mis-computing', () => {
    assert.throws(() => wilsonInterval(5, 10, { confidence: 0.5 }), /unsupported confidence level/);
  });

  test('rejects successes > total', () => {
    assert.throws(() => wilsonInterval(11, 10), /invalid successes\/total/);
  });
});

// --- seedBootstrapCI -----------------------------------------------------

describe('seedBootstrapCI', () => {
  const sum = (arr) => arr.reduce((s, u) => s + u.cost, 0);
  const mean = (arr) => sum(arr) / arr.length;

  test('point estimate is the statistic on the full pooled data, independent of resampling', () => {
    const seedGroups = [
      [{ cost: 1 }, { cost: 2 }],
      [{ cost: 3 }, { cost: 4 }],
      [{ cost: 5 }],
    ];
    const { point } = seedBootstrapCI(seedGroups, mean, { iterations: 500 });
    assert.ok(Math.abs(point - 3) < 1e-9); // mean of [1,2,3,4,5]
  });

  test('same seed + same data => identical bounds across repeated calls (determinism)', () => {
    const seedGroups = [
      [{ cost: 10 }, { cost: 12 }],
      [{ cost: 8 }],
      [{ cost: 20 }, { cost: 22 }, { cost: 18 }],
      [{ cost: 5 }],
    ];
    const a = seedBootstrapCI(seedGroups, mean, { iterations: 1000, seed: 7 });
    const b = seedBootstrapCI(seedGroups, mean, { iterations: 1000, seed: 7 });
    assert.deepEqual(a, b);
  });

  test('different seeds produce different (but each internally valid) bounds', () => {
    const seedGroups = [
      [{ cost: 1 }, { cost: 100 }],
      [{ cost: 2 }],
      [{ cost: 3 }],
      [{ cost: 4 }],
      [{ cost: 5 }],
    ];
    const a = seedBootstrapCI(seedGroups, mean, { iterations: 1000, seed: 1 });
    const b = seedBootstrapCI(seedGroups, mean, { iterations: 1000, seed: 2 });
    assert.notEqual(a.lower, b.lower);
    assert.ok(a.lower <= a.upper);
    assert.ok(b.lower <= b.upper);
  });

  test('constant data across all seeds collapses to a zero-width interval at that constant', () => {
    const seedGroups = [[{ cost: 7 }], [{ cost: 7 }], [{ cost: 7 }]];
    const { point, lower, upper } = seedBootstrapCI(seedGroups, mean, { iterations: 500 });
    assert.equal(point, 7);
    assert.equal(lower, 7);
    assert.equal(upper, 7);
  });

  test('seed-level clustering: a single volatile seed produces wider bounds than the same total variance spread evenly', () => {
    // Clustered: all the high-cost units live in one seed, so resampling can
    // either include or exclude that whole seed -> high variance.
    const clustered = [
      [{ cost: 1 }, { cost: 1 }, { cost: 1 }],
      [{ cost: 1 }, { cost: 1 }, { cost: 1 }],
      [{ cost: 100 }, { cost: 100 }, { cost: 100 }],
    ];
    // Evenly spread: the same nine values, but the outliers are distributed
    // one-per-seed, so every resample sees a mix.
    const spread = [
      [{ cost: 1 }, { cost: 1 }, { cost: 100 }],
      [{ cost: 1 }, { cost: 1 }, { cost: 100 }],
      [{ cost: 1 }, { cost: 1 }, { cost: 100 }],
    ];
    const a = seedBootstrapCI(clustered, mean, { iterations: 3000, seed: 3 });
    const b = seedBootstrapCI(spread, mean, { iterations: 3000, seed: 3 });
    assert.ok(a.upper - a.lower > b.upper - b.lower, 'clustered variance should yield a wider CI than evenly-spread variance');
  });

  test('ratio statistic (cost/pass) is computed on pooled units, not averaged per-seed', () => {
    // Seed A: 1 pass at cost 10. Seed B: 1 pass at cost 0 (free) plus 1 fail.
    // Naive average-of-per-seed-ratios would give (10 + 0) / 2 = 5.
    // Pooled cost/pass is (10 + 0) / 2 passes = 5 as well here by
    // coincidence of these numbers, so use an asymmetric case instead.
    const seedGroups = [
      [{ cost: 10, pass: true }],
      [
        { cost: 0, pass: true },
        { cost: 0, pass: true },
        { cost: 30, pass: false },
      ],
    ];
    const costPerPass = (pooled) => {
      const cost = pooled.reduce((s, u) => s + u.cost, 0);
      const passCount = pooled.filter((u) => u.pass).length;
      return cost / passCount;
    };
    const { point } = seedBootstrapCI(seedGroups, costPerPass, { iterations: 200 });
    // Pooled: total cost = 10+0+0+30 = 40, total passes = 3 -> 40/3.
    // A naive mean of per-seed ratios (10/1, 0/2) would give 5, not 40/3.
    assert.ok(Math.abs(point - 40 / 3) < 1e-9);
    assert.notEqual(point, 5);
  });

  test('rejects an empty seedGroups array', () => {
    assert.throws(() => seedBootstrapCI([], mean), /non-empty array/);
  });

  test('rejects iterations < 1', () => {
    assert.throws(() => seedBootstrapCI([[{ cost: 1 }]], mean, { iterations: 0 }), /iterations must be/);
  });
});

// --- summarizeWithCI -----------------------------------------------------

describe('summarizeWithCI', () => {
  test('combines pass-rate Wilson CI and cost-per-pass bootstrap CI over a flat unit list', () => {
    const units = [
      { seed: 0, pass: true, cost: 0.01 },
      { seed: 0, pass: false, cost: 0.01 },
      { seed: 1, pass: true, cost: 0.02 },
      { seed: 1, pass: true, cost: 0.01 },
    ];
    const summary = summarizeWithCI(units, { iterations: 500 });
    assert.equal(summary.n, 4);
    assert.equal(summary.passes, 3);
    assert.ok(Math.abs(summary.passRate.point - 0.75) < 1e-9);
    assert.ok(summary.passRate.lower < 0.75 && summary.passRate.upper > 0.75);
    assert.ok(Math.abs(summary.totalCost - 0.05) < 1e-9);
    assert.ok(Math.abs(summary.costPerPass - 0.05 / 3) < 1e-9);
    assert.ok(summary.costPerPassCI.lower <= summary.costPerPass + 1e-9);
  });

  test('all-failing suite reports costPerPass as Infinity without throwing', () => {
    const units = [
      { seed: 0, pass: false, cost: 0.5 },
      { seed: 1, pass: false, cost: 0.5 },
    ];
    const summary = summarizeWithCI(units, { iterations: 200 });
    assert.equal(summary.passes, 0);
    assert.equal(summary.costPerPass, Infinity);
  });

  test('supports a custom seedKey for harnesses that name the field differently', () => {
    const units = [
      { runSeed: 'a', pass: true, cost: 1 },
      { runSeed: 'b', pass: true, cost: 3 },
    ];
    const summary = summarizeWithCI(units, { seedKey: 'runSeed', iterations: 200 });
    assert.equal(summary.n, 2);
    assert.equal(summary.passes, 2);
  });
});
