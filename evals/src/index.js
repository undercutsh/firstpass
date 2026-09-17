// Public entry point for the `@undercutsh/evals` package.
//
// This harness (src/main.js, src/runner.js, src/suites/, …) is an internal
// CLI tool run in CI and by hand — it is not part of this package's public
// API and isn't reachable through `exports` (see package.json). The one
// thing meant to be imported by other packages is the confidence-interval /
// significance-testing module re-exported here: it's the shared statistics
// this repo's own eval harness uses to decide whether an A/B result is real,
// and it's the exact surface undercut-app's private vetting pipeline needs
// for its tier-swap significance gate (see stats.js's header and this
// package's README "Consumed by the private backend" section).
export * from './stats.js';
