'use strict';

const { generateJobId } = require('./utils');
const JobHelpers = require('./JobHelpers');
const EngineLocation = require('./EngineLocation');

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
  const finalDescription = description || rawText || '';
  const applyUrl = job.applyUrl || job.url || '';
  const jobUrl = job.jobUrl || job.url || applyUrl;
  const now = new Date().toISOString();

  return {
    id: job.id || generateJobId(company.id, title, location, jobUrl, job.reqId || ''),
    companyId: company.id,
    companyName: company.name,
    title,
    description: finalDescription,
    location,
    city: normLoc.city || 'Unknown',
    state: normLoc.state || 'Unknown',
    country: 'India',
    experienceLevel: expResult.level,
    minYears: expResult.minYears !== undefined ? expResult.minYears : null,
    maxYears: expResult.maxYears !== undefined ? expResult.maxYears : null,
    effectiveYears: expResult.effectiveYears !== undefined ? expResult.effectiveYears : null,
    confidence: expResult.confidence || 0.98,
    hasConflict: expResult.hasConflict || false,
    classificationSource: expResult.classificationSource || 'rule-engine',
    yearsExperience: expResult.minYears !== undefined ? expResult.minYears : null,
    yearsExperienceMax: expResult.maxYears !== undefined ? expResult.maxYears : null,
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
    industry: JobHelpers.classifyIndustry(title, job.department),
    fingerprints,
    postedDate: job.postedDate || now,
    dateScraped: now,
    createdAt: now,
    keywords: [],
  };
}

module.exports = { buildJobRecord };
