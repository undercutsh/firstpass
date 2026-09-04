// Eval harness entrypoint.
//   node src/main.js                          full run (all vendors, all arms, 10 seeds)
//   node src/main.js --smoke                  small: 1 seed, cheap tiers only
//   node src/main.js --verify-only            check model slugs resolve
//   node src/main.js --mock                   run with the mock LLM (no key, plumbing check)

import { VENDORS, ARMS, DEFAULT_SEEDS, TIER_ORDER } from './config.js';
import { hasKey, verifyModels, chat } from './llm.js';
import { runSuite, makeAttempter, mockAttempter, mockApex } from './runner.js';
import { createPolicy } from './policy.js';
import { runFlagTest, printFlagReport } from './flagtest.js';
import { codeSuite } from './suites/code.js';
import { reasoningSuite } from './suites/reasoning.js';
import { mechanicalSuite } from './suites/mechanical.js';
import { debugSuite } from './suites/debug.js';
import { loadGsm8k, loadHumanEval, loadMbpp } from './benchmarks.js';
import { summarizeWithCI } from './stats.js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const SUITES = { code: codeSuite, reasoning: reasoningSuite, mechanical: mechanicalSuite, debug: debugSuite };
const RESULTS_DIR = path.join(import.meta.dirname, '..', 'results');

function parseArgs(argv) {
  const a = { smoke: false, verifyOnly: false, mock: false, flagtest: false, seeds: null, vendors: null, arms: null, suites: null, policy: 'latest', compare: null, baseline: null, dispatcher: 'cheap', benchmark: null };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--smoke': a.smoke = true; break;
      case '--verify-only': a.verifyOnly = true; break;
      case '--mock': a.mock = true; break;
      case '--flagtest': a.flagtest = true; break;
      case '--seeds': a.seeds = Number(argv[++i]); break;
      case '--vendors': a.vendors = argv[++i].split(','); break;
      case '--arms': a.arms = argv[++i].split(','); break;
      case '--suites': a.suites = argv[++i].split(','); break;
      case '--concurrency': a.concurrency = Number(argv[++i]); break;
      case '--policy': a.policy = argv[++i]; break;
      case '--compare': a.compare = argv[++i]; break;
      case '--baseline': a.baseline = argv[++i]; break;
      case '--dispatcher': a.dispatcher = argv[++i]; break;
      case '--benchmark': a.benchmark = argv[++i].split(','); break;
    }
  }
  return a;
}

