// OpenRouter LLM client — single key, all vendors, per-call token + cost.
// Uses OpenRouter's usage metadata (provider pricing) rather than a hardcoded
// price table, so cost accounting tracks the real bill.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
const API_KEY = process.env.OPENROUTER_API_KEY || '';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 120000;

export class LLMError extends Error {}

export function hasKey() {
  return API_KEY.length > 0;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Valid OpenRouter reasoning-effort levels. OpenRouter normalizes this one
// param (`reasoning: { effort }`) across vendors' native reasoning controls
// (Anthropic thinking budget, OpenAI reasoning_effort, Gemini thinking
// level) — see https://openrouter.ai/docs/use-cases/reasoning-tokens.
// Models with no reasoning mode silently ignore the field, so it's safe to
// pass on every call rather than needing a per-model capability check.
const EFFORT_LEVELS = new Set(['low', 'medium', 'high']);

async function rawCall(model, messages, { temperature = 0.2, maxTokens = 2048, effort = null }) {
  if (!API_KEY) throw new LLMError('OPENROUTER_API_KEY is not set');
  if (effort !== null && !EFFORT_LEVELS.has(effort)) {
    throw new LLMError(`invalid effort "${effort}" — must be one of ${[...EFFORT_LEVELS].join(', ')}`);
  }
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const body = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        // JSON mode is required for the worker contract, but not every
        // provider supports response_format. On 400 we retry without it and
        // rely on the prompt contract + our own JSON extraction.
        response_format: { type: 'json_object' },
        ...(effort ? { reasoning: { effort } } : {}),
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
            'X-Title': 'tiered-dispatch-evals',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 400 && String(await res.text().catch(() => '')).includes('response_format')) {
        // Provider doesn't support structured output — retry without it.
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), REQUEST_TIMEOUT_MS);
        try {
          delete body.response_format;
          res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${API_KEY}`,
              'X-Title': 'tiered-dispatch-evals',
            },
            body: JSON.stringify(body),
            signal: controller2.signal,
          });
        } finally {
          clearTimeout(timer2);
        }
      }
      if (!res.ok) {
        const resBody = await res.text().catch(() => '');
        if (res.status === 429 || res.status >= 500) {
          lastErr = new LLMError(`HTTP ${res.status}: ${resBody.slice(0, 200)}`);
          await sleep(BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw new LLMError(`HTTP ${res.status}: ${resBody.slice(0, 200)}`);
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new LLMError('malformed response (no choices)');
      const usage = data.usage || {};
      return {
        content: msg.content,
        usage: {
          in: usage.prompt_tokens || 0,
          out: usage.completion_tokens || 0,
          costUsd: usage.total_cost ?? usage.cost ?? null, // OpenRouter uses `cost` on this endpoint
        },
      };
    } catch (e) {
      if (e?.name === 'AbortError') lastErr = new LLMError('request timed out');
      else lastErr = e instanceof LLMError ? e : new LLMError(String(e));
      await sleep(BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastErr;
}

/** Single chat call with retries. Returns { content, usage }. */
export async function chat(model, system, user, opts = {}) {
  return rawCall(model, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], opts);
}

/** Verify every slug in the roster resolves on OpenRouter. */
export async function verifyModels() {
  if (!API_KEY) throw new LLMError('OPENROUTER_API_KEY is not set');
  const res = await fetch(`${OPENROUTER_URL}/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new LLMError(`HTTP ${res.status} listing models`);
  const data = await res.json();
  const available = new Set((data.data || []).map((m) => m.id));
  const report = {};
  const missing = [];
  for (const vendor of Object.keys(VENDORS)) {
    for (const tier of TIER_ORDER) {
      const slug = VENDORS[vendor].tiers[tier];
      report[`${vendor}/${tier}`] = { slug, available: available.has(slug) };
      if (!available.has(slug)) missing.push(`${vendor}/${tier}: ${slug}`);
    }
  }
  return { report, missing };
}

import { VENDORS, TIER_ORDER } from './config.js';