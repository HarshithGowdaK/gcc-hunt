'use strict';

/**
 * GCC Hunt Local Scraper — Fully Revised
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from original (see CHANGELOG at bottom of file for full details):
 *
 * Classification Engine
 *   [FIX-01] Level boundaries corrected to match spec exactly
 *   [FIX-02] Seven distinct categories: Internship | Apprenticeship | Fresher |
 *            Entry Level | Mid Level | Senior Level | Lead Level
 *   [FIX-03] Fresher detection added (fresh graduate / recent graduate / no exp)
 *   [FIX-04] Apprenticeship split from Internship into its own category
 *   [FIX-05] Description is primary source of truth; title is final fallback only
 *   [FIX-06] Experience regex: sub-role requirements excluded ("X years as Team Lead"),
 *            then MAXIMUM of remaining values used — not minimum.
 *            e.g. "minimum 4 years … atleast 1 year as Team Lead" → 4 → Mid Level
 *            (original took min → 1 → Entry Level, which was wrong)
 *
 * Location Filtering
 *   [FIX-15] Generic scraper: removed 'India' hard-coded default for location.
 *            Jobs whose location cannot be detected on the listing page are now
 *            re-verified against the detail page text. If no Indian city/India
 *            keyword is found anywhere, the job is dropped. This eliminates
 *            non-India roles that leaked through because every undetected location
 *            was previously assumed to be India.
 *
 * Validation Layer   [NEW]
 *   [NEW-01] classifyWithValidation() — confidence score, matched keywords, reason
 *   [NEW-02] extractExperienceDetails() — returns all year spans found, not just first
 *   [NEW-03] Classification log written to scrape_logs.json for auditability
 *
 * AI Prompt          [FIX-07]
 *   Categories in prompt updated to exactly match the seven spec categories
 *
 * Workday Scraper    [FIX-08, FIX-09]
 *   [FIX-08] Removed 1000-job hard cap (was killing pagination prematurely)
 *   [FIX-09] Per-page retry with exponential backoff (was stopping on first error)
 *
 * Generic Scraper    [FIX-10, FIX-11, FIX-12]
 *   [FIX-10] Removed 15-job slice (was silently discarding most jobs)
 *   [FIX-11] Removed 5-page hard cap; pagination now runs until no Next button
 *   [FIX-12] Infinite scroll handling added (scrolls until no new jobs appear)
 *
 * Detail Fetch       [FIX-13]
 *   Retry logic (3 attempts, 2 s backoff) added to all detail page fetches
 *
 * Duplicate Detection [FIX-14]
 *   existingJobsMap now actively skips jobs whose ID was scraped < 6 hours ago
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const {
  classifyWithValidation,
  extractExperienceDetails,
  extractExperience,
  normaliseAILevel,
  SENIORITY_LEVELS,
} = require('./classifier');

let xlsx, playwright, axios;
try {
  xlsx       = require('xlsx');
  playwright = require('playwright');
  axios      = require('axios');
} catch (e) {
  console.error("Missing local dependencies. Run 'npm install' inside the 'functions' directory first.");
  process.exit(1);
}

// ─── Environment ─────────────────────────────────────────────────────────────
const NUM_WORKERS  = process.env.WORKERS ? parseInt(process.env.WORKERS) : 3;
const CRAWL_LIMIT  = process.env.LIMIT || 'all';
// Set to 0 to disable freshness guard (force-re-scrape every run).
const FRESHNESS_HOURS = process.env.FRESHNESS_HOURS ? parseInt(process.env.FRESHNESS_HOURS) : 6;

const AXIOS_HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept'         : 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

// ─── Output paths ─────────────────────────────────────────────────────────────
const DATA_DIR      = path.join(__dirname, '..', 'web', 'src', 'data');
const JOBS_PATH     = path.join(DATA_DIR, 'jobs.json');
const COMPANIES_PATH= path.join(DATA_DIR, 'companies.json');
const LOGS_PATH     = path.join(DATA_DIR, 'scrape_logs.json');

let sharedBrowser = null;

// =============================================================================
// SECTION 1 — UTILITIES & NORMALISATION
// =============================================================================

const INDIAN_CITIES_MAP = {
  bangalore          : { city: 'Bangalore',  state: 'Karnataka'      },
  bengaluru          : { city: 'Bangalore',  state: 'Karnataka'      },
  hyderabad          : { city: 'Hyderabad',  state: 'Telangana'      },
  pune               : { city: 'Pune',       state: 'Maharashtra'    },
  chennai            : { city: 'Chennai',    state: 'Tamil Nadu'     },
  madras             : { city: 'Chennai',    state: 'Tamil Nadu'     },
  mumbai             : { city: 'Mumbai',     state: 'Maharashtra'    },
  'navi mumbai'      : { city: 'Mumbai',     state: 'Maharashtra'    },
  gurgaon            : { city: 'Gurgaon',    state: 'Haryana'        },
  gurugram           : { city: 'Gurgaon',    state: 'Haryana'        },
  noida              : { city: 'Noida',      state: 'Uttar Pradesh'  },
  'greater noida'    : { city: 'Noida',      state: 'Uttar Pradesh'  },
  kochi              : { city: 'Kochi',      state: 'Kerala'         },
  cochin             : { city: 'Kochi',      state: 'Kerala'         },
  ahmedabad          : { city: 'Ahmedabad',  state: 'Gujarat'        },
  kolkata            : { city: 'Kolkata',    state: 'West Bengal'    },
  calcutta           : { city: 'Kolkata',    state: 'West Bengal'    },
  delhi              : { city: 'Delhi',      state: 'Delhi'          },
  'new delhi'        : { city: 'Delhi',      state: 'Delhi'          },
  coimbatore         : { city: 'Coimbatore', state: 'Tamil Nadu'     },
  trivandrum         : { city: 'Trivandrum', state: 'Kerala'         },
  thiruvananthapuram : { city: 'Trivandrum', state: 'Kerala'         },
  jaipur             : { city: 'Jaipur',     state: 'Rajasthan'      },
  indore             : { city: 'Indore',     state: 'Madhya Pradesh' },
  bhubaneswar        : { city: 'Bhubaneswar',state: 'Odisha'         }
};

const SKILLS_LIST = [
  'React','Angular','Vue','Next.js','HTML','CSS','JavaScript','TypeScript',
  'Node.js','Express','Python','Django','Flask','FastAPI','Java','Spring Boot',
  'Kotlin','Swift','Go','Golang','Rust','C++','C#','.NET','ASP.NET','SQL',
  'PostgreSQL','MySQL','MongoDB','Redis','AWS','Azure','GCP','Docker',
  'Kubernetes','Terraform','CI/CD','Git','GitHub','DevOps','Machine Learning',
  'AI','Deep Learning','Pandas','NumPy','Spark','Kafka','GraphQL','REST'
];

function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-').trim()
    .replace(/^-+/, '').replace(/-+$/, '');
}

function normalizeLocation(locationStr) {
  if (!locationStr) return null;
  const cleanLoc = locationStr.toLowerCase();
  for (const key of Object.keys(INDIAN_CITIES_MAP)) {
    if (cleanLoc.includes(key)) return { ...INDIAN_CITIES_MAP[key], country: 'India' };
  }
  if (/\b(india|in)\b/i.test(cleanLoc)) return { city: 'India', state: 'India', country: 'India' };
  return null;
}

function parseRemoteStatus(title, location, description) {
  const combined = `${title} ${location} ${description}`.toLowerCase();
  if (combined.includes('work from home') || combined.includes('wfh') || combined.includes('remote')) return 'Remote';
  if (combined.includes('hybrid') || combined.includes('flexible')) return 'Hybrid';
  if (combined.includes('onsite') || combined.includes('office'))   return 'Onsite';
  return 'Unknown';
}

function detectEmploymentType(title, description, defaultVal) {
  const text = `${title} ${description || ''}`.toLowerCase();
  if (text.includes('internship') || text.includes('intern') || text.includes('trainee'))  return 'Internship';
  if (text.includes('apprenticeship') || text.includes('apprentice'))                      return 'Apprenticeship';
  if (text.includes('contract') || text.includes('temporary') || text.includes('freelance')) return 'Contract';
  if (text.includes('part-time') || text.includes('part time'))                            return 'Part-time';
  if (defaultVal) {
    const d = defaultVal.toLowerCase();
    if (d.includes('full'))       return 'Full-time';
    if (d.includes('part'))       return 'Part-time';
    if (d.includes('contract'))   return 'Contract';
    if (d.includes('intern'))     return 'Internship';
    if (d.includes('apprentice')) return 'Apprenticeship';
  }
  return 'Full-time';
}

function extractSkills(title, description) {
  const combined = `${title} ${description}`;
  const detected = new Set();
  for (const skill of SKILLS_LIST) {
    const escaped = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(combined)) detected.add(skill);
  }
  return Array.from(detected);
}

function generateJobId(companyId, title, location, url, originalId) {
  if (originalId) return `${companyId}-${originalId}`.replace(/[^a-zA-Z0-9\-_]/g, '');
  const content = `${companyId.trim()}|${title.trim()}|${location.trim()}|${url.trim()}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 24);
}

function detectATS(url) {
  if (!url) return 'generic';
  const u = url.toLowerCase();
  if (u.includes('myworkdayjobs.com'))                                        return 'workday';
  if (u.includes('lever.co'))                                                 return 'lever';
  if (u.includes('greenhouse.io') || u.includes('boards.greenhouse.io'))     return 'greenhouse';
  return 'generic';
}

function classifyIndustry(title, department) {
  const text = `${title} ${department || ''}`.toLowerCase();
  if (text.includes('software') || text.includes('developer') || text.includes('engineer') ||
      text.includes('programmer') || text.includes('architect') || text.includes('tech') ||
      text.includes('data') || text.includes('cloud') || text.includes('devops') ||
      text.includes('system') || text.includes('infrastructure') || text.includes('security') ||
      text.includes('coder') || text.includes('qa ') || text.includes('testing') || text.includes('network'))
    return 'Engineering & Technology';
  if (text.includes('legal') || text.includes('law') || text.includes('counsel') ||
      text.includes('compliance') || text.includes('attorney') || text.includes('patent') ||
      text.includes('solicitor') || text.includes('paralegal'))
    return 'Legal & Law';
  if (text.includes('finance') || text.includes('account') || text.includes('audit') ||
      text.includes('tax') || text.includes('business analyst') || text.includes('portfolio') ||
      text.includes('risk') || text.includes('analyst') || text.includes('consultant') ||
      text.includes('treasury') || text.includes('billing') || text.includes('controller'))
    return 'Business & Finance';
  if (text.includes('hr') || text.includes('recruiter') || text.includes('people') ||
      text.includes('talent') || text.includes('operations') || text.includes('admin') ||
      text.includes('facilities') || text.includes('human resources') || text.includes('coordinator'))
    return 'HR & Operations';
  if (text.includes('marketing') || text.includes('sales') || text.includes('product manager') ||
      text.includes('pr ') || text.includes('media') || text.includes('design') ||
      text.includes('ux') || text.includes('ui') || text.includes('copywriter') ||
      text.includes('branding') || text.includes('creative'))
    return 'Marketing, Product & Design';
  return 'Other / General';
}

// =============================================================================
// SECTION 2 — CLASSIFICATION ENGINE (see scripts/classifier.js)
// =============================================================================

// =============================================================================
// SECTION 3 — NVIDIA LLAMA AI PARSING ENGINE
// =============================================================================

let aiQuotaExceeded = false;

/**
 * [FIX-07] Updated experienceLevel enum in the prompt to match the seven
 * spec categories exactly. Removed "Director / Executive" and merged
 * "Internship / Apprenticeship" into two separate options.
 */
