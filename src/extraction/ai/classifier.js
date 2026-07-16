'use strict';

const SENIORITY_LEVELS = {
  INTERNSHIP: 'Internship',
  FRESHER: 'Fresher',
  ENTRY: 'Entry Level',
  ASSOCIATE: 'Associate',
  MID: 'Mid',
  MID_SENIOR: 'Mid',
  SENIOR: 'Senior',
  LEAD: 'Lead',
  PRINCIPAL: 'Principal',
};

const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20
};

function parseWordOrNum(s) {
  if (!s) return null;
  const clean = s.trim().toLowerCase();
  if (WORD_TO_NUM[clean] !== undefined) return WORD_TO_NUM[clean];
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? null : parsed;
}

function normalizeYearsCandidate(candidate) {
  if (!candidate || candidate.min === null || candidate.min === undefined || candidate.max !== null) {
    return candidate;
  }

  // Some scraped pages collapse "3-8 years" into "38 years"; repair obvious two-digit ranges.
  if (candidate.min >= 30 && candidate.min <= 99) {
    const digits = String(candidate.min);
    const low = Number(digits[0]);
    const high = Number(digits[1]);
    if (low > 0 && high > low) {
      return {
        ...candidate,
        min: low,
        max: high,
        text: candidate.text.replace(String(candidate.min), `${low}-${high}`),
      };
    }
  }

  return candidate;
}

function extractExperienceDetails(text) {
  if (!text) return { minYears: null, maxYears: null, experience_text: null };
  const lowerText = String(text)
    .toLowerCase()
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*\(\s*(\d+)\s*\)/gi, '$2')
    .replace(/\b(\d+)\s*\(\s*(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*\)/gi, '$1');

  const subRoleRe = /\d+\s*(?:year|yr)s?\s*(?:of\s*)?(?:experience|exp)?\s*as\b[^,.\n;]*/gi;
  const cleanedText = lowerText.replace(subRoleRe, match => ' '.repeat(match.length));

  const patterns = [
    {
      re: /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:-|to)\s*(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:years?|yrs?)\b/gi,
      parse: (m) => ({ min: parseWordOrNum(m[1]), max: parseWordOrNum(m[2]), text: m[0] })
    },
    {
      re: /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\+\s*(?:years?|yrs?)\b/gi,
      parse: (m) => ({ min: parseWordOrNum(m[1]), max: null, text: m[0] })
    },
    {
      re: /\b(?:minimum|at\s*least|requires?|min)\s*(?:of\s+)?(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:years?|yrs?)\b/gi,
      parse: (m) => ({ min: parseWordOrNum(m[1]), max: null, text: m[0] })
    },
    {
      re: /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:years?|yrs?)\s*(?:of\s*)?experience\b/gi,
      parse: (m) => ({ min: parseWordOrNum(m[1]), max: null, text: m[0] })
    }
  ];

  const candidates = [];
  for (const pat of patterns) {
    let match;
    const re = new RegExp(pat.re);
    while ((match = re.exec(cleanedText)) !== null) {
      const parsedMatch = pat.parse(match);
      if (parsedMatch.min !== null) {
        candidates.push(normalizeYearsCandidate(parsedMatch));
      }
    }
  }

  if (candidates.length === 0) {
    return { minYears: null, maxYears: null, experience_text: null };
  }

  const rangeCandidate = candidates.find(c => c.max !== null);
  const selected = rangeCandidate || candidates[0];

  return {
    minYears: selected.min,
    maxYears: selected.max,
    experience_text: selected.text
  };
}

const INTERNSHIP_PATTERNS = [
  /\bintern\b/i,
  /\binternship\b/i,
  /\bsummer intern\b/i,
  /\bwinter intern\b/i,
  /\bstudent intern\b/i,
  /\bgraduate intern\b/i,
  /\bapprentice\b/i,
  /\bapprenticeship\b/i,
  /\bgraduate apprentice\b/i,
  /\bengineering apprentice\b/i,
  /\btrade apprentice\b/i,
  /\bco-?op\b/i,
  /\bindustrial trainee\b/i,
];

function detectInternship(fullText) {
  if (!fullText) return false;
  for (let i = 0; i < INTERNSHIP_PATTERNS.length; i++) {
    if (INTERNSHIP_PATTERNS[i].test(fullText)) return true;
  }
  return false;
}

