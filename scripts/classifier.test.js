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
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
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
  const { classification } = classifyWithValidation('2-4 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '2-4 years (midpoint 3) → Mid Level');
}

{
  const { classification } = classifyWithValidation('3-5 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '3-5 years (midpoint 4) → Mid Level');
}

{
  const { classification } = classifyWithValidation('5-8 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '5-8 years (midpoint 7) → Mid Level');
}

{
  const { classification } = classifyWithValidation('8-10 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.SENIOR, '8-10 years (midpoint 9) → Senior Level');
}

{
  const { classification } = classifyWithValidation('12+ years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.LEAD, '12+ years → Lead / Management');
}

{
  const { classification } = classifyWithValidation('15+ years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.EXECUTIVE, '15+ years → Executive Leadership');
}

// =============================================================================
section('classifyWithValidation — experience dominates titles (with conflicts)');

{
  const { classification, hasConflict } = classifyWithValidation(
    '8 years of experience required.',
    'Associate Software Engineer'
  );
  eq(classification, SENIORITY_LEVELS.SENIOR, 'Associate Software Engineer + 8 years → Senior Level');
  eq(hasConflict, true, 'Associate Software Engineer + 8 years hasConflict → true');
}

{
  const { classification, hasConflict } = classifyWithValidation(
    '4 years of experience required.',
    'Senior Software Engineer'
  );
  eq(classification, SENIORITY_LEVELS.MID, 'Senior Engineer + 4 years → Mid Level');
  eq(hasConflict, true, 'Senior Engineer + 4 years hasConflict → true');
}

{
  const { classification, hasConflict } = classifyWithValidation(
    '5 years of experience required.',
    'Lead Engineer'
  );
  eq(classification, SENIORITY_LEVELS.MID, 'Lead Engineer + 5 years → Mid Level');
  eq(hasConflict, true, 'Lead Engineer + 5 years hasConflict → true');
}

{
  const { classification, hasConflict } = classifyWithValidation(
    '8-10 years of experience required.',
    'Principal Engineer'
  );
  eq(classification, SENIORITY_LEVELS.SENIOR, 'Principal Engineer + 8-10 years → Senior Level');
  eq(hasConflict, false, 'Principal Engineer + 8-10 years hasConflict → false');
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
    'Looking for graduate trainees to join our technical team.',
    'Software Engineer'
  );
  eq(classification, SENIORITY_LEVELS.INTERNSHIP, 'Graduate trainee keyword → Internship / Apprenticeship');
}

console.log('\n' + '═'.repeat(64));
console.log(`Tests complete:  ${passed} passed  |  ${failed} failed`);
console.log('═'.repeat(64));
if (failed > 0) process.exit(1);
