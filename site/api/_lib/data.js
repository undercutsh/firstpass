// Shared, synchronous, read-only data layer for the public JSON API
// (site/api/*.js) — and for anything else in site/ that needs the same
// published data. Every value comes from ./snapshot.js, which
// scripts/build-api-data.js generates from files already published in this
// repo; nothing here fetches, writes, or infers.
//
// The `_lib/` directory is underscore-prefixed on purpose: Vercel does not
// turn files under a `_`-prefixed path in api/ into functions, so nothing
// here is routable on its own.
//
// Returned objects are deep-frozen and shared across calls: treat them as
// read-only (structuredClone() one if you need to modify it).

import snapshot from './snapshot.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const data = deepFreeze(snapshot);

/** Every companion-page client: [{ slug, name, detailed, labels, url }]. */
export function getClients() {
  return data.clients;
}

/** One client by slug, or null when there is no such client. */
export function getClient(slug) {
  return data.clients.find((c) => c.slug === slug) ?? null;
}

/** The /setup segment router data (site/segments.json, comment keys removed, plus source). */
export function getSegments() {
  return data.segments;
}

/** The routing policy: { name, version, rubricVersion, description, format: 'text/markdown', markdown, source }. */
export function getPolicy() {
  return data.policy;
}

/** The tier→model mapping: { lastUpdated, vendors, tiers, format, markdown, source }. */
export function getModels() {
  return data.models;
}

/** Published benchmark summary: { note, standingLimitation, caveats, runs, cells, comparisons, methodology, source }. */
export function getResults() {
  return data.results;
}

/** Pricing: { title, summary, lastUpdated, plans, format, markdown, source }. */
export function getPricing() {
  return data.pricing;
}

/** Founder-published Teams onboarding windows: { slotMinutes, leadTimeHours, horizonDays, windows, taken, notes, source }. */
export function getTeamsAvailability() {
  return data.teamsAvailability;
}
