#!/usr/bin/env node
// Stop hook: prints the session-end receipt (Layer 2 of the feedback
// loop) -- only when this session actually had >=1 dispatch, so a quiet
// session never looks like "it's dead."
//
// COPY NOTE: the receipt format below is a draft pending Justin's review
// -- see the design doc and the chat message alongside this build.

const { rowsForSession } = require("./lib/ledger");
const { summarize, formatSavingsLine } = require("./lib/savings");
const { terminalLink } = require("./lib/links");

function formatReceipt(rows) {
  const summary = summarize(rows);
  const savingsLine = formatSavingsLine(summary);

  const lines = [
    "── undercut ──────────────────────────────",
    `  ${summary.cheapOrStandard} of ${summary.total} dispatches -> cheap/standard tier`,
  ];
  if (summary.escalated > 0) lines.push(`  ${summary.escalated} escalated to frontier/apex`);
  if (savingsLine) lines.push(`  ${savingsLine}`);
  lines.push(`  ${terminalLink()}`);
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
