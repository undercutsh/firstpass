# Tier → model mapping

Tier names are generic; this file resolves them to actual model IDs. Updated
when a model beats the incumbent on the reference benchmarks (see README
roadmap). Last updated: 2026-08-18 — slugs verified against OpenRouter's
model catalog at eval time.

| Tier | Anthropic | OpenAI | Google | Open-weight |
|---|---|---|---|---|
| cheap | `anthropic/claude-haiku-4.5` | `openai/gpt-5-nano` | `google/gemini-3.5-flash-lite` | `qwen/qwen3-coder-30b-a3b-instruct` |
| standard | `anthropic/claude-sonnet-5` | `openai/gpt-5.6-terra` | `google/gemini-3.5-flash` | `deepseek/deepseek-v4-flash` |
| frontier | `anthropic/claude-opus-5` | `openai/gpt-5.6-sol` | `google/gemini-3.1-pro-preview` | `deepseek/deepseek-v4-pro` |
| apex | `anthropic/claude-fable-5` | `openai/gpt-5.6-sol-pro` | `google/gemini-3.1-pro-preview` | `z-ai/glm-5.2` |

For agents that consume a SKILL.md but don't expose OpenRouter slugs (Claude
Code, Codex, Cursor, Copilot, OpenCode), map each tier to that agent's
closest current model **at that tier's capability level** — the tier is
defined by capability relative to the others, not by a specific model name.
As a rule of thumb: cheap = smallest/fastest model, standard = default work
model, frontier = highest-reasoning production model, apex = max-reasoning /
tie-break model.

## Notes

- These are the exact slugs used by the evaluation harness (`evals/`), so the
  benchmark tables in `testing/README.md` are reproducible against this exact
  roster.
- **Open-weight caveat:** some open-weight providers price their tiers
  non-monotonically (standard can be cheaper than cheap). Check your provider
  price list before assuming cheap is cheapest — see the benchmark caveats.
- A tier's model changes when a new release beats the current incumbent on
  the reference benchmarks for that tier — see the README roadmap for how
  updates ship.
