#!/usr/bin/env node
// Holds site/openapi.json to the API that actually exists in site/api/.
//
//   1. Shape: OpenAPI 3.1, servers = https://getundercut.sh, MIT license,
//      `security: []` and no securitySchemes (no auth exists — documenting
//      one would be fabricated metadata, see AGENTS.md's hard rules).
//   2. Coverage, both directions: every documented path has a handler file
//      (/api/clients/{slug} -> site/api/clients/[slug].js) and every handler
//      file is documented, except the explicit UNDOCUMENTED list below.
//   3. Read-only: every operation is a GET with a unique operationId.
//   4. Every $ref resolves.
//   5. Truth: each handler is invoked with a mock GET and its real 200 body
//      is validated against the documented response schema, so the spec
//      cannot silently drift from the data.
//
// Usage:
//   node scripts/validate-openapi.js --check   # exit 1 on any problem (read-only)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const API_DIR = path.join(repoRoot, 'site/api');
export const SPEC_PATH = path.join(repoRoot, 'site/openapi.json');

// Handlers deliberately left out of the public spec, with the reason.
export const UNDOCUMENTED = {
  'lead.js': 'POST form intake for the site\'s own pricing forms, not part of the public read-only data API',
  'mcp.js': 'the MCP server (POST JSON-RPC at /mcp), not a REST path; held to the same data by scripts/validate-mcp.js',
};

// '/api/clients/{slug}' -> 'clients/[slug].js'
export function pathToHandlerFile(apiPath) {
  if (!apiPath.startsWith('/api/')) return null;
  return apiPath.slice('/api/'.length).replace(/\{([^}]+)\}/g, '[$1]') + '.js';
}

// Every file Vercel would turn into a function: *.js under site/api, minus
// `_`/`.`-prefixed path segments (Vercel skips those) and *.test.js.
export function listHandlerFiles(dir = API_DIR, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listHandlerFiles(full, `${prefix}${name}/`));
    else if (name.endsWith('.js') && !name.endsWith('.test.js')) out.push(`${prefix}${name}`);
  }
  return out.sort();
}

export function resolveRef(spec, ref) {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .reduce((node, key) => (node == null ? undefined : node[key.replace(/~1/g, '/').replace(/~0/g, '~')]), spec);
}

