// Integration tests for login.js's localhost-callback server logic.
//
// These exercise the *real* HTTP server login() spins up (real socket,
// real request/response) — nothing here mocks http.createServer or
// waitForCallback. The only thing stubbed out is the browser-open step
// (login() accepts an injectable `openBrowser` for exactly this reason):
// a test run must never actually pop a browser window, and we don't need
// one — the injected function is how the test learns the OS-assigned
// callback port and the CSRF `state` the server generated, which it then
// uses to make a real HTTP request back to the server, simulating what
// the browser would do after the (nonexistent, placeholder) backend
// redirects it.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";

import { login } from "./login.js";
import { credentialsPath } from "../lib/paths.js";

let tmpHome;
let realHome;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "undercut-login-test-"));
  realHome = process.env.HOME;
  process.env.HOME = tmpHome;
});

afterEach(async () => {
  process.env.HOME = realHome;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

/** Parse callback_port + state out of the activate URL login() opens. */
function parseActivateUrl(url) {
  const parsed = new URL(url);
  return {
    port: parsed.searchParams.get("callback_port"),
    state: parsed.searchParams.get("state"),
  };
}

/** Fire a real HTTP GET at the callback the server is listening on. */
function hitCallback(port, query) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(query).toString();
    http
      .get(`http://127.0.0.1:${port}/callback?${qs}`, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      })
      .on("error", reject);
  });
}

/** After login() settles, the port should no longer accept connections. */
function assertPortClosed(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/callback", timeout: 500 },
      () => {
        req.destroy();
        reject(new Error(`port ${port} is still accepting connections`));
      }
    );
    req.on("error", () => resolve()); // ECONNREFUSED etc. == closed, as expected
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`connection to port ${port} hung instead of refusing`));
    });
  });
}

describe("login() localhost-callback server", () => {
  test("accepts a callback with a valid token + matching CSRF state", async () => {
    let capturedPort;

    const loginPromise = login({
      openBrowser(activateUrl) {
        const { port, state } = parseActivateUrl(activateUrl);
        capturedPort = port;
        // Simulate the browser landing back on the callback URL with a
        // real token and the exact state the server generated.
        hitCallback(port, { token: "tok_test_valid", state }).catch(() => {
          // surfaced via the login() assertion below if anything's wrong
        });
        return true;
      },
    });

    await loginPromise;

    const creds = JSON.parse(await fs.readFile(credentialsPath(), "utf8"));
    assert.equal(creds.token, "tok_test_valid");
    assert.equal(creds.version, 1);
    assert.ok(creds.paired_at);

    // Server must have shut down after a successful callback.
    await assertPortClosed(capturedPort);
  });

  test("rejects a callback with a mismatched/missing CSRF state, and still shuts down", async () => {
    let capturedPort;

    const loginPromise = login({
      openBrowser(activateUrl) {
        const { port } = parseActivateUrl(activateUrl);
        capturedPort = port;
        // Wrong state entirely (not merely missing) — simulates a
        // malicious page trying to complete pairing with its own token.
        hitCallback(port, {
          token: "tok_attacker_controlled",
          state: "not-the-real-state",
        }).catch(() => {});
        return true;
      },
    });

    await assert.rejects(loginPromise, /state mismatch/i);

    // No credentials should have been written.
    const creds = await fs.readFile(credentialsPath(), "utf8").catch((err) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    assert.equal(creds, null);

    await assertPortClosed(capturedPort);
  });

  test("rejects a callback with valid state but no token, and still shuts down", async () => {
    let capturedPort;

    const loginPromise = login({
      openBrowser(activateUrl) {
        const { port, state } = parseActivateUrl(activateUrl);
        capturedPort = port;
        // Correct state, but no token param at all.
        hitCallback(port, { state }).catch(() => {});
        return true;
      },
    });

    await assert.rejects(loginPromise, /no token returned/i);

    const creds = await fs.readFile(credentialsPath(), "utf8").catch((err) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    assert.equal(creds, null);

    await assertPortClosed(capturedPort);
  });

  test("never spawns a real browser process (openBrowser is fully injectable)", async () => {
    let called = false;

    const loginPromise = login({
      openBrowser(activateUrl) {
        called = true;
        const { port, state } = parseActivateUrl(activateUrl);
        hitCallback(port, { token: "tok_x", state }).catch(() => {});
        return true;
      },
    });

    await loginPromise;
    assert.equal(called, true);
  });
});
