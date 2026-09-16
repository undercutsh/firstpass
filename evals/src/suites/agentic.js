// Agentic task suite — Terminal-Bench-2.0-shaped, offline-gradable.
//
// WHY THIS SUITE EXISTS
// The other seven suites are single-shot: one prompt, one short answer, one
// grader. Kilo Auto Model's published evidence is Terminal Bench 2.0 (89 real
// agentic tasks x 5 attempts = 445 attempts per model) — a workload where the
// model has to read a file tree, chain several tools, and leave behind a
// concrete artifact that either works or doesn't. That is the workload a
// routing policy will actually be judged on, and no one has published the
// ablation "rubric-driven, verification-gated escalation vs. a static
// single-model pick" on it. This suite plus `--ablation` (see ablation.js)
// is that ablation.
//
// THE DESIGN CONSTRAINT: TB2 shape, but every grader must run offline,
// deterministically, in CI, with no live sandbox and no LLM judge.
// TB2 proper spins up a real container per task and lets the agent drive a
// terminal. We can't do that here (and the harness's rule is "the grader is
// the ground truth, never a model"), so each task keeps the *shape* of a
// terminal task — multi-step reasoning over a small file tree or log, ending
// in a machine-checkable artifact — while the check is one of:
//   - gradeShell: the artifact IS a bash script/pipeline. It runs in a fresh
//     temp dir holding only inline fixtures, with a scrubbed env, a SIGKILL
//     timeout, an output cap, and (where the host allows `unshare -rn`) no
//     network. Stdout must match exactly. Same script + same fixtures =>
//     same bytes, so it is deterministic by construction.
//   - gradeCode: the artifact is a JS function run in the existing vm
//     sandbox against hidden cases (multi-step parsing/aggregation/graph
//     tasks, not one-liners).
//   - gradeJsonSubset / gradeExact: the artifact is a plan, manifest, or
//     resolution that has ONE correct structural answer (dependency order
//     with a stated tie-break, a config that must parse to a given shape, a
//     multi-file refactor plan, an exact log-derived summary).
// What we deliberately give up: no task may depend on the clock, locale,
// network, installed packages beyond POSIX coreutils + bash + awk/sed/grep,
// or on any judgment call. Anything "TB2-like" that needed one of those was
// cut rather than shipped flaky.
//
// Each task sets `category` to one of the existing seven so results slot into
// the per-category ledger; ids are prefixed `agentic:` so the suite is still
// identifiable. `answerKey` is a reference solution that MUST pass the task's
// own grader (agentic.test.js enforces this — it is the determinism check),
// and `mock` is the --mock difficulty profile: the lowest tier at which the
// mock worker "solves" the task, optionally failing once first, so --mock
// exercises cheap-pass, retry-then-pass, escalate-to-standard/frontier,
// apex tie-break, never-solved ('none'), and static-arm-never-passes paths
// without an API key.

import { makeTask, gradeShell, gradeCode, gradeJsonSubset, gradeExact } from '../tasks.js';

const SHELL_NOTE =
  'ANSWER FORMAT: the "answer" field MUST be a complete bash script as a plain string (no markdown fences, no explanation). ' +
  'It runs with `bash` from a working directory containing ONLY the files described, with POSIX coreutils, awk, sed and grep available and NO network. ' +
  'Print exactly the required output to stdout and exit 0.';
const JS_NOTE =
  'ANSWER FORMAT: the "answer" field MUST be the raw JavaScript function source code as a plain string. Do NOT wrap it in an object, do not add explanation.';

const F = (over) => ({ unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: false, ...over });

const TShell = (id, category, prompt, flags, fixtures, expected, reference, mock) =>
  makeTask({
    id: `agentic:${id}`,
    category,
    prompt,
    flags,
    answerKey: reference,
    answerNote: SHELL_NOTE,
    mock,
    grader: (answer) => gradeShell(answer, fixtures, expected),
  });

const TCode = (id, prompt, flags, testCases, reference, mock) =>
  makeTask({
    id: `agentic:${id}`,
    category: 'code',
    prompt,
    flags,
    answerKey: reference,
    answerNote: JS_NOTE,
    mock,
    grader: (answer) => gradeCode(answer, testCases),
  });

const TJson = (id, category, prompt, flags, answerKey, mock) =>
  makeTask({
    id: `agentic:${id}`,
    category,
    prompt,
    flags,
    answerKey,
    mock,
    grader: (answer) => gradeJsonSubset(answer, answerKey),
  });

