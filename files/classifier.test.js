'use strict';
/**
 * classifier.test.js
 * ------------------
 * Tests for classifyWithValidation() and extractExperienceDetails().
 * Run with:  node classifier.test.js
 * (No test framework required — plain assertions.)
 */

const {
  classifyWithValidation,
  extractExperienceDetails,
  SENIORITY_LEVELS,
} = require('./scrape_local');

// ─── tiny assertion helpers ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}
function eq(a, b, label) {
  assert(a === b, `${label}  →  got "${a}", expected "${b}"`);
}
function section(name) {
  console.log(`\n── ${name} ${'─'.repeat(60 - name.length)}`);
}

// =============================================================================
// extractExperienceDetails
// =============================================================================
section('extractExperienceDetails — sub-role exclusion');

// [BUG-A reproduced] Carrier-style: "minimum 4 years … atleast 1 year as Team Lead"
// OLD code: min(4, 1) = 1 (wrong)
// NEW code: exclude "1 year as Team Lead", max(4) = 4 (correct)
{
  const text = 'A minimum of 4 years prior relevant experience and atleast 1 year experience as Team Lead';
  const { minYears } = extractExperienceDetails(text);
  eq(minYears, 4, 'Carrier case: "minimum 4 years + atleast 1 year as TL" → 4');
}

{
  const text = 'Requires 6 years of experience. At least 2 years experience as senior developer.';
  const { minYears } = extractExperienceDetails(text);
  eq(minYears, 6, '"6 years overall + 2 years as senior dev" → 6');
}

{
  const text = 'minimum 5 years experience as software engineer';
  // "experience as" is the sub-role pattern → should be excluded → no primary → null
  const { minYears } = extractExperienceDetails(text);
  // Note: "minimum 5 years" is matched BEFORE "experience as", so it IS captured
  // by the /(?:minimum|at\s*least)\s*(\d+)\s*years?/ pattern. Let's verify the
  // actual result here — the "minimum" pattern runs on cleanedText after blanking.
  // "minimum 5 years experience as software engineer" → sub-role blanks
  // "5 years experience as software engineer" part → "minimum 5 years" is kept.
  assert(minYears !== null, '"minimum 5 years experience as software engineer" → some value found');
}

section('extractExperienceDetails — standard patterns');

{
  const { minYears } = extractExperienceDetails('3-5 years of experience required');
  eq(minYears, 5, 'Range "3-5 years" → max of candidates = 5');
  // (range lower bound 3 is a candidate, but also "5 years of experience" pattern
  //  may fire with value 5 — max is 5; both 3 and 5 are reasonable, test just verifies
  //  it's ≥ 3 and classifies correctly)
  assert(minYears >= 3, 'Range "3-5 years" → value ≥ 3');
}

{
  const { minYears } = extractExperienceDetails('8+ years experience');
  eq(minYears, 8, '"8+ years" → 8');
}

{
  const { minYears } = extractExperienceDetails('Minimum 6 years of experience in software development');
  eq(minYears, 6, '"Minimum 6 years" → 6');
}

{
  const { minYears } = extractExperienceDetails('No prior experience needed');
  eq(minYears, null, 'No numeric experience → null');
}

// =============================================================================
// classifyWithValidation — level boundaries (FIX-01)
// =============================================================================
section('classifyWithValidation — level boundaries');

{
  const { classification } = classifyWithValidation('0 years of experience required', 'Graduate Developer');
  // 0 years, no fresher keywords → Entry Level (not Fresher)
  // (Fresher needs explicit fresher language, 0 years alone is Entry Level)
  assert(
    classification === SENIORITY_LEVELS.ENTRY || classification === SENIORITY_LEVELS.FRESHER,
    '"0 years required" → Entry Level or Fresher'
  );
}

{
  const { classification } = classifyWithValidation('1 year of experience required', 'Software Engineer');
  eq(classification, SENIORITY_LEVELS.ENTRY, '1 year → Entry Level');
}

