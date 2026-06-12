'use strict';

const {
  classifyWithValidation,
  extractExperienceDetails,
  SENIORITY_LEVELS,
} = require('../classifier');

/**
 * Experience Intelligence Engine — delegates to the production classifier
 * and surfaces arbitration signals (confidence, conflicts, evidence).
 */
class EngineExperience {
  evaluate(title, responsibilities, qualifications = '') {
    const fullText = `${responsibilities || ''}\n${qualifications || ''}`.trim();
    const validation = classifyWithValidation(fullText, title);
    const expDetails = extractExperienceDetails(fullText);

    const evidence = [
      ...(validation.signals || []),
      ...(validation.reason ? [validation.reason] : []),
    ];

    const hasMultipleRanges = (expDetails.allFound || []).length > 2;
    const hasConflict =
      validation.confidence < 0.75 ||
      (validation.minYears !== null && validation.matchedKeywords?.length > 3);

    return {
      level: validation.experienceLevel,
      years: validation.years,
      minYears: validation.minYears,
      maxYears: validation.maxYears,
      confidence: validation.confidence,
      evidence,
      validation,
      hasConflict,
      hasMultipleRanges,
      experienceFound: validation.experienceFound,
    };
  }
}

module.exports = new EngineExperience();
module.exports.SENIORITY_LEVELS = SENIORITY_LEVELS;
