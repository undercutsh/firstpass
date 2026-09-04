// Refactor task suite — deterministic JSON schema / exact-match graders.
// Small, mechanically-verifiable refactoring judgment calls: dead-code
// detection, pure-rename vs behavior-change classification, extract-helper
// signatures, and code-smell -> refactor-pattern classification against a
// fixed enum. Every answer has a single ground truth — no task here asks
// for a subjective quality judgment.

import { makeTask, gradeJsonSubset, gradeExact } from '../tasks.js';

const TJson = (id, prompt, flags, answerKey) =>
  makeTask({
    id: `refactor:${id}`,
    category: 'refactor',
    prompt,
    flags,
    answerKey,
    grader: (answer) => gradeJsonSubset(answer, answerKey),
  });

const TExact = (id, prompt, flags, answerKey) =>
  makeTask({
    id: `refactor:${id}`,
    category: 'refactor',
    prompt,
    flags,
    answerKey,
    grader: (answer) => gradeExact(answer, answerKey),
  });

export const refactorSuite = [
  TJson(
    'dead-code',
    'Given these four functions, identify the one that is never called anywhere: ' +
      '`function loadConfig() { return parse(readFile()); }`, ' +
      '`function parse(text) { return JSON.parse(text); }`, ' +
      '`function readFile() { return fs.readFileSync("config.json", "utf8"); }`, ' +
      '`function validateConfig(cfg) { return cfg.version != null; }`. ' +
      'Only loadConfig is invoked externally (by main()), and loadConfig calls parse and readFile. ' +
      'validateConfig is never called from loadConfig, main, or anywhere else. ' +
      'Return JSON: {"deadCode": "<function name>"}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { deadCode: 'validateConfig' },
  ),
  TJson(
    'unused-import',
    'Given this import statement and the code that follows, identify the one imported ' +
      'binding that is never referenced in the code body: ' +
      '`import { debounce, throttle, cloneDeep } from "lodash"; import fs from "fs";` ' +
      'Code body uses: `debounce(save, 300)`, `cloneDeep(state)`, and `fs.readFileSync(path)`. ' +
      '`throttle` does not appear anywhere else in the code. ' +
      'Return JSON: {"unusedImport": "<binding name>"}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { unusedImport: 'throttle' },
  ),
  TJson(
    'pure-rename-true',
    'Given this diff, classify whether it is a pure rename/move with no behavior change, ' +
      'or a behavior change. Diff: ' +
      '`- function calculateTotal(items) { return items.reduce((sum, i) => sum + i.price, 0); }` ' +
      '`+ function computeTotal(items) { return items.reduce((sum, i) => sum + i.price, 0); }` ' +
      'The function body is byte-for-byte identical; only the function name changed, and all ' +
      'call sites were updated to match. Return JSON: {"pureRename": true or false}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { pureRename: true },
  ),
  TJson(
    'pure-rename-false',
    'Given this diff, classify whether it is a pure rename/move with no behavior change, ' +
      'or a behavior change. Diff: ' +
      '`- function calculateTotal(items) { return items.reduce((sum, i) => sum + i.price, 0); }` ' +
      '`+ function computeTotal(items) { return items.reduce((sum, i) => sum + i.price * 1.1, 0); }` ' +
      'The function was renamed AND the calculation now multiplies each price by 1.1 (a 10% markup ' +
      'that was not present before). Return JSON: {"pureRename": true or false}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { pureRename: false },
  ),
  TJson(
    'extract-helper',
    'This codebase has the same block duplicated in two places: ' +
      '`const area1 = width1 * height1;` in one function, and ' +
      '`const area2 = width2 * height2;` in another. You extract it into a shared helper ' +
      'that takes a width and a height and returns their product. Return JSON describing the ' +
      'helper: {"helperName": "<a descriptive camelCase name for computing an area>", "paramCount": 2}.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: true },
    { paramCount: 2 },
  ),
  TExact(
    'smell-long-parameter-list',
    'A function `createUser(firstName, lastName, email, phone, address, city, state, zip, country)` ' +
      'takes nine positional parameters, most of which are always passed together as a group. ' +
      'Which refactoring pattern from this fixed list best fixes this smell: ' +
      '"Extract Method", "Introduce Parameter Object", "Inline Function", "Rename Variable", "Move Method"? ' +
      'Answer with the exact pattern name from the list.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false, formatStrict: false },
    'Introduce Parameter Object',
  ),
  TExact(
    'smell-conditional-polymorphism',
    'A function contains `if (shape.type === "circle") { ...compute circle area... } else if ' +
      '(shape.type === "square") { ...compute square area... } else if (shape.type === "triangle") ' +
      '{ ...compute triangle area... }`, and this same type-switch is copy-pasted in several other ' +
      'functions across the codebase (perimeter, render, etc.), each branching on `shape.type`. ' +
      'Which refactoring pattern from this fixed list best fixes this smell: ' +
      '"Extract Method", "Replace Conditional with Polymorphism", "Rename Variable", "Inline Variable", ' +
      '"Introduce Parameter Object"? Answer with the exact pattern name from the list.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: true, formatStrict: false },
    'Replace Conditional with Polymorphism',
  ),
  TExact(
    'smell-feature-envy',
    'A method `Invoice.printSummary()` barely touches its own Invoice fields, and instead calls ' +
      '`this.customer.getName()`, `this.customer.getAddress()`, `this.customer.getBillingHistory()`, ' +
      'and `this.customer.formatContact()` — four different calls into the Customer object\'s data. ' +
      'Which refactoring pattern from this fixed list best fixes this smell: ' +
      '"Move Method", "Extract Variable", "Rename Variable", "Inline Method", "Split Loop"? ' +
      'Answer with the exact pattern name from the list.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: true, formatStrict: false },
    'Move Method',
  ),
];
