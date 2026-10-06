#!/usr/bin/env node
// Undercut settings: one `undercut` object in Claude Code's own
// settings.json, toggled per key. Same shape the plugin README documents.
//
// Resolution order (first hit wins):
//   1. env var  UNDERCUT_<KEY_IN_SNAKE_CASE>=0|off|false  (or 1|on|true)
//   2. project  ./.claude/settings.json  -> "undercut": { ... }
//   3. user     ~/.claude/settings.json  -> "undercut": { ... }
//   4. DEFAULTS below
//
// Nothing here touches the network.

const fs = require("fs");
const os = require("os");
const path = require("path");

// Everything that other people can see (commits, PRs, generated files) or
// that is promotional (tips, share hints) is governed by `branding`. Setting
// `branding` to false turns all of those off at once; the local ledger,
// routing, and the receipt keep working.
const DEFAULTS = {
  branding: true,
  attribution: true, // commit trailer + PR footer (master for the next three)
  attributionPr: true, // PR description footer
  attributionBadge: true, // badge image in the PR footer
  attributionStats: true, // tier counts in the PR footer
  statusLine: true, // master switch for the Undercut status line
  statusLineSession: true,
  statusLineLifetime: true,
  statusLineTips: true,
  narrationTag: true, // "· undercut" on the Routing: line
  spinnerVerbs: true,
  receipt: true, // session-end receipt
  shareHint: true, // weekly "run undercut share" line in the receipt
  updateNotice: true, // session-start line when a newer plugin version is cached
  generatedFileHeaders: true, // header on files Undercut itself writes
};

// Keys that `branding: false` switches off.
const BRANDING_KEYS = new Set([
  "attribution",
  "attributionPr",
  "attributionBadge",
  "attributionStats",
  "statusLineTips",
  "narrationTag",
  "spinnerVerbs",
  "shareHint",
  "generatedFileHeaders",
]);

function userSettingsPath() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json");
}

function projectSettingsPath(cwd) {
  return path.join(cwd || process.cwd(), ".claude", "settings.json");
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function envName(key) {
  return "UNDERCUT_" + key.replace(/([A-Z])/g, "_$1").toUpperCase();
}

function parseBool(raw) {
  const v = String(raw).trim().toLowerCase();
  if (["0", "off", "false", "no"].includes(v)) return false;
  if (["1", "on", "true", "yes"].includes(v)) return true;
  return undefined;
}

function fromFile(p, key) {
  const obj = readJson(p);
  const block = obj && typeof obj.undercut === "object" && obj.undercut ? obj.undercut : null;
  return block && typeof block[key] === "boolean" ? block[key] : undefined;
}

function get(key, opts = {}) {
  if (!(key in DEFAULTS)) throw new Error(`unknown Undercut setting: ${key}`);

  let value;
  const env = process.env[envName(key)];
  if (env !== undefined) value = parseBool(env);
  if (value === undefined) value = fromFile(projectSettingsPath(opts.cwd), key);
  if (value === undefined) value = fromFile(userSettingsPath(), key);
  if (value === undefined) value = DEFAULTS[key];

  if (BRANDING_KEYS.has(key) && key !== "branding" && value && !get("branding", opts)) return false;
  return value;
}

function getAll(opts = {}) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) out[key] = get(key, opts);
  return out;
}

// Write one key into the user-level settings.json, preserving everything
// else. Returns false (and writes nothing) if the file exists but is not
// valid JSON -- we never clobber a file we could not parse.
function setUser(key, value) {
  if (!(key in DEFAULTS)) throw new Error(`unknown Undercut setting: ${key}`);
  if (typeof value !== "boolean") throw new Error("Undercut settings are on/off");

  const p = userSettingsPath();
  let obj = {};
  if (fs.existsSync(p)) {
    obj = readJson(p);
    if (!obj || typeof obj !== "object") return false;
  }
  obj.undercut = { ...(typeof obj.undercut === "object" && obj.undercut ? obj.undercut : {}), [key]: value };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
  return true;
}

module.exports = { DEFAULTS, BRANDING_KEYS, get, getAll, setUser, userSettingsPath, projectSettingsPath, envName, readJson };