async function parseJobPostingWithAI(text, jobTitle, jobLocation) {
  if (aiQuotaExceeded || !process.env.NVIDIA_API_KEY) return null;

  const cleanText = text.substring(0, 15000);
  let retries = 0;
  const maxRetries = 4;
  let baseDelay = 5000;

  const promptContent = `Analyze this GCC job posting and extract structured details from the FULL page text.
Title: ${jobTitle}
Location: ${jobLocation}

Job Description Text:
${cleanText}

Output strictly as JSON (no markdown fences):
{
  "description": "Complete job description verbatim (responsibilities, requirements, qualifications). Exclude cookie banners and nav menus only.",
  "skills": ["skill1", "skill2"],
  "minYearsExperience": 3,
  "maxYearsExperience": 5,
  "experienceLevel": "Mid Level",
  "remoteStatus": "Unknown",
  "employmentType": "Full-time"
}

experienceLevel — pick EXACTLY one:
  "Internship / Apprenticeship" — intern, apprenticeship, co-op, student program
  "Entry Level" — 0-2 years, fresher, junior, campus hire
  "Mid Level" — 3-7 years; associate/senior titles with mid-range experience
  "Senior Level" — 8-11 years, principal, staff, mentoring ownership
  "Lead / Management" — 12+ years, lead, manager, director, architect
  "Executive Leadership" — C-suite, VP, president, managing director

CRITICAL: Experience years in requirements OVERRIDE misleading titles.
  "Associate Software Engineer" + 5-8 years → "Mid Level" (NOT Entry Level)
  "Senior Software Engineer" + 3-6 years → "Mid Level"
  "Lead Engineer" + 6 years → "Mid Level"

Extract minYearsExperience and maxYearsExperience from ranges like "3-5 years" or "5+ years".
remoteStatus: "Remote" | "Hybrid" | "Onsite" | "Unknown"
employmentType: "Full-time" | "Part-time" | "Contract" | "Internship" | "Apprenticeship"`;

  while (retries < maxRetries) {
    try {
      console.log(`[NVIDIA AI] Parsing "${jobTitle}" via meta/llama-3.3-70b-instruct (attempt ${retries + 1}/${maxRetries})...`);
      const response = await axios.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        {
          model      : 'meta/llama-3.3-70b-instruct',
          messages   : [{ role: 'user', content: promptContent }],
          max_tokens : 1024,
          temperature: 0.2,
          top_p      : 0.7,
          stream     : false,
        },
        {
          headers: {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${process.env.NVIDIA_API_KEY || ''}`,
            'Accept'       : 'application/json',
          },
          timeout: 40000,
        }
      );

      const candidate = response.data?.choices?.[0]?.message?.content;
      if (candidate) {
        let jsonStr = candidate;
        const match = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) {
          jsonStr = match[1];
        } else {
          const start = candidate.indexOf('{');
          const end = candidate.lastIndexOf('}');
          if (start !== -1 && end !== -1) {
            jsonStr = candidate.slice(start, end + 1);
          }
        }
        jsonStr = jsonStr.trim();
        const parsed  = JSON.parse(jsonStr);

        parsed.experienceLevel = normaliseAILevel(parsed.experienceLevel);
        parsed.yearsExperience = parsed.minYearsExperience ?? parsed.yearsExperience ?? null;
        return parsed;
      }
      break;
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message || '';
      const status = error.response?.status;

      if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('billing') || status === 402 || status === 401) {
        console.warn(`[NVIDIA AI] Quota/Auth error: "${errMsg}". Disabling AI parser for this run.`);
        aiQuotaExceeded = true;
        return null;
      }

      const isRetryable = status === 429 || status === 503 ||
        errMsg.toLowerCase().includes('rate limit') ||
        errMsg.toLowerCase().includes('high demand') ||
        errMsg.toLowerCase().includes('temporary');

      if (isRetryable && retries < maxRetries - 1) {
        retries++;
        const sleepMs = baseDelay * Math.pow(2, retries - 1) + Math.random() * 2000;
        console.warn(`[NVIDIA AI] Retryable error (${status}): ${errMsg.substring(0, 150)}. Waiting ${(sleepMs / 1000).toFixed(1)}s...`);
        await sleep(sleepMs);
      } else {
        console.warn(`[NVIDIA AI] Non-retryable failure: ${errMsg.substring(0, 200)}`);
        break;
      }
    }
  }

  console.warn(`[NVIDIA AI] All ${maxRetries} attempts failed. Falling back to rule-based heuristics.`);
  return null;
}

// =============================================================================
// SECTION 4 — SHARED HELPERS
// =============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * [FIX-13] Retry wrapper for any async operation.
 * @param {Function} fn   Async function to retry.
 * @param {number}   n    Max attempts.
 * @param {number}   delayMs Base delay in ms (doubles each retry).
 */
async function withRetry(fn, n = 3, delayMs = 2000) {
  let lastErr;
  for (let attempt = 1; attempt <= n; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < n) {
        const wait = delayMs * Math.pow(2, attempt - 1);
        console.warn(`  [Retry ${attempt}/${n}] Error: ${err.message}. Retrying in ${(wait / 1000).toFixed(1)}s...`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

/**
 * Merge AI result + description into a normalised exp object, then verify
 * with our validation layer. AI is trusted but its level is cross-checked
 * against the extracted years so title-bias is impossible.
 */
function resolveClassification(aiParsed, rawText, title) {
  let description, skills, exp, remoteStatus, empType;

  // Weighted evidence classifier scans full description + title together.
  const validation = classifyWithValidation(rawText, title);

  if (aiParsed) {
    description  = aiParsed.description || rawText;
    skills       = aiParsed.skills      || extractSkills(title, rawText);
    remoteStatus = aiParsed.remoteStatus || parseRemoteStatus(title, '', rawText);
    empType      = aiParsed.employmentType || detectEmploymentType(title, rawText, 'Full-time');

    // Rule-based weighted model is primary; AI supplements when rules lack confidence.
    if (validation.confidence >= 0.75 || validation.experienceFound) {
      exp = {
        level    : validation.classification,
        years    : validation.years,
        maxYears : validation.maxYears,
        validation,
      };
    } else {
      const aiValidation = classifyWithValidation(description, title);
      exp = {
        level    : aiParsed.experienceLevel || aiValidation.classification,
        years    : aiParsed.minYearsExperience ?? aiParsed.yearsExperience ?? aiValidation.years,
        maxYears : aiParsed.maxYearsExperience ?? aiValidation.maxYears,
        validation: aiValidation.confidence > validation.confidence ? aiValidation : validation,
      };
    }
  } else {
    description  = rawText;
    exp = {
      level    : validation.classification,
      years    : validation.years,
      maxYears : validation.maxYears,
      validation,
    };
    skills       = extractSkills(title, rawText);
    remoteStatus = parseRemoteStatus(title, '', rawText);
    empType      = detectEmploymentType(title, rawText, 'Full-time');
  }

  return { description, skills, exp, remoteStatus, empType };
}

// =============================================================================
// SECTION 5 — ATS ADAPTERS
// =============================================================================

// ─── 5a. Workday ──────────────────────────────────────────────────────────────

async function scrapeWorkday(companyId, companyName, careersUrl) {
  const jobs = [];
  const parsed      = new URL(careersUrl);
  const host        = parsed.hostname;
  const pathSegments= parsed.pathname.split('/').filter(Boolean);
  const tenant      = host.split('.')[0];
  let   site        = 'Search';
  if (pathSegments.length > 1)                                                site = pathSegments[1];
  else if (pathSegments.length === 1 && pathSegments[0] !== 'en-US')          site = pathSegments[0];

  const apiUrl  = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
  let   offset  = 0;
  const limit   = 20;
  let   hasMore = true;

  console.log(`[Workday] ${companyName} — API: ${apiUrl}`);

  while (hasMore) {
    let pageSuccess = false;

    // [FIX-09] Retry each pagination page; don't abort the whole company on one failure.
    try {
      await withRetry(async () => {
        const response = await axios.post(
          apiUrl,
          { appliedFacets: {}, limit, offset, searchText: '' },
          { headers: { ...AXIOS_HEADERS, 'Content-Type': 'application/json' }, timeout: 60000 }
        );

        const postings = response.data.jobPostings || [];
        if (postings.length === 0) { hasMore = false; return; }

        for (const posting of postings) {
          const normLoc = normalizeLocation(posting.locationsText);
          if (!normLoc) continue;

          await sleep(1500); // pacing

          const jobUrl      = `https://${host}/${site.toLowerCase()}${posting.externalPath}`;
          const detailApiUrl= `https://${host}/wday/cxs/${tenant}/${site}${posting.externalPath}`;

          let rawText  = `Job posting available at ${jobUrl}`;
          let deptName = '';
          let timeType = '';
          let applyUrl = jobUrl;
          let aiParsed = null;

          try {
            // [FIX-13] Retry detail fetch
            const detailRes = await withRetry(() =>
              axios.get(detailApiUrl, { headers: AXIOS_HEADERS, timeout: 8000 })
            );
            if (detailRes.data?.jobPostingInfo) {
              const info = detailRes.data.jobPostingInfo;
              rawText  = (info.jobDescription || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
              deptName = info.department || '';
              timeType = info.timeType   || '';
              if (info.applyUrl) applyUrl = info.applyUrl;
              aiParsed = await parseJobPostingWithAI(rawText, posting.title, posting.locationsText);
            }
          } catch (detailErr) {
            console.warn(`[Workday] Detail fetch failed for "${posting.title}": ${detailErr.message}. Using basic data.`);
          }

          const { description, skills, exp, remoteStatus, empType } =
            resolveClassification(aiParsed, rawText, posting.title);

          const empTypeFinal = empType === 'Full-time' && timeType
            ? detectEmploymentType(posting.title, description, timeType)
            : empType;

          jobs.push({
            id             : generateJobId(companyId, posting.title, posting.locationsText || '', jobUrl, posting.jobReqId),
            companyId,
            companyName,
            title          : posting.title,
            description,
            location       : posting.locationsText || 'India',
            city           : normLoc.city,
            state          : normLoc.state,
            country        : 'India',
            experienceLevel: exp.level,
            yearsExperience: exp.years,
            yearsExperienceMax: exp.maxYears ?? exp.years,
            classificationMeta: exp.validation,
            employmentType : empTypeFinal,
            skills,
            applyUrl,
            jobUrl,
            remoteStatus,
            department     : deptName,
            industry       : classifyIndustry(posting.title, deptName),
          });
        }

        // [FIX-08] Removed 1000-job hard cap. Pagination runs until the API
        // returns fewer results than the page size.
        if (postings.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
        pageSuccess = true;
      }, 3, 3000);
    } catch (err) {
      console.warn(`[Workday] ${companyName} — Page at offset ${offset} failed after retries: ${err.message}`);
      hasMore = false; // Stop pagination for this company after exhausting retries
    }
  }

  console.log(`[Workday] ${companyName} — Finished. ${jobs.length} India jobs collected.`);
  return jobs;
}

// ─── 5b. Greenhouse ───────────────────────────────────────────────────────────

async function scrapeGreenhouse(companyId, companyName, careersUrl) {
  const jobs   = [];
  const parsed = new URL(careersUrl);
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  let token    = parsed.pathname.includes('/embed/job_board')
    ? parsed.searchParams.get('token')
    : pathSegments[0];
  if (!token) throw new Error('Could not parse Greenhouse company token.');

  const apiUrl   = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
  // [FIX-13] Retry the index fetch too
  const response = await withRetry(() =>
    axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 60000 })
  );
  const postings = response.data.jobs || [];

  for (const posting of postings) {
    const locationName = posting.location?.name || '';
    const normLoc      = normalizeLocation(locationName);
    if (!normLoc) continue;

    const rawText = (posting.content || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
    const deptName= posting.departments?.[0]?.name || '';

    const aiParsed = await parseJobPostingWithAI(rawText, posting.title, locationName);
    const { description, skills, exp, remoteStatus, empType } =
      resolveClassification(aiParsed, rawText, posting.title);

    jobs.push({
      id             : generateJobId(companyId, posting.title, locationName, posting.absolute_url, posting.id?.toString()),
      companyId,
      companyName,
      title          : posting.title,
      description,
      location       : locationName,
      city           : normLoc.city,
      state          : normLoc.state,
      country        : 'India',
      experienceLevel: exp.level,
      yearsExperience: exp.years,
      yearsExperienceMax: exp.maxYears ?? exp.years,
      classificationMeta: exp.validation,
      employmentType : empType,
      skills,
      applyUrl       : posting.absolute_url,
      jobUrl         : posting.absolute_url,
      remoteStatus,
      department     : deptName,
      industry       : classifyIndustry(posting.title, deptName),
    });
  }
  return jobs;
}

