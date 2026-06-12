'use strict';
/**
 * classifier.test.js
 * Run with: node scripts/classifier.test.js
 */

const {
  classifyWithValidation,
  extractExperienceDetails,
  SENIORITY_LEVELS,
} = require('./classifier');

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
section('extractExperienceDetails — sub-role exclusion');

{
  const text = 'A minimum of 4 years prior relevant experience and atleast 1 year experience as Team Lead';
  const { minYears } = extractExperienceDetails(text);
  eq(minYears, 4, 'Carrier case: minimum 4 years + 1 year as TL → min 4');
}

{
  const text = 'Requires 6 years of experience. At least 2 years experience as senior developer.';
  const { minYears } = extractExperienceDetails(text);
  eq(minYears, 6, '"6 years overall + 2 years as senior dev" → primary 6');
}

section('extractExperienceDetails — ranges');

{
  const { minYears, maxYears } = extractExperienceDetails('3-5 years of experience required');
  eq(minYears, 3, 'Range "3-5 years" → minYears = 3');
  eq(maxYears, 5, 'Range "3-5 years" → maxYears = 5');
}

{
  const { minYears } = extractExperienceDetails('8+ years experience');
  eq(minYears, 8, '"8+ years" → 8');
}

{
  const { minYears } = extractExperienceDetails('No prior experience needed');
  eq(minYears, null, 'No numeric experience → null');
}

// =============================================================================
section('classifyWithValidation — experience boundaries');

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
  const { classification } = classifyWithValidation('5 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '5 years → Mid Level');
}

{
  const { classification } = classifyWithValidation('7 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '7 years → Mid Level');
}

{
  const { classification } = classifyWithValidation('8 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.SENIOR, '8 years → Senior Level');
}

{
  const { classification } = classifyWithValidation('12 years of experience required', 'Architect');
  eq(classification, SENIORITY_LEVELS.LEAD, '12 years → Lead / Management');
}

// =============================================================================
section('classifyWithValidation — GCC override rules');

{
  const { classification } = classifyWithValidation(
    'Required Experience: 5-8 years. Strong software engineering fundamentals.',
    'Associate Software Engineer'
  );
  eq(classification, SENIORITY_LEVELS.MID, 'Associate SE + 5-8 years → Mid Level (NOT Entry)');
}

{
  const { classification } = classifyWithValidation(
    'Minimum 4 years of experience required.',
    'Senior Software Engineer'
  );
  eq(classification, SENIORITY_LEVELS.MID, 'Senior SE + 4 years → Mid Level');
}

{
  const { classification } = classifyWithValidation(
    '6 years of experience required.',
    'Lead Engineer'
  );
  eq(classification, SENIORITY_LEVELS.MID, 'Lead Engineer + 6 years → Mid Level');
}

{
  const { classification } = classifyWithValidation(
    '8-10 years of experience required.',
    'Principal Engineer'
  );
  eq(classification, SENIORITY_LEVELS.SENIOR, 'Principal Engineer + 8-10 years → Senior Level');
}

// =============================================================================
section('classifyWithValidation — title vs description conflicts');

{
  const { classification } = classifyWithValidation('1 year of experience required.', 'Senior Developer');
  eq(classification, SENIORITY_LEVELS.ENTRY, 'Title=Senior but desc=1yr → Entry Level');
}

{
  const { classification } = classifyWithValidation('6 years of experience required.', 'Junior Analyst');
  eq(classification, SENIORITY_LEVELS.MID, 'Title=Junior but desc=6yr → Mid Level');
}

{
  const { classification } = classifyWithValidation(
    '8+ years of experience. Ability to lead cross-functional teams.',
    'Software Engineer'
  );
  eq(classification, SENIORITY_LEVELS.SENIOR, 'Title=SE but desc=8yr+leadership → Senior Level');
}

// =============================================================================
section('classifyWithValidation — Internship detection');

{
  const { classification, confidencePercent } = classifyWithValidation(
    'This is a summer internship program for university students.',
    'Software Intern'
  );
  eq(classification, SENIORITY_LEVELS.INTERNSHIP, 'Internship keywords → Internship / Apprenticeship');
  eq(confidencePercent, 100, 'Internship confidence = 100');
}

{
  const { classification } = classifyWithValidation(
    'This apprenticeship program offers vocational training.',
    'Engineering Apprentice'
  );
  eq(classification, SENIORITY_LEVELS.INTERNSHIP, 'Apprenticeship keywords → Internship / Apprenticeship');
}

{
  const { classification } = classifyWithValidation(
    'We welcome fresh graduates. No experience required.',
    'Graduate Developer'
  );
  eq(classification, SENIORITY_LEVELS.ENTRY, 'Fresh graduate + no experience → Entry Level');
}

// =============================================================================
section('classifyWithValidation — confidence & signals');

{
  const result = classifyWithValidation(
    'Minimum 5 years of experience required. Independently design systems.',
    'Associate Software Engineer'
  );
  assert(result.confidence >= 0.85, `High-signal case confidence ≥ 0.85, got ${result.confidence}`);
  assert(result.signals && result.signals.length > 0, 'Should include classification signals');
  assert(result.minYears === 5, `minYears should be 5, got ${result.minYears}`);
}

{
  const { confidence } = classifyWithValidation('', 'Software Engineer');
  assert(confidence < 0.6, `No-signal case should have low confidence, got ${confidence}`);
}

// =============================================================================
section('classifyWithValidation — BUG-A reproduction');

{
  const desc = 'A minimum of 4 years prior relevant experience and atleast 1 year experience as Team Lead.';
  const { classification, years } = classifyWithValidation(desc, 'Senior Engineer');
  eq(classification, SENIORITY_LEVELS.MID, 'Carrier "Senior Engineer" (4yr req) → Mid Level');
  assert(years === 4, `years reported as 4, got ${years}`);
}

console.log('\n' + '═'.repeat(64));
console.log(`Tests complete:  ${passed} passed  |  ${failed} failed`);
console.log('═'.repeat(64));
if (failed > 0) process.exit(1);
