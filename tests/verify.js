const { isValidJobCandidate } = require('../scripts/core/JobHelpers');
const { classifyWithValidation, extractExperienceDetails } = require('../scripts/classifier');

console.log('--- JobHelpers Validation ---');
console.log('India:', isValidJobCandidate('India')); // false
console.log('Skip to main content:', isValidJobCandidate('Skip to main content')); // false
console.log('Software Engineer:', isValidJobCandidate('Software Engineer')); // true
console.log('Sales:', isValidJobCandidate('Sales')); // false
console.log('VP Engineering:', isValidJobCandidate('VP Engineering')); // true

console.log('\n--- Classifier Experience ---');
const desc1 = "Looking for a software engineer with 3-5 years of experience.";
console.log('3-5 years:', extractExperienceDetails(desc1).effectiveYears); // 4

const desc2 = "Need a principal engineer with 12+ years experience.";
const cl2 = classifyWithValidation(desc2, "Principal Engineer");
console.log('12+ years Level:', cl2.experienceLevel); // Principal

const desc3 = "Junior developer with 0-1 years of experience.";
const cl3 = classifyWithValidation(desc3, "Junior Developer");
console.log('0-1 years Level:', cl3.experienceLevel); // Entry Level

console.log('All tests finished.');
