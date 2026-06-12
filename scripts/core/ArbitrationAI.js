'use strict';

const axios = require('axios');
const CircuitBreakers = require('./CircuitBreakers');
const Queues = require('./Queues');
const Observability = require('./Observability');
const {
  classifyWithValidation,
  normaliseAILevel,
  extractExperienceDetails,
} = require('../classifier');
const JobHelpers = require('./JobHelpers');

let aiQuotaExceeded = false;

function needsArbitration(job, locScore, expResult) {
  if (locScore.confidence < 0.95) return { needed: true, reason: 'location_confidence_low' };
  if (!job.description && !job._rawText) return { needed: true, reason: 'missing_description' };

  // If years are found deterministically, do NOT run AI unless there are multiple conflicting ranges
  if (expResult.minYears !== null) {
    if (expResult.hasMultipleRanges) {
      return { needed: true, reason: 'multiple_experience_ranges' };
    }
    return { needed: false, reason: 'deterministic_rules_sufficient' };
  }

  // If no years found, check if keyword classification has low confidence
  if (expResult.confidence < 0.75) return { needed: true, reason: 'experience_confidence_low' };

  return { needed: false, reason: 'high_confidence_rules' };
}

async function parseJobWithAI(text, jobTitle, jobLocation, companyId) {
  if (aiQuotaExceeded || !process.env.NVIDIA_API_KEY) return null;

  const cleanText = String(text || '').substring(0, 15000);
  const promptContent = `Analyze this GCC job posting and extract structured details.
Title: ${jobTitle}
Location: ${jobLocation}

Job Description:
${cleanText}

Output strictly as JSON (no markdown):
{
  "description": "Complete job description",
  "skills": ["skill1"],
  "minYearsExperience": 3,
  "maxYearsExperience": 5,
  "experienceLevel": "Mid Level",
  "remoteStatus": "Unknown",
  "employmentType": "Full-time",
  "location": "Bangalore, India"
}

experienceLevel — EXACTLY one of:
"Internship / Apprenticeship", "Entry Level", "Mid Level", "Senior Level", "Lead / Management", "Executive Leadership"

Experience years OVERRIDE misleading titles.
remoteStatus: Remote | Hybrid | Onsite | Unknown`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        {
          model: 'meta/llama-3.3-70b-instruct',
          messages: [{ role: 'user', content: promptContent }],
          max_tokens: 1024,
          temperature: 0.2,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
          },
          timeout: 20000,
        }
      );

      const content = response.data?.choices?.[0]?.message?.content || '';
      const jsonMatch = content.replace(/```json/gi, '').replace(/```/g, '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      parsed.experienceLevel = normaliseAILevel(parsed.experienceLevel);
      Observability.recordAICall(companyId, true);
      return parsed;
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message || '';
      if (status === 401 || status === 402 || /quota|billing/i.test(msg)) {
        aiQuotaExceeded = true;
        return null;
      }
      if (attempt === 1) break;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

function mergeAIWithRules(aiParsed, rawText, title) {
  const validation = classifyWithValidation(rawText, title);

  if (!aiParsed) {
    return {
      description: rawText,
      skills: JobHelpers.extractSkills(title, rawText),
      level: validation.experienceLevel,
      years: validation.years,
      minYears: validation.minYears,
      maxYears: validation.maxYears,
      effectiveYears: validation.effectiveYears,
      remoteStatus: JobHelpers.parseRemoteStatus(title, '', rawText),
      employmentType: JobHelpers.detectEmploymentType(title, rawText),
      validation,
      aiUsed: false,
      skipReason: CircuitBreakers.isAIDisabled() ? 'ai_circuit_breaker' : 'ai_unavailable',
      confidence: validation.confidence,
      hasConflict: validation.hasConflict,
      classificationSource: validation.classificationSource || 'rule-engine',
    };
  }

  const description = aiParsed.description || rawText;
  const aiValidation = classifyWithValidation(description, title);
  const useRules = validation.confidence >= 0.85 || validation.experienceFound;

  const level = useRules ? validation.experienceLevel : (aiParsed.experienceLevel || aiValidation.experienceLevel);
  const minYears = useRules ? validation.minYears : (aiParsed.minYearsExperience ?? aiValidation.minYears);
  const maxYears = useRules ? validation.maxYears : (aiParsed.maxYearsExperience ?? aiValidation.maxYears);
  const effectiveYears = (minYears !== null && maxYears !== null)
    ? Math.round((minYears + maxYears) / 2)
    : minYears;

  return {
    description,
    skills: aiParsed.skills || JobHelpers.extractSkills(title, description),
    level,
    years: effectiveYears ?? (useRules ? validation.years : (aiParsed.minYearsExperience ?? aiValidation.years)),
    minYears,
    maxYears,
    effectiveYears,
    remoteStatus: aiParsed.remoteStatus || JobHelpers.parseRemoteStatus(title, aiParsed.location, description),
    employmentType: aiParsed.employmentType || JobHelpers.detectEmploymentType(title, description),
    location: aiParsed.location,
    validation: useRules ? validation : aiValidation,
    aiUsed: true,
    skipReason: null,
    confidence: useRules ? validation.confidence : 0.95,
    hasConflict: useRules ? validation.hasConflict : false,
    classificationSource: useRules ? (validation.classificationSource || 'rule-engine') : 'ai-arbitrator',
  };
}

class ArbitrationAI {
  async arbitrate(job, locScore, expResult, companyId, rawText) {
    const arbitrationCheck = needsArbitration(job, locScore, expResult);

    if (!arbitrationCheck.needed) {
      Observability.recordAISkipped(companyId, arbitrationCheck.reason);
      return {
        ...mergeAIWithRules(null, rawText, job.title),
        arbitrationReason: arbitrationCheck.reason,
      };
    }

    if (CircuitBreakers.isAIDisabled()) {
      return {
        ...mergeAIWithRules(null, rawText, job.title),
        arbitrationReason: 'ai_circuit_breaker_active',
      };
    }

    try {
      const aiJob = { ...job, description: rawText };
      const aiResult = await Queues.aiQueue.enqueue({
        job: aiJob,
        rawText,
        locScore,
        expResult,
        companyId,
      });

      if (aiResult) {
        CircuitBreakers.recordAISuccess();
        return aiResult;
      }

      CircuitBreakers.recordAIFailure();
      return {
        ...mergeAIWithRules(null, rawText, job.title),
        arbitrationReason: 'ai_returned_empty',
      };
    } catch (err) {
      console.warn(`[ArbitrationAI] Failed for "${job.title}": ${err.message}`);
      CircuitBreakers.recordAIFailure();
      return {
        ...mergeAIWithRules(null, rawText, job.title),
        arbitrationReason: `ai_error: ${err.message}`,
      };
    }
  }

  async runAIWorker(payload) {
    const { job, rawText, companyId } = payload;
    const aiParsed = await parseJobWithAI(rawText, job.title, job.location, companyId);
    return mergeAIWithRules(aiParsed, rawText, job.title);
  }
}

module.exports = new ArbitrationAI();
