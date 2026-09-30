// Tests for the default-on bylines: settings resolution, the managed
// settings.json entries and their ownership rules, and the status line.
// Runs against a throwaway HOME so it never touches the real ~/.claude.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "undercut-test-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
delete process.env.CLAUDE_CONFIG_DIR;
for (const k of Object.keys(process.env)) if (k.startsWith("UNDERCUT_")) delete process.env[k];

const settings = require("./lib/settings");
const install = require("./lib/install");
const branding = require("./lib/branding");
const { buildLine } = require("./statusline");

const SETTINGS = path.join(home, ".claude", "settings.json");
const read = () => JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
const write = (o) => {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(o));
};
const reset = () => {
  fs.rmSync(path.join(home, ".claude"), { recursive: true, force: true });
  fs.rmSync(path.join(home, ".undercut"), { recursive: true, force: true });
  for (const k of Object.keys(process.env)) if (k.startsWith("UNDERCUT_")) delete process.env[k];
};
const HOOKS = path.join(home, "hooks");

test("defaults: bylines on", () => {
  reset();
  assert.equal(settings.get("attribution"), true);
  assert.equal(settings.get("statusLine"), true);
});

test("precedence: env beats project beats user beats default", () => {
  reset();
  write({ undercut: { attribution: false } });
  assert.equal(settings.get("attribution"), false);
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "undercut-proj-"));
  fs.mkdirSync(path.join(proj, ".claude"));
  fs.writeFileSync(path.join(proj, ".claude", "settings.json"), JSON.stringify({ undercut: { attribution: true } }));
  assert.equal(settings.get("attribution", { cwd: proj }), true);
  process.env.UNDERCUT_ATTRIBUTION = "off";
  assert.equal(settings.get("attribution", { cwd: proj }), false);
});

test("branding off turns off every byline and tip but not the receipt", () => {
  reset();
  process.env.UNDERCUT_BRANDING = "0";
  for (const k of ["attribution", "attributionBadge", "narrationTag", "spinnerVerbs", "statusLineTips", "shareHint"]) {
    assert.equal(settings.get(k), false, k);
  }
  assert.equal(settings.get("receipt"), true);
  assert.equal(settings.get("statusLine"), true);
});

test("apply writes attribution, status line and spinner verbs on a clean settings.json", () => {
  reset();
  const r = install.apply({ hooksDir: HOOKS });
  assert.deepEqual(r.skipped, []);
  const s = read();
  assert.match(s.attribution.commit, /Co-Authored-By: Claude <noreply@anthropic.com>/);
  assert.match(s.attribution.commit, /Routed-With: Undercut \(getundercut\.sh\)/);
  assert.match(s.attribution.pr, /badge\.svg/);
  assert.match(s.statusLine.command, /statusline\.js/);
  assert.equal(s.spinnerVerbs.mode, "append");
});

test("apply never overwrites an existing attribution, status line or spinner verbs", () => {
  reset();
  const mine = { attribution: { commit: "mine", pr: "mine" }, statusLine: { type: "command", command: "x" }, spinnerVerbs: { mode: "replace", verbs: ["a"] } };
  write(mine);
  const r = install.apply({ hooksDir: HOOKS });
  assert.equal(r.changes.length, 0);
  assert.equal(r.skipped.length, 3);
  assert.deepEqual(read(), mine);
});

test("apply is idempotent and keeps unrelated keys", () => {
  reset();
  write({ theme: "dark" });
  install.apply({ hooksDir: HOOKS });
  const first = fs.readFileSync(SETTINGS, "utf8");
  const r = install.apply({ hooksDir: HOOKS });
  assert.equal(r.changes.length, 0);
  assert.equal(fs.readFileSync(SETTINGS, "utf8"), first);
  assert.equal(read().theme, "dark");
});

test("turning attribution off removes only what Undercut wrote", () => {
  reset();
  install.apply({ hooksDir: HOOKS });
  process.env.UNDERCUT_ATTRIBUTION = "off";
  install.apply({ hooksDir: HOOKS });
  const s = read();
  assert.equal(s.attribution, undefined);
  assert.ok(s.statusLine);
});

test("PR footer off keeps Claude Code's own PR line", () => {
  reset();
  process.env.UNDERCUT_ATTRIBUTION_PR = "off";
  install.apply({ hooksDir: HOOKS });
  assert.equal(read().attribution.pr, install.CLAUDE_CODE_PR_LINE);
});

test("a settings.json that does not parse is never touched", () => {
  reset();
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, "{ not json");
  const r = install.apply({ hooksDir: HOOKS });
  assert.equal(r.unreadable, true);
  assert.equal(fs.readFileSync(SETTINGS, "utf8"), "{ not json");
});

test("status line shows a description, not $0.00, before any dispatch", () => {
  const line = buildLine("s1", [], settings.getAll());
  assert.doesNotMatch(line, /\$0\.00/);
  assert.match(line, /cheapest tier that passes verification/);
});

test("status line savings are always labelled est.", () => {
  const rows = [{ session_id: "s1", tier: "cheap", model: "claude-haiku-4-5", usage: { input_tokens: 1000000, output_tokens: 100000 } }];
  const line = buildLine("s1", rows, settings.getAll());
  assert.match(line, /est\. ~\$/);
  assert.match(line, /1 dispatch \(1 cheap\/standard\)/);
});

test("byline copy carries no dollar figure", () => {
  assert.doesNotMatch(branding.commitTrailer() + branding.prFooter(), /\$/);
});
