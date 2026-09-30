#!/usr/bin/env node
// Applies Undercut's managed entries to Claude Code's user settings.json:
// attribution (commit trailer + PR footer), the status line, and spinner
// verbs. Called from the SessionStart hook on every session and from
// `undercut config` right after a toggle, so a change takes effect without
// waiting for the next session.
//
// Ownership rule: Undercut only ever writes or removes an entry when the
// entry is absent or still exactly what Undercut last wrote (recorded in
// ~/.undercut/managed.json). Anything the user has set or customised is left
// alone, and reported as skipped. A settings.json that does not parse is
// never touched.

const fs = require("fs");
const path = require("path");
const { UNDERCUT_DIR } = require("./ledger");
const settings = require("./settings");
const branding = require("./branding");

const MANAGED_PATH = path.join(UNDERCUT_DIR, "managed.json");
// Claude Code's built-in PR line, used as the baseline when only the commit
// trailer is on, so turning the PR footer off does not blank the PR line.
const CLAUDE_CODE_PR_LINE = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

function readManaged() {
  return settings.readJson(MANAGED_PATH) || {};
}

function writeAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, p);
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// hooksDir: absolute path of the directory holding statusline.js (hooks only).
function apply({ hooksDir, cwd } = {}) {
  const p = settings.userSettingsPath();
  let obj = {};
  if (fs.existsSync(p)) {
    obj = settings.readJson(p);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { changes: [], skipped: [], unreadable: true };
  }

  const managed = readManaged();
  const changes = [];
  const skipped = [];

  // --- attribution -------------------------------------------------------
  {
    const on = settings.get("attribution", { cwd });
    const want = on
      ? {
          commit: branding.commitTrailer(),
          pr: settings.get("attributionPr", { cwd })
            ? branding.prFooter({ badge: settings.get("attributionBadge", { cwd }) })
            : CLAUDE_CODE_PR_LINE,
        }
      : null;
    const have = obj.attribution;
    const owned = have === undefined || same(have, managed.attribution);
    if (!owned) {
      skipped.push("attribution (you already have an `attribution` entry; left untouched)");
    } else if (want && !same(have, want)) {
      obj.attribution = want;
      managed.attribution = want;
      changes.push("commit trailer and PR footer");
    } else if (!want && have !== undefined) {
      delete obj.attribution;
      delete managed.attribution;
      changes.push("removed commit trailer and PR footer");
    }
  }

  // --- status line -------------------------------------------------------
  // Only the SessionStart hook knows the plugin's real path, so the CLI passes
  // no hooksDir: it can remove the status line when it is switched off, but
  // never (re)points it at wherever the CLI happens to be running from.
  if (hooksDir || !settings.get("statusLine", { cwd })) {
    const on = settings.get("statusLine", { cwd });
    const want = on ? { type: "command", command: `node "${path.join(hooksDir, "statusline.js")}"` } : null;
    const have = obj.statusLine;
    const owned = have === undefined || same(have, managed.statusLine);
    if (!owned) {
      skipped.push("status line (you already have one; run `undercut statusline` from yours to include Undercut)");
    } else if (want && !same(have, want)) {
      obj.statusLine = want;
      managed.statusLine = want;
      changes.push("status line");
    } else if (!want && have !== undefined) {
      delete obj.statusLine;
      delete managed.statusLine;
      changes.push("removed status line");
    }
  }

  // --- spinner verbs -----------------------------------------------------
  {
    const on = settings.get("spinnerVerbs", { cwd });
    const want = on ? { mode: "append", verbs: branding.SPINNER_VERBS } : null;
    const have = obj.spinnerVerbs;
    const owned = have === undefined || same(have, managed.spinnerVerbs);
    if (!owned) {
      skipped.push("spinner verbs (you already have custom ones; left untouched)");
    } else if (want && !same(have, want)) {
      obj.spinnerVerbs = want;
      managed.spinnerVerbs = want;
      changes.push("spinner verbs");
    } else if (!want && have !== undefined) {
      delete obj.spinnerVerbs;
      delete managed.spinnerVerbs;
      changes.push("removed spinner verbs");
    }
  }

  if (changes.length > 0) {
    writeAtomic(p, JSON.stringify(obj, null, 2) + "\n");
    writeAtomic(MANAGED_PATH, JSON.stringify(managed, null, 2) + "\n");
  }
  return { changes, skipped, unreadable: false };
}

module.exports = { apply, MANAGED_PATH, CLAUDE_CODE_PR_LINE };
