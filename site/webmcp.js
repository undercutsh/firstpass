/*
 * WebMCP in-page tools for getundercut.sh.
 *
 * WebMCP (https://webmachinelearning.github.io/webmcp/) is a proposed web
 * standard that lets a page hand a browser's built-in agent a set of named
 * tools instead of making it scrape the DOM. This file registers a small set
 * of READ-ONLY tools, each backed by a static file this site already
 * publishes:
 *
 *   list_supported_clients          -> /clients.json
 *   get_client_install_instructions -> /clients.json + the client's own
 *                                      companion page (/<slug>, #install)
 *   get_segment_recommendation      -> /segments.json (same resolution rules
 *                                      as the /setup page)
 *   get_pricing                     -> /pricing.md
 *   get_policy_summary              -> /llms.txt (About / When to use / Install)
 *   get_benchmark_summary           -> /llms.txt (Benchmarks section)
 *
 * Nothing here submits a form, starts a checkout, writes storage, or calls
 * anything but same-origin static files: every tool is a GET of a file a
 * person can open in their own browser. Data is fetched at call time, never
 * copied into this script, so it cannot drift from what the pages say.
 *
 * Progressive enhancement only. If the browser exposes no model context
 * (every browser today unless WebMCP is enabled), this script does nothing:
 * no DOM changes, no network requests, no errors. The page is identical with
 * JavaScript off.
 *
 * Feature detection follows the spec: document.modelContext first;
 * navigator.modelContext only as a trailing fallback for older polyfills.
 *
 * Tests: scripts/webmcp.test.js (run in CI).
 */
