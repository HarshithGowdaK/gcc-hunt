'use strict';

const OpenAI = require('openai');
const { classifyWithValidation } = require('../classifier');
const JobHelpers = require('./JobHelpers');

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const Observability = require('./Observability');

async function runLLMExtraction(description, title, companyId, maxCalls) {
  const metrics = Observability.getCompanyMetrics(companyId);
  const currentCalls = metrics.aiCalls || 0;

  if (currentCalls >= maxCalls) {
    console.log(`[LLM Fallback] Cap reached (${maxCalls}) for company ${companyId}. Skipping LLM call.`);
    return null;
  }

  console.log(`[LLM Fallback] Call ${currentCalls + 1}/${maxCalls} for: "${title}"`);

  const cleanText = String(description || '').substring(0, 10000);
  const promptContent = `Analyze this job posting and extract the required years of experience.
Title: ${title}
Job Description:
${cleanText}

Determine the minimum and maximum years of experience required for this role.
If the description contains general phrases like "several years of experience" or "early career", estimate the years (e.g. several years -> 5 years, early career -> 2 years).
Output strictly valid JSON with no extra text or markdown formatting:
{
  "experience_min": 3,
  "experience_max": 5,
  "experience_text": "3-5 years",
  "reason": "Extracted '3-5 years' from..."
}
If no experience requirement is mentioned or can be estimated, return null for the values.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "meta/llama-3.1-70b-instruct",
      messages: [{ role: "user", content: promptContent }],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 512,
    });

    const content = completion.choices[0]?.message?.content || '';
    const jsonMatch = content.replace(/```json/gi, '').replace(/```/g, '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[LLM Fallback] Failed to parse JSON match from content: "${content}"`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0].trim());
    return parsed;
  } catch (err) {
    console.error(`[LLM Fallback] API error: ${err.message}`);
    return null;
  }
}

class ArbitrationAI {
  async arbitrate(job, locScore, expResult, companyId, rawText) {
    const title = job.title || 'Unknown';
    const description = rawText || job.description || '';

    const regexFailed = expResult.minYears === null;
    const titleConfidenceLow = (expResult.classification_confidence || expResult.confidence || 0) < 0.50;
    const descriptionAvailable = description.length > 500;
    const lowerDesc = description.toLowerCase();
    const hasReqKeywords = lowerDesc.includes('requirement') ||
                           lowerDesc.includes('qualification') ||
                           lowerDesc.includes('experience') ||
                           lowerDesc.includes('skills') ||
                           lowerDesc.includes('year') ||
                           lowerDesc.includes('eligible');
    const hasAmbiguousExperienceHint = /\b(several|multiple|extensive|progressive|relevant|prior|professional)\s+years?\b|\byears?\s+of\s+(?:relevant|professional|related)\s+experience\b/i.test(lowerDesc);
    const seniorTitleNeedsReview = /\b(senior|staff|principal|lead|architect|manager|director)\b/i.test(title) &&
      descriptionAvailable &&
      hasReqKeywords;

    const metrics = Observability.getCompanyMetrics(companyId);
    const jobsDiscovered = metrics.jobsDiscovered || 0;
    const maxCalls = Math.min(100, Math.max(1, Math.ceil(jobsDiscovered * 0.05)));
    const currentCalls = metrics.aiCalls || 0;

    const shouldUseAI = (
      (regexFailed && titleConfidenceLow && descriptionAvailable && hasReqKeywords && hasAmbiguousExperienceHint) ||
      seniorTitleNeedsReview
    ) && currentCalls < maxCalls;

    if (shouldUseAI) {
      const llmParsed = await runLLMExtraction(description, title, companyId, maxCalls);
      if (llmParsed && llmParsed.experience_min !== undefined && llmParsed.experience_min !== null) {
        const min = llmParsed.experience_min;
        const max = llmParsed.experience_max !== undefined ? llmParsed.experience_max : null;
        const text = llmParsed.experience_text || `${min}${max ? '-' + max : '+'} years`;

        // Re-run classification using LLM-extracted values
        const regexRes = classifyWithValidation(text + '\n' + description, title);

        return {
          description,
          skills: JobHelpers.extractSkills(title, description),
          level: regexRes.career_level,
          years: min,
          minYears: min,
          maxYears: max,
          midpoint: min !== null && max !== null ? (min + max) / 2 : min,
          experience_text: text,
          career_level: regexRes.career_level,
          classification_confidence: 0.85,
          classification_source: 'experience_llm',
          experience_source: 'job_description',
          experience_extracted_by: 'llm',
          classification_reason: llmParsed.reason || `LLM extracted '${text}'`,
          warning: regexRes.warning || null,
          needs_review: !!regexRes.needs_review,
          aiUsed: true
        };
      }
    }

    // Default return with standard regex results (which fallback to title_fallback if minYears is null)
    return {
      description,
      skills: JobHelpers.extractSkills(title, description),
      level: expResult.career_level || expResult.level,
      years: expResult.years,
      minYears: expResult.minYears,
      maxYears: expResult.maxYears,
      midpoint: expResult.midpoint,
      experience_text: expResult.experience_text,
      career_level: expResult.career_level || expResult.level,
      classification_confidence: expResult.classification_confidence || expResult.confidence || 0.40,
      classification_source: expResult.classification_source || 'experience_regex',
      experience_source: 'job_description',
      experience_extracted_by: 'regex',
      classification_reason: expResult.classification_reason || expResult.validation?.reason || '',
      warning: expResult.warning || null,
      needs_review: !!expResult.needs_review,
      aiUsed: false,
      skipReason: seniorTitleNeedsReview
        ? 'ai_skipped_budget_or_no_extraction'
        : (regexFailed ? 'ai_skipped_no_ambiguous_experience_hint' : 'regex_years_found')
    };
  }

  async runAIWorker(payload) {
    // Kept to satisfy worker routing if needed
    return null;
  }
}

module.exports = new ArbitrationAI();
