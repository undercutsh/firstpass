import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// The byline settings, ledger and install logic live in ../../../hooks/lib
// (CommonJS, shared with the Claude Code hooks so there is one copy of the
// rules). The CLI is run from a clone today (see README, "Usage"); if it is
// ever published to npm, this is the one file to replace with a bundled copy.
const require = createRequire(import.meta.url);
const lib = (name) => require(fileURLToPath(new URL(`../../../hooks/lib/${name}.js`, import.meta.url)));

export const settings = lib("settings");
export const install = lib("install");
export const branding = lib("branding");
export const ledger = lib("ledger");
export const savings = lib("savings");
export const hooksDir = fileURLToPath(new URL("../../../hooks/", import.meta.url));
