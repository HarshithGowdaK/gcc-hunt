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

    const computeEffectiveYears = (min, max) => {
      if (min === null && max === null) return null;
      if (min !== null && max !== null) return Math.round((min + max) / 2);
      return min !== null ? min : max;
    };
    
    const safeEffectiveYears = computeEffectiveYears(
      validation.minYears !== undefined ? validation.minYears : expDetails.minYears,
      validation.maxYears !== undefined ? validation.maxYears : expDetails.maxYears
    );

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
      years: validation.years || safeEffectiveYears,
      effectiveYears: safeEffectiveYears,
      minYears: validation.minYears !== undefined ? validation.minYears : expDetails.minYears,
      maxYears: validation.maxYears !== undefined ? validation.maxYears : expDetails.maxYears,
      confidence: validation.confidence,
      evidence,
      validation,
      hasConflict,
      hasMultipleRanges,
      experienceFound: validation.experienceFound,
      evidenceSource: validation.evidenceSource || 'none',
      classificationSource: validation.classificationSource || 'rule-engine',
    };
  }
}

module.exports = new EngineExperience();
module.exports.SENIORITY_LEVELS = SENIORITY_LEVELS;
