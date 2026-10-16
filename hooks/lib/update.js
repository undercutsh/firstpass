#!/usr/bin/env node
// Update notice, with no network call from Undercut. Claude Code already
// keeps a local clone of each marketplace and refreshes it on its own
// schedule; this compares the version in that clone with the version of the
// plugin that is actually running, and says so once per new version.
//
// Everything here fails quiet: a layout Claude Code changes, a missing file,
// or an odd version string means "no notice", never an error in a session.

const fs = require("fs");
const os = require("os");
const path = require("path");

const MARKETPLACE = "firstpass";

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(candidate, current) {
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

// Where Claude Code keeps the marketplace clone: known_marketplaces.json
// records an installLocation; the conventional path is the fallback.
function marketplaceDir() {
  const known = readJson(path.join(claudeDir(), "plugins", "known_marketplaces.json"));
  const entry = known && known[MARKETPLACE];
  if (entry && typeof entry.installLocation === "string") return entry.installLocation;
  return path.join(claudeDir(), "plugins", "marketplaces", MARKETPLACE);
}

// pluginRoot: the running plugin's root (hooks/.. ). Returns
// { current, latest } when a newer version is available, else null.
function check(pluginRoot) {
  const current = (readJson(path.join(pluginRoot, ".claude-plugin", "plugin.json")) || {}).version;
  const latest = (readJson(path.join(marketplaceDir(), ".claude-plugin", "plugin.json")) || {}).version;
  return isNewer(latest, current) ? { current, latest } : null;
}

module.exports = { check, isNewer, marketplaceDir };