const TExact = (id, category, prompt, flags, answerKey, mock) =>
  makeTask({
    id: `agentic:${id}`,
    category,
    prompt,
    flags,
    answerKey,
    mock,
    grader: (answer) => gradeExact(answer, answerKey),
  });

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const ACCESS_LOG = [
  '10.0.0.5 - - [01/Sep/2026:10:00:01 +0000] "GET /api/users HTTP/1.1" 200 512',
  '10.0.0.7 - - [01/Sep/2026:10:00:02 +0000] "GET /static/app.js HTTP/1.1" 200 20480',
  '10.0.0.5 - - [01/Sep/2026:10:00:03 +0000] "POST /api/login HTTP/1.1" 401 64',
  '192.168.1.20 - - [01/Sep/2026:10:00:04 +0000] "GET /api/users HTTP/1.1" 500 128',
  '10.0.0.7 - - [01/Sep/2026:10:00:05 +0000] "GET /index.html HTTP/1.1" 200 1024',
  '10.0.0.5 - - [01/Sep/2026:10:00:06 +0000] "GET /api/orders HTTP/1.1" 200 2048',
  '172.16.0.9 - - [01/Sep/2026:10:00:07 +0000] "GET /api/users HTTP/1.1" 200 512',
  '10.0.0.7 - - [01/Sep/2026:10:00:08 +0000] "GET /api/orders HTTP/1.1" 503 32',
  '10.0.0.5 - - [01/Sep/2026:10:00:09 +0000] "GET /index.html HTTP/1.1" 304 0',
  '192.168.1.20 - - [01/Sep/2026:10:00:10 +0000] "GET /static/app.js HTTP/1.1" 200 20480',
  '172.16.0.9 - - [01/Sep/2026:10:00:11 +0000] "DELETE /api/orders/7 HTTP/1.1" 204 0',
  '10.0.0.7 - - [01/Sep/2026:10:00:12 +0000] "GET /api/users HTTP/1.1" 200 512',
  '',
].join('\n');

const APP_LOG = [
  '2026-09-01T10:00:00Z INFO  api: server listening on :8080',
  '2026-09-01T10:00:01Z DEBUG api: loaded 12 routes',
  '2026-09-01T10:00:02Z WARN  db: pool at 80% capacity',
  '2026-09-01T10:00:03Z ERROR db: connection refused (attempt 1)',
  '2026-09-01T10:00:04Z ERROR db: connection refused (attempt 2)',
  '2026-09-01T10:00:05Z INFO  api: GET /health 200',
  '2026-09-01T10:00:06Z WARN  cache: eviction rate high',
  '2026-09-01T10:00:07Z ERROR api: upstream timeout on /api/orders',
  '2026-09-01T10:00:08Z INFO  api: GET /health 200',
  '2026-09-01T10:00:09Z DEBUG cache: flushed 40 keys',
  '',
].join('\n');

const SALES_CSV = [
  'id,region,amount,currency',
  '1,eu,120,EUR',
  '2,us,80,USD',
  '3,apac,45,USD',
  '4,eu,30,EUR',
  '5,us,220,USD',
  '6,eu,5,EUR',
  '7,apac,55,USD',
  '',
].join('\n');

const BASE_ENV = ['# base defaults', 'PORT=3000', 'LOG_LEVEL=info', '', 'DB_HOST=localhost', 'FEATURE_X=off', ''].join('\n');
const OVERRIDE_ENV = ['# production overrides', 'LOG_LEVEL=warn', 'DB_HOST=db.internal', 'REGION=eu-west-1', ''].join('\n');

const SERVICE_LOGS = {
  'logs/gateway.log': [
    '10:00:00.100 INFO  req=r-101 GET /checkout -> orders',
    '10:00:00.900 ERROR req=r-101 upstream orders returned 502',
    '10:00:01.100 INFO  req=r-102 GET /checkout -> orders',
    '10:00:01.800 ERROR req=r-102 upstream orders returned 502',
    '',
  ].join('\n'),
  'logs/orders.log': [
    '10:00:00.150 INFO  req=r-101 calling inventory',
    '10:00:00.850 ERROR req=r-101 inventory call failed: 500',
    '10:00:01.150 INFO  req=r-102 calling inventory',
    '10:00:01.750 ERROR req=r-102 inventory call failed: 500',
    '',
  ].join('\n'),
  'logs/inventory.log': [
    '10:00:00.200 INFO  req=r-101 lookup sku=A1',
    '10:00:00.800 ERROR req=r-101 redis: NOAUTH Authentication required',
    '10:00:01.200 INFO  req=r-102 lookup sku=B2',
    '10:00:01.700 ERROR req=r-102 redis: NOAUTH Authentication required',
    '',
  ].join('\n'),
};

