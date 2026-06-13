'use strict';

/**
 * GCC Job Classification Engine — Weighted Evidence Model
 *
 * Pipeline:
 *   1. Internship / Apprenticeship detection (hard stop)
 *   2. Extract experience years (min + max from ranges)
 *   3. Score seniority signals from title + full description
 *   4. Apply experience weighting (dominates title keywords)
 *   5. GCC override rules for misleading titles
 *   6. Description-based seniority phrases
 *   7. Resolve winner + confidence
 */

const SENIORITY_LEVELS = {
  INTERNSHIP  : 'Internship / Apprenticeship',
  ENTRY       : 'Entry Level',
  MID         : 'Mid Level',
  SENIOR      : 'Senior Level',
  LEAD        : 'Lead / Management',
  EXECUTIVE   : 'Executive Leadership',
};

const LEVEL_KEYS = {
  [SENIORITY_LEVELS.INTERNSHIP]  : 'entry',
  [SENIORITY_LEVELS.ENTRY]       : 'entry',
  [SENIORITY_LEVELS.MID]         : 'mid',
  [SENIORITY_LEVELS.SENIOR]      : 'senior',
  [SENIORITY_LEVELS.LEAD]        : 'lead',
  [SENIORITY_LEVELS.EXECUTIVE]   : 'executive',
};

const EMPTY_RESULT = Object.freeze({
  minYears: null,
  maxYears: null,
  effectiveYears: null,
  allFound: [],
  rawMatches: [],
});

const KEY_TO_LEVEL = {
  entry    : SENIORITY_LEVELS.ENTRY,
  mid      : SENIORITY_LEVELS.MID,
  senior   : SENIORITY_LEVELS.SENIOR,
  lead     : SENIORITY_LEVELS.LEAD,
  executive: SENIORITY_LEVELS.EXECUTIVE,
};

// ─── STEP 1: Internship / Apprenticeship ─────────────────────────────────────

const INTERNSHIP_PATTERNS = [
  /\binterns?\b/i,
  /\binternships?\b/i,
  /\bapprentices?\b/i,
  /\bapprenticeships?\b/i,
  /\bco-?ops?\b/i,
  /\bcoops?\b/i,
  /\bstudent programs?\b/i,
  /\bgraduate trainees?\b/i,
  /\bmanagement trainees?\b/i,
];

function detectInternship(fullText) {
  if (!fullText) return false;
  for (let i = 0; i < INTERNSHIP_PATTERNS.length; i++) {
    if (INTERNSHIP_PATTERNS[i].test(fullText)) return true;
  }
  return false;
}

// ─── STEP 2: Experience extraction ───────────────────────────────────────────

function isValidYears(n) {
  return !isNaN(n) && n >= 0 && n <= 40;
}

/**
 * Extracts primary experience requirement from job text.
 * Returns { minYears, maxYears, allFound, rawMatches }
 */