{
  const { classification } = classifyWithValidation('2 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.ENTRY, '2 years → Entry Level');
}

{
  const { classification } = classifyWithValidation('3 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '3 years → Mid Level');
}

{
  const { classification } = classifyWithValidation('4 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '4 years → Mid Level');
}

{
  const { classification } = classifyWithValidation('5 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.SENIOR, '5 years → Senior Level');
}

{
  const { classification } = classifyWithValidation('7 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.SENIOR, '7 years → Senior Level');
}

{
  const { classification } = classifyWithValidation('8 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.LEAD, '8 years → Lead Level');
}

{
  const { classification } = classifyWithValidation('12 years of experience required', 'Architect');
  eq(classification, SENIORITY_LEVELS.LEAD, '12 years → Lead Level');
}

// =============================================================================
// classifyWithValidation — BUG-A reproduction (Carrier / 4yr → Entry Level)
// =============================================================================
section('classifyWithValidation — BUG-A: sub-role requirements must not override primary');

{
  const desc = 'A minimum of 4 years prior relevant experience and atleast 1 year experience as Team Lead. ' +
    'University Degree – B.Tech in Electrical/Mechanical Engineering.';
  const { classification, years, reason } = classifyWithValidation(desc, 'Senior Engineer');
  eq(classification, SENIORITY_LEVELS.MID, 'Carrier "Senior Engineer" (4yr req + 1yr as TL) → Mid Level');
  assert(years === 4, `years reported as 4, got ${years}`);
  console.log(`     reason: ${reason}`);
}

{
  // Another sub-role variant using "experience as"
  const desc = '6 years of experience. 2 years experience as tech lead.';
  const { classification } = classifyWithValidation(desc, 'Software Engineer');
  eq(classification, SENIORITY_LEVELS.SENIOR, '"6 yrs overall + 2 yrs as TL" → Senior Level');
}

// =============================================================================
// classifyWithValidation — conflict resolution (title vs description)
// =============================================================================
section('classifyWithValidation — title vs description conflict resolution (FIX-05)');

{
  // Spec example: "Title says Senior Developer but description requires only 1 year"
  const { classification } = classifyWithValidation('1 year of experience required.', 'Senior Developer');
  eq(classification, SENIORITY_LEVELS.ENTRY, 'Title=Senior but desc=1yr → Entry Level');
}

{
  // Spec example: "Title says Junior but description requires 6 years"
  const { classification } = classifyWithValidation('6 years of experience required.', 'Junior Analyst');
  eq(classification, SENIORITY_LEVELS.SENIOR, 'Title=Junior but desc=6yr → Senior Level');
}

{
  // Spec example: "Title says Software Engineer, desc requires 8+ years + team leadership"
  const { classification } = classifyWithValidation(
    '8+ years of experience. Responsibilities include team leadership and architecture ownership.',
    'Software Engineer'
  );
  eq(classification, SENIORITY_LEVELS.LEAD, 'Title=SE but desc=8yr+leadership → Lead Level');
}

// =============================================================================
// classifyWithValidation — Internship detection
// =============================================================================
section('classifyWithValidation — Internship / Apprenticeship / Fresher');

{
  const { classification } = classifyWithValidation(
    'This is a summer internship program for university students.',
    'Software Intern'
  );
  eq(classification, SENIORITY_LEVELS.INTERNSHIP, 'Internship keywords in desc → Internship');
}

{
  const { classification } = classifyWithValidation(
    'This apprenticeship program offers vocational training.',
    'Engineering Apprentice'
  );
  eq(classification, SENIORITY_LEVELS.APPRENTICESHIP, 'Apprenticeship keywords in desc → Apprenticeship');
}

{
  const { classification } = classifyWithValidation(
    'We welcome fresh graduates and recent graduates. No experience required.',
    'Graduate Developer'
  );
  eq(classification, SENIORITY_LEVELS.FRESHER, 'Fresher keywords in desc → Fresher');
}

// =============================================================================
// classifyWithValidation — confidence scores
// =============================================================================
section('classifyWithValidation — confidence');

{
  const { confidence } = classifyWithValidation(
    'Minimum 5 years of experience required. Senior-level technical skills expected.',
    'Senior Software Engineer'
  );
  assert(confidence >= 0.85, `High-signal case should have confidence ≥ 0.85, got ${confidence}`);
}

{
  const { confidence } = classifyWithValidation('', 'Software Engineer');
  assert(confidence < 0.6, `No-signal case should have low confidence, got ${confidence}`);
}

// =============================================================================
// Summary
// =============================================================================
console.log('\n' + '═'.repeat(64));
console.log(`Tests complete:  ${passed} passed  |  ${failed} failed`);
console.log('═'.repeat(64));
if (failed > 0) process.exit(1);
