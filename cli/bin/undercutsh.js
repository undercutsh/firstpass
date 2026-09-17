#!/usr/bin/env node
import { run } from "../src/cli.js";

run(process.argv).catch((err) => {
  console.error(`undercutsh: ${err?.message ?? err}`);
  process.exitCode = 1;
});
