import {
  credentialsPath,
  policyJsonPath,
  policyMdPath,
} from "../lib/paths.js";
import {
  readJsonIfExists,
  writeSecureJson,
  writeSecureText,
} from "../lib/fs-secure.js";
import { verifyPolicySignature } from "../lib/verify.js";
import { PLACEHOLDER_POLICY_URL, POLICY_TTL_MS } from "../lib/config.js";

// PLACEHOLDER — policy.getundercut.sh does not exist. `fetchPolicy` below
// never makes a real network call; it returns a locally-fabricated
// artifact shaped like what the PRD describes (§5.1.5) so the rest of the
// pipeline (verify -> cache -> render policy.md) is real, testable code.
//
// TODO(real backend, once policy.getundercut.sh ships):
//   - Replace `fetchPolicy` with a real
//     `GET ${PLACEHOLDER_POLICY_URL}` request, sending the short-lived
//     access token from credentials.json in an Authorization header
//     (PRD: "short-lived access token in header").
//   - Handle 401 (token expired/revoked -> prompt `undercutsh login` again)
//     and use the response's ETag for `--if-stale` conditional requests
//     instead of only our own local TTL clock.
//   - `--ci` should exchange a machine API key for a short-lived access
//     token rather than reusing the paired-session credential shape.
async function fetchPolicy(_credentials) {
  throw new Error(
    `sync is not wired to a real backend yet: ${PLACEHOLDER_POLICY_URL} does not exist. ` +
      "This is expected until undercut-app ships (see cli/README.md and TODOs in src/commands/sync.js)."
  );
}

function renderPolicyMarkdown(policy) {
  const lines = [
    "# Undercut Pro policy (cached)",
    "",
    `- Channel: ${policy.channel ?? "unknown"}`,
    `- Policy version: ${policy.policy_version ?? "unknown"}`,
    `- Fetched: ${policy.fetched_at ?? "unknown"}`,
    "",
    "This file is a human/agent-readable render of `~/.undercut/policy.json`.",
    "Per-category and per-effort model recommendations supersede the free",
    "`models.md` table only while this file's signature verifies and it is",
    "within its TTL. See SKILL.md's policy-file section.",
    "",
  ];
  return lines.join("\n");
}

export async function sync(opts) {
  const credentials = await readJsonIfExists(credentialsPath());
  if (!credentials && !opts.ci) {
    console.error(
      "Not paired. Run `undercutsh login` first (or pass --ci with a machine API key)."
    );
    process.exitCode = 1;
    return;
  }

  if (opts.ifStale) {
    const cached = await readJsonIfExists(policyJsonPath());
    if (cached?.fetched_at) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < POLICY_TTL_MS) {
        console.log(
          `Cached policy is still fresh (age ${Math.round(age / 1000)}s < TTL); nothing to do.`
        );
        return;
      }
    }
  }

  console.log(
    `Fetching policy from ${PLACEHOLDER_POLICY_URL} [PLACEHOLDER — see cli/README.md]...`
  );

  let policy;
  try {
    policy = await fetchPolicy(credentials);
  } catch (err) {
    console.error(String(err.message ?? err));
    console.error(
      "Falling back to the free static model map (models.md) — sync never fails a dispatch."
    );
    process.exitCode = 1;
    return;
  }

  const verification = verifyPolicySignature(policy);
  if (!verification.verified) {
    // TODO: once verify.js is real, a failed verification here should
    // still write nothing (or write but mark unverified) and the caller
    // (status/dispatch) must fall back to models.md rather than trust an
    // unsigned artifact. The stub always lands here today.
    console.warn(`Signature not verified (${verification.reason}).`);
  }

  await writeSecureJson(policyJsonPath(), policy);
  await writeSecureText(policyMdPath(), renderPolicyMarkdown(policy));

  console.log(`Wrote ${policyJsonPath()} and ${policyMdPath()}.`);
}