function loadResults(file) {
  const p = file.includes(path.sep) ? file : path.join(RESULTS_DIR, file);
  if (!existsSync(p)) throw new Error(`results file not found: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function saveResults(results, meta, stats) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(RESULTS_DIR, `run-${meta.policy}-${meta.vendors.join('-')}-${meta.arms.join('-')}-${ts}.json`);
  writeFileSync(file, JSON.stringify({ meta, results, stats }, null, 2));
  console.log(`\n💾 saved: ${file}`);
  return file;
}

/**
 * Wilson CI on pass rate + seed-cluster bootstrap CI on cost-per-pass, for
 * every vendor/arm/suite cell. Additive sibling to `results` — same shape,
 * doesn't touch the existing results[vendor][arm][suite] unit arrays that
 * --compare and the printed tables already depend on.
 *
 * summarizeWithCI() expects `{pass, cost, seed}`-shaped records; runner.js's
 * units carry `passed`/`cost`/`seed` (seed tagged per-unit in runSuite()),
 * so adapt the field name here rather than changing the unit shape.
 */
export function computeStats(results) {
  const stats = {};
  for (const [vendor, byArm] of Object.entries(results)) {
    stats[vendor] = {};
    for (const [arm, bySuite] of Object.entries(byArm)) {
      stats[vendor][arm] = {};
      for (const [suite, units] of Object.entries(bySuite)) {
        if (!units.length) continue;
        const forStats = units.map((u) => ({ pass: u.passed, cost: u.cost, seed: u.seed }));
        stats[vendor][arm][suite] = summarizeWithCI(forStats);
      }
    }
  }
  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --compare: load two saved runs and print a side-by-side summary.
  if (args.compare) {
    const [a, b] = args.compare.split(',').map((f) => loadResults(f.trim()));
    printComparison(a, b);
    return;
  }

  // --flagtest: measure how reliably a dispatcher model reproduces ground-truth
  // rubric flags, and whether its flags route to the same base tier.
  if (args.flagtest) {
    if (!hasKey()) {
      console.error('Set OPENROUTER_API_KEY first (flagtest runs live dispatcher calls).');
      process.exit(1);
    }
    const suites = args.suites ? args.suites.map((s) => SUITES[s]) : Object.values(SUITES);
    const dispatcher = args.dispatcher === 'cheap' ? VENDORS.anthropic.tiers.cheap : args.dispatcher;
    const result = await runFlagTest({ dispatcher, suites, policyVersion: args.policy });
    printFlagReport(result);
    return;
  }

  if (args.verifyOnly) {
    const { report, missing } = await verifyModels();
    console.log('\nModel slug verification:');
    for (const [key, v] of Object.entries(report)) {
      console.log(`  ${v.available ? '✓' : '✗'} ${key.padEnd(18)} ${v.slug}`);
    }
    if (missing.length) {
      console.log('\nMISSING — fix these in src/config.js:');
      for (const m of missing) console.log(`  ${m}`);
      process.exitCode = 1;
    } else {
      console.log('\nAll slugs resolve.');
    }
    return;
  }

  if (!args.mock && !hasKey()) {
    console.error('Set OPENROUTER_API_KEY first, or use --mock to validate plumbing.');
    process.exit(1);
  }

  if (!args.mock) {
    const { missing } = await verifyModels();
    if (missing.length) {
      console.warn(`⚠ ${missing.length} model slugs may not resolve on OpenRouter. Run --verify-only.`);
    }
  }

  const vendors = args.vendors ? args.vendors : Object.keys(VENDORS);
  const arms = args.arms ? args.arms : Object.keys(ARMS);

  // --benchmark: load public benchmark suites (GSM8K reasoning, HumanEval
  // code, MBPP code) into the suite set. They replace/join the built-in
  // suites. gsm8k/humaneval fetch live from HuggingFace; mbpp is a fixed
  // embedded subset (see benchmarks.js) so it needs no network access.
  let benchmarkSuites = null;
  if (args.benchmark) {
    benchmarkSuites = {};
    for (const name of args.benchmark) {
      if (name === 'gsm8k') benchmarkSuites.gsm8k = await loadGsm8k(50);
      else if (name === 'humaneval') benchmarkSuites.humaneval = await loadHumanEval(20);
      else if (name === 'mbpp') benchmarkSuites.mbpp = loadMbpp(30);
      else throw new Error(`unknown benchmark: ${name} (use gsm8k, humaneval, or mbpp)`);
    }
    console.log(`  benchmarks: ${Object.keys(benchmarkSuites).map((k) => `${k} (${benchmarkSuites[k].length} tasks)`).join(', ')}`);
  }
  const suiteMap = benchmarkSuites ?? SUITES;
  const suites = args.suites ? args.suites : Object.keys(suiteMap);
  const seeds = args.smoke ? 1 : args.seeds ?? DEFAULT_SEEDS;

  // Smoke test = plumbing proof, not results. 1 seed, 1 vendor, 1 suite,
  // no frontier arm (frontier reasoning models are minutes-per-call).
  const smokeVendor = 'anthropic';
  const smokeArms = ['all-standard', 'tiered'];
  const smokeSuite = 'code';
  const smokeVendors = args.smoke && !args.vendors ? [smokeVendor] : vendors;
  const smokeArmsFinal = args.smoke && !args.arms ? smokeArms : arms;
  const smokeSuites = args.smoke && !args.suites ? [smokeSuite] : suites;

  console.log(`\nTiered-dispatch eval run`);
  console.log(`  mode:      ${args.mock ? 'MOCK (no spend)' : 'LIVE (OpenRouter)'}`);
  console.log(`  policy:    ${args.policy}`);
  console.log(`  vendors:   ${smokeVendors.join(', ')}`);
  console.log(`  arms:      ${smokeArmsFinal.join(', ')}`);
  console.log(`  suites:    ${smokeSuites.join(', ')}`);
  console.log(`  seeds:     ${seeds}`);

  const policy = createPolicy(args.policy);

  // --baseline: reuse a previously saved all-standard run instead of
  // re-running it (it never changes between policy versions).
  let savedStandard = null;
  if (args.baseline) savedStandard = loadResults(args.baseline);

  const results = {};
  for (const vendor of smokeVendors) {
    results[vendor] = {};
    for (const arm of smokeArmsFinal) {
      if (arm === 'all-standard' && savedStandard) {
        // Reuse the baseline: copy the saved units for matching vendor/suites.
        results[vendor][arm] = {};
        for (const suite of smokeSuites) {
          results[vendor][arm][suite] = savedStandard.results?.[vendor]?.[arm]?.[suite] ?? [];
        }
        console.log(`  ♻ reused all-standard baseline for ${vendor} (${smokeSuites.join(', ')})`);
        continue;
      }
      results[vendor][arm] = {};
      for (const suite of smokeSuites) {
        const attempt = args.mock
          ? mockAttempter()
          : makeAttempter({ model: VENDORS[vendor], runMeta: { temperature: 0.2 }, policy });
        const apexChat = args.mock
          ? mockApex((id) => {
              const t = suiteMap[suite].find((x) => x.id === id);
              return t ? t.answerKey : null;
            })
          : chat;
        const units = await runSuite({
          arm, vendor, suite: suiteMap[suite], attempt,
          apexChat,
          apexModel: VENDORS[vendor].tiers.apex,
          seeds,
          concurrency: args.concurrency ?? 8,
          policy,
        });
        results[vendor][arm][suite] = units;
      }
    }
  }

  const stats = computeStats(results);

  printReport(results, { vendors: smokeVendors, arms: smokeArmsFinal, suites: smokeSuites, seeds, mock: args.mock, policyVersion: args.policy, stats });

  if (!args.mock) {
    saveResults(results, {
      policy: args.policy,
      vendors: smokeVendors,
      arms: smokeArmsFinal,
      suites: smokeSuites,
      seeds,
      mode: 'live',
      generated: new Date().toISOString(),
    }, stats);
  }
}

function printReport(results, { vendors, arms, suites, seeds, mock, policyVersion = 'latest', stats = {} }) {
  console.log('\n' + '='.repeat(72));
  console.log(`RESULTS (policy ${policyVersion})`);
  console.log('='.repeat(72));

  // retries per unit = repeat attempts at the SAME tier (hysteresis retry).
  const retriesOf = (u) => {
    if (!u.attemptLog?.length) return 0;
    return u.attemptLog.length - new Set(u.attemptLog.map((a) => a.tier)).size;
  };

  for (const vendor of vendors) {
    for (const suite of suites) {
      console.log(`\n── ${vendor} / ${suite} ──`);
      console.log(`${'arm'.padEnd(14)}${'pass'.padEnd(8)}${'cost$'.padEnd(10)}${'$/pass'.padEnd(10)}${'tokens'.padEnd(10)}${'esc%'.padEnd(6)}${'apex'.padEnd(5)}retr`);
      for (const arm of arms) {
        const units = results[vendor][arm][suite];
        const n = units.length;
        const passes = units.filter((u) => u.passed).length;
        const cost = units.reduce((s, u) => s + u.cost, 0);
        const tok = units.reduce((s, u) => s + u.tokensIn + u.tokensOut, 0);
        const esc = units.filter((u) => u.escalated).length;
        const apex = units.filter((u) => u.apexResolved).length;
        const retr = units.reduce((s, u) => s + retriesOf(u), 0);
        const perPass = passes ? (cost / passes).toFixed(4) : '∞';
        console.log(
          `${arm.padEnd(14)}${`${passes}/${n}`.padEnd(8)}${cost.toFixed(4).padEnd(10)}${perPass.padEnd(10)}${String(tok).padEnd(10)}${`${((esc / n) * 100).toFixed(0)}%`.padEnd(6)}${String(apex).padEnd(5)}${retr}`
        );
        const cell = stats[vendor]?.[arm]?.[suite];
        if (cell && seeds > 1) {
          const pr = cell.passRate;
          const cpp = cell.costPerPassCI;
          const fmtCpp = (v) => (Number.isFinite(v) ? `$${v.toFixed(4)}` : '∞');
          console.log(
            `${''.padEnd(14)}95% CI: pass ${(pr.lower * 100).toFixed(0)}–${(pr.upper * 100).toFixed(0)}%  ·  $/pass ${fmtCpp(cpp.lower)}–${fmtCpp(cpp.upper)}  (seed-cluster bootstrap, n=${cell.n} across ${seeds} seeds)`
          );
        }
      }
      printTaskDetail(results, vendor, suite, arms, retriesOf);
    }
  }

  // Fail-set overlap: which unit/task FAILED per arm, so we can see whether
  // tiered fails the SAME units as the frontier baseline (quality parity) or
  // different ones (quality divergence). Across multiple seeds, report the
  // set of tasks that ever failed in any seed.
  if (arms.includes('all-frontier')) {
    for (const vendor of vendors) {
      for (const suite of suites) {
        const failByArm = {};
        for (const arm of arms) {
          const units = results[vendor][arm][suite];
          const failed = new Set();
          for (const u of units) if (!u.passed) failed.add(u.id);
          failByArm[arm] = failed;
        }
        const any = new Set(Object.values(failByArm).flatMap((s) => [...s]));
        if (!any.size) continue;
        console.log(`\n${vendor} / ${suite} — FAILED TASKS (any seed)`);
        for (const id of [...any].sort()) {
          const who = arms.map((arm) => `${arm}:${failByArm[arm].has(id) ? '✗' : '✓'}`).join('  ');
          console.log(`  ${id.padEnd(30)} ${who}`);
        }
        if (failByArm['all-frontier'] && failByArm['tiered']) {
          const f = failByArm['all-frontier'];
          const t = failByArm['tiered'];
          const missing = [...t].filter((id) => !f.has(id));
          if (missing.length) {
            console.log(`  ⚠ tiered failed ${missing.length} task(s) the frontier baseline PASSED in every seed: ${missing.join(', ')}`);
          }
        }
      }
    }
  }

  console.log(`\n${mock ? 'MOCK' : 'LIVE'} · ${seeds} seed(s) · ${new Date().toISOString()}`);
}

/**
 * Per-task mechanics table for the tiered arm: what tier each task STARTED
 * on, the escalation path it took (in order, including apex resolution),
 * retries (repeat attempts at the same tier), final tier, pass rate across
 * seeds, and cost. Shows HOW the router got to its answer.
 */
function printTaskDetail(results, vendor, suite, arms, retriesOf) {
  if (!arms.includes('tiered')) return;
  const units = results[vendor]?.tiered?.[suite];
  if (!units?.length) return;

  // Group by task id; within a task, take the LAST seed's trace as the
  // representative path (richest — includes apex resolution when it happened).
  const byTask = new Map();
  for (const u of units) {
    if (!byTask.has(u.id)) byTask.set(u.id, []);
    byTask.get(u.id).push(u);
  }

  console.log(`\n  tiered per-task mechanics (${byTask.size} tasks)`);
  console.log(`  ${'task'.padEnd(26)}${'start'.padEnd(8)}${'path'.padEnd(34)}${'retr'.padEnd(5)}${'final'.padEnd(9)}${'pass%'.padEnd(6)}cost$`);
  for (const [id, us] of byTask) {
    const last = us[us.length - 1];
    const start = last.tiersUsed[0] ?? '—';
    const path = last.attemptLog.map((a) => a.tier).join('→');
    const retr = retriesOf(last);
    const final = last.finalTier ?? '—';
    const passPct = Math.round((us.filter((u) => u.passed).length / us.length) * 100);
    const cost = us.reduce((s, u) => s + u.cost, 0);
    console.log(
      `  ${id.padEnd(26)}${start.padEnd(8)}${path.padEnd(34)}${String(retr).padEnd(5)}${final.padEnd(9)}${`${passPct}%`.padEnd(6)}${cost.toFixed(4)}`
    );
  }
}

/**
 * Side-by-side summary of two saved runs (e.g. --compare v1run.json,latestrun.json).
 * Shows pass, cost, and $/pass deltas per vendor/arm/suite so policy versions
 * can be compared without re-running.
 */
function printComparison(a, b) {
  console.log(`\nCOMPARING: ${a.meta.policy}  (${a.meta.generated})`);
  console.log(`        vs: ${b.meta.policy}  (${b.meta.generated})`);
  const vendors = [...new Set([...Object.keys(a.results), ...Object.keys(b.results)])];
  const arms = [...new Set([...Object.keys(ARMS), ...Object.keys(a.results[vendors[0]] ?? {}), ...Object.keys(b.results[vendors[0]] ?? {})])];
  for (const vendor of vendors) {
    for (const suite of Object.keys(SUITES)) {
      const rows = [];
      for (const arm of arms) {
        const ua = a.results?.[vendor]?.[arm]?.[suite];
        const ub = b.results?.[vendor]?.[arm]?.[suite];
        if (!ua && !ub) continue;
        const sum = (units) => {
          if (!units?.length) return { n: 0, pass: 0, cost: 0, tok: 0 };
          return {
            n: units.length,
            pass: units.filter((u) => u.passed).length,
            cost: units.reduce((s, u) => s + u.cost, 0),
            tok: units.reduce((s, u) => s + u.tokensIn + u.tokensOut, 0),
          };
        };
        const sa = sum(ua);
        const sb = sum(ub);
        const dPass = sb.pass - sa.pass;
        const dCost = sb.cost - sa.cost;
        const pct = sa.cost > 0 ? ((sb.cost - sa.cost) / sa.cost) * 100 : 0;
        rows.push({
          arm,
          a: sa,
          b: sb,
          dPass,
          dCost,
          delta: `${dPass > 0 ? '+' : ''}${dPass} pass, cost ${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`,
        });
      }
      if (!rows.length) continue;
      console.log(`\n${vendor} / ${suite}`);
      console.log(`${'arm'.padEnd(14)}${'A: pass/cost$'.padEnd(20)}${'B: pass/cost$'.padEnd(20)}delta`);
      for (const r of rows) {
        console.log(
          `${r.arm.padEnd(14)}${`${r.a.pass}/${r.a.n} ${r.a.cost.toFixed(4)}`.padEnd(20)}${`${r.b.pass}/${r.b.n} ${r.b.cost.toFixed(4)}`.padEnd(20)}${r.delta}`
        );
      }
    }
  }
}

// Guard so this file can be imported (e.g. by tests, for computeStats) without
// kicking off a full run — only invoke main() when run directly via `node`.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('\nFATAL:', e.message);
    process.exit(1);
  });
}