#!/usr/bin/env node
// Local-only ledger for Undercut Hooks. One JSONL row per dispatch,
// written to ~/.undercut/ledger.jsonl. Nothing here ever leaves the
// machine -- no network call, no telemetry -- this file IS the entire
// "server side" of the feature.

const fs = require("fs");
const os = require("os");
const path = require("path");

const UNDERCUT_DIR = path.join(os.homedir(), ".undercut");
const LEDGER_PATH = path.join(UNDERCUT_DIR, "ledger.jsonl");
const FIRST_ACTIVATION_MARKER = path.join(UNDERCUT_DIR, "first-activation-shown");
const LAST_DIGEST_MARKER = path.join(UNDERCUT_DIR, "last-digest-shown");

function ensureDir() {
  fs.mkdirSync(UNDERCUT_DIR, { recursive: true });
}

function appendRow(row) {
  ensureDir();
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(row) + "\n", "utf8");
}

function readAllRows() {
  ensureDir();
  if (!fs.existsSync(LEDGER_PATH)) return [];
  const raw = fs.readFileSync(LEDGER_PATH, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function rowsSince(isoTimestamp) {
  const cutoff = new Date(isoTimestamp).getTime();
  return readAllRows().filter((r) => new Date(r.ts).getTime() >= cutoff);
}

function rowsForSession(sessionId) {
  return readAllRows().filter((r) => r.session_id === sessionId);
}

function hasShownFirstActivation() {
  ensureDir();
  return fs.existsSync(FIRST_ACTIVATION_MARKER);
}

function markFirstActivationShown() {
  ensureDir();
  fs.writeFileSync(FIRST_ACTIVATION_MARKER, new Date().toISOString(), "utf8");
}

function lastDigestShownAt() {
  ensureDir();
  if (!fs.existsSync(LAST_DIGEST_MARKER)) return null;
  return fs.readFileSync(LAST_DIGEST_MARKER, "utf8").trim();
}

function markDigestShownNow() {
  ensureDir();
  fs.writeFileSync(LAST_DIGEST_MARKER, new Date().toISOString(), "utf8");
}

// Plan cost is set by the user via env var, not detected -- Claude Code
// hooks have no API to read which subscription plan a session is on.
// Unset by default; the digest/receipt fall back to a plan-independent
// dollar estimate when this isn't configured. See hooks/README.md.
function planMonthlyCostUsd() {
  const raw = process.env.UNDERCUT_PLAN_MONTHLY_USD;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = {
  UNDERCUT_DIR,
  LEDGER_PATH,
  appendRow,
  readAllRows,
  rowsSince,
  rowsForSession,
  hasShownFirstActivation,
  markFirstActivationShown,
  lastDigestShownAt,
  markDigestShownNow,
  planMonthlyCostUsd,
};
