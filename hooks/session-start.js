#!/usr/bin/env node
// SessionStart hook: (1) force-injects a condensed rubric so the skill
// doesn't depend on the matcher surfacing it (the Ponytail finding: 0/10
// self-activation without forced injection), and (2) shows the
// first-activation message once, or the daily digest at most once/day.
//
// It also applies Undercut's default-on bylines (commit trailer, PR footer,
// status line, spinner verbs) to Claude Code's settings.json via
// lib/install.js, and says so the first time. Every one of them has an
// off switch -- see lib/settings.js.
//
// COPY NOTE: the strings below (RUBRIC_CONTEXT, first-activation message,
// digest line) are drafts pending Justin's review -- see the design doc
// and the chat message alongside this build. Do not treat this file's
// wording as final/shipped.

const { readAllRows, hasShownFirstActivation, markFirstActivationShown, lastDigestShownAt, markDigestShownNow, hasMarker, setMarker } = require("./lib/ledger");
const { summarize, formatSavingsLine } = require("./lib/savings");
const { markdownLink } = require("./lib/links");
const settings = require("./lib/settings");
const install = require("./lib/install");
const update = require("./lib/update");
const path = require("path");
const { SITE_URL, statsLine } = require("./lib/branding");

const RUBRIC_CONTEXT = `Default to delegating decomposable execution work via subagents (Task tool) rather than doing it directly in the main thread -- the tiering below only saves anything if delegation happens at all. Before any multi-agent fan-out, swarm, or Workflow orchestration, or when assigning a model tier to a delegated unit of work: score six flags (Unverifiable, Ambiguous, Blast radius, Cross-cutting, Novel, Format-strict) to pick a base tier (cheap/standard/frontier/apex). Escalate only on an objective trigger (verification failure x2, measured disagreement, explicit uncertainty) -- never de-escalate, max one retry per tier. See skills/firstpass/SKILL.md for the full rubric.`;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Extra instructions for the agent, only for the marks that are switched on.
function brandingContext(cwd) {
  const lines = [];
  if (settings.get("narrationTag", { cwd })) {
    lines.push(
      `End every \`Routing:\` line with \` \u00b7 [undercut](${SITE_URL})\`, e.g. \`Routing: standard (cross-cutting, ambiguous) \u00b7 [undercut](${SITE_URL})\`.`
    );
  }
  if (settings.get("attribution", { cwd }) && settings.get("attributionPr", { cwd }) && settings.get("attributionStats", { cwd })) {
    lines.push(
      `When you write a pull request description after routing work this session, add one line directly under the Undercut footer with the real counts from your own Routing: lines, in the form "${statsLine("N", "M")}". Leave the line out if you routed nothing. Never add dollar figures.`
    );
  }
  return lines.join(" ");
}

const DISCLOSURE_MARKER = "byline-disclosure-shown";

function disclosureLines(result) {
  const lines = [];
  if (result.changes.length > 0) {
    lines.push(
      `Undercut added to your Claude Code settings: ${result.changes.join(", ")}. Commits get a "Routed-With: Undercut" trailer and PRs get a one-line footer. Turn any of it off with \`undercut config attribution off\` (or \`undercut config branding off\` for every byline and tip at once).`
    );
  }
  for (const s of result.skipped) lines.push(`Left alone: ${s}.`);
  return lines;
}

// One line, once per new version, from the marketplace clone Claude Code
// already keeps locally. No network call.
function updateNoticeLine(cwd) {
  if (!settings.get("updateNotice", { cwd })) return null;
  let found;
  try {
    found = update.check(path.join(__dirname, ".."));
  } catch {
    return null;
  }
  if (!found) return null;
  const marker = `update-notice-${found.latest}`;
  if (hasMarker(marker)) return null;
  setMarker(marker);
  return `${markdownLink()} ${found.latest} is available (you have ${found.current}). Run \`/plugin marketplace update firstpass\` then \`/reload-plugins\`.`;
}

function buildFeedbackContext(result) {
  const disclose = (result.changes.length > 0 || result.skipped.length > 0) && !hasMarker(DISCLOSURE_MARKER);

  if (!hasShownFirstActivation()) {
    markFirstActivationShown();
    const lines = [
      `${markdownLink()} is on. It tracks routing decisions locally (nothing leaves this machine).`,
      "You'll see a short summary at the end of sessions that route work, and at most one digest per day.",
    ];
    if (disclose) {
      setMarker(DISCLOSURE_MARKER);
      lines.push(...disclosureLines(result));
    }
    return lines.join("\n");
  }

  // Hooks installed before default-on bylines existed: disclose once.
  if (disclose) {
    setMarker(DISCLOSURE_MARKER);
    return [`${markdownLink()} update: bylines are now on by default.`, ...disclosureLines(result)].join("\n");
  }

  const last = lastDigestShownAt();
  const now = new Date();
  if (last && startOfDay(last).getTime() === startOfDay(now).getTime()) {
    return null;
  }

  const yesterdayStart = startOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const todayStart = startOfDay(now);
  const rows = readAllRows().filter((r) => {
    const t = new Date(r.ts).getTime();
    return t >= yesterdayStart.getTime() && t < todayStart.getTime();
  });

  if (rows.length === 0) return null;

  markDigestShownNow();

  const summary = summarize(rows);
  const savingsLine = formatSavingsLine(summary);
  const savingsPart = savingsLine ? `, ${savingsLine}` : "";

  return `${markdownLink()}: yesterday -- ${summary.total} dispatches, ${summary.cheapOrStandard} at cheap/standard tier${savingsPart}`;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let payload = {};
  try {
    payload = JSON.parse(input);
  } catch {
    // proceed regardless
  }

  let result = { changes: [], skipped: [] };
  try {
    result = install.apply({ hooksDir: __dirname, cwd: payload.cwd });
  } catch {
    // never block a session on settings housekeeping
  }

  const feedback = buildFeedbackContext(result);
  const extra = brandingContext(payload.cwd);
  const notice = updateNoticeLine(payload.cwd);
  const additionalContext = [RUBRIC_CONTEXT, extra, feedback, notice].filter(Boolean).join("\n\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext,
      },
    })
  );
  process.exit(0);
}

main().catch(() => process.exit(0));
