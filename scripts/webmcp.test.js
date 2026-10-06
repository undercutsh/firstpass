// Unit coverage for site/webmcp.js, the WebMCP in-page tool registrations.
//
// The script is a plain browser <script>, not a module, so it runs here
// inside a node:vm context with a stubbed document/navigator and a fetch()
// that serves the REAL files from site/ (cleanUrls-style: "/codex" ->
// site/codex.html). That way the tools are exercised against the same data
// the deployed page would fetch, and a change to clients.json, segments.json,
// pricing.md or llms.txt that breaks a tool fails here.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const SOURCE = readFileSync(join(SITE, 'webmcp.js'), 'utf8');

const EXPECTED_TOOLS = [
  'list_supported_clients',
  'get_client_install_instructions',
  'get_segment_recommendation',
  'get_pricing',
  'get_policy_summary',
  'get_benchmark_summary'
];

function siteFetch(log) {
  return async (path) => {
    log.push(path);
    assert.ok(path.startsWith('/'), `fetch must be same-origin and relative, got ${path}`);
    let file = join(SITE, path);
    if (!existsSync(file) || !/\.[a-z]+$/.test(path)) file = join(SITE, path + '.html');
    if (!existsSync(file)) return { ok: false, status: 404, text: async () => '' };
    const body = readFileSync(file, 'utf8');
    return { ok: true, status: 200, text: async () => body };
  };
}

function makeContext() {
  return { registered: [], calls: [] };
}

function stubContext(state) {
  return {
    registerTool(tool, options) {
      state.calls.push({ tool, options });
      if (state.registered.some((t) => t.name === tool.name)) {
        return Promise.reject(new Error('InvalidStateError: duplicate'));
      }
      state.registered.push(tool);
      return Promise.resolve();
    }
  };
}

// Runs webmcp.js once in a fresh global. `where` picks which object exposes
// modelContext: 'document', 'navigator', 'both', or 'none'.
function load(where, { runTwice = false } = {}) {
  const docState = makeContext();
  const navState = makeContext();
  const fetchLog = [];
  const document = {};
  const navigator = {};
  if (where === 'document' || where === 'both') document.modelContext = stubContext(docState);
  if (where === 'navigator' || where === 'both') navigator.modelContext = stubContext(navState);
  const sandbox = { document, navigator, fetch: siteFetch(fetchLog), console, Promise, JSON };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'webmcp.js' });
  if (runTwice) vm.runInContext(SOURCE, sandbox, { filename: 'webmcp.js' });
  return { docState, navState, fetchLog, sandbox };
}

function toolsByName(where = 'document') {
  const { docState, fetchLog } = load(where);
  return { tools: Object.fromEntries(docState.registered.map((t) => [t.name, t])), fetchLog };
}

function payload(result) {
  assert.ok(Array.isArray(result.content), 'result has an MCP-style content array');
  assert.equal(result.content[0].type, 'text');
  return JSON.parse(result.content[0].text);
}

