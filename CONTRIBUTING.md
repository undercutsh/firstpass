# Contributing to Undercut (firstpass)

Thanks for helping. Undercut is a small, honest project — the bar for
contributions is: **make a claim or a behavior you can prove.**

## Code of conduct

Be respectful and constructive. That's the whole policy.

## How to contribute

1. **Open an issue first** for anything non-trivial — a bug, a feature, or a
   methodology change. Let's align before you write code.
2. **Branch → PR → squash-merge.** Work on a feature branch, open a PR against
   `main`, and keep it reviewable. We squash-merge.
3. **Reference the evidence.** If your change affects the routing policy, the
   evaluation methodology, or any claim the README/tests make, state what data
   or reasoning supports it.

## The two hard rules

- **No unearned trust signals.** Don't add badges, ratings, "as seen in"
  rows, or compliance claims that aren't backed by a real artifact. This
  project's credibility is its raw published data; keep it honest.
- **Deterministic graders only.** The eval harness never uses an LLM to judge
  another LLM. Keep it that way.

## Running the harness

```sh
cd evals
node src/main.js --mock            # plumbing check, no API key, no spend
node src/main.js --verify-only     # confirm model slugs resolve (needs key)
node src/main.js --flagtest        # dispatcher flagging reliability
```

Mock mode needs no API key and is what CI runs. See `evals/README.md` for the
full methodology.

## Relevant docs

- `README.md` — what it is, measured results
- `testing/README.md` — methodology + all evidence
- `RESULTS.md` — the evaluation write-up
- `skills/firstpass/` — the actual skill (SKILL.md + models.md)
- `evals/` — the benchmark harness