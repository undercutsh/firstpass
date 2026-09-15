import os from "node:os";
import path from "node:path";

// ~/.undercut/ is already owned by firstpass/hooks/ (the opt-in, zero-network
// local telemetry package — see hooks/README.md). This CLI is the second
// citizen of that directory: it adds a Pro credential and a cached, signed
// policy artifact alongside the hooks package's ledger. See PRD §5.1.5 for
// why they share a directory instead of each owning their own.

export function undercutDir() {
  return path.join(os.homedir(), ".undercut");
}

export function credentialsPath() {
  return path.join(undercutDir(), "credentials.json");
}

export function policyJsonPath() {
  return path.join(undercutDir(), "policy.json");
}

export function policyMdPath() {
  return path.join(undercutDir(), "policy.md");
}