function extractExperienceDetails(description) {
  if (!description) return EMPTY_RESULT;
  const text = String(description).toLowerCase();

  const subRoleRe = /\d+\s*(?:year|yr)s?\s*(?:of\s*)?(?:experience|exp)?\s*as\b[^,.\n;]*/gi;
  const cleanedText = text.replace(subRoleRe, match => ' '.repeat(match.length));

  const candidates = [];
  const ranges = [];
  let m;

  const rangeRe = /(\d+)\s*(?:-|to)\s*(\d+)\s*years?/gi;
  while ((m = rangeRe.exec(cleanedText)) !== null) {
    const low = parseInt(m[1], 10);
    const high = parseInt(m[2], 10);
    if (isValidYears(low) && isValidYears(high)) {
      ranges.push({ min: low, max: high, raw: m[0] });
      candidates.push({ value: low, raw: m[0] });
      candidates.push({ value: high, raw: m[0] });
    }
  }

  const plusRe = /(\d+)\+\s*years?/gi;
  while ((m = plusRe.exec(cleanedText)) !== null) {
    const v = parseInt(m[1], 10);
    if (isValidYears(v)) candidates.push({ value: v, raw: m[0] });
  }

  const minRe = /(?:minimum|at\s*least|requires?)\s*(?:of\s+)?(\d+)\s*years?/gi;
  while ((m = minRe.exec(cleanedText)) !== null) {
    const v = parseInt(m[1], 10);
    if (isValidYears(v)) candidates.push({ value: v, raw: m[0] });
  }

  const yrsExpRe = /(\d+)\s*years?\s*(?:of\s*)?experience/gi;
  while ((m = yrsExpRe.exec(cleanedText)) !== null) {
    const v = parseInt(m[1], 10);
    if (isValidYears(v)) candidates.push({ value: v, raw: m[0] });
  }

  const yrsWordsExpRe = /(\d+)\s*years?(?:\s+(?!experience\b)\w+){1,4}\s+experience\b/gi;
  while ((m = yrsWordsExpRe.exec(cleanedText)) !== null) {
    const v = parseInt(m[1], 10);
    if (isValidYears(v)) candidates.push({ value: v, raw: m[0] });
  }

  const expOfRe = /experience\s*(?:of\s*)?(\d+)\+?\s*years?/gi;
  while ((m = expOfRe.exec(cleanedText)) !== null) {
    const v = parseInt(m[1], 10);
    if (isValidYears(v)) candidates.push({ value: v, raw: m[0] });
  }

  if (candidates.length === 0) {
    return EMPTY_RESULT;
  }

  const allValues = candidates.map(c => c.value);
  let primaryMin;
  let primaryMax;

  if (ranges.length > 0) {
    primaryMin = Math.min(...ranges.map(r => r.min));
    primaryMax = Math.max(...ranges.map(r => r.max));
  } else {
    const peak = Math.max(...allValues);
    primaryMin = peak;
    primaryMax = null;
  }

  let effectiveYears = null;
  if (primaryMax !== null && primaryMin !== null && primaryMax !== primaryMin) {
    effectiveYears = (primaryMin + primaryMax) / 2;
  } else if (primaryMin !== null) {
    effectiveYears = primaryMin;
  }

  return {
    minYears  : primaryMin,
    maxYears  : primaryMax,
    effectiveYears: effectiveYears,
    allFound  : allValues,
    rawMatches: [...new Set(candidates.map(c => c.raw))],
  };
}

// ─── Signal scanners ───────────────────────────────────────────────────────────

const ENTRY_SIGNALS = [
  /\bgraduate\b/i, /\bcampus\b/i, /\bfresher\b/i, /\brecent graduate\b/i,
  /\bentry[\s-]?level\b/i, /\bearly career\b/i, /\bjunior\b/i, /\bassociate\b/i,
  /\btrainee\b/i,
];

const MID_SIGNALS = [
  /\bengineer\b/i, /\bdeveloper\b/i, /\banalyst\b/i, /\bconsultant\b/i,
  /\bspecialist\b/i, /\badministrator\b/i,
];

const SENIOR_SIGNALS = [
  /\bsenior\b/i, /\bstaff\b/i, /\bprincipal\b/i, /\bexpert\b/i,
  /\badvanced\b/i, /\btechnical lead\b/i,
];

const LEAD_SIGNALS = [
  /\blead\b/i, /\bmanager\b/i, /\bdirector\b/i, /\barchitect\b/i,
  /\bhead\b/i, /\bvp\b/i, /\bvice president\b/i, /\bchief\b/i,
];

const EXECUTIVE_SIGNALS = [
  /\bceo\b/i, /\bcto\b/i, /\bcfo\b/i, /\bcmo\b/i, /\bcio\b/i,
  /\bpresident\b/i, /\bexecutive director\b/i, /\bmanaging director\b/i,
  /\bsvp\b/i, /\bevp\b/i,
];

const DESC_SENIORITY_PHRASES = [
  { re: /\blead cross[\s-]?functional teams?\b/i, key: 'lead', pts: 15, label: 'lead cross-functional teams' },
  { re: /\bmentor(?:ing)? junior engineers?\b/i, key: 'senior', pts: 10, label: 'mentor junior engineers' },
  { re: /\bwork under supervision\b/i, key: 'entry', pts: 10, label: 'work under supervision' },
  { re: /\bindependently design systems?\b/i, key: 'senior', pts: 10, label: 'independent ownership' },
  { re: /\bteam leadership\b/i, key: 'lead', pts: 15, label: 'team leadership' },
  { re: /\barchitecture ownership\b/i, key: 'lead', pts: 15, label: 'architecture ownership' },
];

