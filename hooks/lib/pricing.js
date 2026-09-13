#!/usr/bin/env node
// Pricing table for real dispatch-cost calculation.
//
// Keys here are Claude Code's own model ID strings (hyphenated, e.g.
// "claude-haiku-4-5"), as they actually appear in local transcript JSONL
// -- confirmed by reading a real subagent transcript on this machine.
// This is deliberately NOT the same string form as
// ../../skills/firstpass/models.md's Anthropic column, which lists
// OpenRouter catalog slugs (dotted, e.g. "anthropic/claude-haiku-4.5")
// for a different provider's routing -- keep the *tier assignment* in
// sync with that file's roster, not the literal string. Cache-write/read
// ratios are Anthropic's standard published ratios (5m write = 1.25x base
// input, 1h write = 2x base input, cache read = 0.1x base input) applied
// uniformly -- update PER_MTOK first if a model's base price changes, the
// ratios rarely do.

const PER_MTOK = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-fable-5": { input: 10.0, output: 50.0 },
  "claude-fable-5-1": { input: 10.0, output: 50.0 },
  "claude-mythos-5-1": { input: 10.0, output: 50.0 },
};

// Tier resolution for Claude Code specifically -- mirrors
// skills/firstpass/models.md's Anthropic column. A model not listed here
// (a future release, or a non-Claude model reachable via some other
// client) still gets priced if it's a known Claude model ID; tier is
// left null rather than guessed.
const MODEL_TO_TIER = {
  "claude-haiku-4-5": "cheap",
  "claude-sonnet-5": "standard",
  "claude-sonnet-4-6": "standard",
  "claude-opus-5": "frontier",
  "claude-opus-4-8": "frontier",
  "claude-opus-4-7": "frontier",
  "claude-opus-4-6": "frontier",
  "claude-fable-5": "apex",
  "claude-fable-5-1": "apex",
  "claude-mythos-5-1": "apex",
};

const CACHE_WRITE_5M_RATIO = 1.25;
const CACHE_WRITE_1H_RATIO = 2.0;
const CACHE_READ_RATIO = 0.1;

/**
 * Compute real dollar cost for one message's usage object.
 * Returns null (not zero) if the model isn't in the pricing table --
 * callers must treat null as "unpriceable", never silently coerce to $0.
 */
function costForUsage(model, usage) {
  const rate = PER_MTOK[model];
  if (!rate || !usage) return null;

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheWrite5m =
    (usage.cache_creation && usage.cache_creation.ephemeral_5m_input_tokens) ||
    usage.cache_creation_input_tokens ||
    0;
  const cacheWrite1h =
    (usage.cache_creation && usage.cache_creation.ephemeral_1h_input_tokens) ||
    0;
  const cacheRead = usage.cache_read_input_tokens || 0;

  const cost =
    (inputTokens / 1e6) * rate.input +
    (outputTokens / 1e6) * rate.output +
    (cacheWrite5m / 1e6) * rate.input * CACHE_WRITE_5M_RATIO +
    (cacheWrite1h / 1e6) * rate.input * CACHE_WRITE_1H_RATIO +
    (cacheRead / 1e6) * rate.input * CACHE_READ_RATIO;

  return cost;
}

function tierForModel(model) {
  return MODEL_TO_TIER[model] || null;
}

function isKnownModel(model) {
  return Object.prototype.hasOwnProperty.call(PER_MTOK, model);
}

// Counterfactual for "what would this same work have cost if it had NOT
// been tiered" -- i.e. run at frontier regardless of the six-flag score.
// This is necessarily an ESTIMATE (we don't know a frontier run would take
// the same token count) but it's the standard methodology already used in
// testing/results/ -- same real token counts, substituted frontier price.
// Never presented as a real number; callers must label it as estimated.
const FRONTIER_MODEL = "claude-opus-5";

function frontierEquivalentCost(usage) {
  return costForUsage(FRONTIER_MODEL, usage);
}

module.exports = {
  costForUsage,
  tierForModel,
  isKnownModel,
  frontierEquivalentCost,
  FRONTIER_MODEL,
  PER_MTOK,
  MODEL_TO_TIER,
};
