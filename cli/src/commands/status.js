import {
  credentialsPath,
  policyJsonPath,
} from "../lib/paths.js";
import { readJsonIfExists } from "../lib/fs-secure.js";
import { verifyPolicySignature } from "../lib/verify.js";
import { POLICY_TTL_MS } from "../lib/config.js";

function formatAge(ms) {
  if (ms < 0) return "in the future (clock skew?)";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/**
 * Real, working status command: reads the two local cache files and
 * reports what's actually on disk. Makes no network calls.
 */
export async function status() {
  const credentials = await readJsonIfExists(credentialsPath());
  const policy = await readJsonIfExists(policyJsonPath());

  if (!credentials) {
    console.log("Connection state: not paired");
    console.log("");
    console.log("Run `undercutsh login` to pair this machine, then `undercutsh sync`.");
    console.log("Until then, dispatch uses the free static model map (models.md).");
    return;
  }

  console.log("Connection state: paired");
  console.log(`  Device:    ${credentials.device_name ?? "unknown"}`);
  console.log(`  Paired at: ${credentials.paired_at ?? "unknown"}`);
  console.log("");

  if (!policy) {
    console.log("Policy: not synced yet");
    console.log("Run `undercutsh sync` to fetch it.");
    return;
  }

  const fetchedAt = policy.fetched_at ? new Date(policy.fetched_at) : null;
  const age = fetchedAt ? Date.now() - fetchedAt.getTime() : null;
  const stale = age === null ? true : age > POLICY_TTL_MS;
  const verification = verifyPolicySignature(policy);

  console.log("Policy:");
  console.log(`  Channel:         ${policy.channel ?? "unknown"}`);
  console.log(`  Policy version:  ${policy.policy_version ?? "unknown"}`);
  console.log(
    `  Age:             ${age === null ? "unknown" : formatAge(age)}${stale ? " (stale — run `undercutsh sync`)" : ""}`
  );
  console.log(
    `  Signature:       ${verification.verified ? "verified" : `NOT verified (${verification.reason})`}`
  );
  console.log(
    "  Next refresh:    on next session-start hook, `undercutsh sync`, or CI/postinstall"
  );

  if (!verification.verified) {
    console.log("");
    console.log(
      "  Unverified policy is not trusted for dispatch; falling back to models.md."
    );
  }
}