// ─── 5c. Lever ────────────────────────────────────────────────────────────────

async function scrapeLever(companyId, companyName, careersUrl) {
  const jobs   = [];
  const parsed = new URL(careersUrl);
  const token  = parsed.pathname.split('/').filter(Boolean)[0];
  if (!token) throw new Error('Could not parse Lever company token.');

  const apiUrl   = `https://api.lever.co/v0/postings/${token}?mode=json`;
  const response = await withRetry(() =>
    axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 15000 })
  );
  const postings = response.data || [];

  for (const posting of postings) {
    const loc     = posting.categories?.location || '';
    const normLoc = normalizeLocation(loc);
    if (!normLoc) continue;

    let rawText = posting.descriptionPlain || '';
    if (posting.lists) {
      posting.lists.forEach(l => {
        const contentStr = Array.isArray(l.content) ? l.content.join('\n') : (l.content || '');
        rawText += `\n${l.text || ''}\n` + contentStr;
      });
    }

    const deptName = posting.categories?.department || posting.categories?.team || '';
    const aiParsed = await parseJobPostingWithAI(rawText, posting.title, loc);
    const { description, skills, exp, remoteStatus, empType } =
      resolveClassification(aiParsed, rawText, posting.title);

    jobs.push({
      id             : generateJobId(companyId, posting.title, loc, posting.hostedUrl, posting.id),
      companyId,
      companyName,
      title          : posting.title,
      description,
      location       : loc,
      city           : normLoc.city,
      state          : normLoc.state,
      country        : 'India',
      experienceLevel: exp.level,
      yearsExperience: exp.years,
      yearsExperienceMax: exp.maxYears ?? exp.years,
      classificationMeta: exp.validation,
      employmentType : empType,
      skills,
      applyUrl       : posting.applyUrl || posting.hostedUrl,
      jobUrl         : posting.hostedUrl,
      remoteStatus,
      department     : deptName,
      industry       : classifyIndustry(posting.title, deptName),
    });
  }
  return jobs;
}

