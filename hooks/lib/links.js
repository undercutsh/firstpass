#!/usr/bin/env node
// Never print an unfurled/bare URL -- always the app name, hyperlinked.
// Two renderers because the two surfaces differ: additionalContext text
// flows into the agent's context and may get relayed to the user in chat
// (markdown renders there); the Stop hook's receipt goes straight to a
// terminal (markdown doesn't render there, but the OSC 8 hyperlink escape
// sequence does in most modern terminals -- and degrades to plain text,
// never a raw URL, in terminals that don't support it).

const REPO_URL = "https://github.com/undercutsh/firstpass";
const APP_NAME = "Undercut";

function markdownLink(text, url) {
  return "[" + (text || APP_NAME) + "](" + (url || REPO_URL) + ")";
}

function terminalLink(text, url) {
  const ESC = "\x1b";
  const BEL = "\x07";
  const label = text || APP_NAME;
  const target = url || REPO_URL;
  return ESC + "]8;;" + target + BEL + label + ESC + "]8;;" + BEL;
}

module.exports = { REPO_URL, APP_NAME, markdownLink, terminalLink };
