import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASKS,
  TRIGGER_PHRASES,
  EXPLICIT_INSTRUCTION,
  HOSTS,
  HOST_KINDS,
  INSTALL_SHAPES,
  installShapeIds,
  scorableHostIds,
  hostKindOf,
  buildPrompt,
  scaffoldResults,
  validateResults,
  summarizeSelfActivation,
} from './selfactivation.js';

describe('TASKS', () => {
  test('every task has a unique id', () => {
    const ids = TASKS.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('has both trigger and control tasks', () => {
    const categories = new Set(TASKS.map((t) => t.category));
    assert.ok(categories.has('trigger'));
    assert.ok(categories.has('control'));
  });

  test('every "trigger" task actually contains a phrase from TRIGGER_PHRASES', () => {
    for (const task of TASKS.filter((t) => t.category === 'trigger')) {
      assert.ok(task.phrasesUsed.length > 0, `${task.id} claims category trigger but lists no phrasesUsed`);
      for (const phrase of task.phrasesUsed) {
        assert.ok(TRIGGER_PHRASES.includes(phrase), `${task.id}: ${phrase} not in TRIGGER_PHRASES`);
        assert.ok(
          task.prompt.toLowerCase().includes(phrase.toLowerCase()),
          `${task.id}: prompt does not actually contain claimed phrase "${phrase}"`
        );
      }
    }
  });

  test('every "control" task avoids all trigger phrases', () => {
    for (const task of TASKS.filter((t) => t.category === 'control')) {
      assert.equal(task.phrasesUsed.length, 0);
      for (const phrase of TRIGGER_PHRASES) {
        assert.ok(
          !task.prompt.toLowerCase().includes(phrase.toLowerCase()),
          `${task.id} (control) unexpectedly contains trigger phrase "${phrase}"`
        );
      }
    }
  });
});

describe('buildPrompt', () => {
  test('condition A is the bare prompt, no mention of the skill', () => {
    const task = TASKS[0];
    assert.equal(buildPrompt(task, 'A'), task.prompt);
  });

  test('condition B appends the explicit instruction', () => {
    const task = TASKS[0];
    const b = buildPrompt(task, 'B');
    assert.ok(b.startsWith(task.prompt));
    assert.ok(b.includes(EXPLICIT_INSTRUCTION));
  });

  test('rejects an invalid condition', () => {
    assert.throws(() => buildPrompt(TASKS[0], 'C'));
  });
});

describe('install shapes and hosts', () => {
  test('exactly one install shape is the force-injecting one, and it is the hook shape', () => {
    const injecting = installShapeIds().filter((id) => INSTALL_SHAPES[id].forcedInjection);
    assert.deepEqual(injecting, ['skill-plus-hook']);
    assert.equal(INSTALL_SHAPES['skill-only'].forcedInjection, false);
  });

  test('every host maps to a declared host kind', () => {
    for (const [id, host] of Object.entries(HOSTS)) {
      assert.ok(HOST_KINDS[host.kind], `host ${id} has unknown kind ${host.kind}`);
      assert.equal(hostKindOf(id), host.kind);
    }
  });

  test('the instruction-file hosts named in the README are classified unscorable', () => {
    // Copilot / Gemini / the generic root-AGENTS.md path append to a file the
    // host loads unconditionally — no matcher, so no rate exists for them.
    for (const id of ['copilot', 'gemini', 'windsurf']) {
      assert.equal(HOSTS[id].kind, 'instruction-file');
      assert.equal(HOST_KINDS[HOSTS[id].kind].scorable, false);
      assert.ok(!scorableHostIds().includes(id));
    }
    assert.ok(scorableHostIds().includes('claude-code'));
  });

  test('hostKindOf throws on an unknown host rather than guessing one', () => {
    assert.throws(() => hostKindOf('not-a-host'), /unknown host/);
  });
});

describe('scaffoldResults', () => {
  test('produces tasks × conditions × n trials, all pending', () => {
    const s = scaffoldResults({ n: 3 });
    assert.equal(s.trials.length, TASKS.length * 2 * 3);
    assert.ok(s.trials.every((t) => t.activated === null));
    assert.ok(s.trials.every((t) => typeof t.prompt === 'string' && t.prompt.length > 0));
  });

  test('never invents a host or install shape: unsupplied means null, not a default', () => {
    const s = scaffoldResults({ n: 1 });
    assert.ok(s.trials.every((t) => t.host === null));
    assert.ok(s.trials.every((t) => t.installShape === null));
    assert.equal(s.meta.host, null);
    assert.equal(s.meta.installShape, null);
    assert.equal(s.meta.hostKind, null);
  });

  test('stamps a supplied host + install shape on every trial and in meta', () => {
    const s = scaffoldResults({ n: 1, host: 'claude-code', installShape: 'skill-only' });
    assert.ok(s.trials.every((t) => t.host === 'claude-code' && t.installShape === 'skill-only'));
    assert.equal(s.meta.hostKind, 'skill-discovering');
  });

  test('refuses to scaffold for an instruction-file host (the rate does not exist there)', () => {
    assert.throws(() => scaffoldResults({ n: 1, host: 'copilot' }), /instruction-file/);
    assert.throws(() => scaffoldResults({ n: 1, host: 'gemini' }), /instruction-file/);
  });

  test('rejects an unknown host or install shape', () => {
    assert.throws(() => scaffoldResults({ n: 1, host: 'nope' }), /unknown host/);
    assert.throws(() => scaffoldResults({ n: 1, installShape: 'skill-plus-vibes' }), /unknown installShape/);
  });

  test('rejects a non-positive-integer n', () => {
    assert.throws(() => scaffoldResults({ n: 0 }));
    assert.throws(() => scaffoldResults({ n: -1 }));
    assert.throws(() => scaffoldResults({ n: 1.5 }));
  });

  test('scaffold round-trips through validateResults', () => {
    const s = scaffoldResults({ n: 2 });
    assert.equal(validateResults(s), true);
  });
});

describe('validateResults', () => {
  test('rejects an unknown taskId', () => {
    assert.throws(() => validateResults({ trials: [{ taskId: 'nope', condition: 'A', activated: null }] }));
  });

  test('rejects a bad condition', () => {
    assert.throws(() =>
      validateResults({ trials: [{ taskId: TASKS[0].id, condition: 'Z', activated: null }] })
    );
  });

  test('rejects a non-boolean, non-null activated value', () => {
    assert.throws(() =>
      validateResults({ trials: [{ taskId: TASKS[0].id, condition: 'A', activated: 'yes' }] })
    );
  });

  test('accepts a well-formed, fully-pending scaffold', () => {
    assert.equal(validateResults(scaffoldResults({ n: 1 })), true);
  });

  test('rejects a present-but-unknown host or installShape (a typo must not become its own stratum)', () => {
    assert.throws(
      () => validateResults({ trials: [{ taskId: TASKS[0].id, condition: 'A', activated: null, host: 'clade-code' }] }),
      /unknown host/
    );
    assert.throws(
      () =>
        validateResults({
          trials: [{ taskId: TASKS[0].id, condition: 'A', activated: null, installShape: 'skill+hook' }],
        }),
      /unknown installShape/
    );
  });

  test('accepts null host/installShape (unlabeled is allowed, it is just unscorable)', () => {
    assert.equal(
      validateResults({ trials: [{ taskId: TASKS[0].id, condition: 'A', activated: true, host: null, installShape: null }] }),
      true
    );
  });
});


describe('summarizeSelfActivation', () => {
  // Default the labels here so each test opts *in* to the interesting case
  // (unlabeled, instruction-file, mixed shapes) rather than out of it.
  function trial({ taskId, category, condition, activated, host = 'claude-code', installShape = 'skill-only' }) {
    return { taskId, category, condition, activated, host, installShape, trial: 1, evidence: '' };
  }

  const trig = TASKS.find((x) => x.category === 'trigger');
  const ctrl = TASKS.find((x) => x.category === 'control');

  test('empty trial list yields no strata and no counts', () => {
    const s = summarizeSelfActivation([]);
    assert.equal(s.scored, 0);
    assert.equal(s.pending, 0);
    assert.equal(s.unlabeled, 0);
    assert.deepEqual(s.strata, []);
    assert.deepEqual(s.notApplicable, []);
  });

  test('pending (activated: null) trials are excluded from the rates, counted separately', () => {
    const s = summarizeSelfActivation([
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: true }),
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: null }),
    ]);
    assert.equal(s.scored, 1);
    assert.equal(s.pending, 1);
    assert.equal(s.strata.length, 1);
    assert.equal(s.strata[0].overall.A.total, 1);
    assert.equal(s.strata[0].overall.A.yes, 1);
  });

  test('computes the documented zero-self-activation scenario for condition A vs a fully-activated B', () => {
    const trials = [];
    for (const task of [trig, ctrl]) {
      for (let i = 0; i < 5; i++) {
        trials.push(trial({ taskId: task.id, category: task.category, condition: 'A', activated: false }));
        trials.push(trial({ taskId: task.id, category: task.category, condition: 'B', activated: true }));
      }
    }
    const s = summarizeSelfActivation(trials);
    assert.equal(s.strata.length, 1);
    const st = s.strata[0];
    assert.equal(st.host, 'claude-code');
    assert.equal(st.installShape, 'skill-only');
    assert.equal(st.overall.A.point, 0);
    assert.equal(st.overall.B.point, 1);
    assert.equal(st.byCategory.trigger.A.point, 0);
    assert.equal(st.byCategory.trigger.B.point, 1);
    assert.equal(st.byCategory.control.A.point, 0);
    assert.equal(st.byCategory.control.B.point, 1);
    assert.equal(st.byTask[trig.id].A.total, 5);
  });

  test('byTask only includes tasks that actually have completed trials', () => {
    const s = summarizeSelfActivation([trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: true })]);
    assert.deepEqual(Object.keys(s.strata[0].byTask), [trig.id]);
  });

  // --- the anti-blend properties -----------------------------------------
  //
  // These are the tests that would fail if someone reintroduced a pooled
  // figure, a default install shape, or a default host. They are the reason
  // the summary has the shape it has.

  test('the summary exposes NO cross-stratum aggregate to misread', () => {
    const s = summarizeSelfActivation([
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: true }),
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: false, host: 'codex' }),
    ]);
    // No top-level rate object of any name, and no top-level Wilson result.
    assert.equal(s.overall, undefined);
    assert.equal(s.byCategory, undefined);
    assert.equal(s.byTask, undefined);
    assert.equal(s.point, undefined);
    assert.equal(s.rate, undefined);
    for (const value of Object.values(s)) {
      assert.ok(
        !(value && typeof value === 'object' && 'point' in value),
        'a top-level Wilson-shaped value would be a pooled cross-stratum rate'
      );
    }
  });

  test('the same host under two install shapes never merges into one rate', () => {
    const trials = [];
    for (let i = 0; i < 4; i++) {
      trials.push(trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: false, installShape: 'skill-only' }));
      trials.push(
        trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: true, installShape: 'skill-plus-hook' })
      );
    }
    const s = summarizeSelfActivation(trials);
    assert.equal(s.strata.length, 2);
    const only = s.strata.find((x) => x.installShape === 'skill-only');
    const hook = s.strata.find((x) => x.installShape === 'skill-plus-hook');
    assert.equal(only.overall.A.point, 0);
    assert.equal(only.forcedInjection, false);
    // The hook shape is ~100% by construction — that is exactly why it is
    // reported apart from, and never averaged with, the shipped shape.
    assert.equal(hook.overall.A.point, 1);
    assert.equal(hook.forcedInjection, true);
    assert.ok(s.strata.every((x) => x.overall.A.total === 4));
  });

  test('two hosts never merge into one rate', () => {
    const s = summarizeSelfActivation([
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: true, host: 'claude-code' }),
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: false, host: 'cursor' }),
    ]);
    assert.equal(s.strata.length, 2);
    assert.deepEqual(s.strata.map((x) => x.host).sort(), ['claude-code', 'cursor']);
    assert.ok(s.strata.every((x) => x.overall.A.total === 1));
  });

  test('unlabeled observed trials are excluded from BOTH numerator and denominator', () => {
    const s = summarizeSelfActivation([
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: true, installShape: null }),
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: true, host: null }),
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: false, host: null, installShape: null }),
    ]);
    assert.equal(s.unlabeled, 3);
    assert.equal(s.scored, 0);
    assert.deepEqual(s.strata, []);
  });

  test('a trial with no host/installShape keys at all is unlabeled, not silently defaulted', () => {
    // Guards old results files written before these fields existed: they must
    // become unscorable, never get assigned the shipped shape by default.
    const s = summarizeSelfActivation([
      { taskId: trig.id, category: 'trigger', condition: 'A', activated: true, trial: 1, evidence: '' },
    ]);
    assert.equal(s.unlabeled, 1);
    assert.equal(s.scored, 0);
    assert.deepEqual(s.strata, []);
  });

  test('instruction-file hosts are reported as not-applicable and never scored', () => {
    const s = summarizeSelfActivation([
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: true, host: 'copilot' }),
      trial({ taskId: trig.id, category: 'trigger', condition: 'B', activated: true, host: 'gemini' }),
      trial({ taskId: trig.id, category: 'trigger', condition: 'A', activated: false, host: 'claude-code' }),
    ]);
    assert.equal(s.scored, 1);
    assert.equal(s.strata.length, 1);
    assert.equal(s.strata[0].host, 'claude-code');
    assert.deepEqual(
      s.notApplicable.map((x) => x.host).sort(),
      ['copilot', 'gemini']
    );
    assert.ok(s.notApplicable.every((x) => x.hostKind === 'instruction-file' && x.trials === 1));
  });
});