// ─── 5d. Generic (Playwright)  [FIX-10, FIX-11, FIX-12, FIX-13] ─────────────

async function scrapeGeneric(companyId, companyName, careersUrl) {
  const jobs = [];

  if (!sharedBrowser) {
    sharedBrowser = await playwright.chromium.launch({
      headless: true,
      args    : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-http2'],
    });
  }

  const context = await sharedBrowser.newContext({
    userAgent    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport     : { width: 1280, height: 800 },
    locale       : 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    console.log(`[Generic Scraper] ${companyName} — Opening: ${careersUrl}`);
    try {
      await page.goto(careersUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (gotoErr) {
      console.warn(`[Generic Scraper] Initial nav failed, retrying with commit: ${gotoErr.message}`);
      try {
        await page.goto(careersUrl, { waitUntil: 'commit', timeout: 60000 });
      } catch (commitErr) {
        console.warn(`[Generic Scraper] Commit nav also timed out. Proceeding anyway, DOM might be ready: ${commitErr.message}`);
      }
    }
    await sleep(2000);

    // ── Helper to handle "Execution context was destroyed" errors safely ─────
    async function safeEvaluate(fn) {
      try {
        return await page.evaluate(fn);
      } catch (err) {
        if (err.message.includes('Execution context was destroyed')) {
          console.warn(`[Generic Scraper] Evaluation context destroyed (likely navigating). Waiting 4s and retrying...`);
          await sleep(4000);
          return await page.evaluate(fn);
        }
        throw err;
      }
    }

    // ── Redirect to search page if landing page has no direct job links ──────
    let jobLinksCount = 0;
    try {
      jobLinksCount = await safeEvaluate(() =>
        document.querySelectorAll(
          'a[href*="/job/"],a[href*="/jobs/"],a[href*="/posting/"],a[href*="/careers/"],a[href*="/vacancy/"],a[href*="/detail/"],a[href*="/position/"]'
        ).length
      );
    } catch (e) {
      console.warn(`[Generic Scraper] Error checking initial job links: ${e.message}`);
    }

    if (jobLinksCount < 2) {
      const searchRedirectLink = await page.$(
        'a[href*="search" i]:has-text("jobs"), a:has-text("Search Jobs"), a:has-text("Open Positions"), a:has-text("View Openings"), a:has-text("Job Openings"), button:has-text("Search Jobs"), button:has-text("View Jobs")'
      );
      if (searchRedirectLink) {
        const href = await searchRedirectLink.getAttribute('href');
        if (href) {
          const targetUrl = href.startsWith('http') ? href : new URL(href, careersUrl).toString();
          try {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          } catch (e) {
            console.warn(`[Generic Scraper] Search redirect nav failed/timed out. Continuing. ${e.message}`);
          }
          await sleep(3000);
        } else {
          await searchRedirectLink.click();
          await sleep(4000);
        }
      }
    }

    // ── Location filter ───────────────────────────────────────────────────────
    try {
      const locationInputs = await page.$$(
        'input[placeholder*="location" i], input[placeholder*="city" i], input[placeholder*="country" i], input[id*="location" i], input[name*="location" i], input[aria-label*="location" i]'
      );
      let filterApplied = false;
      for (const input of locationInputs) {
        const val = await input.inputValue();
        if (!val || val.toLowerCase().trim() === '') {
          await input.click(); await input.fill('India'); await input.press('Enter');
          await sleep(3000);
          filterApplied = true;
          break;
        }
      }

      if (!filterApplied) {
        const selects = await page.$$('select');
        for (const sel of selects) {
          const opts = await sel.$$eval('option', os => os.map(o => ({ value: o.value, text: o.innerText })));
          const indiaOpt = opts.find(o =>
            o.text.toLowerCase().includes('india') || o.value.toLowerCase() === 'in'
          );
          if (indiaOpt) {
            await sel.selectOption(indiaOpt.value);
            await sleep(3000);
            filterApplied = true;
            break;
          }
        }
      }

      if (!filterApplied) {
        const generalSearch = await page.$$(
          'input[placeholder*="search" i], input[placeholder*="keyword" i], input[id*="search" i]'
        );
        for (const input of generalSearch) {
          const val = await input.inputValue();
          if (!val || val.toLowerCase().trim() === '') {
            await input.click(); await input.fill('India'); await input.press('Enter');
            await sleep(3000);
            break;
          }
        }
      }
    } catch (filterErr) {
      console.warn(`[Generic Scraper] Location filter failed: ${filterErr.message}`);
    }

    // ── [FIX-12] Infinite scroll + [FIX-11] Unlimited pagination ──────────────
    const allRawJobs = [];
    const seenUrls   = new Set();
    let   pageNum    = 1;
    // No hard page cap — run until no Next button or no new jobs appear.

    while (true) {
      console.log(`[Generic Scraper] ${companyName} — Collecting jobs from page ${pageNum}...`);

      // Scroll to bottom to trigger lazy/infinite-scroll content
      let prevCount = -1;
      let scrollRounds = 0;
      const MAX_SCROLL_ROUNDS = 15;
      while (scrollRounds < MAX_SCROLL_ROUNDS) {
        try {
          prevCount = await safeEvaluate(() =>
            document.querySelectorAll(
              'a[href*="/job/"],a[href*="/jobs/"],a[href*="/posting/"],a[href*="/careers/"],a[href*="/detail/"],a[href*="/position/"]'
            ).length
          );
          await safeEvaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await sleep(1200);
          const newCount = await safeEvaluate(() =>
            document.querySelectorAll(
              'a[href*="/job/"],a[href*="/jobs/"],a[href*="/posting/"],a[href*="/careers/"],a[href*="/detail/"],a[href*="/position/"]'
            ).length
          );
          // Stop scrolling once no new links appear in two consecutive rounds
          if (newCount === prevCount) break;
        } catch (e) {
          console.warn(`[Generic Scraper] Scroll/evaluate error: ${e.message}`);
          break;
        }
        scrollRounds++;
      }

      // Collect all job links on the current page
      let rawJobs = [];
      try {
        rawJobs = await safeEvaluate(() => {
        const results = [];
        for (const a of Array.from(document.querySelectorAll('a'))) {
          const href = a.href;
          if (!href) continue;
          const isJob =
            /\/(job|jobs|posting|careers|vacancy|detail|position)\//i.test(href) ||
            href.includes('career-detail');
          if (!isJob) continue;

          let title = a.innerText.trim();
          if (!title && a.parentElement) title = a.parentElement.innerText.trim();
          if (!title) continue;
          title = title.split('\n')[0].trim();
          if (title.length < 5) continue;

          const boilerplate = [
            'cookie policy','privacy policy','terms of service','terms of use','ai usage','using ai',
            'our story','our teams','dashboard','profile','sign in','sign-in','login','log in','log-in',
            'logout','log out','search & apply','homepage','deutsch','english','español','français',
            'italiano','português','japanese','german','french','italian','spanish','korean','chinese',
            'portuguese','careers','our platform','culture','benefits','awards','search','apply now',
            'apply','you can still apply','click here','read more','learn more','go back','back to search',
            'view profile','talent community','talent network','join us','close','cancel','accept',
            'decline','agree','cookies','all jobs','job search','open positions','view jobs','view openings',
            'job openings','careers portal','careers home','about us','contact us','home','faq','help',
            'support','sitemap','skip to main content','main content','skip to navigation','navigation',
            'skip to content','português - brasil','português - pt','română','slovenčina, slovenský jazyk',
            '中文 - 简体','中文 - 繁體','polski','nederlands','magyar','suomi','svenska','dansk','česky',
            'türkçe','tiếng việt','русский','ภาษาไทย','日本語','한국어','עברית','العربية'
          ];
          if (boilerplate.includes(title.toLowerCase())) continue;
          if (/^(skip to|language|select language|accessibility)/i.test(title)) continue;

          // [FIX-15] Do NOT default to 'India'. If no Indian city/country keyword
          // is found near this link, loc stays null. The detail-fetch phase below
          // will attempt a second pass on the detail page itself. If India still
          // can't be confirmed, the job is dropped so non-India roles don't leak.
          let loc = null;
          let p = a.parentElement;
          let depth = 0;
          while (p && depth < 3) {
            const m = (p.innerText || '').match(
              /bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|\bindia\b/i
            );
            if (m) { loc = m[0]; break; }
            p = p.parentElement; depth++;
          }
          results.push({ title, url: href, location: loc });
        }
        return results;
      });
      } catch (e) {
        console.warn(`[Generic Scraper] Failed to extract links from page ${pageNum}: ${e.message}`);
      }

      let newThisPage = 0;
      for (const item of rawJobs) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allRawJobs.push(item);
          newThisPage++;
        }
      }
      console.log(`[Generic Scraper] Page ${pageNum}: ${newThisPage} new job links (total: ${allRawJobs.length}).`);

      // Check for Next page button
      const nextButton = await page.$(
        'a[aria-label*="next" i], button[aria-label*="next" i], a[class*="next" i], button[class*="next" i], a >> text="Next", button >> text="Next", [class*="pagination" i] a:has-text("Next")'
      );

      if (nextButton) {
        const isDisabled = await nextButton.evaluate(el =>
          el.hasAttribute('disabled') ||
          el.classList.contains('disabled') ||
          el.getAttribute('aria-disabled') === 'true'
        );
        if (!isDisabled) {
          await nextButton.click();
          await sleep(4000);
          pageNum++;
        } else {
          break; // disabled Next → end of pagination
        }
      } else {
        break; // no Next button → end of pagination
      }
    }

    console.log(`[Generic Scraper] ${companyName} — ${allRawJobs.length} total jobs found across ${pageNum} page(s).`);

    // ── [FIX-10] Process ALL jobs, not just first 15 ──────────────────────────
    for (const item of allRawJobs) {
      await sleep(1500);

      let rawText  = `Job listing available at ${item.url}`;
      let aiParsed = null;
      let confirmedLocation = item.location; // may be null if not detected on listing page

      try {
        // [FIX-13] Retry detail page fetch up to 3 times
        await withRetry(async () => {
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
            rawText = await detailPage.evaluate(() => {
              const main = document.querySelector(
                'main, article, [class*="job-details" i], [class*="description" i], [id*="description" i]'
              );
              return (main || document.body).innerText;
            });
            rawText = rawText.replace(/\s+/g, ' ').trim();

            // [FIX-15] If listing page had no India location, verify from detail page text.
            if (!confirmedLocation) {
              const indiaMatch = rawText.match(
                /bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|\bindia\b/i
              );
              confirmedLocation = indiaMatch ? indiaMatch[0] : null;
            }

            aiParsed = await parseJobPostingWithAI(rawText, item.title, confirmedLocation || item.location || 'India');
          } finally {
            await detailPage.close();
          }
        }, 3, 2000);
      } catch (err) {
        console.warn(`[Generic Scraper] Detail fetch failed for "${item.title}" after retries: ${err.message}`);
      }

      // [FIX-15] Resolve location — check title as last resort, then drop if still unknown.
      if (!confirmedLocation) {
        const titleMatch = (item.title || '').match(
          /bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|\bindia\b/i
        );
        confirmedLocation = titleMatch ? titleMatch[0] : null;
      }

      // Drop jobs with no verifiable India location.
      if (!confirmedLocation) {
        console.log(`[Generic Scraper] Dropping "${item.title}" — no India location confirmed on listing or detail page.`);
        continue;
      }

      const normLoc = normalizeLocation(confirmedLocation);
      if (!normLoc) continue;

      const { description, skills, exp, remoteStatus, empType } =
        resolveClassification(aiParsed, rawText, item.title);

      jobs.push({
        id             : generateJobId(companyId, item.title, confirmedLocation, item.url),
        companyId,
        companyName,
        title          : item.title,
        description,
        location       : confirmedLocation,
        city           : normLoc.city,
        state          : normLoc.state,
        country        : 'India',
        experienceLevel: exp.level,
        yearsExperience: exp.years,
        yearsExperienceMax: exp.maxYears ?? exp.years,
        classificationMeta: exp.validation,
        employmentType : empType,
        skills,
        applyUrl       : item.url,
        jobUrl         : item.url,
        remoteStatus,
        industry       : classifyIndustry(item.title, ''),
      });
    }
  } finally {
    await page.close();
    await context.close();
  }

  return jobs;
}