function hasMatch(text, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(text)) return patterns[i];
  }
  return null;
}

function applySignalMatches(text, patterns, key, points, score, signals) {
  const match = hasMatch(text, patterns);
  if (!match) return;

  score[key] += points;
  signals.push(match.source.replace(/\\b/g, '').replace(/\\/g, ''));
}

function applyExperienceWeighting(minYears, maxYears, score, signals) {
  if (minYears === null) return;

  const yearsLabel = maxYears !== null && maxYears !== minYears
    ? `${minYears}-${maxYears} years`
    : `${minYears}+ years`;

  if (minYears <= 2) {
    score.entry += 100;
    signals.push(`required experience ${yearsLabel}`);
  } else if (minYears <= 7) {
    score.mid += 100;
    signals.push(`required experience ${yearsLabel}`);
  } else if (minYears <= 11) {
    score.senior += 100;
    signals.push(`required experience ${yearsLabel}`);
  } else if (minYears >= 12) {
    score.lead += 100;
    signals.push(`required experience ${yearsLabel}`);
  }
}

function applyGccOverrides(titleText, minYears, maxYears) {
  if (!titleText) return null;
  const title = titleText;

  if (/associate\s+software\s+engineer/i.test(title) && minYears !== null && minYears >= 5) {
    return { level: SENIORITY_LEVELS.MID, reason: 'GCC override: Associate Software Engineer with 5+ years → Mid Level', signals: ['associate title + 5+ years experience'] };
  }

  if (/senior\s+software\s+engineer/i.test(title) && minYears !== null && minYears >= 3 && minYears <= 6) {
    return { level: SENIORITY_LEVELS.MID, reason: 'GCC override: Senior Software Engineer with 3-6 years → Mid Level', signals: ['senior title + mid-range experience'] };
  }

  if (/\blead\s+engineer\b/i.test(title) && minYears !== null && minYears <= 6) {
    return { level: SENIORITY_LEVELS.MID, reason: 'GCC override: Lead Engineer with ≤6 years → Mid Level', signals: ['lead title + experience requirement wins'] };
  }

  if (/principal\s+engineer/i.test(title) && minYears !== null && minYears >= 8 && minYears <= 10) {
    return { level: SENIORITY_LEVELS.SENIOR, reason: 'GCC override: Principal Engineer with 8-10 years → Senior Level', signals: ['principal title + senior-range experience'] };
  }

  if (EXECUTIVE_SIGNALS.some(re => re.test(title)) && minYears !== null && minYears >= 15) {
    return { level: SENIORITY_LEVELS.EXECUTIVE, reason: 'Executive title with 15+ years → Executive Leadership', signals: ['executive title + senior experience'] };
  }

  return null;
}

function scoreToLevel(score) {
  const entries = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [winnerKey, winnerScore] = entries[0];
  const runnerUpScore = entries[1]?.[1] ?? 0;
  const total = entries.reduce((s, [, v]) => s + v, 0);

  let confidence;
  if (total === 0 || winnerScore < 20) {
    confidence = winnerScore >= 100 ? 85 : 40;
  } else {
    const margin = winnerScore - runnerUpScore;
    confidence = Math.round(Math.min(99, 50 + (margin / Math.max(total, 1)) * 50));
    if (winnerScore >= 100) confidence = Math.max(confidence, 85);
  }

  return {
    level      : KEY_TO_LEVEL[winnerKey] || SENIORITY_LEVELS.MID,
    confidence,
    score,
    winnerKey,
  };
}

function levelToDefaultYears(level) {
  const map = {
    [SENIORITY_LEVELS.INTERNSHIP] : 0,
    [SENIORITY_LEVELS.ENTRY]      : 1,
    [SENIORITY_LEVELS.MID]        : 4,
    [SENIORITY_LEVELS.SENIOR]     : 9,
    [SENIORITY_LEVELS.LEAD]       : 12,
    [SENIORITY_LEVELS.EXECUTIVE]  : 18,
  };
  return map[level] ?? 4;
}

