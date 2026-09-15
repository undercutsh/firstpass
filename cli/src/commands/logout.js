import {
  credentialsPath,
  policyJsonPath,
  policyMdPath,
} from "../lib/paths.js";
import { removeIfExists } from "../lib/fs-secure.js";

/**
 * Real, working logout command: deletes local credential + policy cache
 * files so dispatch reverts to the free static model map. Makes no
 * network calls (there's no server-side session to invalidate yet, and
 * even once there is, deleting the local files is what makes the CLI
 * behave as logged-out regardless of server state).
 */
export async function logout() {
  const removedCredentials = await removeIfExists(credentialsPath());
  const removedPolicyJson = await removeIfExists(policyJsonPath());
  const removedPolicyMd = await removeIfExists(policyMdPath());

  if (!removedCredentials && !removedPolicyJson && !removedPolicyMd) {
    console.log("Already logged out (no local credentials or policy cache found).");
    return;
  }

  console.log("Removed local credentials and cached policy.");
  console.log("Reverted to the free static model map (models.md).");
}