function collectRefs(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') out.push(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

// A deliberately small JSON Schema (2020-12 subset) validator covering the
// keywords site/openapi.json uses. Returns a list of "path: problem" strings.
export function validateSchema(spec, schema, value, at = '$') {
  if (schema.$ref) {
    const target = resolveRef(spec, schema.$ref);
    if (!target) return [`${at}: unresolvable $ref ${schema.$ref}`];
    return validateSchema(spec, target, value, at);
  }
  const errors = [];
  if (schema.type) {
    const allowed = [].concat(schema.type);
    const actual = typeOf(value);
    const ok = allowed.includes(actual) || (actual === 'integer' && allowed.includes('number'));
    if (!ok) return [`${at}: expected ${allowed.join('|')}, got ${actual}`];
  }
  if ('const' in schema && value !== schema.const) errors.push(`${at}: expected const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} not in enum`);
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  if (typeof value === 'string' && schema.format) {
    const checks = {
      date: /^\d{4}-\d{2}-\d{2}$/,
      'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
      uri: /^https?:\/\/\S+$/,
    };
    if (checks[schema.format] && !checks[schema.format].test(value)) errors.push(`${at}: not a valid ${schema.format}`);
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}: missing required "${key}"`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties && key in schema.properties) {
        errors.push(...validateSchema(spec, schema.properties[key], v, `${at}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${at}: unexpected property "${key}"`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...validateSchema(spec, schema.additionalProperties, v, `${at}.${key}`));
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((v, i) => errors.push(...validateSchema(spec, schema.items, v, `${at}[${i}]`)));
  }
  return errors;
}

// Static checks (1-4). Returns a list of problems.
export function checkSpec(spec, handlerFiles) {
  const errors = [];
  if (!/^3\.1\.\d+$/.test(spec.openapi ?? '')) errors.push(`openapi must be 3.1.x, got ${spec.openapi}`);
  if (!spec.info?.title || !spec.info?.version) errors.push('info.title and info.version are required');
  if (spec.info?.license?.identifier !== 'MIT') errors.push('info.license.identifier must be MIT');
  if (!spec.info?.contact?.url) errors.push('info.contact.url is required');
  if (JSON.stringify(spec.servers) !== JSON.stringify([{ url: 'https://getundercut.sh' }])) errors.push('servers must be exactly [{ url: "https://getundercut.sh" }]');
  // `security: []` is the explicit OpenAPI way to say "no auth required";
  // anything else would claim an auth scheme that doesn't exist.
  if (!Array.isArray(spec.security) || spec.security.length !== 0) errors.push('top-level security must be [] (explicitly unauthenticated)');
  if (spec.components?.securitySchemes) errors.push('no auth exists: remove components.securitySchemes');

  const documented = new Set();
  const operationIds = new Set();
  for (const [apiPath, item] of Object.entries(spec.paths ?? {})) {
    const file = pathToHandlerFile(apiPath);
    if (!file) { errors.push(`${apiPath}: documented paths must live under /api/`); continue; }
    documented.add(file);
    if (!handlerFiles.includes(file)) errors.push(`${apiPath}: documented, but site/api/${file} does not exist`);
    for (const method of Object.keys(item)) {
      if (['parameters', 'summary', 'description'].includes(method)) continue;
      if (method !== 'get') errors.push(`${apiPath}: ${method.toUpperCase()} documented, but the API is read-only (GET only)`);
      const op = item[method];
      if (!op.operationId) errors.push(`${apiPath} ${method}: missing operationId`);
      else if (operationIds.has(op.operationId)) errors.push(`${apiPath} ${method}: duplicate operationId ${op.operationId}`);
      else operationIds.add(op.operationId);
      if (!op.description) errors.push(`${apiPath} ${method}: missing description`);
      if (!op.responses?.['200']?.content?.['application/json']?.schema) errors.push(`${apiPath} ${method}: missing 200 application/json schema`);
      if (op.security) errors.push(`${apiPath} ${method}: no auth exists, remove security`);
    }
  }
  for (const file of handlerFiles) {
    if (!documented.has(file) && !(file in UNDOCUMENTED)) errors.push(`site/api/${file} is a deployed handler but is not documented in site/openapi.json`);
  }
  for (const ref of collectRefs(spec)) if (resolveRef(spec, ref) === undefined) errors.push(`unresolvable $ref ${ref}`);
  return errors;
}

export function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(chunk) { this.body = chunk === undefined ? undefined : String(chunk); },
  };
}

// Invokes a handler file with a mock GET and returns { status, headers, json }.
export async function callHandler(file, { method = 'GET', query = {}, url } = {}) {
  const mod = await import(pathToFileURL(path.join(API_DIR, file)).href);
  const res = mockRes();
  await mod.default({ method, query, url: url ?? '/', headers: {} }, res);
  return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : undefined };
}

// Runtime check (5): each documented 200 schema against the live handler.
export async function checkResponses(spec) {
  const errors = [];
  const firstSlug = (await callHandler('clients.js')).json?.clients?.[0]?.slug;
  for (const [apiPath, item] of Object.entries(spec.paths ?? {})) {
    const op = item.get;
    if (!op) continue;
    const file = pathToHandlerFile(apiPath);
    if (!existsSync(path.join(API_DIR, file))) continue;
    const query = apiPath.includes('{slug}') ? { slug: firstSlug } : {};
    const { status, json, headers } = await callHandler(file, { query });
    if (status !== 200) { errors.push(`${apiPath}: handler returned ${status}, expected 200`); continue; }
    if (headers['access-control-allow-origin'] !== '*') errors.push(`${apiPath}: missing Access-Control-Allow-Origin: *`);
    const schema = op.responses['200'].content['application/json'].schema;
    errors.push(...validateSchema(spec, schema, json).map((e) => `${apiPath}: ${e}`));
  }
  return errors;
}

async function main() {
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
  const errors = [...checkSpec(spec, listHandlerFiles()), ...(await checkResponses(spec))];
  if (errors.length) {
    console.error(`site/openapi.json does not match site/api/ (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`site/openapi.json is valid and matches site/api/: ${Object.keys(spec.paths).length} documented GET paths, every handler documented, every 200 body matches its schema.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`validate-openapi.js: ${e.message}`);
    process.exit(1);
  });
}