function mapYearsToLevel(min, max, isInternshipMatch) {
  if (isInternshipMatch) return SENIORITY_LEVELS.INTERNSHIP;

  if (min === null || min === undefined) return SENIORITY_LEVELS.MID;

  // Recommended mapping
  // 0-1   -> Fresher
  // 1-2   -> Entry
  // 2-5   -> Associate
  // 5-8   -> Mid
  // 8-12  -> Senior
  // 12+   -> Lead / Principal
  if (min === 0) return SENIORITY_LEVELS.FRESHER;
  if (min === 1) return SENIORITY_LEVELS.ENTRY;
  if (min <= 4) return SENIORITY_LEVELS.ASSOCIATE;
  if (min <= 7) return SENIORITY_LEVELS.MID;
  if (min <= 11) return SENIORITY_LEVELS.SENIOR;
  if (min <= 14) return SENIORITY_LEVELS.LEAD;
  return SENIORITY_LEVELS.PRINCIPAL;
}

function checkTitleConflict(title, career_level) {
  const t = String(title || '').toLowerCase();
  const isSeniorTitle = /\b(senior|lead|staff|principal|architect|manager|director)\b/i.test(t);
  const isJuniorTitle = /\b(junior|trainee|graduate|apprentice)\b/i.test(t);
  const isInternTitle = /\bintern\b/i.test(t);

  if (isSeniorTitle && [SENIORITY_LEVELS.INTERNSHIP, SENIORITY_LEVELS.FRESHER, SENIORITY_LEVELS.ENTRY, SENIORITY_LEVELS.ASSOCIATE].includes(career_level)) {
    return true;
  }
  if (isInternTitle && career_level !== SENIORITY_LEVELS.INTERNSHIP) {
    return true;
  }
  if (isJuniorTitle && ![SENIORITY_LEVELS.INTERNSHIP, SENIORITY_LEVELS.FRESHER, SENIORITY_LEVELS.ENTRY].includes(career_level)) {
    return true;
  }
  return false;
}

