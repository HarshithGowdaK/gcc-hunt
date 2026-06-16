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
  eq(classification, SENIORITY_LEVELS.ASSOCIATE, '2 years → Associate');
}

{
  const { classification } = classifyWithValidation('3 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.ASSOCIATE, '3 years → Associate');
}

{
  const { classification } = classifyWithValidation('5 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '5 years → Mid');
}

{
  const { classification } = classifyWithValidation('7 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '7 years → Mid (5-8 bracket)');
}

{
  const { classification } = classifyWithValidation('8 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.SENIOR, '8 years → Senior');
}

{
  const { classification } = classifyWithValidation('12 years of experience required', 'Architect');
  eq(classification, SENIORITY_LEVELS.LEAD, '12 years → Lead');
}

// =============================================================================
section('classifyWithValidation — custom range mappings');

{
  const { classification } = classifyWithValidation('2-4 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.ASSOCIATE, '2-4 years → Associate');
}

{
  const { classification } = classifyWithValidation('3-5 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.ASSOCIATE, '3-5 years → Associate by minimum years');
}

{
  const { classification } = classifyWithValidation('5+ years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '5+ years → Mid');
}

{
  const { classification } = classifyWithValidation('8+ years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.SENIOR, '8+ years → Senior');
}

{
  const { classification } = classifyWithValidation('12+ years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.LEAD, '12+ years → Lead');
}

{
  const { classification } = classifyWithValidation('0-1 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.FRESHER, '0-1 years → Fresher');
}

{
  const { classification } = classifyWithValidation('0-2 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.FRESHER, '0-2 years → Fresher');
}

{
  const { classification } = classifyWithValidation('1-3 years of experience required', 'Developer');
  eq(classification, SENIORITY_LEVELS.ENTRY, '1-3 years → Entry Level');
}

// =============================================================================
section('classifyWithValidation — title vs description conflicts');

{
  const { classification, warning, needs_review, confidence } = classifyWithValidation('2-4 years of experience required.', 'Senior Developer');
  eq(classification, SENIORITY_LEVELS.ASSOCIATE, 'Title=Senior but desc=2-4yr → Associate');
  eq(warning, 'Title conflicts with extracted experience', 'Warning generated');
  eq(needs_review, true, 'Needs review set');
  eq(confidence, 0.45, 'Confidence downgraded to 0.45');
}

{
  const { classification } = classifyWithValidation('6 years of experience required.', 'Junior Analyst');
  eq(classification, SENIORITY_LEVELS.MID, 'Title=Junior but desc=6yr → Mid');
}

{
  const { classification } = classifyWithValidation('Found range 8-12 years of experience.', 'Engineer');
  eq(classification, SENIORITY_LEVELS.SENIOR, '8-12 years → Senior, not Principal');
}

{
  const { classification, minYears } = classifyWithValidation('Minimum four (4) years of HR Technology experience.', 'Workday Analyst');
  eq(minYears, 4, 'Minimum four (4) years → minYears 4');
  eq(classification, SENIORITY_LEVELS.ASSOCIATE, 'Minimum four (4) years → Associate');
}

{
  const { classification } = classifyWithValidation('5 years of relevant experience.', 'Developer');
  eq(classification, SENIORITY_LEVELS.MID, '5 years → Mid, not Associate');
}

{
  const { classification, minYears, maxYears } = classifyWithValidation('Required Skills: 38 years of experience in HCM systems.', 'Implementation Consultant');
  eq(minYears, 3, 'Collapsed "38 years" → minYears 3');
  eq(maxYears, 8, 'Collapsed "38 years" → maxYears 8');
  eq(classification, SENIORITY_LEVELS.ASSOCIATE, 'Collapsed "3-8 years" maps by minimum years');
}

{
  const { classification, classification_source } = classifyWithValidation('', 'Assistant Marketing Manager');
  eq(classification, SENIORITY_LEVELS.MID, 'Manager title alone → Mid fallback');
  eq(classification_source, 'title_fallback', 'Title fallback source is explicit');
}

{
  const { classification } = classifyWithValidation('', 'Data Architect');
  eq(classification, SENIORITY_LEVELS.MID, 'Architect title alone → Mid fallback');
}

// =============================================================================
section('classifyWithValidation — Internship detection');

{
  const { classification, confidence } = classifyWithValidation(
    'This is a summer internship program for university students.',
    'Software Intern'
  );
  eq(classification, SENIORITY_LEVELS.INTERNSHIP, 'Internship keywords → Internship');
  eq(confidence, 0.95, 'Internship confidence = 0.95');
}

{
  const { classification } = classifyWithValidation(
    'This apprenticeship program offers vocational training.',
    'Engineering Apprentice'
  );
  eq(classification, SENIORITY_LEVELS.INTERNSHIP, 'Apprenticeship keywords → Internship');
}

{
  const { classification } = classifyWithValidation(
    'We require a Software Engineer. Prior internship experience is preferred. 1-2 years experience.',
    'Software Engineer'
  );
  eq(classification, SENIORITY_LEVELS.ENTRY, 'Prior internship experience mentioned but 1-2yr required → Entry Level');
}

{
  const { classification } = classifyWithValidation(
    'Any internship experience is also taken in consideration. No other requirements.',
    'Associate QA Engineer'
  );
  eq(classification, SENIORITY_LEVELS.FRESHER, 'Internship experience taken in consideration fallback → Fresher');
}

{
  const { classification } = classifyWithValidation(
    'We welcome fresh graduates. No experience required.',
    'Graduate Developer'
  );
  eq(classification, SENIORITY_LEVELS.FRESHER, 'Fresh graduate + no experience → Fresher');
}

console.log('\n' + '═'.repeat(64));
console.log(`Tests complete:  ${passed} passed  |  ${failed} failed`);
console.log('═'.repeat(64));
if (failed > 0) process.exit(1);
