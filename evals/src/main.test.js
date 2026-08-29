// Unit tests for main.js's computeStats() — the additive stats[vendor][arm][suite]
// sibling to results[vendor][arm][suite], per business/build-backlog-2026-08-20-round3.md
// §2 ("Output format stays additive").

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from './main.js';

function unit({ passed, cost, seed }) {
  return { passed, cost, seed };
}

describe('computeStats', () => {
  test('produces a stats cell with pass-rate Wilson CI and cost-per-pass bootstrap CI', () => {
    const results = {
      anthropic: {
        tiered: {
          code: [
            unit({ passed: true, cost: 0.01, seed: 0 }),
            unit({ passed: true, cost: 0.01, seed: 0 }),
            unit({ passed: false, cost: 0.01, seed: 1 }),
            unit({ passed: true, cost: 0.01, seed: 1 }),
          ],
        },
      },
    };

    const stats = computeStats(results);
    const cell = stats.anthropic.tiered.code;

    assert.equal(cell.n, 4);
    assert.equal(cell.passes, 3);
    // Wilson point estimate matches the raw proportion.
    assert.ok(Math.abs(cell.passRate.point - 0.75) < 1e-9);
    assert.ok(cell.passRate.lower >= 0 && cell.passRate.lower <= cell.passRate.point);
    assert.ok(cell.passRate.upper <= 1 && cell.passRate.upper >= cell.passRate.point);
    // Cost-per-pass CI is present and bracketed sanely.
    assert.ok(cell.costPerPassCI.lower <= cell.costPerPass);
    assert.ok(cell.costPerPassCI.upper >= cell.costPerPass);
  });

  test('mirrors the full results[vendor][arm][suite] tree shape', () => {
    const results = {
      v1: {
        armA: { s1: [unit({ passed: true, cost: 1, seed: 0 })] },
        armB: { s1: [unit({ passed: false, cost: 1, seed: 0 })] },
      },
      v2: {
        armA: { s1: [unit({ passed: true, cost: 1, seed: 0 })] },
      },
    };
    const stats = computeStats(results);
    assert.deepEqual(Object.keys(stats).sort(), ['v1', 'v2']);
    assert.deepEqual(Object.keys(stats.v1).sort(), ['armA', 'armB']);
    assert.ok(stats.v1.armA.s1);
    assert.ok(stats.v1.armB.s1);
    assert.ok(stats.v2.armA.s1);
  });

  test('skips empty unit arrays without throwing', () => {
    const results = { v1: { armA: { s1: [] } } };
    const stats = computeStats(results);
    assert.equal(stats.v1.armA.s1, undefined);
  });
});