/**
 * Primary classification — weighted evidence model.
 * Scans title + full description together.
 */
function classifyWithValidation(description, title) {
  const descText  = String(description || '').toLowerCase();
  const titleText = String(title || '').toLowerCase();

  if (!descText && !titleText) {
    return {
      classification: SENIORITY_LEVELS.MID,
      experienceLevel: SENIORITY_LEVELS.MID,
      confidence: 0.4,
      confidencePercent: 40,
      experienceFound: null,
      minYears: null,
      maxYears: null,
      effectiveYears: null,
      allExperienceFound: [],
      matchedKeywords: [],
      signals: [],
      reason: 'No text supplied.',
      years: 4,
      score: null,
      hasConflict: false,
      classificationSource: 'rule-engine'
    };
  }

  const fullText = titleText + '\n' + descText;

  // STEP 1: Internship / Apprenticeship — highest priority, hard stop
  if (detectInternship(fullText)) {
    const matched = [];
    for (let i = 0; i < INTERNSHIP_PATTERNS.length; i++) {
      if (INTERNSHIP_PATTERNS[i].test(fullText)) {
        matched.push(INTERNSHIP_PATTERNS[i].source);
      }
    }
    return {
      classification    : SENIORITY_LEVELS.INTERNSHIP,
      experienceLevel   : SENIORITY_LEVELS.INTERNSHIP,
      confidence        : 1.0,
      confidencePercent : 100,
      experienceFound   : '0 years',
      minYears          : 0,
      maxYears          : 0,
      effectiveYears    : 0,
      allExperienceFound: [],
      matchedKeywords   : matched,
      signals           : ['internship/apprenticeship detected'],
      reason            : 'Internship or apprenticeship indicators found — classification stopped.',
      years             : 0,
      score             : null,
      hasConflict       : false,
      evidenceSource    : 'job_description',
      classificationSource: 'rule-engine'
    };
  }

  // STEP 2: Extract experience from full page text
  const { minYears, maxYears, allFound, rawMatches } = extractExperienceDetails(fullText);
  const experienceFound = minYears !== null
    ? (maxYears !== null && maxYears !== minYears
      ? `${minYears}-${maxYears} years`
      : `${minYears} year${minYears !== 1 ? 's' : ''}`)
    : null;

  // STEP 3: Deterministic experience dominance (Years of experience overrides title)
  if (minYears !== null) {
    const effectiveYears = maxYears !== null && maxYears !== minYears
      ? (minYears + maxYears) / 2
      : minYears;

    let finalLevel = SENIORITY_LEVELS.MID;
    if (effectiveYears <= 2) {
      finalLevel = SENIORITY_LEVELS.ENTRY;
    } else if (effectiveYears <= 7) {
      finalLevel = SENIORITY_LEVELS.MID;
    } else if (effectiveYears <= 11) {
      finalLevel = SENIORITY_LEVELS.SENIOR;
    } else if (effectiveYears <= 14) {
      finalLevel = SENIORITY_LEVELS.LEAD;
    } else {
      finalLevel = SENIORITY_LEVELS.EXECUTIVE;
    }

    // CONFLICT DETECTION
    let titleLevel = null;
    if (EXECUTIVE_SIGNALS.some(re => re.test(titleText))) {
      titleLevel = SENIORITY_LEVELS.EXECUTIVE;
    } else if (LEAD_SIGNALS.some(re => re.test(titleText))) {
      titleLevel = SENIORITY_LEVELS.LEAD;
    } else if (SENIOR_SIGNALS.some(re => re.test(titleText))) {
      titleLevel = SENIORITY_LEVELS.SENIOR;
    } else if (ENTRY_SIGNALS.some(re => re.test(titleText))) {
      titleLevel = SENIORITY_LEVELS.ENTRY;
    } else if (MID_SIGNALS.some(re => re.test(titleText))) {
      titleLevel = SENIORITY_LEVELS.MID;
    }

    const hasConflict = titleLevel !== null && titleLevel !== finalLevel;

    return {
      classification    : finalLevel,
      experienceLevel   : finalLevel,
      confidence        : 0.98,
      confidencePercent : 98,
      experienceFound,
      minYears,
      maxYears,
      effectiveYears,
      allExperienceFound: rawMatches,
      matchedKeywords   : titleLevel ? [titleLevel] : [],
      signals           : [`required experience ${experienceFound}`],
      reason            : `Experience requirement (${experienceFound}) overrides title signals.`,
      years             : effectiveYears,
      score             : null,
      hasConflict,
      evidenceSource    : 'job_description',
      classificationSource: 'rule-engine'
    };
  }

  // STEP 4: Fallback to keyword scoring (if no years found)
  const signals = [];
  const score = { entry: 0, mid: 0, senior: 0, lead: 0, executive: 0 };

  applySignalMatches(fullText, ENTRY_SIGNALS, 'entry', 10, score, signals);
  applySignalMatches(fullText, MID_SIGNALS, 'mid', 5, score, signals);
  applySignalMatches(fullText, SENIOR_SIGNALS, 'senior', 15, score, signals);
  applySignalMatches(fullText, LEAD_SIGNALS, 'lead', 20, score, signals);
  applySignalMatches(fullText, EXECUTIVE_SIGNALS, 'executive', 25, score, signals);

  for (let i = 0; i < DESC_SENIORITY_PHRASES.length; i++) {
    const phrase = DESC_SENIORITY_PHRASES[i];
    if (phrase.re.test(fullText)) {
      score[phrase.key] += phrase.pts;
      signals.push(phrase.label);
    }
  }

  const { level, confidence, score: finalScore } = scoreToLevel(score);
  const yearsNumeric = levelToDefaultYears(level);

  let reason;
  let evidenceSrc = 'title';
  let finalClassification = level;
  if (finalScore[LEVEL_KEYS[level]] > 0) {
    reason = `Seniority signals in title/description → ${level}.`;
  } else {
    reason = 'No strong signal found. Level left undefined.';
    finalClassification = null;
    evidenceSrc = 'none';
  }

  return {
    classification    : finalClassification,
    experienceLevel   : finalClassification,
    confidence        : Math.round(confidence) / 100,
    confidencePercent : confidence,
    experienceFound   : null,
    minYears          : null,
    maxYears          : null,
    effectiveYears    : null,
    allExperienceFound: [],
    matchedKeywords   : [...new Set(signals)],
    signals,
    reason,
    years             : finalClassification ? yearsNumeric : null,
    score             : finalScore,
    hasConflict       : false,
    evidenceSource    : evidenceSrc,
    classificationSource: 'rule-engine'
  };
}

