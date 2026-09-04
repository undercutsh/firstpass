// Documentation task suite — deterministic JSON schema graders.
// Given a function signature + short behavior description, produce a
// structured docstring object (params/returns/raises) as JSON — never
// prose graded subjectively. The grader is gradeJsonSubset against a fixed
// reference JSON object per task (param names/types/order, return type,
// raises list all correct). Free-text "description" fields are part of the
// requested schema (a real docstring needs them) but are NOT graded — only
// the structural fields (name/type/kind/optional/raises-type) are, since
// those are the only parts with a single ground truth. `reduceForGrading`
// strips each answer down to the same keys the answerKey uses before handing
// it to gradeJsonSubset, so a model's own phrasing of "description" never
// affects pass/fail.

import { makeTask, gradeJsonSubset, extractJson } from '../tasks.js';

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

/** Keep only the keys the answerKey checks, at every level, so free-text
 * "description" fields (and any other extra keys) never affect grading. */
function reduceForGrading(parsed, answerKey) {
  const reduced = {};
  if (Array.isArray(answerKey.params)) {
    reduced.params = Array.isArray(parsed?.params)
      ? parsed.params.map((p, i) => pick(p, Object.keys(answerKey.params[i] ?? {})))
      : parsed?.params;
  }
  if (answerKey.returns) {
    reduced.returns = pick(parsed?.returns, Object.keys(answerKey.returns));
  }
  if (Array.isArray(answerKey.raises)) {
    reduced.raises = Array.isArray(parsed?.raises)
      ? parsed.raises.map((r, i) => pick(r, Object.keys(answerKey.raises[i] ?? {})))
      : parsed?.raises;
  }
  return reduced;
}

const T = (id, prompt, flags, answerKey) =>
  makeTask({
    id: `documentation:${id}`,
    category: 'documentation',
    prompt,
    flags,
    answerKey,
    grader: (answer) => {
      const parsed = typeof answer === 'string' ? extractJson(answer) : answer;
      if (!parsed) return { pass: false, reason: 'non-JSON output' };
      return gradeJsonSubset(reduceForGrading(parsed, answerKey), answerKey);
    },
  });

