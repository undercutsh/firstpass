import fs from "node:fs";
import path from "node:path";
import { branding } from "../lib/hooks.js";

const START = "<!-- undercut:start -->";
const END = "<!-- undercut:end -->";

export function block() {
  return [
    START,
    "## Model routing",
    "",
    `This repo routes delegated work with [Undercut](${branding.SITE_URL}): start each unit at the cheapest model that can pass verification, and escalate only on evidence. Install the policy with \`npx skills add undercutsh/firstpass\`.`,
    END,
    "",
  ].join("\n");
}

/**
 * Adds (or refreshes) a short routing note in this repo's AGENTS.md so
 * teammates and their agents see it. Explicit by design: it edits a tracked
 * file, so it only ever runs when you call it.
 */
export async function init() {
  const file = path.join(process.cwd(), "AGENTS.md");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
  const next = re.test(existing)
    ? existing.replace(re, block())
    : existing + (existing && !existing.endsWith("\n\n") ? (existing.endsWith("\n") ? "\n" : "\n\n") : "") + block();
  if (next === existing) {
    console.log("AGENTS.md already carries the Undercut note.");
    return;
  }
  fs.writeFileSync(file, next, "utf8");
  console.log("Updated AGENTS.md. Review and commit it like any other change.");
}
