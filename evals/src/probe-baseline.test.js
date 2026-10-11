import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicy } from './policy.js';
import { makeTask } from './tasks.js';
import { runSuite, mockApex } from './runner.js';

const policy = createPolicy('probe');
const names = ['unverifiable', 'ambiguous', 'blast', 'crossCutting', 'novel', 'formatStrict'];
const task = (id, flags = {}) => makeTask({ id, category: 'reasoning', prompt: 'offline fixture', flags,
  answerKey: 'ok', grader: answer => ({ pass: answer === 'ok', reason: 'exact match' }) });
const result = (passed = false, status = 'grounded') => ({ answer: passed ? 'ok' : 'bad', status,
  uncertaintyReason: status === 'uncertain' ? 'missing evidence' : null,
  verdict: { pass: passed, reason: 'fixture check' }, cost: 0, usage: {} });

test('probe: all 64 six-flag assignments obey current base-tier and cap rules', () => {
  for (let mask = 0; mask < 64; mask++) {
    const flags = Object.fromEntries(names.map((name, index) => [name, Boolean(mask & (1 << index))]));
    const count = Object.values(flags).filter(Boolean).length;
    const expected = !flags.unverifiable ? 'cheap' : count >= 3 || flags.blast ? 'frontier' : 'standard';
    const unit = task(`flags-${mask}`, flags);
    assert.equal(policy.baseTier(unit), expected, `base: ${mask}`);
    assert.equal(policy.capTier(unit), flags.formatStrict ? 'standard' : 'frontier', `cap: ${mask}`);
  }
});

test('probe: failure twice escalates one tier, preserves residue and never de-escalates', async () => {
  let payload;
  const trace = await policy.runUnitLadder(task('retry'), async (tier, _task, handoff) => {
    if (tier === 'standard') payload = handoff;
    return result(tier === 'standard');
  });
  assert.deepEqual(trace.attempts.map(a => a.tier), ['cheap', 'cheap', 'standard']);
  assert.equal(payload.item, 'retry');
  assert.equal(payload.attempts.length, 2);
  assert.ok(payload.attempts.every(a => a.verification === 'failed'));
});

test('probe: uncertainty overrides a passing verdict and advisor agreement', async () => {
  const trace = await policy.runUnitLadder(task('uncertain'), async tier => ({
    ...result(true, tier === 'cheap' ? 'uncertain' : 'grounded'), advisorAgrees: true,
  }));
  assert.deepEqual(trace.attempts.map(a => a.tier), ['cheap', 'standard']);
});

test('probe: format work starts cheap, retries once per tier, then returns apex residue', async () => {
  const trace = await policy.runUnitLadder(task('format', { formatStrict: true }), async () => result());
  assert.deepEqual(trace.attempts.map(a => a.tier), ['cheap', 'cheap', 'standard', 'standard']);
  assert.equal(trace.needsApex, true);
});

test('probe: multiple exhausted tasks use one shared apex call', async () => {
  let apexCalls = 0;
  const resolve = mockApex(() => 'ok');
  const units = await runSuite({ arm: 'tiered', vendor: 'offline', suite: [task('a'), task('b')],
    attempt: async () => result(), apexChat: async (...args) => { apexCalls++; return resolve(...args); },
    apexModel: 'offline', seeds: 1, concurrency: 2, policy });
  assert.equal(apexCalls, 1);
  assert.ok(units.every(unit => unit.passed && unit.apexResolved));
});

test('probe: disagreement escalates; agreement alone cannot accept failed checks', async () => {
  let calls = 0;
  const disagree = await policy.runUnitDual(task('dual', { ambiguous: true }), async () => ({ ...result(true), answer: ++calls }));
  assert.equal(disagree.escalated, true);
  const failed = await policy.runUnitDual(task('dual-fail', { ambiguous: true }), async () => result());
  assert.equal(failed.escalated, true);
});

test('probe edge: a starting tier above the format cap cannot call apex per item', async () => {
  const trace = await policy.runUnitLadder(task('above-cap', { unverifiable: true, blast: true, formatStrict: true }),
    async tier => result(tier === 'apex')); // bounded reproduction: apex succeeds instead of looping forever
  assert.ok(trace.attempts.every(attempt => attempt.tier !== 'apex'), 'local ladder called apex directly above its standard cap');
  assert.equal(trace.needsApex, true);
  assert.equal(trace.attempts.length, 0);
  assert.equal(trace.finalTier, null);
});

test('probe edge: dual-run agreement cannot suppress explicit uncertainty', async () => {
  const trace = await policy.runUnitDual(task('dual-uncertain', { ambiguous: true }), async () => result(true, 'uncertain'));
  assert.equal(trace.escalated, true, 'matching uncertain answers were accepted');
});

test('probe: above-cap units join a single batch without any local calls', async () => {
  let localCalls = 0;
  let apexCalls = 0;
  const resolve = mockApex(() => 'ok');
  const flags = { unverifiable: true, blast: true, formatStrict: true };
  const units = await runSuite({ arm: 'tiered', vendor: 'offline', suite: [task('cap-a', flags), task('cap-b', flags)],
    attempt: async () => { localCalls++; throw new Error('must not attempt outside cap'); },
    apexChat: async (...args) => { apexCalls++; return resolve(...args); },
    apexModel: 'offline', seeds: 1, concurrency: 2, policy });
  assert.equal(localCalls, 0);
  assert.equal(apexCalls, 1);
  assert.ok(units.every(unit => unit.passed && unit.apexResolved && unit.finalTier === 'apex'));
});

test('probe: uncertain passing dual answers do not mark exhausted residue as passed', async () => {
  const units = await runSuite({ arm: 'tiered', vendor: 'offline', suite: [task('uncertain-residue', { ambiguous: true })],
    attempt: async tier => tier === 'cheap' ? result(true, 'uncertain') : result(false),
    apexChat: null, apexModel: null, seeds: 1, concurrency: 1, policy });
  assert.equal(units[0].needsApex, true);
  assert.equal(units[0].passed, false);
});
