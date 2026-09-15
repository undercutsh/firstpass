---
title: "Undercut — the policy file"
description: "How Pro's signed policy file is built to be audited: the full JSON schema (tiers, category overrides, evidence, signature), the ed25519 verification process in plain terms, what a failed or expired verification falls back to, and the revocation-manifest kill-switch. Schema is public and MIT."
canonical: "https://getundercut.sh/policy-file.md"
last-updated: "2026-09-15"
---

# Undercut — the policy file

> Machine-readable reference for anyone auditing Pro's trust model — a security
> researcher, a skeptical agent, or your own coding agent deciding whether to
> trust a cached artifact. See also https://getundercut.sh/data for what an
> authenticated policy fetch reveals about you, and https://getundercut.sh/privacy
> for Free's zero-network story.

Pro's tier→model map isn't hand-edited config — it's a signed, versioned JSON
artifact your agent fetches, verifies locally, and then reads to make routing
decisions offline. The point of this page: a signed artifact whose
verification process isn't publicly documented isn't actually verifiable —
you'd just be trusting us. So the schema, the signing scheme, and the
fallback behavior are all public here, and the schema itself is MIT — the
same license as the skill.

## The schema

A policy artifact is one JSON object: a **body** (everything the signature
covers) plus a detached **signature** field.

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | number | Schema revision. Current: `2`. A client that doesn't recognize the version treats the artifact as unusable, same as a failed verification. |
| `channel` | string | Which audience this was compiled for: `"free"`, `"pro"`, or `"teams:<org_id>"`. |
| `generated_at` | string (ISO 8601) | When the compiler produced this artifact. |
| `ttl_seconds` | number | How long a client should treat this artifact as current before checking for a newer one. Not a hard expiry that blocks use — see "What happens on a failed or expired check" below. |
| `policy_version` | string | Human-diffable version string for this compiled policy. |
| `rubric_version` | string | Version of the flag/effort rubric the artifact's routing decisions were built against. |
| `effort_vocabulary` | string[] | The reasoning-effort labels this artifact can reference: `low`, `medium`, `high`, `xhigh`, `ultra-high`. |
| `tiers` | object | The four routing tiers — `cheap`, `standard`, `frontier`, `apex` — each mapped to `{ "default": "<model slug>" }`. Required, all four present. |
| `vendor_ladders` | object | Per-vendor internal ladder data. Currently opaque/reserved for future use. |
| `category_overrides` | object, optional | Absent on the `free` channel — Pro/Teams only. Keyed by task category; see below. |
| `effort_defaults` | object, optional | Per-tier default effort level, when the rubric has one. |
| `evidence` | array, optional | The audit trail backing `category_overrides` — see below. Required whenever `category_overrides` is present. |
| `signature` | string | `"ed25519:<base64>"` — a detached signature over the canonical form of everything above. |

### Category overrides and evidence

`category_overrides` is where Pro/Teams diverge from Free's static mapping.
Each entry:

```json
{
  "code": {
    "base_tier": "standard",
    "effort": "medium",
    "reason_ref": "cell-042",
    "confidence": "significant"
  }
}
```

- **`base_tier`** — one of the four tiers, the override for this category.
- **`effort`** — optional, one of the effort-vocabulary values.
- **`reason_ref`** — points at an `evidence[].cell_id`. Every override must
  trace to a specific ledger cell, not an unexplained number.
- **`confidence`** — `"significant"` or `"directional"`. This is a gated
  claim, not a label the compiler is free to pick: `"significant"` is only
  allowed when the evidence cell it references has `n >= 15` samples *and*
  a 95% confidence interval that excludes zero (i.e., `evidence[].significant
  === true`). Anything short of that threshold has to ship as
  `"directional"` — the schema validator enforces this at build time, not
  just by convention.

Each `evidence` entry is the ledger cell itself:

| Field | Meaning |
|---|---|
| `cell_id` | Referenced by a `category_overrides` entry's `reason_ref`. |
| `n` | Sample size backing this cell. |
| `low` / `high` | Pass-rate fractions at the lower and higher tier being compared, e.g. `"3/10"`. |
| `delta_pp` | The measured difference, in percentage points. |
| `ci` | `[number, number]` — the confidence interval on `delta_pp`. |
| `significant` | Whether this cell itself clears the significance bar. |
| `tested_at` | ISO date the cell was last tested. |

