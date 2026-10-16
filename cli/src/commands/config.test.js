import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../../bin/undercut.js", import.meta.url));

function run(home, cwd, ...args) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.CLAUDE_CONFIG_DIR;
  for (const k of Object.keys(env)) if (k.startsWith("UNDERCUT_")) delete env[k];
  return spawnSync(process.execPath, [BIN, ...args], { env, cwd, encoding: "utf8" });
}

test("config off/on round-trips the managed attribution entry", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uc-cli-"));
  const settingsPath = path.join(home, ".claude", "settings.json");

  // Turning a setting on for the first time writes the managed entries.
  let r = run(home, home, "config", "attribution", "on");
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.match(s.attribution.commit, /Routed-With: Undercut/);
  assert.equal(s.undercut.attribution, true);

  r = run(home, home, "config", "attribution", "off");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(settingsPath, "utf8")).attribution, undefined);
  assert.match(run(home, home, "config", "attribution").stdout, /off/);
});

test("config rejects an unknown setting and a bad value", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uc-cli-"));
  assert.equal(run(home, home, "config", "nope").status, 1);
  assert.equal(run(home, home, "config", "attribution", "maybe").status, 1);
});

test("init adds the AGENTS.md note once and is idempotent", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uc-cli-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uc-repo-"));
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "# Agents\n\nExisting text.\n");
  run(home, repo, "init");
  const once = fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");
  assert.match(once, /Existing text\./);
  assert.equal(once.split("undercut:start").length - 1, 1);
  run(home, repo, "init");
  assert.equal(fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8"), once);
});

test("badge and share print without error", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uc-cli-"));
  assert.match(run(home, home, "badge").stdout, /badge\.svg/);
  assert.match(run(home, home, "share").stdout, /nothing to share yet/);
});