const REPO_SNAPSHOT = {
  'src/config.js': "export const region = process.env.REGION ?? 'us-east-1';\n",
  'src/aws.js': "const client = new S3({ accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: process.env.AWS_SECRET });\n",
  'deploy/id_rsa': '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----\n',
  'README.md': '# service\nSet AWS_ACCESS_KEY_ID in your environment. Never commit keys.\n',
  'test/fixtures/sample.json': '{"token": "REDACTED", "note": "not a real credential"}\n',
};

/* ------------------------------------------------------------------ */
/* Suite                                                               */
/* ------------------------------------------------------------------ */

export const agenticSuite = [
  /* ---------------- code: shell pipelines graded by execution ------- */
  TShell(
    'shell-top-ips',
    'code',
    'The working directory contains `access.log`, an nginx-style access log (one request per line, client IP is the first field). Write a bash script that prints the THREE most frequent client IPs, one per line, formatted as "<count> <ip>" (single space), ordered by count descending; break ties by IP ascending (plain string sort). No header, no other output.\n\nSample of the file format:\n' +
      ACCESS_LOG.split('\n').slice(0, 2).join('\n'),
    F({}),
    { 'access.log': ACCESS_LOG },
    '4 10.0.0.5\n4 10.0.0.7\n2 172.16.0.9',
    "awk '{print $1}' access.log | sort | uniq -c | sort -k1,1nr -k2,2 | head -3 | awk '{print $1, $2}'",
    { minTier: 'cheap' },
  ),
  TShell(
    'shell-level-counts',
    'code',
    'The working directory contains `app.log` with lines shaped `<ISO timestamp> <LEVEL> <component>: <message>` where LEVEL is one of DEBUG, INFO, WARN, ERROR (padded with spaces). Write a bash script that prints one line per level that appears, formatted "<LEVEL> <count>", sorted alphabetically by level name. Nothing else.',
    F({}),
    { 'app.log': APP_LOG },
    'DEBUG 2\nERROR 3\nINFO 3\nWARN 2',
    "awk '{print $2}' app.log | sort | uniq -c | awk '{print $2, $1}' | sort -k1,1",
    { minTier: 'cheap', retryAtMinTier: true },
  ),
  TShell(
    'shell-sum-by-region',
    'code',
    'The working directory contains `sales.csv` with header `id,region,amount,currency` and integer amounts. Write a bash script that prints the total amount per region as "<region>,<total>", one per line, sorted by region name ascending. Skip the header. No other output.',
    F({}),
    { 'sales.csv': SALES_CSV },
    'apac,100\neu,155\nus,300',
    "tail -n +2 sales.csv | awk -F, '{t[$2]+=$3} END {for (r in t) print r \",\" t[r]}' | sort",
    { minTier: 'standard' },
  ),
  TShell(
    'shell-rename-plan',
    'code',
    'The directory `in/` contains files named `report-YYYY-MM.txt`. Write a bash script that prints a rename plan, one line per file, formatted "in/report-YYYY-MM.txt -> in/YYYY-MM-report.txt" (the date moves to the front), sorted by the ORIGINAL path ascending. Do NOT actually rename anything. Only .txt files matching the pattern are listed; ignore anything else in the directory.',
    F({}),
    {
      'in/report-2026-01.txt': 'a',
      'in/report-2026-03.txt': 'b',
      'in/report-2025-12.txt': 'c',
      'in/notes.md': 'ignore me',
    },
    'in/report-2025-12.txt -> in/2025-12-report.txt\nin/report-2026-01.txt -> in/2026-01-report.txt\nin/report-2026-03.txt -> in/2026-03-report.txt',
    "for f in $(ls in/report-*.txt | sort); do b=$(basename \"$f\" .txt); d=${b#report-}; echo \"$f -> in/$d-report.txt\"; done",
    { minTier: 'standard' },
  ),
  TShell(
    'shell-merge-env',
    'code',
    'The working directory contains `base.env` and `override.env`, each with `KEY=VALUE` lines plus comments (`#`) and blank lines. Write a bash script that prints the merged configuration: every key from either file, with the value from `override.env` winning when both define a key, one `KEY=VALUE` per line, sorted by KEY ascending, with comments and blank lines dropped.',
    F({}),
    { 'base.env': BASE_ENV, 'override.env': OVERRIDE_ENV },
    'DB_HOST=db.internal\nFEATURE_X=off\nLOG_LEVEL=warn\nPORT=3000\nREGION=eu-west-1',
    "cat base.env override.env | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | awk -F= '{v[$1]=$0} END {for (k in v) print v[k]}' | sort",
    { minTier: 'frontier' },
  ),
  TShell(
    'shell-first-error-per-service',
    'code',
    'The directory `logs/` holds one file per service (`gateway.log`, `orders.log`, `inventory.log`); each line is `<HH:MM:SS.mmm> <LEVEL> req=<id> <message>`. Write a bash script that prints, for each service, the timestamp of its FIRST ERROR line, formatted "<service> <timestamp>" (service = filename without .log), sorted by timestamp ascending so the line printed first is the service that failed first. No other output.',
    F({ crossCutting: true }),
    SERVICE_LOGS,
    'inventory 10:00:00.800\norders 10:00:00.850\ngateway 10:00:00.900',
    "for f in logs/*.log; do s=$(basename \"$f\" .log); t=$(grep -m1 ' ERROR ' \"$f\" | awk '{print $1}'); echo \"$s $t\"; done | sort -k2,2",
    { minTier: 'frontier' },
  ),

  /* ---------------- code: multi-step JS graded by execution --------- */
  TCode(
    'js-log-aggregate',
    'Write a function `main(lines)` that takes an array of log lines shaped "<timestamp> <LEVEL> <service>: <message>" (LEVEL is one of DEBUG, INFO, WARN, ERROR; there may be multiple spaces between fields; the service name ends at the first colon). Return an object mapping each service that has at least one WARN or ERROR to `{ warn: <count>, error: <count> }` (both keys always present). Services with only DEBUG/INFO lines are omitted.',
    F({}),
    [
      { input: [APP_LOG.trim().split('\n')], expected: { db: { warn: 1, error: 2 }, cache: { warn: 1, error: 0 }, api: { warn: 0, error: 1 } } },
      { input: [['t INFO a: x', 't DEBUG b: y']], expected: {} },
      { input: [['t ERROR svc: boom', 't ERROR svc: again', 't WARN svc: hmm']], expected: { svc: { warn: 1, error: 2 } } },
      { input: [[]], expected: {} },
    ],
    'function main(lines){ const out={}; for(const l of lines){ const m=l.match(/^\\S+\\s+(\\w+)\\s+([^:\\s]+):/); if(!m) continue; const [,lvl,svc]=m; if(lvl!=="WARN"&&lvl!=="ERROR") continue; out[svc]=out[svc]||{warn:0,error:0}; out[svc][lvl.toLowerCase()]++; } return out }',
    { minTier: 'standard' },
  ),
  TCode(
    'js-build-order',
    'Write a function `main(deps)` where `deps` maps each target name to an array of the targets it depends on (every name that appears anywhere is a target, even if it has no entry of its own). Return a build order as an array: a target may only appear after all of its dependencies. When several targets are ready at the same time, emit them in ascending lexicographic order (this makes the answer unique). If the graph has a cycle, return `null`.',
    F({ novel: true }),
    [
      { input: [{ app: ['lib', 'util'], lib: ['util'] }], expected: ['util', 'lib', 'app'] },
      { input: [{ a: ['b', 'c'], b: [], c: ['d'] }], expected: ['b', 'd', 'c', 'a'] },
      { input: [{ x: ['y'], y: ['x'] }], expected: null },
      { input: [{ z: [] }], expected: ['z'] },
      { input: [{}], expected: [] },
    ],
    'function main(deps){ const nodes=new Set(Object.keys(deps)); for(const ds of Object.values(deps)) ds.forEach(d=>nodes.add(d)); const indeg={}; const rev={}; for(const n of nodes){indeg[n]=0;rev[n]=[];} for(const [n,ds] of Object.entries(deps)){ for(const d of ds){ indeg[n]++; rev[d].push(n);} } let ready=[...nodes].filter(n=>indeg[n]===0).sort(); const out=[]; while(ready.length){ const n=ready.shift(); out.push(n); for(const m of rev[n]){ if(--indeg[m]===0) ready.push(m);} ready.sort(); } return out.length===nodes.size?out:null }',
    { minTier: 'frontier' },
  ),

  /* ---------------- debug ------------------------------------------ */
  TJson(
    'trace-cascade-origin',
    'debug',
    'Three services log to separate files. Timestamps are on one clock.\n\ngateway.log:\n' + SERVICE_LOGS['logs/gateway.log'] +
      '\norders.log:\n' + SERVICE_LOGS['logs/orders.log'] +
      '\ninventory.log:\n' + SERVICE_LOGS['logs/inventory.log'] +
      '\nThe gateway is returning 502s. Trace the cascade to its origin: which service logged the EARLIEST error, for which request id, and what single word names the misconfigured dependency it reports? Return JSON {"service": "...", "requestId": "...", "dependency": "..."} (dependency lowercase).',
    F({ crossCutting: true, formatStrict: true }),
    { service: 'inventory', requestId: 'r-101', dependency: 'redis' },
    { minTier: 'cheap' },
  ),
  TJson(
    'flaky-test-cause',
    'debug',
    'A CI job runs `npm test` on every push. The test `formats invoice due date` passed on runs at 09:12 UTC, 14:40 UTC and 17:05 UTC, and failed on runs at 23:31 UTC and 00:15 UTC with:\n  expected "2026-09-02" but received "2026-09-01"\nThe test builds the due date with `new Date(dueMs).toISOString().slice(0,10)` and compares it to a string produced by the app with `date.toLocaleDateString("en-CA")`. The CI runners are in TZ=America/Los_Angeles. No network calls are involved and the test does not depend on other tests. Classify the flakiness cause from this fixed set: "timezone-dependent", "order-dependent", "network-dependent", "timeout-too-short". Return JSON {"cause": "..."}.',
    F({ novel: true, formatStrict: true }),
    { cause: 'timezone-dependent' },
    { minTier: 'standard' },
  ),
  TJson(
    'stacktrace-first-app-frame',
    'debug',
    'A production crash produced this stack trace (most recent call first):\n' +
      '  TypeError: Cannot read properties of null (reading "amount")\n' +
      '      at Array.reduce (<anonymous>)\n' +
      '      at sumLines (node_modules/ledger-kit/dist/sum.js:88:14)\n' +
      '      at computeTotal (src/billing/invoice.js:42:19)\n' +
      '      at buildInvoice (src/billing/invoice.js:17:9)\n' +
      '      at handler (src/routes/invoices.js:61:22)\n' +
      '      at Layer.handle (node_modules/express/lib/router/layer.js:95:5)\n' +
      'Third-party code under node_modules/ is not ours to fix. Identify the first frame that is in OUR code (the deepest application frame, i.e. where the bad value was handed to the library). Return JSON {"file": "...", "line": N} with the path exactly as printed and the line as a number.',
    F({ formatStrict: true }),
    { file: 'src/billing/invoice.js', line: 42 },
    { minTier: 'cheap' },
  ),
  TJson(
    'container-crashloop',
    'debug',
    'A container restarts every ~40 seconds. Evidence:\n' +
      '  $ kubectl describe pod api-7d9f\n' +
      '    Last State: Terminated\n' +
      '      Reason: OOMKilled\n' +
      '      Exit Code: 137\n' +
      '    Limits: memory: 256Mi\n' +
      '  $ kubectl logs api-7d9f --previous | tail -3\n' +
      '    loading 1.2GB embeddings index into memory...\n' +
      '    index 38% loaded\n' +
      '    (no further output)\n' +
      'Classify the root cause from this fixed set: "oom-killed", "missing-env-var", "port-conflict", "bad-entrypoint". Also state the single kubernetes field that must change to fix it, from: "resources.limits.memory", "env", "containerPort", "command". Return JSON {"cause": "...", "fix": "..."}.',
    F({ crossCutting: true, formatStrict: true }),
    { cause: 'oom-killed', fix: 'resources.limits.memory' },
    { minTier: 'standard', retryAtMinTier: true },
  ),

  /* ---------------- mechanical: config/manifest generation ---------- */
  TJson(
    'gen-package-manifest',
    'mechanical',
    'Generate a package.json for a Node ESM library from this spec and return it as JSON (the answer IS the manifest object): name "@acme/ledger", version "0.4.2", ES modules, entry point "./src/index.js", scripts: test runs `node --test`, lint runs `eslint .`; runtime dependencies pinned EXACTLY (no ^ or ~): "zod" at 3.23.8 and "dayjs" at 1.11.13; dev dependency "eslint" at 9.9.0 (also exact). Requires Node >= 22. Include the "type" and "main" fields.',
    F({ formatStrict: true }),
    {
      name: '@acme/ledger',
      version: '0.4.2',
      type: 'module',
      main: './src/index.js',
      scripts: { test: 'node --test', lint: 'eslint .' },
      dependencies: { zod: '3.23.8', dayjs: '1.11.13' },
      devDependencies: { eslint: '9.9.0' },
      engines: { node: '>=22' },
    },
    { minTier: 'cheap' },
  ),
  TExact(
    'gen-crontab-line',
    'mechanical',
    'Write the single crontab line (standard 5-field cron, then the command) that runs `/opt/backup.sh --full` at 02:30 every weekday (Monday through Friday). Use a numeric day-of-week range, not names. Return ONLY the line.',
    F({ formatStrict: true }),
    '30 2 * * 1-5 /opt/backup.sh --full',
    { minTier: 'cheap' },
  ),
  TJson(
    'gen-ci-matrix',
    'mechanical',
    'A CI config declares a matrix: node versions [18, 20, 22] x os ["ubuntu", "windows"], with one exclusion: node 18 on windows. Expand the matrix into the list of concrete jobs. Return JSON {"jobs": [{"node": N, "os": "..."}]} ordered by node ascending, then os alphabetically.',
    F({ formatStrict: true }),
    {
      jobs: [
        { node: 18, os: 'ubuntu' },
        { node: 20, os: 'ubuntu' },
        { node: 20, os: 'windows' },
        { node: 22, os: 'ubuntu' },
        { node: 22, os: 'windows' },
      ],
    },
    { minTier: 'standard' },
  ),
  TJson(
    'gen-route-table',
    'mechanical',
    'Produce a reverse-proxy route table from these requirements: anything under /api/ goes to upstream "backend:3000"; anything under /static/ goes to "cdn"; the health endpoint /healthz goes to "backend:3000" too; everything else goes to "frontend:8080". Return JSON mapping each path prefix (exactly as written above, with its slashes) to its upstream: {"<prefix>": "<upstream>", ...} with the catch-all keyed as "/".',
    F({ formatStrict: true }),
    { '/api/': 'backend:3000', '/static/': 'cdn', '/healthz': 'backend:3000', '/': 'frontend:8080' },
    { minTier: 'cheap' },
  ),
  TJson(
    'parse-access-log-summary',
    'mechanical',
    'Summarize this access log (fields: ip, -, -, [time], "METHOD path proto", status, bytes):\n' + ACCESS_LOG +
      'Return JSON {"requests": <total lines>, "errors": <count with status >= 500>, "bytes": <sum of the bytes field>, "topPath": "<most requested path; ties by path ascending>"}.',
    F({ formatStrict: true }),
    { requests: 12, errors: 2, bytes: 45792, topPath: '/api/users' },
    { minTier: 'standard' },
  ),
  TJson(
    'dockerfile-layer-order',
    'mechanical',
    'Order these Dockerfile instructions so that dependency installation is cached independently of source changes, following the rules: (1) FROM first; (2) WORKDIR before any COPY; (3) copy ONLY the manifests (package.json + lockfile) before installing; (4) install before copying the rest of the source; (5) CMD last. Instructions (unordered): "COPY . .", "RUN npm ci", "FROM node:22-alpine", "CMD [\\"node\\", \\"src/index.js\\"]", "WORKDIR /app", "COPY package.json package-lock.json ./". Return JSON {"order": [the six instructions, exactly as written]}.',
    F({ formatStrict: true }),
    {
      order: [
        'FROM node:22-alpine',
        'WORKDIR /app',
        'COPY package.json package-lock.json ./',
        'RUN npm ci',
        'COPY . .',
        'CMD ["node", "src/index.js"]',
      ],
    },
    { minTier: 'standard' },
  ),

  /* ---------------- reasoning: resolution puzzles ------------------- */
  TJson(
    'dep-resolve-unique',
    'reasoning',
    'Resolve versions for a lockfile. Available: lib-a 1.0.0, 1.2.0, 2.0.0; lib-b 2.0.1, 2.1.0, 3.0.0. Constraints: the app requires lib-a "^1.0.0" and lib-b "^2.0.0"; lib-a 1.2.0 requires lib-b "<2.1.0"; lib-a 1.0.0 requires lib-b ">=2.1.0". Caret means >= the given version and < the next major. Pick the HIGHEST version of lib-a that satisfies every constraint, and then the highest lib-b compatible with that choice. Return JSON {"lib-a": "x.y.z", "lib-b": "x.y.z"}.',
    F({ novel: true, formatStrict: true }),
    { 'lib-a': '1.2.0', 'lib-b': '2.0.1' },
    { minTier: 'standard' },
  ),
  TJson(
    'migration-order',
    'reasoning',
    'Five database migrations must run in an order that respects foreign keys: `orders` references `users`; `order_items` references `orders` and `products`; `reviews` references `users` and `products`. When more than one migration is runnable, run them in alphabetical order (this makes the answer unique). Return JSON {"order": ["<table>", ...]}.',
    F({ novel: true, formatStrict: true }),
    { order: ['products', 'users', 'orders', 'order_items', 'reviews'] },
    { minTier: 'standard' },
  ),
  TExact(
    'build-order-third-target',
    'reasoning',
    'A Makefile has these dependencies: `all: bin docs`; `bin: lib`; `docs: lib gen`; `lib: gen`; `gen` has no dependencies. Targets are built depth-first from `all` in the order their prerequisites are listed, each target built at most once (skip it if already built). Which target is built THIRD? Answer with the target name only.',
    F({ novel: true }),
    'bin',
    { minTier: 'frontier' },
  ),
  TExact(
    'backoff-total-wait',
    'reasoning',
    'A client retries a failed request with exponential backoff: first wait 250 ms, doubling each time, capped at 2000 ms per wait, with at most 5 retries and no jitter. Every attempt fails. How many milliseconds in TOTAL does the client spend waiting across all retries? Answer with a single integer.',
    F({}),
    '5750',
    { minTier: 'cheap' },
  ),
  TJson(
    'semver-merge-conflict',
    'reasoning',
    'Two branches both edit package.json off a base where "left-pad" was "^1.1.0". Branch A bumps it to "^1.3.0"; branch B bumps it to "~1.2.4". The registry has left-pad 1.1.0, 1.2.4, 1.2.9, 1.3.0, 1.3.5, 2.0.0. Resolve the merge by keeping the range that BOTH branches\' intents can satisfy simultaneously if one exists (i.e. the intersection is non-empty), else the stricter (narrower) range wins. Then state the highest registry version that the chosen range installs. Return JSON {"range": "...", "installs": "x.y.z"}.',
    F({ novel: true, formatStrict: true }),
    { range: '~1.2.4', installs: '1.2.9' },
    // 'none': unsolved at every tier in --mock, apex included, so the report
    // exercises a genuinely failed unit in the tiered arm (and the ∞ $/pass
    // guards in a static arm with zero completions never trip silently).
    { minTier: 'none' },
  ),

  /* ---------------- refactor: multi-file plans ---------------------- */
  TJson(
    'extract-shared-helper',
    'refactor',
    'Three files each contain an identical private `formatMoney(cents)` function: src/cart/summary.js, src/checkout/receipt.js, and src/admin/reports.js. Plan the refactor that removes the duplication: create ONE new module at src/utils/money.js exporting `formatMoney` as a named export, and edit each duplicating file to import it and delete its local copy. Return JSON {"create": "<new file path>", "export": "<exported name>", "edit": [<the three file paths, sorted ascending>]}.',
    F({ crossCutting: true, formatStrict: true }),
    { create: 'src/utils/money.js', export: 'formatMoney', edit: ['src/admin/reports.js', 'src/cart/summary.js', 'src/checkout/receipt.js'] },
    { minTier: 'cheap' },
  ),
  TJson(
    'move-function-update-imports',
    'refactor',
    'You are moving `parseDate` out of src/a.js into a new file src/dates.js. Import graph (importer -> what it imports): src/b.js imports { parseDate, slugify } from "./a.js"; src/c.js imports { slugify } from "./a.js"; src/d.js imports { parseDate } from "./a.js"; src/e.js imports { parseDate } from "./b.js" (b re-exports it). Which files need their import statements edited to point at ./dates.js (only files that directly import parseDate from a.js)? Return JSON {"updateImports": [sorted paths], "unchanged": [sorted paths of the other importers listed]}.',
    F({ crossCutting: true, formatStrict: true }),
    { updateImports: ['src/b.js', 'src/d.js'], unchanged: ['src/c.js', 'src/e.js'] },
    { minTier: 'standard' },
  ),
  TJson(
    'rename-respect-shadowing',
    'refactor',
    'You want to rename the OUTER variable `total` to `grandTotal` in this code, without touching any other binding:\n' +
      ' 1: function summarize(orders) {\n' +
      ' 2:   let total = 0;\n' +
      ' 3:   for (const o of orders) {\n' +
      ' 4:     const total = o.lines.reduce((s, l) => s + l.amount, 0);\n' +
      ' 5:     log("order total", total);\n' +
      ' 6:     accumulate(o, total);\n' +
      ' 7:   }\n' +
      ' 8:   return total;\n' +
      ' 9: }\n' +
      '10: function accumulate(o, total) { o.total = total; }\n' +
      'List the line numbers where `total` refers to the outer binding declared on line 2 (those are the only lines a correct rename may edit). Return JSON {"lines": [ascending line numbers]}.',
    F({ novel: true, formatStrict: true }),
    { lines: [2, 8] },
    { minTier: 'frontier' },
  ),

  /* ---------------- documentation: structured artifacts ------------- */
  TJson(
    'cli-help-manifest',
    'documentation',
    'Produce a structured help manifest for a CLI subcommand from this spec, as JSON. Command `deploy` takes: `--env` (string, required, no default), `--dry-run` (boolean, optional, default false), `--replicas` (number, optional, default 2), and a positional argument `service` (string, required). Return JSON {"command": "deploy", "positionals": [{"name": "...", "type": "...", "required": true|false}], "flags": [{"name": "--...", "type": "...", "required": true|false, "default": <value or null>}]} with flags in the order given above. Use null for "no default".',
    F({ formatStrict: true }),
    {
      command: 'deploy',
      positionals: [{ name: 'service', type: 'string', required: true }],
      flags: [
        { name: '--env', type: 'string', required: true, default: null },
        { name: '--dry-run', type: 'boolean', required: false, default: false },
        { name: '--replicas', type: 'number', required: false, default: 2 },
      ],
    },
    { minTier: 'standard' },
  ),
  TJson(
    'changelog-from-commits',
    'documentation',
    'Turn these conventional commits into a structured changelog entry. Commits (oldest first):\n' +
      '  feat(api): add bulk export endpoint\n' +
      '  fix(auth): refresh token race on concurrent tabs\n' +
      '  chore: bump eslint\n' +
      '  feat!: drop Node 18 support\n' +
      '  fix(ui): clip long invoice numbers\n' +
      'Rules: `feat` -> "added", `fix` -> "fixed", a `!` after the type marks a breaking change which goes in "breaking" INSTEAD of its normal section; `chore` is omitted. Keep the description text after the colon and space, verbatim, in the original order. Return JSON {"added": [...], "fixed": [...], "breaking": [...]}.',
    F({ formatStrict: true }),
    {
      added: ['add bulk export endpoint'],
      fixed: ['refresh token race on concurrent tabs', 'clip long invoice numbers'],
      breaking: ['drop Node 18 support'],
    },
    { minTier: 'cheap' },
  ),

  /* ---------------- security: audits over files/configs ------------- */
  TJson(
    'ci-workflow-audit',
    'security',
    'Audit this GitHub Actions workflow excerpt (line-numbered):\n' +
      ' 1: name: deploy\n' +
      ' 2: on: [push]\n' +
      ' 3: jobs:\n' +
      ' 4:   deploy:\n' +
      ' 5:     runs-on: ubuntu-latest\n' +
      ' 6:     env:\n' +
      ' 7:       NPM_TOKEN: npm_Kx91hZ2yQpL8vR3tWq7mN4bC6dF0gH1jS5a\n' +
      ' 8:     steps:\n' +
      ' 9:       - uses: actions/checkout@v4\n' +
      '10:       - run: npm ci\n' +
      '11:       - run: npm publish\n' +
      'Classify the vulnerability from this fixed set: "sql-injection", "xss", "path-traversal", "hardcoded-secret", "insecure-deserialization", "missing-auth-check", "none", and give the line number where it occurs. Return JSON {"category": "...", "line": N}.',
    F({ blast: true, formatStrict: true }),
    { category: 'hardcoded-secret', line: 7 },
    { minTier: 'cheap' },
  ),
  TJson(
    'script-audit-traversal',
    'security',
    'Audit this CGI-style shell script that serves report files:\n' +
      '  #!/bin/bash\n' +
      '  name="$QUERY_STRING"\n' +
      '  echo "Content-Type: text/plain"; echo\n' +
      '  cat "/var/reports/$name"\n' +
      'Classify the vulnerability from this fixed set: "sql-injection", "xss", "path-traversal", "hardcoded-secret", "insecure-deserialization", "missing-auth-check", "none". Return JSON {"category": "..."}.',
    F({ blast: true, formatStrict: true }),
    { category: 'path-traversal' },
    { minTier: 'standard' },
  ),
  TShell(
    'repo-secret-scan',
    'security',
    'The working directory is a small repo snapshot. Write a bash script that prints the relative paths of every file containing a committed credential — defined as EITHER an AWS access key id (the literal prefix `AKIA` followed by 16 uppercase letters/digits) OR a PEM private key header (`-----BEGIN` ... `PRIVATE KEY-----`). Print one path per line, sorted ascending, paths relative to the working directory without a leading "./". Files that merely mention keys in prose or contain placeholder tokens must NOT be listed.\n\nFiles present: ' +
      Object.keys(REPO_SNAPSHOT).sort().join(', '),
    F({ blast: true, crossCutting: true }),
    REPO_SNAPSHOT,
    'deploy/id_rsa\nsrc/aws.js',
    "grep -rlE 'AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----' . | sed 's#^\\./##' | sort",
    { minTier: 'apex' },
  ),
];