function classifyWithValidation(description, title) {
  const descText = String(description || '').toLowerCase();
  const titleText = String(title || '').toLowerCase();

  const isInternTitle = detectInternship(titleText);
  let isIntern = isInternTitle;

  const priorInternshipPatterns = [
    /\b(?:prior|previous|past|completed)?\s*(?:internship|intern|co-?op|apprentice|apprenticeship)s?\s*(?:experience|exp)?s?\s*(?:is|will\s+be|would\s+be)?\s*(?:also\s+)?(?:preferred|plus|a\s+plus|required|valued|taken\s+in(?:to)?\s+consideration|counts?|considered|acceptable|desirable|beneficial)\b/gi,
    /\b(?:experience|exp)\s*(?:including|gained\s*during|from|in)?\s*(?:internships?|co-?ops?|apprenticeships?)\b/gi,
    /\b(?:or|\/)\s*(?:internship|co-?op|apprentice|apprenticeship)\s*(?:experience|exp)?\b/gi,
    /\b(?:internship|intern|co-?op|apprentice|apprenticeship)s?\s*(?:experience|exp)?s?\s*(?:are|will\s+be|can\s+be)?\s*(?:also\s+)?(?:eligible|considered|valued|preferred)\b/gi,
    /\b(?:candidates|applicants|students)\s*(?:with|having|who\s+have)\s*(?:prior|previous|past|completed)?\s*(?:internship|intern|co-?op|apprentice|apprenticeship)s?\s*(?:experience|exp)?s?\b/gi
  ];

  let priorInternshipConsidered = false;
  for (const pattern of priorInternshipPatterns) {
    if (pattern.test(descText)) {
      priorInternshipConsidered = true;
    }
  }

  if (!isIntern) {
    // Clean out references to prior internship/apprentice experience in description before checking
    let cleanedDesc = descText;
    for (const pattern of priorInternshipPatterns) {
      cleanedDesc = cleanedDesc.replace(pattern, '');
    }

    if (detectInternship(cleanedDesc)) {
      isIntern = true;
    }
  }

  const descExperience = extractExperienceDetails(descText);
  const titleExperience = descExperience.minYears === null ? extractExperienceDetails(titleText) : { minYears: null, maxYears: null, experience_text: null };
  const { minYears, maxYears, experience_text } = descExperience.minYears !== null ? descExperience : titleExperience;

  // Safeguard: if minYears >= 1 and title is not internship-related, it is not an internship
  if (isIntern && !isInternTitle && minYears !== null && minYears >= 1) {
    isIntern = false;
  }

  let career_level = mapYearsToLevel(minYears, maxYears, isIntern);
  let confidence = 0.95;
  let warning = null;
  let needs_review = false;
  let classification_source = 'experience_regex';

  if (minYears === null) {
    classification_source = 'title_fallback';
    confidence = 0.40;
    
    let score = 0;
    if (/\bintern(ship)?|apprentice(ship)?|co-?op\b/i.test(titleText)) score += 100;
    if (/\blead\b/i.test(titleText)) score += 90;
    if (/\bprincipal\b/i.test(titleText)) score += 80;
    if (/\bmanager\b/i.test(titleText)) score += 50;
    if (/\bsenior\b/i.test(titleText)) score += 40;
    if (/\bassociate\b/i.test(titleText)) score += 20;
    if (/\b(fresher|graduate|trainee|junior|entry)\b/i.test(titleText)) score += 10;

    if (score >= 100 || isIntern) {
      career_level = SENIORITY_LEVELS.INTERNSHIP;
      confidence = 0.95;
    } else if (score >= 80) {
      career_level = SENIORITY_LEVELS.PRINCIPAL;
      confidence = 0.65;
    } else if (score >= 50) {
      career_level = SENIORITY_LEVELS.LEAD;
      confidence = 0.65;
    } else if (score >= 40) {
      career_level = SENIORITY_LEVELS.SENIOR;
      confidence = 0.60;
    } else if (score >= 20) {
      career_level = SENIORITY_LEVELS.ASSOCIATE;
      confidence = 0.50;
    } else if (score >= 10) {
      career_level = /\b(fresher|graduate)\b/i.test(titleText) ? SENIORITY_LEVELS.FRESHER : SENIORITY_LEVELS.ENTRY;
      confidence = 0.60;
    } else if (priorInternshipConsidered) {
      career_level = SENIORITY_LEVELS.FRESHER;
      confidence = 0.85;
      classification_source = 'prior_internship_heuristic';
    } else {
      career_level = SENIORITY_LEVELS.MID;
    }
  } else {
    // If minYears was found but title strongly implies higher level, bump the level (combine title + regex)
    let score = 0;
    if (/\blead\b/i.test(titleText)) score += 90;
    if (/\bprincipal\b/i.test(titleText)) score += 80;
    if (/\bsenior\b/i.test(titleText)) score += 40;
    
    // Penalize modifier titles that shouldn't auto-bump to Senior
    if (/\b(associate|analyst)\b/i.test(titleText)) score -= 40;

    if (score >= 80 && minYears >= 5) {
      career_level = SENIORITY_LEVELS.PRINCIPAL;
    } else if (score >= 90 && minYears >= 4) {
      career_level = SENIORITY_LEVELS.LEAD;
    } else if (score >= 40 && minYears >= 3 && career_level !== SENIORITY_LEVELS.LEAD && career_level !== SENIORITY_LEVELS.PRINCIPAL) {
      career_level = SENIORITY_LEVELS.SENIOR;
    }
  }

  // Validate title conflict
  if (minYears !== null && checkTitleConflict(titleText, career_level)) {
    warning = 'Title conflicts with extracted experience';
    needs_review = true;
    confidence = 0.45;
  }

  const midpoint = minYears !== null && maxYears !== null ? (minYears + maxYears) / 2 : minYears;

  return {
    classification: career_level,
    career_level,
    confidence,
    classification_confidence: confidence,
    experience_min: minYears,
    experience_max: maxYears,
    experience_midpoint: midpoint,
    experience_text,
    warning,
    needs_review,
    classification_source,
    reason: warning ? `${warning}. Derived '${career_level}' from years.` : `Derived '${career_level}' from experience requirement.`,
    minYears,
    maxYears,
    midpoint,
    years: minYears !== null ? minYears : (career_level === SENIORITY_LEVELS.SENIOR ? 7 : (career_level === SENIORITY_LEVELS.LEAD ? 10 : (career_level === SENIORITY_LEVELS.PRINCIPAL ? 15 : 4)))
  };
}

module.exports = {
  SENIORITY_LEVELS,
  extractExperienceDetails,
  classifyWithValidation,
  detectInternship,
  mapYearsToLevel
};