export const documentationSuite = [
  T(
    'simple-no-raises',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def square(n: int) -> int`. Behavior: returns the ' +
      'square of the input integer. It never raises. Return JSON: ' +
      '{"params": [{"name": "n", "type": "int", "description": "<short description>"}], ' +
      '"returns": {"type": "int", "description": "<short description>"}, "raises": []}. ' +
      'The "params" and "raises" arrays must list entries in the order given here; ' +
      'descriptions may be any reasonable short phrasing.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { params: [{ name: 'n', type: 'int' }], returns: { type: 'int' }, raises: [] },
  ),
  T(
    'two-params-no-raises',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def clamp(value: float, low: float, high: float) -> float`. ' +
      'Behavior: returns value restricted to the inclusive range [low, high]; never raises. ' +
      'Return JSON: {"params": [{"name": "value", "type": "float", "description": "..."}, ' +
      '{"name": "low", "type": "float", "description": "..."}, {"name": "high", "type": "float", ' +
      '"description": "..."}], "returns": {"type": "float", "description": "..."}, "raises": []}. ' +
      'List params in signature order.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    {
      params: [{ name: 'value', type: 'float' }, { name: 'low', type: 'float' }, { name: 'high', type: 'float' }],
      returns: { type: 'float' },
      raises: [],
    },
  ),
  T(
    'single-raise',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def divide(a: float, b: float) -> float`. Behavior: ' +
      'returns a divided by b; raises ZeroDivisionError if b is 0. Return JSON: ' +
      '{"params": [{"name": "a", "type": "float", "description": "..."}, {"name": "b", "type": "float", ' +
      '"description": "..."}], "returns": {"type": "float", "description": "..."}, ' +
      '"raises": [{"type": "ZeroDivisionError", "condition": "<short condition>"}]}. ' +
      'List params in signature order.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    {
      params: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }],
      returns: { type: 'float' },
      raises: [{ type: 'ZeroDivisionError' }],
    },
  ),
  T(
    'optional-param-with-default',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def greet(name: str, greeting: str = "Hello") -> str`. ' +
      'Behavior: returns "{greeting}, {name}!"; never raises. `greeting` is optional. Return JSON: ' +
      '{"params": [{"name": "name", "type": "str", "optional": false, "description": "..."}, ' +
      '{"name": "greeting", "type": "str", "optional": true, "description": "..."}], ' +
      '"returns": {"type": "str", "description": "..."}, "raises": []}. List params in signature order.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    {
      params: [{ name: 'name', type: 'str', optional: false }, { name: 'greeting', type: 'str', optional: true }],
      returns: { type: 'str' },
      raises: [],
    },
  ),
  T(
    'multiple-typed-raises',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def parse_age(raw: str) -> int`. Behavior: parses raw as ' +
      'an integer age; raises ValueError if raw is not a valid integer string, and raises ' +
      'ValueError if the parsed integer is negative (age cannot be negative). It does NOT raise ' +
      'TypeError. Return JSON: {"params": [{"name": "raw", "type": "str", "description": "..."}], ' +
      '"returns": {"type": "int", "description": "..."}, "raises": [{"type": "ValueError", ' +
      '"condition": "..."}, {"type": "ValueError", "condition": "..."}]}. List raises in the order ' +
      'the two ValueError conditions are described above.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    {
      params: [{ name: 'raw', type: 'str' }],
      returns: { type: 'int' },
      raises: [{ type: 'ValueError' }, { type: 'ValueError' }],
    },
  ),
  T(
    'two-distinct-raise-types',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def get_item(items: list, index: int) -> object`. ' +
      'Behavior: returns items[index]; raises IndexError if index is out of range, and raises ' +
      'TypeError if items is not a list. Return JSON: {"params": [{"name": "items", "type": "list", ' +
      '"description": "..."}, {"name": "index", "type": "int", "description": "..."}], ' +
      '"returns": {"type": "object", "description": "..."}, "raises": [{"type": "TypeError", ' +
      '"condition": "..."}, {"type": "IndexError", "condition": "..."}]}. List raises in this exact ' +
      'order: TypeError first, then IndexError (parameter-validation errors are listed before ' +
      'value-range errors).',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    {
      params: [{ name: 'items', type: 'list' }, { name: 'index', type: 'int' }],
      returns: { type: 'object' },
      raises: [{ type: 'TypeError' }, { type: 'IndexError' }],
    },
  ),
  T(
    'nullable-return-type',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def find_user(user_id: int, db: dict) -> Optional[str]`. ' +
      'Behavior: returns the username string for user_id if present in db, otherwise returns None; ' +
      'never raises. Return JSON: {"params": [{"name": "user_id", "type": "int", "description": "..."}, ' +
      '{"name": "db", "type": "dict", "description": "..."}], "returns": {"type": "Optional[str]", ' +
      '"description": "..."}, "raises": []}. List params in signature order.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    {
      params: [{ name: 'user_id', type: 'int' }, { name: 'db', type: 'dict' }],
      returns: { type: 'Optional[str]' },
      raises: [],
    },
  ),
  T(
    'novel-varargs-kwargs',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON, including entries for the variadic parameters. Signature: ' +
      '`def build_url(base: str, *segments: str, **params: str) -> str`. Behavior: joins base with ' +
      'each of segments as path components, then appends params as a query string; never raises. ' +
      'Return JSON: {"params": [{"name": "base", "type": "str", "kind": "positional", ' +
      '"description": "..."}, {"name": "segments", "type": "str", "kind": "vararg", ' +
      '"description": "..."}, {"name": "params", "type": "str", "kind": "kwarg", ' +
      '"description": "..."}], "returns": {"type": "str", "description": "..."}, "raises": []}. ' +
      'List params in signature order: the positional parameter first, then the *args-style ' +
      'variadic (kind "vararg"), then the **kwargs-style variadic (kind "kwarg").',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: true, formatStrict: true },
    {
      params: [
        { name: 'base', type: 'str', kind: 'positional' },
        { name: 'segments', type: 'str', kind: 'vararg' },
        { name: 'params', type: 'str', kind: 'kwarg' },
      ],
      returns: { type: 'str' },
      raises: [],
    },
  ),
  T(
    'novel-generic-type',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def first_or_default(items: List[T], default: T) -> T` ' +
      '(a generic function parameterized by type T). Behavior: returns the first element of items ' +
      'if items is non-empty, otherwise returns default; never raises. Return JSON: ' +
      '{"params": [{"name": "items", "type": "List[T]", "description": "..."}, {"name": "default", ' +
      '"type": "T", "description": "..."}], "returns": {"type": "T", "description": "..."}, ' +
      '"raises": []}. List params in signature order and preserve the generic type notation exactly ' +
      '("List[T]" and "T").',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: true, formatStrict: true },
    {
      params: [{ name: 'items', type: 'List[T]' }, { name: 'default', type: 'T' }],
      returns: { type: 'T' },
      raises: [],
    },
  ),
  T(
    'harder-multi-param-multi-raise',
    'Given this Python function signature and behavior description, produce structured ' +
      'documentation as JSON. Signature: `def transfer(from_acct: str, to_acct: str, amount: float, ' +
      'accounts: dict) -> bool`. Behavior: moves amount from accounts[from_acct] to accounts[to_acct] ' +
      'and returns True on success. Raises KeyError if from_acct or to_acct is not in accounts, and ' +
      'raises ValueError if amount is negative, and raises RuntimeError if accounts[from_acct] has ' +
      'insufficient balance. Return JSON: {"params": [{"name": "from_acct", "type": "str", ' +
      '"description": "..."}, {"name": "to_acct", "type": "str", "description": "..."}, ' +
      '{"name": "amount", "type": "float", "description": "..."}, {"name": "accounts", "type": "dict", ' +
      '"description": "..."}], "returns": {"type": "bool", "description": "..."}, "raises": ' +
      '[{"type": "KeyError", "condition": "..."}, {"type": "ValueError", "condition": "..."}, ' +
      '{"type": "RuntimeError", "condition": "..."}]}. List params in signature order and raises in ' +
      'the exact order the conditions are described above.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: false },
    {
      params: [
        { name: 'from_acct', type: 'str' },
        { name: 'to_acct', type: 'str' },
        { name: 'amount', type: 'float' },
        { name: 'accounts', type: 'dict' },
      ],
      returns: { type: 'bool' },
      raises: [{ type: 'KeyError' }, { type: 'ValueError' }, { type: 'RuntimeError' }],
    },
  ),
];
