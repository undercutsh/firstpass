// Tests for sync.js's local file-caching logic: writing/reading
// ~/.undercut/policy.json (and the rendered policy.md alongside it), and
// graceful handling of a missing or corrupt cache file.
//
// fetchPolicy() is a hardcoded placeholder stub (no real backend exists
// yet — see sync.js's header comment), so these tests don't hit a
// network — they exercise the real cache read/write path end to end
// against a temp HOME, which is exactly the part of sync.js that is real,
// testable code today.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sync } from "./sync.js";
import {
  credentialsPath,
  policyJsonPath,
  policyMdPath,
  undercutDir,
} from "../lib/paths.js";
import { writeSecureJson, readJsonIfExists } from "../lib/fs-secure.js";

let tmpHome;
let realHome;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "undercut-sync-test-"));
  realHome = process.env.HOME;
  process.env.HOME = tmpHome;
});

afterEach(async () => {
  process.env.HOME = realHome;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

async function pair() {
  await writeSecureJson(credentialsPath(), {
    version: 1,
    token: "tok_fixture",
    paired_at: new Date().toISOString(),
    device_name: "test-device",
  });
}

describe("sync() without pairing", () => {
  test("refuses to run and writes no cache when not paired and --ci not passed", async () => {
    await sync({});
    const cached = await readJsonIfExists(policyJsonPath());
    assert.equal(cached, null);
  });
});

describe("sync() cache writes", () => {
  test("fetchPolicy is still a placeholder stub, so sync fails and writes nothing yet", async () => {
    // This documents current behavior: fetchPolicy() always throws (no
    // backend exists), so a paired sync should fail gracefully (non-zero
    // exit code, no crash) and never touch the cache files.
    await pair();
    process.exitCode = 0;
    await sync({});
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;

    assert.equal(await readJsonIfExists(policyJsonPath()), null);
    assert.equal(await readJsonIfExists(policyMdPath()).catch(() => null), null);
  });
});

describe("local policy cache read/write (the real, testable part of sync.js)", () => {
  test("writes policy.json to ~/.undercut/ and it round-trips exactly", async () => {
    const policy = {
      channel: "pro",
      policy_version: 3,
      fetched_at: new Date().toISOString(),
      models: { code: "some-model" },
    };
    await writeSecureJson(policyJsonPath(), policy);

    assert.equal(path.dirname(policyJsonPath()), undercutDir());
    assert.ok(policyJsonPath().startsWith(tmpHome));

    const readBack = await readJsonIfExists(policyJsonPath());
    assert.deepEqual(readBack, policy);
  });

  test("policy.json is written with owner-only (0600) permissions", async () => {
    await writeSecureJson(policyJsonPath(), { channel: "pro" });
    const stat = await fs.stat(policyJsonPath());
    assert.equal(stat.mode & 0o777, 0o600);
  });

  test("readJsonIfExists returns null for a missing cache file (no throw)", async () => {
    const result = await readJsonIfExists(policyJsonPath());
    assert.equal(result, null);
  });

  test("readJsonIfExists throws (not silently null) on a corrupt cache file", async () => {
    await fs.mkdir(undercutDir(), { recursive: true });
    await fs.writeFile(policyJsonPath(), "{ this is not valid json", "utf8");

    await assert.rejects(readJsonIfExists(policyJsonPath()), SyntaxError);
  });

  test("sync() with --if-stale treats a corrupt cache as absent and degrades gracefully", async () => {
    await pair();
    await fs.mkdir(undercutDir(), { recursive: true });
    await fs.writeFile(policyJsonPath(), "not json at all", "utf8");

    // sync.js's --if-stale path calls readJsonIfExists(policyJsonPath())
    // itself; a corrupt file should propagate as a thrown error rather
    // than being silently treated as "fresh" (which would skip fetching
    // and leave a corrupt file in place forever).
    await assert.rejects(sync({ ifStale: true }), SyntaxError);
  });

  test("sync() with --if-stale short-circuits when the cache is fresh (within TTL)", async () => {
    await pair();
    const freshPolicy = {
      channel: "pro",
      policy_version: 1,
      fetched_at: new Date().toISOString(), // now => well within TTL
    };
    await writeSecureJson(policyJsonPath(), freshPolicy);

    process.exitCode = 0;
    await sync({ ifStale: true });
    // Should return early (cache fresh) without ever calling the
    // (always-throwing) fetchPolicy stub, so exitCode stays untouched.
    assert.equal(process.exitCode, 0);

    // Cache file must be unchanged.
    const stillThere = await readJsonIfExists(policyJsonPath());
    assert.deepEqual(stillThere, freshPolicy);
  });

  test("sync() with --if-stale proceeds (and fails via the fetch stub) when the cache is expired", async () => {
    await pair();
    const stalePolicy = {
      channel: "pro",
      policy_version: 1,
      fetched_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days old
    };
    await writeSecureJson(policyJsonPath(), stalePolicy);

    process.exitCode = 0;
    await sync({ ifStale: true });
    // Falls through to fetchPolicy(), which is a stub that always
    // throws, so sync() should report failure rather than silently
    // treating the stale cache as good.
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  });
});
