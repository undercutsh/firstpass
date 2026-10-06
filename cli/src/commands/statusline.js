import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { buildLine } = require(fileURLToPath(new URL("../../../hooks/statusline.js", import.meta.url)));
import { settings, ledger } from "../lib/hooks.js";

/**
 * Prints the Undercut status line so it can be chained from your own status
 * line script, e.g. `echo "$(your-line) | $(undercut statusline)"`.
 */
export async function statusline() {
  const cfg = settings.getAll();
  if (!cfg.statusLine) return;
  console.log(buildLine(process.env.CLAUDE_SESSION_ID || "", ledger.readAllRows(), cfg));
}
