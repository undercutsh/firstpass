// Security-review task suite — deterministic graders (JSON schema or
// exact-match). Tests vulnerability-classification skill: given a short code
// snippet, name which vulnerability category it exhibits from a FIXED enum.
// Every task has one unambiguous, machine-checkable correct answer — never
// a matter of taste, and never graded by an LLM judge.
//
// Fixed classification enum used across this suite:
//   "sql-injection"            — unsanitized input concatenated into a SQL query
//   "xss"                      — unsanitized input written into HTML/DOM output
//   "path-traversal"           — unsanitized input used to build a filesystem path
//   "hardcoded-secret"         — a credential/key/token literal committed in source
//   "insecure-deserialization" — untrusted data passed to an unsafe deserializer
//   "missing-auth-check"       — a sensitive action reachable without an authorization check
//   "none"                     — the snippet is genuinely safe

import { makeTask, gradeJsonSubset, gradeExact } from '../tasks.js';

const TJ = (id, prompt, flags, answerKey) =>
  makeTask({
    id: `security:${id}`,
    category: 'security',
    prompt,
    flags,
    answerKey,
    grader: (answer) => gradeJsonSubset(answer, answerKey),
  });

const TE = (id, prompt, flags, answerKey) =>
  makeTask({
    id: `security:${id}`,
    category: 'security',
    prompt,
    flags,
    answerKey,
    grader: (answer) => gradeExact(answer, answerKey),
  });

const ENUM_LIST =
  '"sql-injection", "xss", "path-traversal", "hardcoded-secret", "insecure-deserialization", "missing-auth-check", "none"';

export const securitySuite = [
  TJ(
    'sql-string-concat',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code:\n' +
      '"const query = \'SELECT * FROM users WHERE username = \\\'\' + req.body.username + \'\\\'\'; db.execute(query);"\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: true, crossCutting: false, novel: false, formatStrict: true },
    { category: 'sql-injection' },
  ),
  TJ(
    'sql-parameterized-safe',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code:\n' +
      '"const query = \'SELECT * FROM users WHERE username = ?\'; db.execute(query, [req.body.username]);"\n' +
      'The query uses a parameterized placeholder and passes user input as a bound parameter, never concatenated into the SQL string.\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { category: 'none' },
  ),
  TJ(
    'xss-innerhtml',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code:\n' +
      '"function showComment(comment) { document.getElementById(\'output\').innerHTML = comment; }"\n' +
      '`comment` comes directly from another user\'s submitted form input and is never escaped or sanitized before being assigned to innerHTML.\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: true, crossCutting: false, novel: false, formatStrict: true },
    { category: 'xss' },
  ),
  TJ(
    'xss-textcontent-safe',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code:\n' +
      '"function showComment(comment) { document.getElementById(\'output\').textContent = comment; }"\n' +
      '`textContent` assigns the string as plain text; the browser never parses it as HTML/script, so no markup or script can execute regardless of the input.\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { category: 'none' },
  ),
  TJ(
    'path-traversal-join',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code:\n' +
      '"app.get(\'/download\', (req, res) => { const filePath = \'/srv/files/\' + req.query.filename; res.sendFile(filePath); });"\n' +
      '`req.query.filename` is attacker-controlled and concatenated directly into the path with no normalization or check for ".." segments, so a value like "../../etc/passwd" escapes the intended directory.\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: true, crossCutting: false, novel: true, formatStrict: true },
    { category: 'path-traversal' },
  ),
  TJ(
    'hardcoded-api-key',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code:\n' +
      '"const PAYMENT_API_SECRET = \'REDACTED_EXAMPLE_NOT_A_REAL_KEY_1234567890abcdef\'; function charge(amount) { return paymentClient.charge({ amount, apiKey: PAYMENT_API_SECRET }); }"\n' +
      'The secret key is a literal string committed directly in source rather than read from an environment variable or secret store.\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { category: 'hardcoded-secret' },
  ),
  TJ(
    'insecure-pickle-deserialize',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code (Python):\n' +
      '"import pickle\ndef load_session(raw_bytes):\n    return pickle.loads(raw_bytes)"\n' +
      '`raw_bytes` comes from a cookie sent by the client. `pickle.loads` on attacker-controlled bytes can execute arbitrary code during deserialization.\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: true, crossCutting: false, novel: true, formatStrict: true },
    { category: 'insecure-deserialization' },
  ),
  TJ(
    'missing-auth-admin-route',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code:\n' +
      '"app.post(\'/admin/deleteUser\', (req, res) => { db.deleteUser(req.body.userId); res.sendStatus(200); });"\n' +
      'This route deletes any user by id and has no session check, role check, or middleware verifying the caller is an authenticated admin — any request reaches it.\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: true, crossCutting: true, novel: false, formatStrict: true },
    { category: 'missing-auth-check' },
  ),
  TJ(
    'auth-checked-safe',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code:\n' +
      '"app.post(\'/admin/deleteUser\', requireRole(\'admin\'), (req, res) => { db.deleteUser(req.body.userId); res.sendStatus(200); });"\n' +
      '`requireRole(\'admin\')` is authentication/authorization middleware that runs before the handler and rejects any caller who is not an authenticated admin.\n' +
      'Return JSON {"category": "..."}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: true, novel: false, formatStrict: true },
    { category: 'none' },
  ),
  TE(
    'sql-fstring-python',
    'Classify the vulnerability in this code from this fixed set: ' + ENUM_LIST + '.\n' +
      'Code (Python):\n' +
      '"def get_user(username):\n    cursor.execute(f\\"SELECT * FROM users WHERE name = \'{username}\'\\")"\n' +
      '`username` is interpolated directly into the SQL string via an f-string, with no parameter binding.\n' +
      'Return only the category string, e.g. "xss".',
    { unverifiable: false, ambiguous: false, blast: true, crossCutting: false, novel: false, formatStrict: true },
    'sql-injection',
  ),
];
