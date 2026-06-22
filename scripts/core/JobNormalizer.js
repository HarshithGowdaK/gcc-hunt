'use strict';

const { generateJobId } = require('./utils');
const JobHelpers = require('./JobHelpers');
const EngineLocation = require('./EngineLocation');

function extractDescriptionSections(fullText) {
  if (!fullText) return { description: '', requirements: '', qualifications: '' };

  const keywords = [
    { key: 'responsibilities', patterns: [/\bresponsibilit(?:ies|y)\b/i, /\bwhat\s+you(?:\'ll|will)\s+do\b/i, /\brole\s+description\b/i, /\bkey\s+responsibilit(?:ies|y)\b/i] },
    { key: 'requirements', patterns: [/\brequirements\b/i, /\bwhat\s+you(?:\'ll|will)\s+need\b/i, /\bwhat\s+we\s+are\s+looking\s+for\b/i, /\brequired\s+skills\b/i, /\bbasic\s+qualifications\b/i] },
    { key: 'qualifications', patterns: [/\bqualifications\b/i, /\bdesired\s+skills\b/i, /\bminimum\s+qualifications\b/i] },
    { key: 'preferredQualifications', patterns: [/\bpreferred\s+qualifications\b/i, /\bnice\s+to\s+have\b/i, /\bpreferred\s+skills\b/i] },
    { key: 'education', patterns: [/\beducation\b/i, /\bdegree\b/i, /\bacademics\b/i] },
    { key: 'experience', patterns: [/\bexperience\b/i, /\bwork\s+experience\b/i, /\bprior\s+experience\b/i] }
  ];

  const matches = [];
  keywords.forEach(item => {
    item.patterns.forEach(pat => {
      let match;
      const re = new RegExp(pat, 'gi');
      while ((match = re.exec(fullText)) !== null) {
        matches.push({
          key: item.key,
          index: match.index,
          length: match[0].length
        });
      }
    });
  });

  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) {
    return {
      description: fullText,
      requirements: '',
      qualifications: ''
    };
  }

  const segments = [];
  let prevIndex = 0;
  let prevKey = 'intro';

  for (const m of matches) {
    segments.push({
      key: prevKey,
      text: fullText.substring(prevIndex, m.index).trim()
    });
    prevIndex = m.index;
    prevKey = m.key;
  }
  segments.push({
    key: prevKey,
    text: fullText.substring(prevIndex).trim()
  });

  const grouped = {
    intro: '',
    responsibilities: '',
    requirements: '',
    qualifications: '',
    preferredQualifications: '',
    education: '',
    experience: ''
  };

  segments.forEach(seg => {
    if (grouped[seg.key]) {
      grouped[seg.key] += '\n' + seg.text;
    } else {
      grouped[seg.key] = seg.text;
    }
  });

  const extractedRequirements = [grouped.requirements, grouped.experience].filter(Boolean).join('\n\n');
  const extractedQualifications = [grouped.qualifications, grouped.preferredQualifications, grouped.education].filter(Boolean).join('\n\n');

  return {
    description: fullText,
    requirements: extractedRequirements || '',
    qualifications: extractedQualifications || ''
  };
}

/**
 * Builds a web-schema job record from pipeline outputs.
 */
function buildJobRecord({
  company,
  job,
  rawText,
  description,
  locScore,
  expResult,
  skills,
  remoteStatus,
  employmentType,
  fingerprints,
  arbitrationMeta = {},
}) {
  const title = job.title || 'Unknown';
  const location = job.location || locScore.resolvedLocation || 'India';
  const normLoc = JobHelpers.normalizeLocation(location) || EngineLocation.normalizeCityState(location);
  const finalDescription = JobHelpers.stripBoilerplateSections(description || rawText || '');
  const applyUrl = job.applyUrl || job.url || '';
  const jobUrl = job.jobUrl || job.url || applyUrl;
  const now = new Date().toISOString();

  const sections = extractDescriptionSections(finalDescription);

  return {
    id: job.id || generateJobId(company.id, title, location, jobUrl, job.reqId || ''),
    companyId: company.id,
    companyName: company.name,
    title,
    description: sections.description,
    requirements: sections.requirements,
    qualifications: sections.qualifications,
    location,
    city: normLoc.city || 'Unknown',
    state: normLoc.state || 'Unknown',
    country: 'India',
    experienceLevel: expResult.career_level || expResult.level || 'Mid Level',
    yearsExperience: expResult.years ?? expResult.minYears,
    yearsExperienceMax: expResult.maxYears ?? expResult.years,
    yearsRequired: expResult.minYears !== undefined && expResult.minYears !== null
      ? (expResult.maxYears !== undefined && expResult.maxYears !== null ? `${expResult.minYears}-${expResult.maxYears}` : `${expResult.minYears}+`)
      : null,
    
    // New fields persisted for Parts 6 & 8
    experience_min: expResult.minYears !== undefined && expResult.minYears !== null ? expResult.minYears : null,
    experience_max: expResult.maxYears !== undefined && expResult.maxYears !== null ? expResult.maxYears : null,
    experience_midpoint: expResult.midpoint !== undefined && expResult.midpoint !== null ? expResult.midpoint : null,
    experience_text: expResult.experience_text || null,
    experience_source: expResult.experience_source || 'job_description',
    experience_extracted_by: expResult.experience_extracted_by || 'regex',
    career_level: expResult.career_level || expResult.level || 'Mid Level',
    classification_reason: expResult.classification_reason || expResult.validation?.reason || '',
    classification_confidence: expResult.classification_confidence !== undefined && expResult.classification_confidence !== null ? expResult.classification_confidence : (expResult.confidence || 0),
    classification_version: "v3",
    warning: expResult.warning || null,
    needs_review: !!expResult.needs_review,
    classification_source: expResult.classification_source || 'experience_regex',

    classificationMeta: {
      ...expResult.validation,
      locationEvidence: locScore.evidence,
      locationConfidence: locScore.confidence,
      arbitration: arbitrationMeta,
    },
    employmentType: employmentType || JobHelpers.detectEmploymentType(title, finalDescription),
    skills: skills || JobHelpers.extractSkills(title, finalDescription),
    applyUrl,
    jobUrl,
    remoteStatus: remoteStatus || JobHelpers.parseRemoteStatus(title, location, finalDescription),
    department: job.department || '',
    team: job.team || job.department || '',
    industry: JobHelpers.classifyIndustry(title, job.department),
    rejectionReason: job.rejectionReason || null,
    fingerprints,
    postedDate: job.postedDate || now,
    dateScraped: now,
    createdAt: now,
    keywords: [],
    isNew: true,
  };
}

module.exports = { buildJobRecord, extractDescriptionSections };
