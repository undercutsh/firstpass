// Unit tests for policy.js — pure-function tier assignment/escalation logic.
// See business/build-backlog-2026-08-20-round3.md §7 for the sketch this
// implements. No I/O, no mocking: policy.js is pure logic over task/flags
// objects.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicy, countFlags } from './policy.js';
import { makeTask } from './tasks.js';
import { TIER_ORDER } from './config.js';
import { codeSuite } from './suites/code.js';
import { reasoningSuite } from './suites/reasoning.js';
import { mechanicalSuite } from './suites/mechanical.js';
import { debugSuite } from './suites/debug.js';
import { refactorSuite } from './suites/refactor.js';
import { documentationSuite } from './suites/documentation.js';
import { securitySuite } from './suites/security.js';

// --- countFlags boundary tests: 0/1/2/3 flags -------------------------------

describe('countFlags', () => {
  test('0 flags set', () => {
    const task = makeTask({ id: 't0', category: 'reasoning', prompt: 'x', flags: {}, answerKey: 'x', grader: () => {} });
    assert.equal(countFlags(task), 0);
  });

  test('1 flag set', () => {
    const task = makeTask({ id: 't1', category: 'reasoning', prompt: 'x', flags: { unverifiable: true }, answerKey: 'x', grader: () => {} });
    assert.equal(countFlags(task), 1);
  });

  test('2 flags set', () => {
    const task = makeTask({
      id: 't2',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, ambiguous: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(countFlags(task), 2);
  });

  test('3 flags set', () => {
    const task = makeTask({
      id: 't3',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, ambiguous: true, blast: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(countFlags(task), 3);
  });
});

// --- baseTier() across policy versions --------------------------------------

describe('baseTier — zero-flag units still base at cheap on every version', () => {
  // The cheap-to-verify principle survives the semantics correction exactly
  // here: a mechanically verifiable unit with nothing else flagged scores 0
  // rubric flags and bases at 'cheap'. What no longer happens is verifiability
  // clamping a BLAST / 3+-flag unit down to 'cheap' (see the reachability
  // tests at the bottom of this file).
  for (const version of ['v1', 'probe', 'latest']) {
    test(`${version}: verifiable, no flags -> cheap`, () => {
      const policy = createPolicy(version);
      const task = makeTask({ id: 'a', category: 'mechanical', prompt: 'x', flags: {}, answerKey: 'x', grader: () => {} });
      assert.equal(policy.baseTier(task), 'cheap');
    });
  }
});

describe('baseTier — v1-vs-probe/latest formatStrict divergence', () => {
  // A task that is BOTH format-strict and cheap-to-verify (unverifiable:
  // false). This is the exact case round 5's finding (documented in
  // policy.js's header comment) reversed for `probe`: `latest` hardcodes
  // formatStrict -> 'standard' unconditionally; v1 has no formatStrict
  // concept at all and probe deliberately restores cheap-first.
  const formatStrictVerifiable = () =>
    makeTask({
      id: 'fs-verifiable',
      category: 'mechanical',
      prompt: 'x',
      flags: { formatStrict: true, unverifiable: false },
      answerKey: 'x',
      grader: () => {},
    });

  // UPDATED with the cheap-to-verify semantics correction. Both cases below
  // asserted 'cheap' while the `if (!flags.unverifiable) return 'cheap'` clamp
  // existed, i.e. they pinned the defect: the clamp fired for every verifiable
  // unit and returned before the rubric ran. FORMAT-STRICT is itself one of
  // the six rubric flags, so this unit scores 1 flag and the rubric's
  // "1-2 flags -> standard" row now governs.
  test('v1: formatStrict is a counted flag -> 1 flag -> standard', () => {
    const policy = createPolicy('v1');
    assert.equal(countFlags(formatStrictVerifiable()), 1);
    assert.equal(policy.baseTier(formatStrictVerifiable()), 'standard');
  });

  test('probe: formatStrict is a counted flag -> 1 flag -> standard', () => {
    const policy = createPolicy('probe');
    assert.equal(policy.baseTier(formatStrictVerifiable()), 'standard');
  });

  test('latest hardcodes formatStrict -> standard (same tier, via its own guard)', () => {
    const policy = createPolicy('latest');
    assert.equal(policy.baseTier(formatStrictVerifiable()), 'standard');
  });

  // A second case: formatStrict + unverifiable + blast (would independently
  // route to 'frontier' via the ownership/judgment rule). `latest`'s
  // hardcoded formatStrict rule fires FIRST and overrides that entirely —
  // v1/probe fall through to the flags-count/blast logic instead.
  const formatStrictUnverifiableBlast = () =>
    makeTask({
      id: 'fs-unverifiable-blast',
      category: 'reasoning',
      prompt: 'x',
      flags: { formatStrict: true, unverifiable: true, blast: true },
      answerKey: 'x',
      grader: () => {},
    });

  test('v1: formatStrict is just another flag, blast still forces frontier', () => {
    const policy = createPolicy('v1');
    assert.equal(policy.baseTier(formatStrictUnverifiableBlast()), 'frontier');
  });

  // UPDATED: this asserted 'frontier' for probe, which is a base tier ABOVE
  // probe's own capTier() of 'standard' for formatStrict work. That is not a
  // harmless mismatch: runUnitLadder() terminates only on `tier === cap`, so a
  // unit starting above its cap escalates past frontier to apex and then spins
  // at apex forever (escalate() saturates while the cap check never matches).
  // baseTier() now clamps to capTier(), so probe bases this unit at 'standard'.
  test('probe: rubric says frontier but the formatStrict cap is standard -> clamped to standard', () => {
    const policy = createPolicy('probe');
    assert.equal(policy.capTier(formatStrictUnverifiableBlast()), 'standard');
    assert.equal(policy.baseTier(formatStrictUnverifiableBlast()), 'standard');
  });

  test('latest: hardcoded formatStrict rule wins over blast -> standard', () => {
    const policy = createPolicy('latest');
    assert.equal(policy.baseTier(formatStrictUnverifiableBlast()), 'standard');
  });
});

describe('baseTier — flag-count ladder for unverifiable tasks (shared by v1/probe)', () => {
  // NOTE: countFlags() counts ALL true flags, including `unverifiable`
  // itself — so an unverifiable task with no other flags already has
  // countFlags() === 1, not 0, and cannot reach 'cheap'. That is the whole
  // mechanism by which mechanical verifiability lowers a unit's tier now:
  // one fewer counted flag, not a clamp to 'cheap'.
  test('unverifiable with no other flags -> countFlags is 1 -> standard', () => {
    const policy = createPolicy('probe');
    const task = makeTask({ id: 'u0', category: 'reasoning', prompt: 'x', flags: { unverifiable: true }, answerKey: 'x', grader: () => {} });
    assert.equal(countFlags(task), 1);
    assert.equal(policy.baseTier(task), 'standard');
  });

  test('unverifiable + 1 extra flag -> standard', () => {
    const policy = createPolicy('probe');
    const task = makeTask({
      id: 'u1',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, ambiguous: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(policy.baseTier(task), 'standard');
  });

  test('3+ extra flags -> frontier', () => {
    const policy = createPolicy('probe');
    const task = makeTask({
      id: 'u3',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, ambiguous: true, crossCutting: true, novel: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(policy.baseTier(task), 'frontier');
  });

  test('blast alone forces frontier regardless of flag count', () => {
    const policy = createPolicy('probe');
    const task = makeTask({
      id: 'ublast',
      category: 'reasoning',
      prompt: 'x',
      flags: { unverifiable: true, blast: true },
      answerKey: 'x',
      grader: () => {},
    });
    assert.equal(policy.baseTier(task), 'frontier');
  });
});

// --- escalate(): never overruns the ladder, idempotent at top tier ---------

describe('escalate', () => {
  test('steps up one tier at a time through the full ladder', () => {
    const policy = createPolicy('latest');
    assert.equal(policy.escalate('cheap'), 'standard');
    assert.equal(policy.escalate('standard'), 'frontier');
    assert.equal(policy.escalate('frontier'), 'apex');
  });

  test('never overruns the ladder: escalating the top tier stays at the top tier', () => {
    const policy = createPolicy('latest');
    assert.equal(policy.escalate('apex'), TIER_ORDER[TIER_ORDER.length - 1]);
  });

  test('idempotent at the top tier across repeated calls', () => {
    const policy = createPolicy('latest');
    let tier = 'apex';
    for (let i = 0; i < 5; i++) tier = policy.escalate(tier);
    assert.equal(tier, 'apex');
  });

  test('behavior is identical across policy versions (escalate has no version branching)', () => {
    for (const version of ['v1', 'probe', 'latest']) {
      const policy = createPolicy(version);
      assert.equal(policy.escalate('cheap'), 'standard');
      assert.equal(policy.escalate('apex'), 'apex');
    }
  });
});

// --- capTier(): direct coverage (previously only exercised indirectly via
// baseTier's formatStrict fallthrough) ---------------------------------------

describe('capTier', () => {
  const task = (flags) => makeTask({ id: 'c', category: 'mechanical', prompt: 'x', flags, answerKey: 'x', grader: () => {} });

  test('v1 always caps at frontier, formatStrict or not (no formatStrict concept)', () => {
    const policy = createPolicy('v1');
    assert.equal(policy.capTier(task({})), 'frontier');
    assert.equal(policy.capTier(task({ formatStrict: true })), 'frontier');
  });

  for (const version of ['latest', 'probe']) {
    test(`${version}: non-formatStrict task caps at frontier`, () => {
      const policy = createPolicy(version);
      assert.equal(policy.capTier(task({})), 'frontier');
    });

    test(`${version}: formatStrict task caps at standard (never spends frontier on format work)`, () => {
      const policy = createPolicy(version);
      assert.equal(policy.capTier(task({ formatStrict: true })), 'standard');
    });
  }
});

// --- runUnitLadder(): escalation trace, hysteresis, and the apex cap -------
// Previously untested directly — only exercised indirectly through
// runner.test.js's seed-tagging tests via a mock attempter that never
// exercises retries, uncertainty, or the needsApex cap path.

describe('runUnitLadder', () => {
  const task = (flags = {}) => makeTask({ id: 'ladder-task', category: 'reasoning', prompt: 'x', flags, answerKey: 'x', grader: () => {} });

  const passResult = { answer: 'ok', status: 'grounded', uncertaintyReason: null, verdict: { pass: true, reason: 'ok' }, cost: 1 };
  const failResult = { answer: 'bad', status: 'grounded', uncertaintyReason: null, verdict: { pass: false, reason: 'nope' }, cost: 1 };
  const uncertainResult = { answer: null, status: 'uncertain', uncertaintyReason: 'unsure', verdict: { pass: false, reason: 'unsure' }, cost: 1 };

  test('passes on the very first attempt: single attempt, no escalation', async () => {
    const policy = createPolicy('latest');
    const attempt = async () => passResult;
    const trace = await policy.runUnitLadder(task(), attempt);
    assert.equal(trace.attempts.length, 1);
    assert.equal(trace.finalTier, 'cheap');
    assert.equal(trace.escalated, false);
    assert.equal(trace.needsApex, false);
  });

  test('hysteresis: one retry at the same tier on failure before escalating', async () => {
    const policy = createPolicy('latest');
    let calls = 0;
    // Fail twice at cheap (initial + 1 retry), then pass at standard.
    const attempt = async (tier) => {
      calls++;
      if (tier === 'cheap') return failResult;
      return passResult;
    };
    const trace = await policy.runUnitLadder(task(), attempt);
    assert.equal(calls, 3); // cheap, cheap (retry), standard (pass)
    assert.deepEqual(trace.attempts.map((a) => a.tier), ['cheap', 'cheap', 'standard']);
    assert.equal(trace.finalTier, 'standard');
    assert.equal(trace.escalated, true);
  });

  test('uncertain status escalates immediately, with no same-tier retry', async () => {
    const policy = createPolicy('latest');
    const attempt = async (tier) => (tier === 'cheap' ? uncertainResult : passResult);
    const trace = await policy.runUnitLadder(task(), attempt);
    assert.deepEqual(trace.attempts.map((a) => a.tier), ['cheap', 'standard']);
    assert.equal(trace.finalTier, 'standard');
  });

  test('never escalates past the cap: exhausting the cap tier marks needsApex instead of trying apex directly', async () => {
    const policy = createPolicy('latest');
    // Always fails, at every tier — should climb cheap -> standard -> frontier
    // (the v1/non-formatStrict cap) and stop there, never attempting 'apex'.
    const attempt = async () => failResult;
    const trace = await policy.runUnitLadder(task(), attempt);
    assert.equal(trace.needsApex, true);
    assert.equal(trace.finalTier, 'frontier');
    assert.ok(trace.attempts.every((a) => a.tier !== 'apex'), 'ladder must never call apex directly');
  });

  test('a formatStrict task under `latest` caps at standard, not frontier', async () => {
    const policy = createPolicy('latest');
    const attempt = async () => failResult;
    const trace = await policy.runUnitLadder(task({ formatStrict: true }), attempt);
    assert.equal(trace.needsApex, true);
    assert.equal(trace.finalTier, 'standard');
  });
});

// --- runUnitDual(): dual-run disagreement for ambiguous cheap work ---------
// Previously untested directly.

describe('runUnitDual', () => {
  const task = makeTask({ id: 'dual-task', category: 'reasoning', prompt: 'x', flags: { ambiguous: true }, answerKey: 'x', grader: () => {} });

  test('two agreeing, passing attempts: no escalation, settles at the low tier', async () => {
    const policy = createPolicy('latest');
    const attempt = async () => ({ answer: 'same', status: 'grounded', uncertaintyReason: null, verdict: { pass: true, reason: 'ok' }, cost: 1 });
    const result = await policy.runUnitDual(task, attempt);
    assert.equal(result.escalated, false);
    assert.equal(result.finalTier, 'cheap');
    assert.equal(result.attempts.length, 2);
  });

  test('two agreeing attempts that both FAIL still escalate (agreement alone is not enough)', async () => {
    const policy = createPolicy('latest');
    const attempt = async () => ({ answer: 'same', status: 'grounded', uncertaintyReason: null, verdict: { pass: false, reason: 'nope' }, cost: 1 });
    const result = await policy.runUnitDual(task, attempt);
    assert.equal(result.escalated, true);
    assert.equal(result.finalTier, null);
    assert.equal(result.disagreement, true);
  });

  test('two attempts with different answers escalate as a disagreement', async () => {
    const policy = createPolicy('latest');
    let call = 0;
    const attempt = async () => {
      call++;
      return { answer: call === 1 ? 'a' : 'b', status: 'grounded', uncertaintyReason: null, verdict: { pass: true, reason: 'ok' }, cost: 1 };
    };
    const result = await policy.runUnitDual(task, attempt);
    assert.equal(result.escalated, true);
    assert.equal(result.disagreement, true);
    assert.equal(result.finalTier, null);
  });

  test('respects a custom lowTier argument', async () => {
    const policy = createPolicy('latest');
    const seenTiers = [];
    const attempt = async (tier) => {
      seenTiers.push(tier);
      return { answer: 'x', status: 'grounded', uncertaintyReason: null, verdict: { pass: true, reason: 'ok' }, cost: 1 };
    };
    await policy.runUnitDual(task, attempt, 'standard');
    assert.deepEqual(seenTiers, ['standard', 'standard']);
  });
});

// --- baseTier(): every tier is reachable, and the corrected cheap-to-verify
// semantics are pinned ------------------------------------------------------
//
// These exist because of a reachability defect: baseTier() used to open with
//   if (!task.flags.unverifiable) return 'cheap';
// and `unverifiable` is false on all 69 hand-labelled suite tasks (it is also
// makeTask()'s default), so that line returned for every task in every suite
// and the 'frontier' arm below it had never once executed. Published benchmark
// numbers produced under it measured escalation behaviour, not the rubric.

describe('baseTier — tier reachability from synthetic flag combinations', () => {
  const task = (flags) => makeTask({ id: 'r', category: 'reasoning', prompt: 'x', flags, answerKey: 'x', grader: () => {} });

  test('cheap is reachable: 0 flags, every version', () => {
    for (const version of ['v1', 'probe', 'latest']) {
      assert.equal(createPolicy(version).baseTier(task({})), 'cheap');
    }
  });

  test('standard is reachable: 1-2 flags, every version', () => {
    for (const version of ['v1', 'probe', 'latest']) {
      assert.equal(createPolicy(version).baseTier(task({ novel: true })), 'standard');
      assert.equal(createPolicy(version).baseTier(task({ novel: true, crossCutting: true })), 'standard');
    }
  });

  test('frontier is reachable via 3+ flags on a mechanically VERIFIABLE unit', () => {
    // The exact shape the old clamp made unreachable: unverifiable === false
    // (so the unit is mechanically checkable) yet three other flags set.
    const t = task({ unverifiable: false, ambiguous: true, crossCutting: true, novel: true });
    assert.equal(countFlags(t), 3);
    for (const version of ['v1', 'probe', 'latest']) {
      assert.equal(createPolicy(version).baseTier(t), 'frontier');
    }
  });

  test('frontier is reachable via BLAST alone on a mechanically VERIFIABLE unit', () => {
    const t = task({ unverifiable: false, blast: true });
    assert.equal(countFlags(t), 1); // below the 3-flag threshold: blast alone carries it
    for (const version of ['v1', 'probe', 'latest']) {
      assert.equal(createPolicy(version).baseTier(t), 'frontier');
    }
  });

  test('apex is never a base tier — it is only ever reached by the batched tie-break', () => {
    const every = [
      {}, { novel: true }, { blast: true },
      { unverifiable: true, ambiguous: true, crossCutting: true, novel: true, blast: true, formatStrict: true },
    ];
    for (const version of ['v1', 'probe', 'latest']) {
      for (const flags of every) {
        assert.notEqual(createPolicy(version).baseTier(task(flags)), 'apex');
      }
    }
  });
});

describe('baseTier — cheap-to-verify is a counted flag, not a clamp', () => {
  const task = (flags) => makeTask({ id: 's', category: 'reasoning', prompt: 'x', flags, answerKey: 'x', grader: () => {} });

  test('verifiability lowers the tier by exactly one counted flag, nothing more', () => {
    // Same unit, flipping only UNVERIFIABLE: 2 flags -> standard,
    // 3 flags -> frontier. Under the old clamp the verifiable variant
    // returned 'cheap' regardless of the other two flags.
    const verifiable = task({ unverifiable: false, ambiguous: true, crossCutting: true });
    const notVerifiable = task({ unverifiable: true, ambiguous: true, crossCutting: true });
    assert.equal(countFlags(verifiable), 2);
    assert.equal(countFlags(notVerifiable), 3);
    const policy = createPolicy('v1');
    assert.equal(policy.baseTier(verifiable), 'standard');
    assert.equal(policy.baseTier(notVerifiable), 'frontier');
  });

  test('BLAST is not discounted by verifiability', () => {
    const policy = createPolicy('v1');
    assert.equal(policy.baseTier(task({ unverifiable: false, blast: true })), 'frontier');
    assert.equal(policy.baseTier(task({ unverifiable: true, blast: true })), 'frontier');
  });
});

describe('baseTier <= capTier invariant', () => {
  // runUnitLadder() only terminates on `tier === cap`. A base tier above the
  // cap escalates past frontier to apex and then spins at apex forever, since
  // escalate() saturates at the last tier while the cap check never matches.
  const combos = [];
  const keys = ['unverifiable', 'ambiguous', 'blast', 'crossCutting', 'novel', 'formatStrict'];
  for (let mask = 0; mask < 1 << keys.length; mask++) {
    const flags = {};
    keys.forEach((k, i) => { flags[k] = Boolean(mask & (1 << i)); });
    combos.push(flags);
  }

  for (const version of ['v1', 'probe', 'latest']) {
    test(`${version}: holds for all ${combos.length} flag combinations`, () => {
      const policy = createPolicy(version);
      for (const flags of combos) {
        const t = makeTask({ id: 'i', category: 'reasoning', prompt: 'x', flags, answerKey: 'x', grader: () => {} });
        const base = TIER_ORDER.indexOf(policy.baseTier(t));
        const cap = TIER_ORDER.indexOf(policy.capTier(t));
        assert.ok(base <= cap, `${version}: base ${policy.baseTier(t)} > cap ${policy.capTier(t)} for ${JSON.stringify(flags)}`);
      }
    });
  }
});

describe('baseTier — base-tier distribution over the real hand-labelled suites', () => {
  // Regression pin on the MEASURED distribution, so a future change to
  // baseTier() or to a suite's labels cannot silently collapse the arms back
  // to "everything starts cheap" the way the old clamp did.
  const allTasks = [
    ...codeSuite, ...reasoningSuite, ...mechanicalSuite, ...debugSuite,
    ...refactorSuite, ...documentationSuite, ...securitySuite,
  ];

  const distribution = (version) => {
    const policy = createPolicy(version);
    const d = { cheap: 0, standard: 0, frontier: 0, apex: 0 };
    for (const t of allTasks) d[policy.baseTier(t)]++;
    return d;
  };

  test('the suites carry 69 tasks, and UNVERIFIABLE/AMBIGUOUS are constant-false across them', () => {
    assert.equal(allTasks.length, 69);
    assert.equal(allTasks.filter((t) => t.flags.unverifiable).length, 0);
    assert.equal(allTasks.filter((t) => t.flags.ambiguous).length, 0);
  });

  test('v1: 20 cheap / 43 standard / 6 frontier', () => {
    assert.deepEqual(distribution('v1'), { cheap: 20, standard: 43, frontier: 6, apex: 0 });
  });

  for (const version of ['probe', 'latest']) {
    // All 6 rubric-frontier tasks in the suites are security tasks and all 6
    // are formatStrict, whose cap is 'standard' on probe/latest — so frontier
    // is legitimately unreachable on these two arms over THESE tasks (by the
    // cap, not by a dead branch). The synthetic reachability tests above cover
    // the branch itself.
    test(`${version}: 20 cheap / 49 standard / 0 frontier (all 6 frontier tasks are formatStrict, capped at standard)`, () => {
      assert.deepEqual(distribution(version), { cheap: 20, standard: 49, frontier: 0, apex: 0 });
    });
  }

  test('no arm bases every task at cheap any more (the defect signature)', () => {
    for (const version of ['v1', 'probe', 'latest']) {
      assert.notEqual(distribution(version).cheap, allTasks.length);
    }
  });
});
