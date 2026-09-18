#!/usr/bin/env node
// Shared savings math for the Stop receipt and the SessionStart digest.
//
// "Savings" = the real cost of what actually ran, subtracted from what the
// SAME token counts would have cost at frontier rates. The actual cost is
// real; the frontier comparison is an estimate (we don't know a frontier
// run would produce the same token count) -- so this is always presented
// as an estimate, per the design doc's dollar-figure-honesty rule.
//
// When UNDERCUT_PLAN_MONTHLY_USD is set, savings are also expressed as a
// share of that plan cost -- but never as "we reduced your bill by $X":
// Claude subscription plans are flat-rate, so token savings don't map to
// a literal invoice reduction. It's value delivered relative to plan
// cost, framed that way on purpose.

const { costForUsage, frontierEquivalentCost } = require("./pricing");
const { planMonthlyCostUsd } = require("./ledger");

function summarize(rows) {
  const total = rows.length;
  const cheapOrStandard = rows.filter((r) => r.tier === "cheap" || r.tier === "standard").length;
  // escalated must be counted explicitly, never as (total - cheapOrStandard):
  // a row whose model ID didn't resolve has tier null, and the subtraction
  // silently reported it as escalated -- inverting the product's own claim
  // (a Haiku dispatch shown as "escalated to frontier/apex").
  const escalated = rows.filter((r) => r.tier === "frontier" || r.tier === "apex").length;
  const unclassified = total - cheapOrStandard - escalated;

  let actualCost = 0;
  let frontierCost = 0;
  let priced = 0;

  for (const row of rows) {
    if (!row.usage || !row.model) continue;
    const actual = typeof row.cost_usd === "number" ? row.cost_usd : costForUsage(row.model, row.usage);
    const frontier = frontierEquivalentCost(row.usage);
    if (typeof actual !== "number" || typeof frontier !== "number") continue;
    actualCost += actual;
    frontierCost += frontier;
    priced += 1;
  }

  const estimatedSavings = priced > 0 ? Math.max(0, frontierCost - actualCost) : null;
  const unpriced = total - priced;
  const planCost = planMonthlyCostUsd();
  const pctOfPlan = estimatedSavings !== null && planCost ? (estimatedSavings / planCost) * 100 : null;

  return { total, cheapOrStandard, escalated, unclassified, actualCost, estimatedSavings, unpriced, planCost, pctOfPlan };
}

function formatSavingsLine(summary) {
  if (summary.estimatedSavings === null) return null;

  const savings = `~$${summary.estimatedSavings.toFixed(2)}`;
  const unpricedNote = summary.unpriced > 0 ? ` (${summary.unpriced} unpriced, excluded)` : "";

  if (summary.pctOfPlan !== null) {
    const pct = summary.pctOfPlan.toFixed(0);
    return `est. ${savings} in frontier-rate value saved${unpricedNote} -- ~${pct}% of your $${summary.planCost}/mo plan`;
  }

  return `est. ${savings} in frontier-rate value saved vs. running everything at frontier${unpricedNote}`;
}

module.exports = { summarize, formatSavingsLine };
