import { Command } from "commander";
import { login } from "./commands/login.js";
import { sync } from "./commands/sync.js";
import { status } from "./commands/status.js";
import { logout } from "./commands/logout.js";
import { config } from "./commands/config.js";
import { share } from "./commands/share.js";
import { badge } from "./commands/badge.js";
import { init } from "./commands/init.js";
import { statusline } from "./commands/statusline.js";

const VERSION = "0.1.0";

export function buildProgram() {
  const program = new Command();

  program
    .name("undercut")
    .description(
      "Undercut Pro CLI — pair this machine, sync your policy, check status, log out."
    )
    .version(VERSION);

  program
    .command("login")
    .description(
      "Pair this machine with your Undercut Pro account (localhost-callback flow)."
    )
    .option(
      "--code <code>",
      "pre-bound pairing code from the web dashboard (skips the interactive prompt)"
    )
    .option(
      "--port <port>",
      "force the local callback server to a specific port instead of an OS-assigned one"
    )
    .action(login);

  program
    .command("sync")
    .description(
      "Fetch the signed policy artifact and cache it at ~/.undercut/policy.json."
    )
    .option("--if-stale", "no-op if the cached policy is still within its TTL")
    .option("--ci", "use machine-auth (API key) instead of a paired session")
    .action(sync);

  program
    .command("status")
    .description(
      "Show pairing/connection state, cached policy version, and cache age."
    )
    .action(status);

  program
    .command("logout")
    .description(
      "Delete local credentials and cached policy; revert to the free static model map."
    )
    .action(logout);

  program
    .command("config [setting] [value]")
    .description(
      "List, read, or change Undercut settings (bylines, status line, tips). `undercut config branding off` turns off every byline and tip."
    )
    .action(config);

  program
    .command("share")
    .description("Print a copy-paste summary of the last 7 days from the local ledger.")
    .action(share);

  program
    .command("badge")
    .description("Print the README badge markdown.")
    .action(badge);

  program
    .command("init")
    .description("Add a short routing note to this repo's AGENTS.md.")
    .action(init);

  program
    .command("statusline")
    .description("Print the Undercut status line, for chaining from your own.")
    .action(statusline);

  program.addHelpText("after", "\nUndercut · https://getundercut.sh");

  return program;
}

export async function run(argv) {
  const program = buildProgram();
  await program.parseAsync(argv);
}
