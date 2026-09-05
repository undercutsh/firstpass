// CLI flag-parsing/wiring coverage for main.js.
//
// main.test.js only unit-tests computeStats() — it never invokes the CLI
// itself, so every flag branch in parseArgs()/main() (including newer ones
// like --selfactivation/--selfactivation-init/--selfactivation-report) had
// zero test coverage: nothing would catch a broken `case` in parseArgs, a
// swapped argv index, or a flag whose handler silently stopped firing.
// The underlying logic these flags call into (selfactivation.js,
// computeStats, etc.) is well covered elsewhere; what's missing is proof
// that main.js's own argv → behavior wiring for each documented flag
// actually works, end to end, offline.
//
// Every case here runs with `--mock` or otherwise avoids live network calls
// (OPENROUTER_API_KEY is explicitly stripped from the child env) so this
// suite stays fast and free in CI. --benchmark mbpp is safe to run for real
// (embedded dataset, no HuggingFace fetch); gsm8k/humaneval are not
// exercised here for that reason.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAIN = path.join(import.meta.dirname, 'main.js');
const CWD = path.join(import.meta.dirname, '..'); // evals/

function runCli(args, { env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [MAIN, ...args], {
      cwd: CWD,
      encoding: 'utf8',
      env: { ...process.env, ...env, OPENROUTER_API_KEY: '' },
      timeout: 30_000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    // execFileSync throws on non-zero exit; the useful bits are still on it.
    return { status: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

describe('--selfactivation', () => {
  test('prints the protocol and exits 0, no key/network needed', () => {
    const { status, stdout } = runCli(['--selfactivation']);
    assert.equal(status, 0);
    assert.match(stdout, /SELF-ACTIVATION PROTOCOL/);
    assert.match(stdout, /trigger-fanout-lint/);
    assert.match(stdout, /control-fix-failing-test/);
  });
});

describe('--selfactivation-init', () => {
  test('scaffolds a pending-trials file with the default n=10', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-selfact-'));
    const file = path.join(dir, 'scaffold.json');
    try {
      const { status, stdout } = runCli(['--selfactivation-init', file]);
      assert.equal(status, 0);
      assert.match(stdout, /Scaffolded \d+ pending trials/);
      const data = JSON.parse(readFileSync(file, 'utf8'));
      assert.equal(data.meta.n, 10);
      assert.ok(data.trials.length > 0);
      assert.ok(data.trials.every((t) => t.activated === null));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--selfactivation-n overrides trial count per task/condition', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-selfact-'));
    const file = path.join(dir, 'scaffold.json');
    try {
      const { status } = runCli(['--selfactivation-init', file, '--selfactivation-n', '2']);
      assert.equal(status, 0);
      const data = JSON.parse(readFileSync(file, 'utf8'));
      assert.equal(data.meta.n, 2);
      // trials = tasks * 2 conditions * n
      assert.equal(data.trials.length, data.meta.tasks * 2 * 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('--selfactivation-report', () => {
  test('an all-pending scaffold reports zero completed trials', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-selfact-'));
    const file = path.join(dir, 'scaffold.json');
    try {
      runCli(['--selfactivation-init', file, '--selfactivation-n', '1']);
      const { status, stdout } = runCli(['--selfactivation-report', file]);
      assert.equal(status, 0);
      assert.match(stdout, /No completed trials yet/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a partially filled-in file reports real rates', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-selfact-'));
    const file = path.join(dir, 'filled.json');
    try {
      runCli(['--selfactivation-init', file, '--selfactivation-n', '1']);
      const data = JSON.parse(readFileSync(file, 'utf8'));
      // Fill in every trial: condition A never activates, B always does —
      // mirrors the documented worst-case scenario in selfactivation.test.js.
      for (const t of data.trials) t.activated = t.condition === 'B';
      writeFileSync(file, JSON.stringify(data, null, 2));

      const { status, stdout } = runCli(['--selfactivation-report', file]);
      assert.equal(status, 0);
      assert.match(stdout, /SELF-ACTIVATION REPORT/);
      assert.match(stdout, /Condition A \(no mention\):\s+0%/);
      assert.match(stdout, /Condition B \(explicit mention\):\s+100%/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects a malformed results file (bad taskId) instead of silently reporting garbage', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-selfact-'));
    const file = path.join(dir, 'bad.json');
    try {
      writeFileSync(file, JSON.stringify({ trials: [{ taskId: 'not-a-real-task', condition: 'A', activated: null }] }));
      const { status, stderr } = runCli(['--selfactivation-report', file]);
      assert.notEqual(status, 0);
      assert.match(stderr, /unknown taskId/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('--flagtest', () => {
  test('without an API key, fails fast with the documented message instead of attempting live calls', () => {
    const { status, stderr } = runCli(['--flagtest']);
    assert.notEqual(status, 0);
    assert.match(stderr, /OPENROUTER_API_KEY/);
  });

  test('still parses --dispatcher and --policy before the key check', () => {
    const { status, stderr } = runCli(['--flagtest', '--dispatcher', 'openai/gpt-4o-mini', '--policy', 'v1']);
    assert.notEqual(status, 0);
    assert.match(stderr, /OPENROUTER_API_KEY/);
  });
});

describe('--verify-only', () => {
  test('without an API key, fails via the LLMError path (no key check gate on this flag)', () => {
    const { status, stderr } = runCli(['--verify-only']);
    assert.notEqual(status, 0);
    assert.match(stderr, /OPENROUTER_API_KEY/);
  });
});

describe('--mock plumbing across vendor/arm/suite/seed/policy flags', () => {
  test('a scoped mock run (vendors/arms/suites/seeds/policy all set) completes and reports', () => {
    const { status, stdout } = runCli([
      '--mock', '--seeds', '1',
      '--vendors', 'anthropic',
      '--arms', 'tiered',
      '--suites', 'mechanical',
      '--policy', 'v1',
      '--concurrency', '4',
    ]);
    assert.equal(status, 0);
    assert.match(stdout, /RESULTS \(policy v1\)/);
    assert.match(stdout, /anthropic \/ mechanical/);
  });

  test('--smoke overrides to the single smoke vendor/arms/suite when none given explicitly', () => {
    const { status, stdout } = runCli(['--smoke', '--mock']);
    assert.equal(status, 0);
    assert.match(stdout, /vendors:\s+anthropic/);
    assert.match(stdout, /arms:\s+all-standard, tiered/);
    assert.match(stdout, /suites:\s+code/);
    assert.match(stdout, /seeds:\s+1/);
  });

  test('--smoke still honors an explicit --vendors override', () => {
    const { status, stdout } = runCli(['--smoke', '--mock', '--vendors', 'anthropic,openai']);
    assert.equal(status, 0);
    assert.match(stdout, /vendors:\s+anthropic, openai/);
  });
});

describe('--benchmark', () => {
  test('mbpp loads the embedded offline subset and runs under --mock', () => {
    const { status, stdout } = runCli([
      '--mock', '--seeds', '1',
      '--vendors', 'anthropic',
      '--arms', 'tiered',
      '--benchmark', 'mbpp',
    ]);
    assert.equal(status, 0);
    assert.match(stdout, /benchmarks:\s+mbpp/);
    assert.match(stdout, /anthropic \/ mbpp/);
  });

  test('an unknown benchmark name fails fast with a clear error', () => {
    const { status, stderr } = runCli(['--mock', '--benchmark', 'not-a-real-benchmark']);
    assert.notEqual(status, 0);
    assert.match(stderr, /unknown benchmark: not-a-real-benchmark/);
  });
});

describe('--baseline', () => {
  test('reuses a saved all-standard run instead of re-running it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-baseline-'));
    const file = path.join(dir, 'baseline.json');
    try {
      const saved = {
        meta: { policy: 'latest', vendors: ['anthropic'], arms: ['all-standard'], suites: ['mechanical'], seeds: 1, generated: new Date().toISOString() },
        results: {
          anthropic: {
            'all-standard': {
              mechanical: [{ id: 'mechanical:classify-files', passed: true, cost: 0.02, tokensIn: 100, tokensOut: 50, seed: 0, escalated: false, apexResolved: false, attemptLog: [] }],
            },
          },
        },
      };
      writeFileSync(file, JSON.stringify(saved));

      const { status, stdout } = runCli([
        '--mock', '--seeds', '1',
        '--vendors', 'anthropic',
        '--arms', 'all-standard',
        '--suites', 'mechanical',
        '--baseline', file,
      ]);
      assert.equal(status, 0);
      assert.match(stdout, /reused all-standard baseline for anthropic/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('--compare', () => {
  test('diffs two saved runs side by side', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fp-compare-'));
    const fileA = path.join(dir, 'a.json');
    const fileB = path.join(dir, 'b.json');
    try {
      const mkRun = (policy, passed) => ({
        meta: { policy, generated: new Date().toISOString() },
        results: {
          anthropic: {
            tiered: {
              mechanical: [{ id: 'mechanical:zones', passed, cost: 0.01, tokensIn: 10, tokensOut: 10 }],
            },
          },
        },
      });
      writeFileSync(fileA, JSON.stringify(mkRun('v1', false)));
      writeFileSync(fileB, JSON.stringify(mkRun('latest', true)));

      const { status, stdout } = runCli(['--compare', `${fileA},${fileB}`]);
      assert.equal(status, 0);
      assert.match(stdout, /COMPARING: v1/);
      assert.match(stdout, /vs: latest/);
      assert.match(stdout, /anthropic \/ mechanical/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a missing results file fails clearly instead of a raw ENOENT', () => {
    const { status, stderr } = runCli(['--compare', '/nonexistent-a.json,/nonexistent-b.json']);
    assert.notEqual(status, 0);
    assert.match(stderr, /results file not found/);
  });
});