This is the same audit-trail idea as the site's published benchmark
methodology, applied to the live routing policy instead of a one-time
benchmark: every number that changes your routing traces to a specific,
re-checkable measurement, not an opaque "trust us."

## Verifying the signature, in plain terms

1. The compiler signs the **canonical form** of the body — a deterministic
   JSON encoding with object keys sorted and no incidental whitespace, so the
   signature covers one byte-stable representation regardless of how the JSON
   happens to be formatted on disk.
2. It signs that canonical bytes with **Ed25519** (the same algorithm used
   for SSH keys and a lot of modern signing — fast, small signatures, no
   parameter choices to get wrong) and prepends `ed25519:` to the base64
   result to get the `signature` field.
3. The matching **public key ships inside the skill package itself** — it is
   not fetched over the network at verification time. That matters: if the
   key came from the same channel as the artifact, a compromised or
   spoofed fetch could ship a fake key alongside a fake artifact and verify
   against itself. Shipping the key in the skill means an attacker would
   have to compromise the skill's own distribution (MIT, public, on
   `skills.sh` and in this repo) to plant a bad key — a much higher bar than
   spoofing one network response.
4. Verification recomputes the canonical form of the body it received,
   checks the signature against it with the shipped public key, and returns
   one boolean. It does not throw on a malformed, mis-keyed, wrong-version,
   or tampered artifact — a structurally broken artifact and a
   cryptographically invalid one are both just "not verified," so a caller
   can't accidentally treat a thrown error as a pass.

**"Verified" means exactly two things held:** the artifact's body matches the
schema in the table above, *and* the signature checks out against the public
key shipped in the skill. It does not mean the artifact is recent — that's
what `ttl_seconds` and `generated_at` are for, checked separately.

## What happens on a failed or expired verification

Nothing in the dispatch path is allowed to block or error out because a
policy fetch or verification didn't go cleanly. The fallback order:

1. **Signature fails, or the schema doesn't parse.** The artifact is
   discarded outright — never partially trusted, never used to make even one
   routing decision. The client falls through to the next step as if it had
   never received anything.
2. **Signature is valid but the artifact is past its `ttl_seconds`.** The
   client tries to refresh. If the refresh fails (offline, endpoint
   unreachable, rate-limited) it keeps using the last artifact that *did*
   verify — a stale-but-verified policy is still a verified policy, and
   still strictly better than guessing.
3. **No verified artifact exists at all** (first run, verification never
   succeeded, or nothing has ever been cached). The client falls back to
   the free tier's static `models.md` tier→model map — the same file Free
   users read directly, MIT-licensed, shipped in the skill, requiring no
   network access at all.

At every step, the worst case is "route with the free static map instead of
the live one" — never "the dispatch fails" or "the agent stalls waiting on
us." Nothing about a coding agent's actual dispatch decision is ever allowed
to depend on our verification server being reachable at that moment.

## The revocation manifest

`ttl_seconds` handles routine refresh — "check again in N seconds because
this might be stale." It does not handle the emergency case: a signing key
gets compromised, or a compiled artifact turns out to be wrong in a way that
matters, and every client holding it needs to stop trusting it *before* its
normal TTL would have made them ask again.

That's what the revocation manifest is for: a short-TTL side document,
checked far more often than the main policy bundle, that can say "artifact
`<policy_version>` on channel `<channel>` is revoked" ahead of schedule. A
revocation hit doesn't invent a replacement policy on the spot — it just
collapses the client straight to step 3 above (the static `models.md` map)
until a newly-signed, non-revoked artifact is available. It's a kill switch,
not a second delivery channel, and it inherits the same "never blocks
dispatch" rule: an unreachable revocation check behaves like no revocation,
not like a forced fallback, since the alternative would let a network outage
double as a denial-of-service against every Pro user's dispatch.

## Where this schema lives

The schema, the validator, and the signature verification code are the
public, MIT half of this system — they live in the open-source `firstpass`
repo alongside the skill, not in any private backend. Only the *compiler*
that reads the vetting ledger and produces the actual pro/teams values is
private (it has nothing secret in its output, just infrastructure and the
signing key). You can audit the schema and the verification logic yourself
without needing a Pro account.

## Contact

Found a discrepancy between this page and actual client behavior, or have a
question about the trust model: https://iamjustinwinter.com.
