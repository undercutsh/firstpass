#!/usr/bin/env node
// Status line: prints one line from the local ledger. Claude Code runs this
// on every refresh with session JSON on stdin. No network, no model call.
//
// Before the first dispatch there is nothing real to show, so it prints a
// one-line description instead of "$0.00" (which reads as broken).

const { readAllRows } = require("./lib/ledger");
const { summarize } = require("./lib/savings");
const settings = require("./lib/settings");
const { tipFor } = require("./lib/branding");
const { terminalLink } = require("./lib/links");

function money(n) {
  return `~$${n.toFixed(2)}`;
}

function buildLine(sessionId, rows, cfg) {
  const name = terminalLink();
  const mine = rows.filter((r) => r.session_id === sessionId);
  const parts = [name];

  if (mine.length === 0) {
    parts.push("routes each unit of work to the cheapest tier that passes verification");
  } else {
    const s = summarize(mine);
    if (cfg.statusLineSession) {
      if (s.estimatedSavings !== null) parts.push(`est. ${money(s.estimatedSavings)} saved this session`);
      parts.push(`${s.total} dispatch${s.total === 1 ? "" : "es"} (${s.cheapOrStandard} cheap/standard)`);
    }
  }

  if (cfg.statusLineLifetime && rows.length > 0) {
    const all = summarize(rows);
    if (all.estimatedSavings !== null) parts.push(`est. ${money(all.estimatedSavings)} lifetime`);
  }

  if (cfg.statusLineTips) parts.push(`tip: ${tipFor(sessionId)}`);
  return parts.join(" · ");
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let payload = {};
  try {
    payload = JSON.parse(input);
  } catch {
    // no stdin JSON: fall through with no session id
  }
  const cfg = settings.getAll({ cwd: payload.cwd });
  if (!cfg.statusLine) process.exit(0);
  process.stdout.write(buildLine(payload.session_id || "", readAllRows(), cfg) + "\n");
  process.exit(0);
}

if (require.main === module) main().catch(() => process.exit(0));

module.exports = { buildLine };
