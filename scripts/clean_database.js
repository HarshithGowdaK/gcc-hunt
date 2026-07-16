const fs = require('fs');
const path = require('path');
const EngineLocation = require('../src/extraction/parser/EngineLocation');
const { classifyWithValidation } = require('./classifier');

const jobsFile = path.join(__dirname, '../web/src/data/jobs.json');
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

console.log(`Original jobs count: ${jobs.length}`);
const cleanJobs = [];
const seenKeys = new Set();
const seenIds = new Set();

for (const j of jobs) {
  // Deduplicate by ID
  if (j.id && seenIds.has(j.id)) {
    continue;
  }

  // Deduplicate by company, title, and normalized location/city
  const comp = (j.companyId || j.companyName || '').toLowerCase().trim();
  const title = (j.title || '').toLowerCase().trim();
  const city = (j.city || j.location || '').toLowerCase().trim();
  const key = `${comp}:${title}:${city}`;
  if (seenKeys.has(key)) {
    continue;
  }

  let isIndia = true;
  
  if (j.companyId === 'jfrog') {
    // Extract location from Greenhouse description header: < Back Senior Customer Retention Account Manager Netanya/Tel Aviv, Israel | Sales Share position
    const match = j.description.match(/<\s*Back\s+[\s\S]*?([^\n|]+)\s*\|\s*/i);
    if (match) {
      let rawLoc = match[1].trim();
      if (rawLoc.toLowerCase().includes(j.title.toLowerCase())) {
        rawLoc = rawLoc.replace(new RegExp(j.title.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i'), '').trim();
      }
      const locRes = EngineLocation.evaluate(j.title, rawLoc, j.description);
      isIndia = locRes.isIndia;
    }
  } else {
    const locRes = EngineLocation.evaluate(j.title, j.location, j.description);
    isIndia = locRes.isIndia;
  }
  
  if (isIndia) {
    // Re-classify experience using the updated rules
    const fullText = `${j.description || ''}\n${j.requirements || ''}\n${j.qualifications || ''}`.trim();
    const validation = classifyWithValidation(fullText, j.title);
    
    j.experienceLevel = validation.career_level;
    j.career_level = validation.career_level;
    j.yearsExperience = validation.years;
    j.yearsExperienceMax = validation.maxYears ?? validation.years;
    j.yearsRequired = validation.minYears !== null
      ? (validation.maxYears !== null ? `${validation.minYears}-${validation.maxYears}` : `${validation.minYears}+`)
      : null;
    
    j.experience_min = validation.minYears;
    j.experience_max = validation.maxYears;
    j.experience_midpoint = validation.midpoint;
    j.experience_text = validation.experience_text;
    j.classification_reason = validation.reason || '';
    j.classification_confidence = validation.confidence;
    j.classification_version = "v3";
    j.warning = validation.warning;
    j.needs_review = !!validation.needs_review;
    j.classification_source = validation.classification_source;

    cleanJobs.push(j);
    if (j.id) seenIds.add(j.id);
    seenKeys.add(key);
  }
}

fs.writeFileSync(jobsFile, JSON.stringify(cleanJobs, null, 2), 'utf8');
console.log(`Successfully cleaned database. Kept ${cleanJobs.length} of ${jobs.length} jobs.`);
