#!/usr/bin/env node
// SubagentStop hook: turns one completed subagent dispatch into one ledger
// row with REAL usage/cost data, read from the subagent's own transcript.
// Never calls a second model, never proxies network traffic -- this only
// reads a transcript file Claude Code already wrote locally.

const fs = require("fs");
const readline = require("readline");
const path = require("path");
const { costForUsage, tierForModel, isKnownModel } = require("./lib/pricing");
const { appendRow } = require("./lib/ledger");

async function sumUsageByModel(transcriptPath) {
  const totals = new Map();
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return totals;

  const rl = readline.createInterface({
    input: fs.createReadStream(transcriptPath, "utf8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry.message;
    if (!msg || msg.role !== "assistant" || !msg.usage || !msg.model) continue;

    const model = msg.model;
    const usage = msg.usage;
    const prev = totals.get(model) || {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    };

    prev.input_tokens += usage.input_tokens || 0;
    prev.output_tokens += usage.output_tokens || 0;
    prev.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
    prev.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
    if (usage.cache_creation) {
      prev.cache_creation.ephemeral_5m_input_tokens +=
        usage.cache_creation.ephemeral_5m_input_tokens || 0;
      prev.cache_creation.ephemeral_1h_input_tokens +=
        usage.cache_creation.ephemeral_1h_input_tokens || 0;
    }

    totals.set(model, prev);
  }

  return totals;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const {
    session_id: sessionId,
    cwd,
    agent_id: agentId,
    agent_type: agentType,
    agent_transcript_path: transcriptPath,
  } = payload;

  const totals = await sumUsageByModel(transcriptPath);
  const ts = new Date().toISOString();

  for (const [model, usage] of totals) {
    const cost = isKnownModel(model) ? costForUsage(model, usage) : null;
    appendRow({
      ts,
      session_id: sessionId || null,
      agent_id: agentId || null,
      agent_type: agentType || null,
      cwd: cwd || null,
      model,
      tier: tierForModel(model),
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
      },
      cost_usd: cost,
    });
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
