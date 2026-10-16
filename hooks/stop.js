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
const settings = require("./lib/settings");
const { markerAgeMs, setMarker } = require("./lib/ledger");

const SHARE_HINT_MARKER = "share-hint-shown";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// At most once a week, and only when the user has a week of real data worth
// sharing. Never on a session with no dispatches.
function shareHintDue(cwd) {
  if (!settings.get("shareHint", { cwd })) return false;
  const age = markerAgeMs(SHARE_HINT_MARKER);
  return age === null || age > WEEK_MS;
}

function formatReceipt(rows, withShareHint) {
  const summary = summarize(rows);
  const savingsLine = formatSavingsLine(summary);

  const lines = [
    "── undercut ──────────────────────────────",
    `  ${summary.cheapOrStandard} of ${summary.total} dispatches -> cheap/standard tier`,
  ];
  if (summary.escalated > 0) lines.push(`  ${summary.escalated} escalated to frontier/apex`);
  if (savingsLine) lines.push(`  ${savingsLine}`);
  if (withShareHint) lines.push("  run `undercut share` for a copy-paste summary of the last 7 days");
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

  if (!settings.get("receipt", { cwd: payload.cwd })) process.exit(0);

  const rows = rowsForSession(payload.session_id);
  if (rows.length === 0) process.exit(0);

  const hint = shareHintDue(payload.cwd);
  if (hint) setMarker(SHARE_HINT_MARKER);
  process.stderr.write(formatReceipt(rows, hint) + "\n");
  process.exit(0);
}

main().catch(() => process.exit(0));
