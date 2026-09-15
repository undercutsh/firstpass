// Signature verification for the policy artifact.
//
// STUB — DO NOT SHIP AS-IS. No signing key exists yet; there is nothing
// real to verify against. See PRD §5.1.5 (pro-teams-backend-prd, "The
// pairing problem") and the design note at PRD:
//   "> Policy file. ... its signature verifies ..." (policy.md section)
//
// TODO(real signature verification):
//   1. Undercut's backend signs the policy artifact with an Ed25519
//      private key held server-side only (never in this CLI, never in
//      undercut-app's client bundle — see PRD §5.5, "Boundary review
//      before @undercut/cli first publishes: it must carry the public
//      key and verification logic and nothing about entitlement
//      evaluation, the vetting pipeline, or cost economics").
//   2. This CLI ships pinned with the corresponding Ed25519 *public* key
//      (e.g. via Node's built-in node:crypto verify() with an Ed25519
//      KeyObject, or @noble/ed25519 if a zero-dependency pure-JS
//      implementation is preferred over @electron/node's crypto
//      surface for portability).
//   3. Verification must run on every `sync` before the fetched artifact
//      is trusted, and again on every read of the cached policy.json
//      before a dispatch decision uses it — never trust an unverified
//      cached file just because it was already on disk.
//   4. On verification failure (bad signature, unknown key id, expired
//      TTL): fall back to the free static `models.md` table. Per the
//      PRD, policy verification failure must never fail a dispatch —
//      it only ever degrades to the free tier.
//
// Until (1)-(4) land, `verifyPolicySignature` always returns
// `{ verified: false, reason: "stub" }` so nothing downstream can
// mistake a stub pass for a real one.

/**
 * @param {object} _policy - the parsed policy artifact (unused by the stub)
 * @returns {{ verified: boolean, reason: string }}
 */
export function verifyPolicySignature(_policy) {
  return {
    verified: false,
    reason:
      "stub: no Ed25519 signing key exists yet (see src/lib/verify.js TODO); " +
      "treat every policy artifact as unverified until this ships",
  };
}
