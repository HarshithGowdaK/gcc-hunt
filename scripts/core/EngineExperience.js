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

    const evidence = [
      ...(validation.reason ? [validation.reason] : []),
    ];

    return {
      level: validation.career_level,
      career_level: validation.career_level,
      years: validation.years,
      minYears: validation.minYears,
      maxYears: validation.maxYears,
      midpoint: validation.experience_midpoint,
      experience_text: validation.experience_text,
      confidence: validation.classification_confidence,
      classification_confidence: validation.classification_confidence,
      classification_source: validation.classification_source,
      warning: validation.warning,
      needs_review: validation.needs_review,
      evidence,
      validation,
      hasConflict: !!validation.needs_review,
      hasMultipleRanges: false,
      experienceFound: validation.experience_text || null,
    };
  }
}

module.exports = new EngineExperience();
module.exports.SENIORITY_LEVELS = SENIORITY_LEVELS;
