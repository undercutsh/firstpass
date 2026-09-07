#!/usr/bin/env node
// Stop hook: prints the session-end receipt (Layer 2 of the feedback
// loop) -- only when this session actually had >=1 dispatch, so a quiet
// session never looks like "it's dead."
//
// COPY NOTE: the receipt format below is a draft pending Justin's review
// -- see the design doc and the chat message alongside this build.

const { rowsForSession } = require("./lib/ledger");

function formatReceipt(rows) {
  const total = rows.length;
  const cheapOrStandard = rows.filter((r) => r.tier === "cheap" || r.tier === "standard").length;
  const escalated = total - cheapOrStandard;

  const known = rows.filter((r) => typeof r.cost_usd === "number");
  const totalCost = known.reduce((sum, r) => sum + r.cost_usd, 0);

  const costLine =
    known.length > 0
      ? `  ~$${totalCost.toFixed(2)} spent${known.length < total ? ` (${total - known.length} unpriced)` : ""}`
      : null;

  const lines = [
    "── undercut ──────────────────────────────",
    `  ${cheapOrStandard} of ${total} dispatches -> cheap/standard tier`,
  ];
  if (escalated > 0) lines.push(`  ${escalated} escalated to frontier/apex`);
  if (costLine) lines.push(costLine);
  lines.push("  github.com/undercutsh/firstpass");
  lines.push("────────────────────────────────────────────");

  return lines.join("\n");
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const rows = rowsForSession(payload.session_id);
  if (rows.length === 0) process.exit(0);

  process.stderr.write(formatReceipt(rows) + "\n");
  process.exit(0);
}

main().catch(() => process.exit(0));
