import { branding } from "../lib/hooks.js";

/** Prints the README badge markdown. Opt-in by nature: you paste it. */
export async function badge() {
  console.log(`[![routed with undercut](${branding.BADGE_URL})](${branding.SITE_URL})`);
}
