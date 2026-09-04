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

## Local development

### Eval harness

From `evals/`, everything below runs with no API key and no network access
(except the `gsm8k`/`humaneval` benchmarks, which fetch from HuggingFace):

```sh
cd evals
node src/main.js --mock --seeds 1                    # what CI runs (all vendors/arms/suites)
node src/main.js --mock --seeds 5 --suites mechanical # more seeds, one suite — faster iteration
node --test 'src/**/*.test.js'                        # unit tests (policy.js, tasks.js, runner.js, ...)
```

`--seeds N` re-runs each arm N times with the mock LLM and reports pass rate
across seeds; CI uses `--seeds 1` for speed, `evals/README.md`'s reproduce
steps use `--seeds 5` for the published numbers. See `evals/README.md` for
the full flag reference (`--vendors`, `--arms`, `--suites`, `--policy`,
`--benchmark`, `--compare`, ...).

**Adding a new eval suite category** (e.g. alongside the existing `code`,
`reasoning`, `mechanical`, `debug`, `refactor`, `security`): follow the
`mechanical.js` / `refactor.js` / `debug.js` pattern in `evals/src/suites/`.

1. Create `evals/src/suites/<name>.js` exporting an array of tasks built
   with `makeTask` from `../tasks.js`, each with a deterministic grader
   (`gradeJsonSubset` or `gradeExact` — never an LLM judge).
2. Import it in `evals/src/main.js` and add it to the `SUITES` map there
   (`{ ..., <name>: <name>Suite }`).
3. Add a row for it to the suite table in `evals/README.md`.
4. Run `node src/main.js --mock --seeds 1 --suites <name>` to sanity-check
   the new suite in isolation, then `node --test 'src/**/*.test.js'` and a
   full `node src/main.js --mock --seeds 1` before opening a PR.

A new suite category is a MINOR bump (see `AGENTS.md` → Versioning) and
needs a `CHANGELOG.md` entry.

### Site preview

`site/` is static HTML/JS with no build step — any local file server works:

```sh
cd site
python3 -m http.server 8000    # or: npx serve .
```

Then open `http://localhost:8000/`. This serves the pages exactly as
authored, but skips `site/vercel.json`'s headers/redirects and
`site/middleware.ts`'s markdown content-negotiation (`Accept: text/markdown`
and AI-crawler user agents get served `.md` alternates instead of HTML) —
those only run on Vercel. If you're touching either of those, verify with
`vercel dev` instead, or check the deployed preview from your PR.

## Relevant docs

- `README.md` — what it is, measured results
- `testing/README.md` — methodology + all evidence
- `RESULTS.md` — the evaluation write-up
- `skills/firstpass/` — the actual skill (SKILL.md + models.md)
- `evals/` — the benchmark harness