import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASKS,
  TRIGGER_PHRASES,
  EXPLICIT_INSTRUCTION,
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

describe('scaffoldResults', () => {
  test('produces tasks × conditions × n trials, all pending', () => {
    const s = scaffoldResults({ n: 3 });
    assert.equal(s.trials.length, TASKS.length * 2 * 3);
    assert.ok(s.trials.every((t) => t.activated === null));
    assert.ok(s.trials.every((t) => typeof t.prompt === 'string' && t.prompt.length > 0));
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
});

describe('summarizeSelfActivation', () => {
  function trial({ taskId, category, condition, activated }) {
    return { taskId, category, condition, activated, trial: 1, evidence: '' };
  }

  test('empty trial list summarizes to zero completed, all rates 0/0', () => {
    const s = summarizeSelfActivation([]);
    assert.equal(s.n, 0);
    assert.equal(s.pending, 0);
    assert.equal(s.overall.A.total, 0);
  });

  test('pending (activated: null) trials are excluded from n and rates, counted separately', () => {
    const t = TASKS.find((x) => x.category === 'trigger');
    const trials = [
      trial({ taskId: t.id, category: 'trigger', condition: 'A', activated: true }),
      trial({ taskId: t.id, category: 'trigger', condition: 'A', activated: null }),
    ];
    const s = summarizeSelfActivation(trials);
    assert.equal(s.n, 1);
    assert.equal(s.pending, 1);
    assert.equal(s.overall.A.total, 1);
    assert.equal(s.overall.A.yes, 1);
  });

  test('computes the documented zero-self-activation scenario for condition A vs a fully-activated B', () => {
    const trig = TASKS.find((x) => x.category === 'trigger');
    const ctrl = TASKS.find((x) => x.category === 'control');
    const trials = [];
    for (const task of [trig, ctrl]) {
      for (let i = 0; i < 5; i++) {
        trials.push(trial({ taskId: task.id, category: task.category, condition: 'A', activated: false }));
        trials.push(trial({ taskId: task.id, category: task.category, condition: 'B', activated: true }));
      }
    }
    const s = summarizeSelfActivation(trials);
    assert.equal(s.overall.A.point, 0);
    assert.equal(s.overall.B.point, 1);
    assert.equal(s.byCategory.trigger.A.point, 0);
    assert.equal(s.byCategory.trigger.B.point, 1);
    assert.equal(s.byCategory.control.A.point, 0);
    assert.equal(s.byCategory.control.B.point, 1);
    assert.equal(s.byTask[trig.id].A.total, 5);
  });

  test('byTask only includes tasks that actually have completed trials', () => {
    const t = TASKS.find((x) => x.category === 'trigger');
    const s = summarizeSelfActivation([trial({ taskId: t.id, category: 'trigger', condition: 'A', activated: true })]);
    assert.deepEqual(Object.keys(s.byTask), [t.id]);
  });
});
