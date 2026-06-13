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
  if (!job.description && !job._rawText) return { needed: true, reason: 'missing_description' };

  // 1. Location confidence low (ambiguous or "Unknown" locations)
  if (locScore.confidence < 0.85) return { needed: true, reason: 'location_confidence_low' };

  // 2. Experience level conflict (e.g. Associate title with 8 years experience)
  if (expResult.hasConflict) return { needed: true, reason: 'experience_conflict_detected' };

  // 3. Experience confidence low
  if (expResult.confidence < 0.80) return { needed: true, reason: 'experience_confidence_low' };

  // 4. Multiple conflicting experience ranges in the text
  if (expResult.hasMultipleRanges) return { needed: true, reason: 'multiple_experience_ranges' };

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

  const maxAttempts = 3;
  const backoffDelays = [3000, 8000, 15000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
      if (!jsonMatch) {
        console.warn(`[NVIDIA AI] Attempt ${attempt + 1}: Malformed JSON in response`);
        return null;
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.warn(`[NVIDIA AI] Attempt ${attempt + 1}: Failed to parse JSON content: ${parseErr.message}`);
        return null;
      }

      parsed.experienceLevel = normaliseAILevel(parsed.experienceLevel);
      Observability.recordAICall(companyId, true);
      return parsed;
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message || '';
      const code = err.code || '';

      console.warn(`[NVIDIA AI] Attempt ${attempt + 1} failed: Status ${status || 'none'}, Code ${code || 'none'}, Message: ${msg}`);

      if (status === 401 || status === 402 || /quota|billing/i.test(msg)) {
        aiQuotaExceeded = true;
        return null;
      }

      const isRateLimit = status === 429 || /429|rate limit/i.test(msg);
      const isTimeout = /timeout/i.test(msg) || code === 'ECONNABORTED';
      const isConnReset = code === 'ECONNRESET';
      const is503 = status === 503 || /503/i.test(msg);

      const shouldRetry = isRateLimit || isTimeout || isConnReset || is503;

      if (!shouldRetry || attempt === maxAttempts - 1) {
        break;
      }

      const delay = backoffDelays[attempt] || 3000;
      console.log(`[NVIDIA AI] Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
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
      validation: {
        ...validation,
        regexYears: validation.effectiveYears,
        aiYears: null,
        finalYears: validation.effectiveYears,
      },
      aiUsed: false,
      skipReason: CircuitBreakers.isAIDisabled() ? 'ai_circuit_breaker' : 'ai_unavailable',
      confidence: validation.confidence,
      hasConflict: validation.hasConflict,
      classificationSource: validation.classificationSource || 'rule-engine',
    };
  }

  const description = aiParsed.description || rawText;
  const aiValidation = classifyWithValidation(description, title);

  // Extract rule-based values
  const regexMin = validation.minYears;
  const regexMax = validation.maxYears;
  const regexYears = validation.effectiveYears;

  // Extract AI-based values
  const aiMin = aiParsed.minYearsExperience !== undefined ? aiParsed.minYearsExperience : null;
  const aiMax = aiParsed.maxYearsExperience !== undefined ? aiParsed.maxYearsExperience : null;
  let aiYears = null;
  if (aiMin !== null) {
    aiYears = (aiMax !== null && aiMax !== aiMin) ? (aiMin + aiMax) / 2 : aiMin;
  }

  // Calculate final resolved values
  let finalMin = aiMin !== null ? aiMin : regexMin;
  let finalMax = aiMax !== null ? aiMax : regexMax;
  let finalYears = aiYears !== null ? aiYears : regexYears;
  let finalLevel = aiParsed.experienceLevel || validation.experienceLevel;
  let finalConfidence = 0.95;

  if (aiYears !== null && regexYears !== null) {
    // Both found: check for large discrepancy (>3 years)
    if (Math.abs(aiYears - regexYears) > 3) {
      // Discrepancy > 3 years: use the larger evidence source (more conservative/senior)
      finalYears = Math.max(regexYears, aiYears);
      finalMin = finalYears === regexYears ? regexMin : aiMin;
      finalMax = finalYears === regexYears ? regexMax : aiMax;
      finalConfidence = Math.max(0.1, validation.confidence - 0.3); // Decrease confidence by 0.3
    }
  }

  // Fallback map for finalLevel in case it is null
  if (!finalLevel) {
    if (finalYears !== null) {
      if (finalYears <= 2) finalLevel = SENIORITY_LEVELS.ENTRY;
      else if (finalYears <= 7) finalLevel = SENIORITY_LEVELS.MID;
      else if (finalYears <= 11) finalLevel = SENIORITY_LEVELS.SENIOR;
      else if (finalYears <= 14) finalLevel = SENIORITY_LEVELS.LEAD;
      else finalLevel = SENIORITY_LEVELS.EXECUTIVE;
    } else {
      finalLevel = SENIORITY_LEVELS.MID;
    }
  }

  return {
    description,
    skills: aiParsed.skills || JobHelpers.extractSkills(title, description),
    level: finalLevel,
    years: finalYears,
    minYears: finalMin,
    maxYears: finalMax,
    effectiveYears: finalYears,
    remoteStatus: aiParsed.remoteStatus || JobHelpers.parseRemoteStatus(title, aiParsed.location, description),
    employmentType: aiParsed.employmentType || JobHelpers.detectEmploymentType(title, description),
    location: aiParsed.location,
    validation: {
      ...(aiYears !== null ? aiValidation : validation),
      regexYears,
      aiYears,
      finalYears,
    },
    aiUsed: true,
    skipReason: null,
    confidence: finalConfidence,
    hasConflict: aiYears !== null && regexYears !== null && Math.abs(aiYears - regexYears) > 3,
    classificationSource: 'ai-arbitrator',
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
