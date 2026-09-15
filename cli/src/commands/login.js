import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { credentialsPath } from "../lib/paths.js";
import { writeSecureJson } from "../lib/fs-secure.js";
import { PLACEHOLDER_ACTIVATE_URL } from "../lib/config.js";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes, matches typical CLI OAuth UX

// TODO(real backend): this whole module implements the *structure* of the
// PRD's session-4 addendum design (S4.6: "CLI login with localhost
// callback, no typed code" — see pro-teams-backend-prd-2026-09-14.md,
// "D. Pairing UX", option C, and the earlier §5.1.5 device-code design it
// supersedes). Nothing here talks to a real server yet because
// `undercut-app` doesn't exist. Specifically, once it does:
//   1. Replace PLACEHOLDER_ACTIVATE_URL (src/lib/config.js) with the real
//      `https://app.getundercut.sh/activate` endpoint.
//   2. The activate URL needs a `state` (CSRF) param and the callback
//      port/path appended as a query param, e.g.
//      `${ACTIVATE_URL}?callback_port=${port}&state=${state}`, so the
//      backend knows where to redirect the browser after the user
//      approves in-browser (Clerk sign-in, per PRD).
//   3. The backend redirects the browser to
//      `http://127.0.0.1:${port}/callback?state=...&token=...` (or posts
//      the token via a small JS fetch from that redirected page — either
//      way, the callback handler below needs a matching implementation
//      for whichever transport is chosen).
//   4. Verify the returned `state` matches what we sent before trusting
//      the token, to prevent a malicious page from completing pairing
//      with an attacker-controlled token.
//   5. The token we receive and persist should be a short-lived
//      *refresh* credential per the PRD's access-token-in-header model
//      for `sync` (§5.1.5: "GET policy.getundercut.sh/v2/pro (short-lived
//      access token in header)") — not a long-lived secret written
//      in plaintext forever. Exact shape (refresh token + rotation vs.
//      long-lived API key) is a backend design decision, not this CLI's.

function openBrowser(url) {
  // Best-effort cross-platform "open a URL in the default browser".
  // Never throws — if it fails (headless box, no DISPLAY, no `open`/
  // `xdg-open` binary at all, etc.) we just fall through to printing the
  // URL for the user to open by hand, which is always the fallback path
  // anyway (PRD option D: manual entry for headless/SSH cases).
  //
  // Note: a missing binary (e.g. no xdg-open) surfaces as an async
  // 'error' event on the child, not a synchronous throw from spawn() —
  // an unhandled 'error' event crashes the process, so it must be
  // listened for explicitly even though we otherwise ignore the child.
  const platform = process.platform;
  let child;
  try {
    if (platform === "darwin") {
      child = spawn("open", [url], { stdio: "ignore", detached: true });
    } else if (platform === "win32") {
      child = spawn("cmd", ["/c", "start", "", url], {
        stdio: "ignore",
        detached: true,
      });
    } else {
      child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    }
    child.on("error", () => {}); // swallow ENOENT/EACCES etc.
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function waitForCallback(server, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timed out waiting for browser approval"));
    }, timeoutMs);
    timer.unref?.();

    server.on("request", (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      // PLACEHOLDER handling: a real implementation reads `token` and
      // `state` from the query string (or a POST body) and validates
      // `state`. There is no real backend to redirect here yet, so this
      // path only exercises the shape of a successful callback and is
      // never reached by a real browser flow today (see README.md).
      const token = url.searchParams.get("token");
      const state = url.searchParams.get("state");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<html><body><p>Undercut CLI: you can close this tab.</p></body></html>"
      );

      clearTimeout(timer);
      resolve({ token, state });
    });
  });
}

export async function login(opts) {
  const state = crypto.randomBytes(16).toString("hex");

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    // Port 0 = OS-assigned random port, unless the caller forced one for
    // testing (--port). PRD explicitly calls for an OS-assigned port, not
    // a fixed one, to avoid collisions with whatever else is running
    // locally.
    server.listen(opts.port ? Number(opts.port) : 0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  const activateUrl = `${PLACEHOLDER_ACTIVATE_URL}?callback_port=${port}&state=${state}`;

  console.log("Undercut: pairing this machine with your Pro account.");
  console.log("");
  console.log(`  Opening ${activateUrl}`);
  console.log("");
  console.log(
    "  If your browser doesn't open automatically, open that URL yourself."
  );
  console.log(
    "  [PLACEHOLDER: this endpoint does not exist yet — undercut-app has not shipped. See cli/README.md.]"
  );
  console.log("");

  const opened = openBrowser(activateUrl);
  if (!opened) {
    console.log(
      "  (couldn't auto-open a browser here — copy the URL above manually)"
    );
  }

  process.stdout.write("Waiting for approval... ");

  let result;
  try {
    result = await waitForCallback(server, CALLBACK_TIMEOUT_MS);
  } catch (err) {
    server.close();
    console.log("failed.");
    throw err;
  }
  server.close();

  if (result.state !== state) {
    throw new Error(
      "callback state mismatch — refusing to trust this token (possible CSRF); try again"
    );
  }
  if (!result.token) {
    throw new Error(
      "no token returned by callback — the backend doesn't exist yet, so this is expected until undercut-app ships (see TODOs in src/commands/login.js)"
    );
  }

  console.log("approved.");

  const credentials = {
    version: 1,
    token: result.token,
    paired_at: new Date().toISOString(),
    device_name: process.env.HOSTNAME || process.env.COMPUTERNAME || "unknown-device",
    // TODO: real backend should also return an account/org identifier and
    // a channel (free/pro/team) so `status` can show more than "paired".
  };

  await writeSecureJson(credentialsPath(), credentials);
  console.log(`Wrote credentials to ${credentialsPath()} (mode 0600).`);
  console.log("Run `undercut sync` to fetch your policy.");
}
