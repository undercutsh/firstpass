// Reasoning task suite — deterministic exact-match graders.
// Original multiple-choice and short-answer questions; answerKey is ground truth.

import { makeTask, gradeExact } from '../tasks.js';

const T = (id, prompt, flags, answerKey) =>
  makeTask({
    id: `reasoning:${id}`,
    category: 'reasoning',
    prompt,
    flags,
    answerKey,
    grader: (answer) => gradeExact(answer, answerKey),
  });

export const reasoningSuite = [
  T(
    'logic-balls',
    'You have 3 identical-looking balls. One is heavier. With a balance scale that can only compare two balls at a time, what is the minimum number of weighings guaranteed to identify the heavy ball? Answer with a single number.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    '1',
  ),
  T(
    'probability',
    'A bag has 3 red and 2 blue marbles. You draw two marbles without replacement. What is the probability (as a simplified fraction) that both are red? Answer with a fraction like "3/10".',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    '3/10',
  ),
  T(
    'sequence',
    'What number comes next in the sequence: 2, 6, 12, 20, 30, ? Answer with a single number.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    '42',
  ),
  T(
    'schedule',
    'Three meetings must be scheduled: A, B, C. A must be before B. C must be after A. B must be last. Which meeting is first? Answer with a single letter.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    'A',
  ),
  T(
    'percent-change',
    'A price of $80 increases by 25%, then decreases by 20%. What is the final price in dollars? Answer with a single number.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    '80',
  ),
  T(
    'deduction',
    'All employees in department X take coffee breaks at 10:00. Jamie is an employee in department X. Is Jamie guaranteed to take a coffee break at 10:00? Answer "yes" or "no".',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    'yes',
  ),
  T(
    'binary',
    'Convert the binary number 101101 to decimal. Answer with a single number.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    '45',
  ),
  T(
    'clock',
    'If the time is 3:45, what is the smaller angle in degrees between the hour and minute hands? Answer with a single number.',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: true },
    '157.5',
  ),
  T(
    'transport',
    'A train leaves station P at 9:00 traveling 60 km/h toward station Q, which is 150 km away. A second train leaves Q at 9:30 traveling 40 km/h toward P. At what time (HH:MM) do they meet?',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: true },
    '10:42',
  ),
  T(
    'syllogism',
    'Some squares are red. All red things are visible. Is it necessarily true that some squares are visible? Answer "yes" or "no".',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    'yes',
  ),
  // Deliberately unresolvable by every local tier in --mock (see runner.js's
  // mockAttempter APEX_PROBE_IDS) so the ladder genuinely exhausts its cap
  // and needsApex, exercising the single batched apex tie-break end to end
  // in mock/plumbing runs. Without a task like this, --mock's ladder always
  // resolves by 'standard' (mockAttempter passes any non-cheap tier), so
  // frontier — and therefore apex — is dead code from --mock's perspective.
  T(
    'apex-tiebreak',
    'Two expert reviewers disagree on whether this refactor changes observable behavior. Resolve the tie: does it change observable behavior? Answer "yes" or "no".',
    { unverifiable: false, ambiguous: false, blast: false, crossCutting: false, novel: false },
    'no',
  ),
];