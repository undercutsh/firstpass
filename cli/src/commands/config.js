import { settings, install } from "../lib/hooks.js";

const VALUES = { on: true, off: false, true: true, false: false, 1: true, 0: false };

/**
 * `undercut config`            list every setting and its current value
 * `undercut config <key>`      print one
 * `undercut config <key> on|off`  change it in ~/.claude/settings.json and
 *                              re-apply the managed entries right away
 */
export async function config(key, value) {
  if (!key) {
    const all = settings.getAll();
    const width = Math.max(...Object.keys(all).map((k) => k.length));
    for (const [k, v] of Object.entries(all)) {
      console.log(`${k.padEnd(width)}  ${v ? "on" : "off"}`);
    }
    console.log("");
    console.log("Change one with `undercut config <setting> off`. `branding off` turns off every byline and tip.");
    return;
  }

  if (!(key in settings.DEFAULTS)) {
    console.error(`Unknown setting "${key}". Run \`undercut config\` to list them.`);
    process.exitCode = 1;
    return;
  }

  if (value === undefined) {
    console.log(settings.get(key) ? "on" : "off");
    return;
  }

  const next = VALUES[String(value).toLowerCase()];
  if (next === undefined) {
    console.error('Value must be "on" or "off".');
    process.exitCode = 1;
    return;
  }

  if (!settings.setUser(key, next)) {
    console.error(`Could not update ${settings.userSettingsPath()}: it is not valid JSON, so it was left untouched.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${key}: ${next ? "on" : "off"}`);

  const result = install.apply({});
  for (const c of result.changes) console.log(`  updated: ${c}`);
  for (const s of result.skipped) console.log(`  left alone: ${s}`);
  if (result.changes.length > 0) console.log("Run /reload-plugins, or start a new session, for Claude Code to pick it up.");
}