describe('registration', () => {
  test('source carries the literal document.modelContext.registerTool call', () => {
    assert.match(SOURCE, /document\.modelContext\.registerTool\(/);
  });

  test('registers every expected tool on document.modelContext', () => {
    const { docState } = load('document');
    assert.deepEqual(docState.registered.map((t) => t.name).sort(), [...EXPECTED_TOOLS].sort());
  });

  test('prefers document.modelContext when both exist', () => {
    const { docState, navState } = load('both');
    assert.equal(docState.registered.length, EXPECTED_TOOLS.length);
    assert.equal(navState.registered.length, 0);
  });

  test('falls back to navigator.modelContext', () => {
    const { navState } = load('navigator');
    assert.deepEqual(navState.registered.map((t) => t.name).sort(), [...EXPECTED_TOOLS].sort());
  });

  test('no-ops without any modelContext: no throw, no fetch', () => {
    const { docState, navState, fetchLog } = load('none');
    assert.equal(docState.calls.length + navState.calls.length, 0);
    assert.equal(fetchLog.length, 0);
  });

  test('loading the script twice registers each tool once', () => {
    const { docState } = load('document', { runTwice: true });
    assert.equal(docState.calls.length, EXPECTED_TOOLS.length);
  });

  test('registration makes no network requests (data is fetched at call time)', () => {
    const { fetchLog } = load('document');
    assert.equal(fetchLog.length, 0);
  });

  test('every tool is well-formed, read-only, and spec-valid', () => {
    const { docState } = load('document');
    for (const t of docState.registered) {
      assert.match(t.name, /^[A-Za-z0-9_.-]{1,128}$/, `${t.name}: name charset per spec`);
      assert.equal(typeof t.description, 'string');
      assert.ok(t.description.length > 20, `${t.name}: description`);
      assert.equal(typeof t.inputSchema, 'object');
      assert.equal(t.inputSchema.type, 'object', `${t.name}: inputSchema.type`);
      assert.doesNotThrow(() => JSON.stringify(t.inputSchema));
      assert.equal(typeof t.execute, 'function', `${t.name}: execute`);
      assert.equal(t.annotations.readOnlyHint, true, `${t.name}: readOnlyHint`);
      assert.equal(t.annotations.consequentialHint, false, `${t.name}: consequentialHint`);
    }
  });

  test('no tool touches the side-effecting lead endpoint', () => {
    assert.doesNotMatch(SOURCE, /\/api\/lead/);
    assert.doesNotMatch(SOURCE, /method:\s*['"]POST/i);
  });
});

describe('tools return real site data', () => {
  const clients = JSON.parse(readFileSync(join(SITE, 'clients.json'), 'utf8')).clients;
  const segments = JSON.parse(readFileSync(join(SITE, 'segments.json'), 'utf8'));

  test('list_supported_clients mirrors clients.json', async () => {
    const { tools } = toolsByName();
    const out = payload(await tools.list_supported_clients.execute({}, {}));
    assert.equal(out.count, clients.length);
    assert.deepEqual(out.clients.map((c) => c.slug), clients.map((c) => c.slug));
  });

  test('get_client_install_instructions finds the install commands for every client', async () => {
    const { tools } = toolsByName();
    for (const c of clients) {
      const out = payload(await tools.get_client_install_instructions.execute({ client: c.slug }, {}));
      assert.equal(out.client.slug, c.slug);
      assert.ok(out.options.length >= 1, `${c.slug}: at least one install option`);
      assert.ok(out.options.every((o) => o.option.length > 0), `${c.slug}: every option has a heading`);
      assert.doesNotMatch(JSON.stringify(out.options), /&mdash;|&amp;|<\/?(code|span|a|p|div|strong|em|br|h3)\b/, `${c.slug}: no raw HTML/entities`);
    }
  });

  test('get_client_install_instructions accepts display names and returns verbatim commands', async () => {
    const { tools } = toolsByName();
    const out = payload(await tools.get_client_install_instructions.execute({ client: 'Codex CLI' }, {}));
    assert.equal(out.client.slug, 'codex');
    const all = out.options.flatMap((o) => o.commands);
    assert.ok(all.includes('npx skills add undercutsh/firstpass -a codex'));
    const html = readFileSync(join(SITE, 'codex.html'), 'utf8');
    for (const cmd of all) assert.ok(html.includes(cmd.replace(/&/g, '&amp;')) || html.includes(cmd), `command is on the page: ${cmd}`);
  });

  test('get_client_install_instructions reports unknown clients as an error result', async () => {
    const { tools } = toolsByName();
    const res = await tools.get_client_install_instructions.execute({ client: 'not-a-client' }, {});
    assert.equal(res.isError, true);
    assert.ok(payload(res).valid_slugs.includes('claude-code'));
  });

  test('get_segment_recommendation provider enum matches segments.json', () => {
    const { tools } = toolsByName();
    assert.deepEqual(
      [...tools.get_segment_recommendation.inputSchema.properties.provider_setup.enum],
      segments.provider_question.answers.map((a) => a.id)
    );
  });

  test('get_segment_recommendation applies the same rules as /setup', async () => {
    const { tools } = toolsByName();
    const run = async (client, provider_setup) =>
      payload(await tools.get_segment_recommendation.execute({ client, provider_setup }, {}));
    assert.equal((await run('claude-code', 'subscription_only')).segment, 'A');
    assert.equal((await run('Cursor', 'subscription_only')).segment, 'B');
    assert.equal((await run('cursor', 'api_billing_only')).segment, 'C');
    const zed = await run('zed', 'api_billing_only');
    assert.equal(zed.segment, 'D', 'Zed resolves to D regardless of provider answer');
    const codex = await run('codex', 'subscription_only');
    assert.equal(codex.segment, null);
    assert.equal(codex.headline, segments.unresearched.headline);
    assert.equal((await run('claude-code', 'subscription_only')).headline, segments.segments.A.headline);
  });

  test('get_pricing returns the tiers published in pricing.md', async () => {
    const { tools } = toolsByName();
    const md = readFileSync(join(SITE, 'pricing.md'), 'utf8');
    const all = payload(await tools.get_pricing.execute({}, {}));
    for (const k of ['pro', 'teams', 'enterprise', 'free']) {
      assert.ok(all.tiers[k] && md.includes(all.tiers[k]), `${k} section is verbatim from pricing.md`);
    }
    assert.ok(all.money_back_guarantee);
    const pro = payload(await tools.get_pricing.execute({ tier: 'pro' }, {}));
    assert.equal(pro.tier, 'Pro');
    assert.match(pro.details, /\$9 \/ month/);
    assert.equal((await tools.get_pricing.execute({ tier: 'platinum' }, {})).isError, true);
  });

  test('get_policy_summary and get_benchmark_summary quote llms.txt', async () => {
    const { tools } = toolsByName();
    const txt = readFileSync(join(SITE, 'llms.txt'), 'utf8');
    const pol = payload(await tools.get_policy_summary.execute({}, {}));
    assert.ok(pol.about && txt.includes(pol.about));
    assert.ok(pol.when_to_use && txt.includes(pol.when_to_use));
    assert.match(pol.install, /npx skills add undercutsh\/firstpass/);
    const bench = payload(await tools.get_benchmark_summary.execute({}, {}));
    assert.ok(txt.includes(bench.summary), 'benchmark numbers are verbatim from llms.txt');
    assert.match(bench.summary, /HumanEval/);
    assert.match(bench.methodology, /testing\/README\.md$/);
  });

  test('every fetch a tool makes is a same-origin static file', async () => {
    const { tools, fetchLog } = toolsByName();
    for (const t of Object.values(tools)) {
      await t.execute({ client: 'cursor', provider_setup: 'subscription_only' }, {});
    }
    assert.ok(fetchLog.length > 0);
    for (const p of fetchLog) assert.match(p, /^\/[a-z0-9.-]+$/);
  });
});
