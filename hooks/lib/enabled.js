#!/usr/bin/env node
// Opt-in gate for the hooks package.
//
// The hooks are deliberately opt-in: the skill's promise is a policy file
// the agent reads with zero infrastructure, and installing the plugin for
// the skill must never silently start writing a ledger.
//
// Two install shapes, and two different things that count as consent:
//
//   Manual install -- the user hand-wired these scripts into settings.json.
//   Editing settings.json IS the opt-in; there is nothing further to ask.
//   This is also every pre-plugin install, which must keep working exactly
//   as it does today.
//
//   Plugin install -- `claude plugin install` registers hooks/hooks.json
//   automatically, so the wiring no longer implies intent. Consent moves to
//   an explicit marker file the user creates.
//
// CLAUDE_PLUGIN_ROOT is set by the client only in the plugin case, which is
// what lets a single check tell the two apart.

const fs = require("fs");
const path = require("path");
const { UNDERCUT_DIR } = require("./ledger");

const MARKER_PATH = path.join(UNDERCUT_DIR, "hooks-enabled");

// markerPath is injectable so this is testable without touching the real
// home directory; production callers always use the default.
function hooksEnabled(markerPath = MARKER_PATH) {
  if (!process.env.CLAUDE_PLUGIN_ROOT) return true;
  if (process.env.UNDERCUT_HOOKS === "1") return true;
  try {
    return fs.existsSync(markerPath);
  } catch {
    // An unreadable home directory is not consent.
    return false;
  }
}

module.exports = { hooksEnabled, MARKER_PATH };