(function () {
  'use strict';

  var g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
  if (g.__undercutWebMCP) return; // loaded twice on one page: register once
  g.__undercutWebMCP = true;

  var hasDocumentContext =
    typeof document !== 'undefined' &&
    document.modelContext &&
    typeof document.modelContext.registerTool === 'function';
  var hasNavigatorContext =
    !hasDocumentContext &&
    typeof navigator !== 'undefined' &&
    navigator.modelContext &&
    typeof navigator.modelContext.registerTool === 'function';
  if (!hasDocumentContext && !hasNavigatorContext) return;

  var SITE = 'https://getundercut.sh';
  var REPO = 'https://github.com/undercutsh/firstpass';
  var SKILL_RAW = 'https://raw.githubusercontent.com/undercutsh/firstpass/main/skills/firstpass/SKILL.md';
  var METHODOLOGY = REPO + '/blob/main/testing/README.md';
  var RAW_RESULTS = REPO + '/tree/main/testing/results';

  // ---- helpers -------------------------------------------------------------

  function ok(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
  }

  function fail(message, extra) {
    var data = { error: message };
    if (extra) for (var k in extra) data[k] = extra[k];
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
  }

  function getText(path, signal) {
    return fetch(path, { credentials: 'same-origin', signal: signal }).then(function (res) {
      if (!res.ok) throw new Error(path + ' returned HTTP ' + res.status);
      return res.text();
    });
  }

  function getJSON(path, signal) {
    return getText(path, signal).then(JSON.parse);
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', middot: '·', rarr: '→', larr: '←', hellip: '…', copy: '©', times: '×', minus: '−', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function (m, e) {
      if (e[0] === '#') {
        var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(n) ? String.fromCodePoint(n) : m;
      }
      var v = ENTITIES[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  }

  function htmlToText(html) {
    return decodeEntities(
      html
        .replace(/<button\b[\s\S]*?<\/button>/gi, ' ') // "Copy" buttons
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/span>\s*<span/gi, '</span> <span') // "1" + "Read ..." step rows
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|pre)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
    )
      .replace(/[ \t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  // Markdown "## Heading" sections -> { heading: body }.
  function mdSections(md) {
    var out = {};
    var body = md.replace(/^---\n[\s\S]*?\n---\n/, '');
    var parts = body.split(/^## /m);
    for (var i = 1; i < parts.length; i++) {
      var nl = parts[i].indexOf('\n');
      var heading = (nl === -1 ? parts[i] : parts[i].slice(0, nl)).trim();
      out[heading] = (nl === -1 ? '' : parts[i].slice(nl + 1)).trim();
    }
    return out;
  }

  function frontmatter(md) {
    var m = md.match(/^---\n([\s\S]*?)\n---\n/);
    var out = {};
    if (!m) return out;
    m[1].split('\n').forEach(function (line) {
      var kv = line.match(/^([\w-]+):\s*"?(.*?)"?\s*$/);
      if (kv) out[kv[1]] = kv[2];
    });
    return out;
  }

  function findSection(sections, prefix) {
    for (var h in sections) if (h.indexOf(prefix) === 0) return { heading: h, body: sections[h] };
    return null;
  }

  function clientList(data) {
    return data.clients.map(function (c) {
      return { slug: c.slug, name: c.labels.llms, guide_url: SITE + '/' + c.slug, detailed_in_agents_md: !!c.detailed };
    });
  }

  function findClient(data, query) {
    var q = norm(query);
    if (!q) return null;
    for (var i = 0; i < data.clients.length; i++) {
      var c = data.clients[i];
      var names = [c.slug];
      for (var k in c.labels) names.push(c.labels[k]);
      for (var j = 0; j < names.length; j++) if (norm(names[j]) === q) return c;
    }
    return null;
  }

  // Splits a companion page's <section id="install"> into its <h3> options.
  function parseInstallSection(html) {
    var start = html.search(/<section\b[^>]*\bid="install"/i);
    if (start === -1) return null;
    var end = html.indexOf('</section>', start);
    var section = html.slice(start, end === -1 ? undefined : end);
    var chunks = section.split(/(?=<h3\b)/i).slice(1);
    return chunks.map(function (chunk) {
      var h = chunk.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
      var commands = [];
      var re = /data-copy="([^"]*)"/g;
      var m;
      while ((m = re.exec(chunk))) commands.push(decodeEntities(m[1]));
      return {
        option: h ? htmlToText(h[1]) : '',
        instructions: htmlToText(chunk.replace(/<h3\b[\s\S]*?<\/h3>/i, '')),
        commands: commands
      };
    });
  }

  function resolveSegment(data, slug, providerAnswer) {
    var client = null;
    for (var i = 0; i < data.clients.length; i++) if (data.clients[i].slug === slug) client = data.clients[i];
    var clientSegment = client ? client.segment : undefined;
    var rules = data.resolution_matrix.rules;
    for (var r = 0; r < rules.length; r++) {
      var rule = rules[r];
      if ('if_client_segment' in rule && rule.if_client_segment !== clientSegment) continue;
      if ('if_provider_answer' in rule && rule.if_provider_answer !== providerAnswer) continue;
      return rule.result_segment;
    }
    return null;
  }

  var PROVIDER_ANSWERS = ['subscription_only', 'subscription_plus_key', 'api_billing_only'];
  var TIERS = { pro: 'Pro', teams: 'Teams', enterprise: 'Enterprise', free: 'Free' };

  // ---- tools ---------------------------------------------------------------

  var READ_ONLY = { readOnlyHint: true, untrustedContentHint: false, consequentialHint: false };

  var tools = [
    {
      name: 'list_supported_clients',
      title: 'List supported coding agents',
      description:
        'List every coding agent (client) Undercut has a verified install guide for: slug, display name, and guide URL. Read-only; reads /clients.json, the same list the site renders.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      execute: function (_input, opts) {
        return getJSON('/clients.json', opts && opts.signal).then(function (data) {
          var clients = clientList(data);
          return ok({ count: clients.length, clients: clients, source: SITE + '/clients.json' });
        });
      }
    },
    {
      name: 'get_client_install_instructions',
      title: 'Get install instructions for one coding agent',
      description:
        "Get the install options and exact shell commands for Undercut's free SKILL.md in one coding agent, taken from that agent's own install guide on this site. Accepts a slug or a display name (e.g. \"codex\", \"Claude Code\", \"Cursor\"). Read-only; nothing is installed.",
      inputSchema: {
        type: 'object',
        properties: {
          client: { type: 'string', description: 'Client slug or name, e.g. "claude-code", "Codex CLI", "cursor". Call list_supported_clients for the full list.' }
        },
        required: ['client'],
        additionalProperties: false
      },
      annotations: READ_ONLY,
      execute: function (input, opts) {
        var signal = opts && opts.signal;
        var query = input && input.client;
        return getJSON('/clients.json', signal).then(function (data) {
          var c = findClient(data, query);
          if (!c) {
            return fail('Unknown client: ' + JSON.stringify(query == null ? '' : query), {
              valid_slugs: data.clients.map(function (x) { return x.slug; })
            });
          }
          return getText('/' + c.slug, signal).then(function (html) {
            var options = parseInstallSection(html) || [];
            return ok({
              client: { slug: c.slug, name: c.labels.llms },
              guide_url: SITE + '/' + c.slug + '#install',
              options: options,
              skill_file: SKILL_RAW,
              note: 'Commands are copied verbatim from the guide page. Undercut is a plain SKILL.md policy file: no account, API key, or proxy is involved.'
            });
          });
        });
      }
    },
    {
      name: 'get_segment_recommendation',
      title: 'Which Undercut segment fits a setup',
      description:
        "Given the coding agent someone uses and how they pay for model access, return the honest segment write-up the /setup page would show (what Undercut adds, the OpenRouter framing, and the caveat), or the 'not yet researched' answer when that tool has not been covered. Read-only; reads /segments.json.",
      inputSchema: {
        type: 'object',
        properties: {
          client: { type: 'string', description: 'Client slug or name, e.g. "claude-code", "Cursor", "opencode".' },
          provider_setup: {
            type: 'string',
            enum: PROVIDER_ANSWERS,
            description:
              'How they pay for model access today on that tool: subscription_only (just the tool\'s bundled subscription), subscription_plus_key (that subscription plus their own provider key such as OpenRouter), or api_billing_only (per-token API billing, no subscription).'
          }
        },
        required: ['client', 'provider_setup'],
        additionalProperties: false
      },
      annotations: READ_ONLY,
      execute: function (input, opts) {
        input = input || {};
        var signal = opts && opts.signal;
        return Promise.all([getJSON('/segments.json', signal), getJSON('/clients.json', signal)]).then(function (both) {
          var data = both[0];
          var answers = data.provider_question.answers.map(function (a) { return a.id; });
          if (answers.indexOf(input.provider_setup) === -1) {
            return fail('Unknown provider_setup: ' + JSON.stringify(input.provider_setup == null ? '' : input.provider_setup), { valid_values: answers });
          }
          var c = findClient(both[1], input.client);
          if (!c) {
            return fail('Unknown client: ' + JSON.stringify(input.client == null ? '' : input.client), {
              valid_slugs: data.clients.map(function (x) { return x.slug; })
            });
          }
          var segId = resolveSegment(data, c.slug, input.provider_setup);
          var seg = segId ? data.segments[segId] : data.unresearched;
          return ok({
            client: c.slug,
            provider_setup: input.provider_setup,
            segment: segId || null,
            name: seg.name || 'Not yet researched',
            headline: seg.headline,
            body: seg.body,
            openrouter_framing: seg.openrouter_framing,
            honesty_caveat: seg.honesty_caveat,
            flag: seg.flag || null,
            key_fact: data.key_fact,
            last_verified: data.last_verified,
            page: SITE + '/setup',
            source: SITE + '/segments.json'
          });
        });
      }
    },
    {
      name: 'get_pricing',
      title: 'Get Undercut pricing',
      description:
        'Get Undercut pricing as published in /pricing.md: Pro, Teams, Enterprise, and Free, with status, guarantee, and what each includes. Optionally one tier. Read-only; this does not start a trial or checkout (those are on the page itself, by a person).',
      inputSchema: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: Object.keys(TIERS), description: 'Optional: return just this tier.' }
        },
        additionalProperties: false
      },
      annotations: READ_ONLY,
      execute: function (input, opts) {
        var tier = input && input.tier;
        if (tier != null && !TIERS.hasOwnProperty(tier)) {
          return Promise.resolve(fail('Unknown tier: ' + JSON.stringify(tier), { valid_values: Object.keys(TIERS) }));
        }
        return getText('/pricing.md', opts && opts.signal).then(function (md) {
          var fm = frontmatter(md);
          var sections = mdSections(md);
          var out = { summary: fm.description, last_updated: fm['last-updated'], source: SITE + '/pricing.md', page: SITE + '/#pricing' };
          if (tier) {
            out.tier = TIERS[tier];
            out.details = sections[TIERS[tier]];
          } else {
            out.tiers = {};
            for (var k in TIERS) out.tiers[k] = sections[TIERS[k]];
            var guarantee = findSection(sections, 'Money-back guarantee');
            if (guarantee) out.money_back_guarantee = guarantee.body;
          }
          return ok(out);
        });
      }
    },
    {
      name: 'get_policy_summary',
      title: 'What Undercut is and when to use it',
      description:
        "Summarize Undercut's routing policy (a free, MIT-licensed SKILL.md a coding agent follows at dispatch time): what it is, when it fits and when it does not, how to install it, and where the full policy file lives. Read-only; reads /llms.txt.",
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      execute: function (_input, opts) {
        return getText('/llms.txt', opts && opts.signal).then(function (txt) {
          var s = mdSections(txt);
          var about = findSection(s, 'About');
          var when = findSection(s, 'When to use');
          var install = findSection(s, 'Install');
          return ok({
            about: about && about.body.split('\n\n')[0],
            when_to_use: when && when.body,
            install: install && install.body,
            policy_file: SKILL_RAW,
            repository: REPO,
            source: SITE + '/llms.txt'
          });
        });
      }
    },
    {
      name: 'get_benchmark_summary',
      title: 'Get published benchmark results',
      description:
        "Return Undercut's published benchmark summary (cost change at equal-or-better pass rate on public benchmarks, per vendor) exactly as the site states it, with links to the methodology and raw results in the repo's testing/ directory. Read-only; reads /llms.txt.",
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      execute: function (_input, opts) {
        return getText('/llms.txt', opts && opts.signal).then(function (txt) {
          var bench = findSection(mdSections(txt), 'Benchmarks');
          if (!bench) return fail('No benchmark section found in /llms.txt', { methodology: METHODOLOGY, raw_results: RAW_RESULTS });
          return ok({
            heading: bench.heading,
            summary: bench.body,
            methodology: METHODOLOGY,
            raw_results: RAW_RESULTS,
            source: SITE + '/llms.txt'
          });
        });
      }
    }
  ];

  // ---- registration ----------------------------------------------------------

  function register(tool) {
    try {
      var p = hasDocumentContext
        ? document.modelContext.registerTool(tool)
        : navigator.modelContext.registerTool(tool); // legacy polyfill fallback
      if (p && typeof p.then === 'function') p.then(null, function () {}); // e.g. duplicate name: stay silent
    } catch (e) {
      /* never let an agent API break the page */
    }
  }

  for (var i = 0; i < tools.length; i++) register(tools[i]);
})();