function extractExperience(description, title) {
  const v = classifyWithValidation(description, title);
  return { years: v.years, level: v.classification };
}

function normaliseAILevel(raw) {
  if (!raw) return SENIORITY_LEVELS.MID;
  const s = String(raw).trim().toLowerCase();

  if (s.includes('intern') || s.includes('apprentice') || s.includes('co-op') || s.includes('coop')) {
    return SENIORITY_LEVELS.INTERNSHIP;
  }
  if (s.includes('executive') || s.includes('director') && s.includes('chief')) {
    return SENIORITY_LEVELS.EXECUTIVE;
  }
  if (s.includes('entry') || s.includes('fresher') || s.includes('fresh') || s.includes('junior')) {
    return SENIORITY_LEVELS.ENTRY;
  }
  if (s.includes('mid')) return SENIORITY_LEVELS.MID;
  if (s.includes('senior') || s.includes('principal') || s.includes('staff')) {
    return SENIORITY_LEVELS.SENIOR;
  }
  if (s.includes('lead') || s.includes('manager') || s.includes('head of')) {
    return SENIORITY_LEVELS.LEAD;
  }
  return SENIORITY_LEVELS.MID;
}

module.exports = {
  SENIORITY_LEVELS,
  extractExperienceDetails,
  extractExperience,
  classifyWithValidation,
  normaliseAILevel,
  detectInternship,
};
