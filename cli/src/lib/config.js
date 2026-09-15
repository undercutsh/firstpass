// Backend endpoints this CLI talks to.
//
// PLACEHOLDER — none of these hosts exist yet. `undercut-app` (the private
// backend repo, PRD §5.1.5 topology table) has not been built. Every URL
// below is a stand-in so the CLI's control flow (open browser -> local
// callback -> write credentials; fetch policy -> verify -> cache) is
// exercised and testable today, without pretending a server answers on
// the other end.
//
// TODO(when undercut-app ships): replace these with the real hosts from
// the PRD's domain table (§1.9 / topology section):
//   ACTIVATE_URL     -> https://app.getundercut.sh/activate
//   CALLBACK REGISTER -> POST to app.getundercut.sh so it knows which
//                        localhost port to redirect back to (see PRD
//                        session-4 addendum, item S4.6: "CLI login with
//                        localhost callback, no typed code")
//   POLICY_URL       -> https://policy.getundercut.sh/v2/pro
// and delete PLACEHOLDER_* below along with this comment block.

export const PLACEHOLDER_ACTIVATE_URL = "https://app.getundercut.sh/activate";
export const PLACEHOLDER_POLICY_URL = "https://policy.getundercut.sh/v2/pro";

// Policy cache is considered stale past this TTL (PRD: "short-TTL
// revocation manifest" / `sync --if-stale` is meant to be a near no-op
// once fresh). Placeholder value pending a real number from the backend.
export const POLICY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
