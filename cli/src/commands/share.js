import { ledger, savings, branding } from "../lib/hooks.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Prints a copy-paste summary of the last 7 days from the local ledger.
 * Real counts; savings only as a labelled estimate; no headline benchmark
 * number, because the brand rule is that a number never travels without its
 * condition. Nothing is sent anywhere.
 */
export async function share() {
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const rows = ledger.rowsSince(since);
  if (rows.length === 0) {
    console.log("No dispatches recorded in the last 7 days, so there is nothing to share yet.");
    return;
  }
  const s = savings.summarize(rows);
  const parts = [`Last 7 days with Undercut: ${s.total} dispatches, ${s.cheapOrStandard} ran cheap/standard`];
  if (s.escalated > 0) parts[0] += `, ${s.escalated} escalated on evidence`;
  parts[0] += ".";
  const line = savings.formatSavingsLine(s);
  if (line) parts.push(line.charAt(0).toUpperCase() + line.slice(1) + " (an estimate: the same tokens priced at frontier rates).");
  parts.push(`Routed with Undercut: ${branding.SITE}`);
  console.log(parts.join(" "));
}