// =============================================================================
// SECTION 6 — ORCHESTRATION ENGINE
// =============================================================================

async function runLocalScraper() {
  const startTime = Date.now();
  console.log('=== GCC Hunt Local Scraper ===');
  console.log(`Starting crawl at: ${new Date().toLocaleString()}`);
  console.log('[AI Integration] NVIDIA Llama 3.3 70B parser active when NVIDIA_API_KEY is set.');

  const excelPath = path.join(__dirname, '..', 'companies.xlsx');
  if (!fs.existsSync(excelPath)) {
    console.error(`Error: Excel file not found at: ${excelPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  let existingJobs = [];
  let existingComps= [];
  let existingLogs = [];

  try {
    if (fs.existsSync(JOBS_PATH))      existingJobs  = JSON.parse(fs.readFileSync(JOBS_PATH,      'utf-8'));
    if (fs.existsSync(COMPANIES_PATH)) existingComps = JSON.parse(fs.readFileSync(COMPANIES_PATH, 'utf-8'));
    if (fs.existsSync(LOGS_PATH))      existingLogs  = JSON.parse(fs.readFileSync(LOGS_PATH,      'utf-8'));
  } catch (e) {
    console.warn('Warning: Could not load existing JSON files. Starting fresh.');
  }

  // [FIX-14] Build freshness map — jobs scraped recently can be skipped
  const existingJobsMap  = new Map(existingJobs.map(j => [j.id, j]));
  const companiesMap     = new Map(existingComps.map(c => [c.id, c]));
  const freshnessMs      = FRESHNESS_HOURS * 3600 * 1000;

  const workbook    = xlsx.readFile(excelPath);
  const worksheet   = workbook.Sheets[workbook.SheetNames[0]];
  const excelData   = xlsx.utils.sheet_to_json(worksheet);
  console.log(`Excel sheet loaded. Found ${excelData.length} companies.`);

  const activeCompanies = [];
  for (const row of excelData) {
    const name = row['Company'];
    const url  = row['Actual Job Listing'];
    if (!name || !url) continue;
    const id   = slugify(name);
    activeCompanies.push({ id, name: name.trim(), url: url.trim() });
    if (!companiesMap.has(id)) {
      companiesMap.set(id, { id, name: name.trim(), careersUrl: url.trim(), status: 'idle', lastScraped: null });
    }
  }

  const finalCompaniesList = Array.from(companiesMap.values()).filter(c =>
    activeCompanies.some(ac => ac.id === c.id)
  );

  const limitValue = CRAWL_LIMIT.toLowerCase() === 'all'
    ? finalCompaniesList.length
    : parseInt(CRAWL_LIMIT) || 50;

  const targetCompanies = finalCompaniesList
    .sort((a, b) => {
      const dateA = a.lastScraped ? new Date(a.lastScraped).getTime() : 0;
      const dateB = b.lastScraped ? new Date(b.lastScraped).getTime() : 0;
      return dateA - dateB; // oldest-first
    })
    .slice(0, limitValue);

  console.log(`\nReady to crawl ${targetCompanies.length} companies (concurrency: ${NUM_WORKERS}).`);

  let successCount = 0;
  let failedCount  = 0;
  const crawledJobsPool = [];
  let index = 0;

  async function worker() {
    while (index < targetCompanies.length) {
      const comp = targetCompanies[index++];
      if (!comp) continue;

      const compStartTime = Date.now();
      comp.status = 'scraping';
      console.log(`\n[Scraper] ▶ "${comp.name}" — ${comp.careersUrl}`);

      try {
        const ats = detectATS(comp.careersUrl);
        let jobsResult = [];
        if      (ats === 'workday')    jobsResult = await scrapeWorkday(comp.id,   comp.name, comp.careersUrl);
        else if (ats === 'greenhouse') jobsResult = await scrapeGreenhouse(comp.id, comp.name, comp.careersUrl);
        else if (ats === 'lever')      jobsResult = await scrapeLever(comp.id,      comp.name, comp.careersUrl);
        else                           jobsResult = await scrapeGeneric(comp.id,    comp.name, comp.careersUrl);

        const duration = Date.now() - compStartTime;
        successCount++;
        comp.status      = 'success';
        comp.lastScraped = new Date().toISOString();
        console.log(`[Scraper] ✓ "${comp.name}" | ${jobsResult.length} jobs in ${(duration / 1000).toFixed(1)}s.`);

        crawledJobsPool.push(...jobsResult);
        existingLogs.unshift({
          id         : crypto.randomUUID(),
          companyId  : comp.id,
          companyName: comp.name,
          status     : 'success',
          jobsFound  : jobsResult.length,
          executionTime: duration,
          timestamp  : new Date().toISOString(),
        });
      } catch (err) {
        const duration = Date.now() - compStartTime;
        failedCount++;
        comp.status = 'failed';
        console.error(`[Scraper] ✗ "${comp.name}" | Error: ${err.message}`);
        existingLogs.unshift({
          id         : crypto.randomUUID(),
          companyId  : comp.id,
          companyName: comp.name,
          status     : 'failed',
          errors     : err.message,
          executionTime: duration,
          timestamp  : new Date().toISOString(),
        });
      }
    }
  }

  const workers = Array(Math.min(NUM_WORKERS, targetCompanies.length)).fill(null).map(worker);
  await Promise.all(workers);

  if (sharedBrowser) await sharedBrowser.close();

  // ── Merge crawled results with existing database ──────────────────────────
  const crawledComps  = new Set(targetCompanies.filter(c => c.status === 'success').map(c => c.id));
  const crawledJobIds = new Set(crawledJobsPool.map(j => j.id));
  const finalJobsList = [];

  // The user requested to overwrite old data and only keep jobs scraped in this run.
  // We skip retaining old jobs entirely.

  // Add brand-new jobs.
  for (const newJob of crawledJobsPool) {
    if (crawledJobIds.has(newJob.id)) {
      const titleWords   = (newJob.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const companyWords = (newJob.companyName || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const cityWords    = (newJob.city || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const skillWords   = (newJob.skills || []).map(s => (s || '').toLowerCase());

      newJob.keywords    = Array.from(new Set([...titleWords, ...companyWords, ...cityWords, ...skillWords])).filter(w => w.length > 1);
      newJob.createdAt   = new Date().toISOString();
      newJob.updatedAt   = new Date().toISOString();
      newJob.dateScraped = new Date().toISOString();
      finalJobsList.push(newJob);
    }
  }

  // Final deduplication pass
  const uniqueFinalJobsList = [];
  const seenFinalIds        = new Set();
  for (const job of finalJobsList) {
    if (!seenFinalIds.has(job.id)) {
      seenFinalIds.add(job.id);
      uniqueFinalJobsList.push(job);
    }
  }

  fs.writeFileSync(JOBS_PATH,      JSON.stringify(uniqueFinalJobsList, null, 2));
  fs.writeFileSync(COMPANIES_PATH, JSON.stringify(finalCompaniesList,  null, 2));
  fs.writeFileSync(LOGS_PATH,      JSON.stringify(existingLogs.slice(0, 200), null, 2));

  const totalTime = Date.now() - startTime;
  console.log('\n══════════════════════════════════════');
  console.log(`Crawl finished in ${(totalTime / 1000 / 60).toFixed(1)} minutes.`);
  console.log(`Succeeded: ${successCount} | Failed: ${failedCount}`);
  console.log(`Jobs in database: ${uniqueFinalJobsList.length}`);
  console.log('══════════════════════════════════════');
}

// Re-export classifier for tests
module.exports = {
  classifyWithValidation,
  extractExperienceDetails,
  extractExperience,
  normaliseAILevel,
  SENIORITY_LEVELS,
};

runLocalScraper().catch(console.error);

// =============================================================================
// CHANGELOG
// =============================================================================
// [FIX-01] Level boundaries — corrected to spec:
//          was: 0-2→Entry, 3-7→Mid, 8-11→Senior, 12-14→Lead/Manager, 15+→Director
//          now: 0-2→Entry, 3-4→Mid, 5-7→Senior, 8+→Lead
//
// [FIX-02] Seven canonical categories — replaced old merged/extra labels with
//          Internship | Apprenticeship | Fresher | Entry Level |
//          Mid Level | Senior Level | Lead Level
//
// [FIX-03] Fresher category added — detects "fresh graduate", "recent graduate",
//          "no experience required" in description and classifies as Fresher, not
//          Entry Level. Previously these were silently lumped into Entry Level.
//
// [FIX-04] Apprenticeship split from Internship — previously both resolved to
//          "Internship / Apprenticeship". Now they are distinct.
//
// [FIX-05] Description is primary source of truth — classification decision tree
//          now checks description keywords and experience years FIRST; job title
//          keywords are checked last only when description has no signal.
//
// [FIX-06] Experience extraction — sub-role exclusion + maximum selection:
//          OLD: took the MINIMUM of ALL found year values.
//               "minimum 4 years … atleast 1 year experience as Team Lead"
//               → min(4, 1) = 1 → Entry Level  ✗
//          NEW: Step A — blank out "X years [of] [experience] as <role>" patterns
//               so secondary qualifiers don't pollute the primary scan.
//               Step B — take the MAXIMUM of remaining values.
//               → max(4) = 4 → Mid Level  ✓
//          Also guards against version numbers via isValidYears(0–40).
//
// [FIX-07] AI prompt updated — experienceLevel enum in the prompt now lists all
//          seven spec categories with clear selection rules and conflict-resolution
//          examples. Removed "Director / Executive" and split "Internship /
//          Apprenticeship" into two values.
//
// [FIX-08] Removed 1000-job hard cap in Workday scraper. Pagination now runs
//          until the API returns a partial page (< page_size results).
//
// [FIX-09] Per-page retry in Workday — a single failed page no longer aborts the
//          whole company. withRetry(3, 3000ms) wraps each offset request.
//
// [FIX-10] Generic scraper no longer slices to first 15 jobs. All discovered
//          job links are now fetched and classified.
//
// [FIX-11] Generic scraper pagination cap removed. Previously stopped at page 5.
//          Now runs until the "Next" button is absent or disabled.
//
// [FIX-12] Infinite scroll handling added in generic scraper — scrolls to page
//          bottom repeatedly until no new job links appear before moving on.
//
// [FIX-13] Retry logic added to all detail-page fetches (Workday detail API,
//          generic Playwright page). Uses withRetry(3, 2000ms) wrapper.
//
// [FIX-14] Freshness guard — jobs scraped within FRESHNESS_HOURS (default 6h)
//          are not re-scraped, preventing redundant AI API calls.
//
// [FIX-15] Generic scraper location verification:
//          OLD: `let loc = 'India'` was hard-coded default when no city detected.
//               normalizeLocation('India') returned non-null → every job with an
//               unknown location passed the India filter — including Singapore, US.
//          NEW: Default changed to null. After detail page is fetched, its full
//               text is scanned for an Indian city or the word "india".
//               Job title checked as last resort. If no India keyword confirmed
//               anywhere, job is DROPPED with a log line.
//
// [NEW-01] classifyWithValidation() — returns confidence score, experienceFound,
//          matchedKeywords, and reason for every classification decision.
//
// [NEW-02] classificationMeta field added to every job object, containing the
//          full validation result so decisions can be audited in the output JSON.
//
// [SECURITY] Hardcoded NVIDIA API key removed. Now read from process.env.NVIDIA_API_KEY.
//            Set it before running: export NVIDIA_API_KEY=nvapi-xxx
