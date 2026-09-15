---
title: "Undercut — what we can see"
description: "Pro's policy sync is an authenticated licence check (account ID, IP, timestamp, policy version), not telemetry about your work. Retention: 30-day raw logs, then aggregate-only. Never correlated to session content or working directory. Includes a proxy-vs-Undercut comparison and the sync-cadence opt-out."
canonical: "https://getundercut.sh/data.md"
last-updated: "2026-09-15"
---

# Undercut — what we can see

> Machine-readable version of https://getundercut.sh/data for agents. See also
> https://getundercut.sh/privacy for the free, no-account tier (no cookies, no analytics,
> no network calls at all).

Free sets no cookies, runs no analytics, and makes no network calls — the skill is a file your
agent reads locally. Pro adds exactly one network thing: your machine periodically fetches a
signed policy file so its tier→model map stays current. That fetch is a licence/entitlement
check, not telemetry about your work. This page states specifically what it reveals, what it
never sees, retention, and how it differs from a proxy.

## What an authenticated policy fetch reveals

Four fields, because they're what any authenticated HTTP request necessarily carries:

- **Account ID** — which subscription is asking.
- **IP address** — where the request came from.
- **Timestamp** — when it happened.
- **Current policy version** — which revision your machine already has, so we know whether to
  send a diff or say "no changes."

That's the complete list. Nothing else is in the request or logged from it.

## Why this differs from telemetry

"No telemetry" elsewhere on this site means no data about *your work* — no prompts, code, file
paths, repo names, or session content leaves your machine. A policy fetch carries none of that;
it's the same category of signal any paid product's server needs to check entitlement, the way a
license server or subscription paywall works. It is unavoidable for any authenticated request and
categorically different from watching what you build. A sync is never correlated to a coding
session or a working directory — the server cannot distinguish "you ran a task" from "your
refresh timer elapsed."

## What a fetch never contains

Request logging on the policy endpoint runs off an explicit allowlist (the same pattern
`/api/lead` uses for form fields) — nothing is captured by default. Never logged or transmitted:
prompts, code, file contents, file paths, working directory, repo name, session content, the
`User-Agent` string, or which coding agent you're running.

## Retention

- Raw access logs (account ID, IP, timestamp, policy version): **30 days**, then deleted.
- After 30 days: aggregate, non-per-account counters only (total sync volume, for capacity
  planning) — never a reconstructable per-user activity timeline.

## What a proxy does vs. what Undercut does

| Question | A live routing proxy | What Undercut does |
|---|---|---|
| Sees each prompt/response? | Yes — it's in the request path | No — dispatch decisions happen locally, in the agent, from the policy file already on disk |
| Brokers your live model traffic? | Yes — every call passes through it | No — your agent talks to your model provider directly |
| What crosses the network to us? | Every request and response body | Only a periodic pull of a small signed policy file (the four fields above) |
| If it goes down mid-session? | Every in-flight call breaks — single point of failure | Nothing breaks — the agent keeps using the last cached policy file |
| If the vendor disappeared entirely? | Routing stops — no traffic path without it | The last cached `policy.json` keeps working indefinitely; failing that, the free static `models.md` map. Dispatch never depends on us being reachable |

Nothing decides per call on the network path — still not a proxy.

## Sync cadence is local, client-initiated, and optional

The default is a daily check, but that describes a client-side timer, not a service watching you.
No resident daemon runs on either end — your machine's own process wakes, checks whether the
cached policy is past its TTL, and if so makes one outbound request. Nothing about the mechanism
requires the daily default:

- **Slow it down** — set a longer TTL and sync weekly or monthly.
- **Disable it** — the last cached policy keeps being used until you turn sync back on.
- **Run fully offline, indefinitely** — download the signed policy bundle once and drop it in
  place by hand; signature verification still applies, there's just no periodic fetch.

## Contact

Questions about this or any other data-handling detail: https://iamjustinwinter.com. See also
https://getundercut.sh/privacy for the free tier's full data handling.
