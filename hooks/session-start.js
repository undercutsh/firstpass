#!/usr/bin/env node
// SessionStart hook: (1) force-injects a condensed rubric so the skill
// doesn't depend on the matcher surfacing it (the Ponytail finding: 0/10
// self-activation without forced injection), and (2) shows the
// first-activation message once, or the daily digest at most once/day.
//
// COPY NOTE: the strings below (RUBRIC_CONTEXT, first-activation message,
// digest line) are drafts pending Justin's review -- see the design doc
// and the chat message alongside this build. Do not treat this file's
// wording as final/shipped.

const { readAllRows, hasShownFirstActivation, markFirstActivationShown, lastDigestShownAt, markDigestShownNow } = require("./lib/ledger");

const RUBRIC_CONTEXT = `Before any multi-agent fan-out, swarm, or Workflow orchestration, or when assigning a model tier to a delegated unit of work: score six flags (Unverifiable, Ambiguous, Blast radius, Cross-cutting, Novel, Format-strict) to pick a base tier (cheap/standard/frontier/apex). Escalate only on an objective trigger (verification failure x2, measured disagreement, explicit uncertainty) -- never de-escalate, max one retry per tier. See skills/firstpass/SKILL.md for the full rubric.`;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function buildFeedbackContext() {
  if (!hasShownFirstActivation()) {
    markFirstActivationShown();
    return [
      "undercut hooks installed -- this will track routing decisions locally (nothing leaves this machine).",
      "You'll see a short summary at the end of sessions that route work, and at most one digest per day.",
      "github.com/undercutsh/firstpass",
    ].join("\n");
  }

  const last = lastDigestShownAt();
  const now = new Date();
  if (last && startOfDay(last).getTime() === startOfDay(now).getTime()) {
    return null;
  }

  const yesterdayStart = startOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const todayStart = startOfDay(now);
  const rows = readAllRows().filter((r) => {
    const t = new Date(r.ts).getTime();
    return t >= yesterdayStart.getTime() && t < todayStart.getTime();
  });

  if (rows.length === 0) return null;

  markDigestShownNow();

  const cheapOrStandard = rows.filter((r) => r.tier === "cheap" || r.tier === "standard").length;
  const known = rows.filter((r) => typeof r.cost_usd === "number");
  const totalCost = known.reduce((sum, r) => sum + r.cost_usd, 0);
  const costPart =
    known.length === rows.length
      ? `~$${totalCost.toFixed(2)}`
      : `~$${totalCost.toFixed(2)} (${rows.length - known.length} unpriced)`;

  return `undercut: yesterday -- ${rows.length} dispatches, ${cheapOrStandard} at cheap/standard tier, ${costPart} spent -- github.com/undercutsh/firstpass`;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  try {
    JSON.parse(input);
  } catch {
    // proceed regardless -- SessionStart input isn't required to build context
  }

  const feedback = buildFeedbackContext();
  const additionalContext = feedback ? `${RUBRIC_CONTEXT}\n\n${feedback}` : RUBRIC_CONTEXT;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext,
      },
    })
  );
  process.exit(0);
}

main().catch(() => process.exit(0));
