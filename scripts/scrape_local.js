const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load packages using functions/node_modules context
let xlsx, playwright, axios;
try {
  xlsx = require('xlsx');
  playwright = require('playwright');
  axios = require('axios');
} catch (e) {
  console.error("Missing local dependencies. Make sure to run 'npm install' inside the 'functions' directory first.");
  process.exit(1);
}

// Environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CRAWL_LIMIT = process.env.LIMIT || 'all'; // Default to 'all' to scrape all companies in the sheet

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Data output file paths
const DATA_DIR = path.join(__dirname, '..', 'web', 'src', 'data');
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json');
const COMPANIES_PATH = path.join(DATA_DIR, 'companies.json');
const LOGS_PATH = path.join(DATA_DIR, 'scrape_logs.json');

// Shared browser instance for generic scraping (reused to save memory)
let sharedBrowser = null;

// -------------------------------------------------------------
// UTILITIES AND NORMALIZATION
// -------------------------------------------------------------

const INDIAN_CITIES_MAP = {
  bangalore: { city: 'Bangalore', state: 'Karnataka' },
  bengaluru: { city: 'Bangalore', state: 'Karnataka' },
  hyderabad: { city: 'Hyderabad', state: 'Telangana' },
  pune: { city: 'Pune', state: 'Maharashtra' },
  chennai: { city: 'Chennai', state: 'Tamil Nadu' },
  madras: { city: 'Chennai', state: 'Tamil Nadu' },
  mumbai: { city: 'Mumbai', state: 'Maharashtra' },
  'navi mumbai': { city: 'Mumbai', state: 'Maharashtra' },
  gurgaon: { city: 'Gurgaon', state: 'Haryana' },
  gurugram: { city: 'Gurgaon', state: 'Haryana' },
  noida: { city: 'Noida', state: 'Uttar Pradesh' },
  'greater noida': { city: 'Noida', state: 'Uttar Pradesh' },
  kochi: { city: 'Kochi', state: 'Kerala' },
  cochin: { city: 'Kochi', state: 'Kerala' },
  ahmedabad: { city: 'Ahmedabad', state: 'Gujarat' },
  kolkata: { city: 'Kolkata', state: 'West Bengal' },
  calcutta: { city: 'Kolkata', state: 'West Bengal' },
  delhi: { city: 'Delhi', state: 'Delhi' },
  'new delhi': { city: 'Delhi', state: 'Delhi' },
  coimbatore: { city: 'Coimbatore', state: 'Tamil Nadu' },
  trivandrum: { city: 'Trivandrum', state: 'Kerala' },
  thiruvananthapuram: { city: 'Trivandrum', state: 'Kerala' },
  jaipur: { city: 'Jaipur', state: 'Rajasthan' },
  indore: { city: 'Indore', state: 'Madhya Pradesh' },
  bhubaneswar: { city: 'Bhubaneswar', state: 'Odisha' }
};

const SKILLS_LIST = [
  'React', 'Angular', 'Vue', 'Next.js', 'HTML', 'CSS', 'JavaScript', 'TypeScript',
  'Node.js', 'Express', 'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring Boot',
  'Kotlin', 'Swift', 'Go', 'Golang', 'Rust', 'C++', 'C#', '.NET', 'ASP.NET', 'SQL',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'AWS', 'Azure', 'GCP', 'Docker',
  'Kubernetes', 'Terraform', 'CI/CD', 'Git', 'GitHub', 'DevOps', 'Machine Learning',
  'AI', 'Deep Learning', 'Pandas', 'NumPy', 'Spark', 'Kafka', 'GraphQL', 'REST'
];

function slugify(text) {
  return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').trim().replace(/^-+/, '').replace(/-+$/, '');
}

function normalizeLocation(locationStr) {
  if (!locationStr) return null;
  const cleanLoc = locationStr.toLowerCase();
  for (const key of Object.keys(INDIAN_CITIES_MAP)) {
    if (cleanLoc.includes(key)) {
      return { ...INDIAN_CITIES_MAP[key], country: 'India' };
    }
  }
  if (/\b(india|in)\b/i.test(cleanLoc)) {
    return { city: 'India', state: 'India', country: 'India' };
  }
  return null;
}

function parseRemoteStatus(title, location, description) {
  const combined = `${title} ${location} ${description}`.toLowerCase();
  if (combined.includes('work from home') || combined.includes('wfh') || combined.includes('remote')) return 'Remote';
  if (combined.includes('hybrid') || combined.includes('flexible')) return 'Hybrid';
  if (combined.includes('onsite') || combined.includes('office')) return 'Onsite';
  return 'Unknown';
}

function extractExperience(description, title) {
  const descText = (description || '').toLowerCase();
  const titleText = (title || '').toLowerCase();
  const fullText = `${titleText} ${descText}`;

  // Step 2: Internship / Apprenticeship Detection
  const internshipKeywords = [
    'internship', 'summer intern', 'winter intern', 'graduate intern', 
    'student intern', 'research intern', 'campus internship', 'trainee intern',
    'apprenticeship', 'graduate apprentice', 'trade apprentice',
    'engineering apprentice', 'technician apprentice', 'apprenticeship program',
    'co-op', 'coop', 'student program', 'industrial trainee'
  ];
  const internRegex = /\b(intern|apprentice)\b/i;
  
  if (internRegex.test(fullText) || internshipKeywords.some(kw => fullText.includes(kw))) {
    return { years: 0, level: 'Internship / Apprenticeship' };
  }

  // Step 1: Extract Experience Requirement
  const regexes = [
    /(\d+)\s*(?:-|to)\s*(\d+)\s*years?/g,
    /(\d+)\+\s*years?/g,
    /minimum\s*(\d+)\s*years?/g,
    /at\s*least\s*(\d+)\s*years?/g,
    /(\d+)\s*years?\s*(?:of\s*)?experience/g,
    /experience\s*(?:of\s*)?(\d+)\+?\s*years?/g,
    /(\d+)\s*yrs?\b/g
  ];

  let minYears = null;
  for (const regex of regexes) {
    const matches = Array.from(descText.matchAll(regex));
    if (matches && matches.length > 0) {
      minYears = parseInt(matches[0][1], 10);
      break;
    }
  }

  // Step 3: Experience-Based Classification
  if (minYears !== null && !isNaN(minYears)) {
    if (minYears <= 2) return { years: minYears, level: 'Entry Level' };
    if (minYears >= 3 && minYears <= 7) return { years: minYears, level: 'Mid Level' };
    if (minYears >= 8 && minYears <= 11) return { years: minYears, level: 'Senior Level' };
    if (minYears >= 12 && minYears <= 14) return { years: minYears, level: 'Lead / Manager' };
    if (minYears >= 15) return { years: minYears, level: 'Director / Executive' };
  }

  // Step 4 & 5: Title-Based Fallback
  const entryKeywords = /\b(junior|graduate|fresher|entry level|associate engineer|associate developer|associate consultant|trainee|early career)\b/;
  const leadKeywords = /\b(lead|manager|architect|program manager|project manager|engineering manager|delivery manager|solution architect|enterprise architect|head of|director)\b/;
  const seniorKeywords = /\b(senior|staff engineer|staff developer|principal engineer|technical lead|senior consultant|senior analyst|principal)\b/;
  const midKeywords = /\b(engineer|developer|consultant|analyst|specialist|administrator|designer|programmer)\b/;

  if (entryKeywords.test(titleText) || /\b(entry level|fresher|recent graduate|fresh graduate)\b/.test(descText)) {
    return { years: 0, level: 'Entry Level' };
  }
  if (leadKeywords.test(titleText)) {
    return { years: 12, level: 'Lead / Manager' };
  }
  if (seniorKeywords.test(titleText)) {
    return { years: 8, level: 'Senior Level' };
  }
  if (midKeywords.test(titleText)) {
    return { years: 3, level: 'Mid Level' };
  }

  // Default Fallback
  return { years: 3, level: 'Mid Level' };
}

/**
 * Heuristically parses employment type from title and description.
 */
function detectEmploymentType(title, description, defaultVal) {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  if (text.includes('internship') || text.includes('intern') || text.includes('trainee')) {
    return 'Internship';
  }
  if (text.includes('apprenticeship') || text.includes('apprentice')) {
    return 'Apprenticeship';
  }
  if (text.includes('contract') || text.includes('temporary') || text.includes('freelance') || text.includes('consultant')) {
    return 'Contract';
  }
  if (text.includes('part-time') || text.includes('part time')) {
    return 'Part-time';
  }
  
  // Clean default values like Workday's timeTypes
  if (defaultVal) {
    const cleanDefault = defaultVal.toLowerCase();
    if (cleanDefault.includes('full')) return 'Full-time';
    if (cleanDefault.includes('part')) return 'Part-time';
    if (cleanDefault.includes('contract')) return 'Contract';
    if (cleanDefault.includes('intern')) return 'Internship';
    if (cleanDefault.includes('apprentice')) return 'Apprenticeship';
  }

  return 'Full-time';
}

function extractSkills(title, description) {
  const combined = `${title} ${description}`;
  const detected = new Set();
  for (const skill of SKILLS_LIST) {
    const escaped = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(combined)) {
      detected.add(skill);
    }
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
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('myworkdayjobs.com')) return 'workday';
  if (lowerUrl.includes('lever.co')) return 'lever';
  if (lowerUrl.includes('greenhouse.io') || lowerUrl.includes('boards.greenhouse.io')) return 'greenhouse';
  return 'generic';
}

/**
 * Classifies jobs into industries.
 */
function classifyIndustry(title, department) {
  const text = `${title} ${department || ''}`.toLowerCase();
  
  if (
    text.includes('software') || text.includes('developer') || text.includes('engineer') || 
    text.includes('programmer') || text.includes('architect') || text.includes('tech') || 
    text.includes('data') || text.includes('cloud') || text.includes('devops') || 
    text.includes('system') || text.includes('infrastructure') || text.includes('security') ||
    text.includes('coder') || text.includes('qa ') || text.includes('testing') || text.includes('network')
  ) {
    return 'Engineering & Technology';
  }
  
  if (
    text.includes('legal') || text.includes('law') || text.includes('counsel') || 
    text.includes('compliance') || text.includes('attorney') || text.includes('patent') ||
    text.includes('solicitor') || text.includes('paralegal')
  ) {
    return 'Legal & Law';
  }
  
  if (
    text.includes('finance') || text.includes('account') || text.includes('audit') || 
    text.includes('tax') || text.includes('business analyst') || text.includes('portfolio') || 
    text.includes('risk') || text.includes('analyst') || text.includes('consultant') ||
    text.includes('treasury') || text.includes('billing') || text.includes('controller')
  ) {
    return 'Business & Finance';
  }
  
  if (
    text.includes('hr') || text.includes('recruiter') || text.includes('people') || 
    text.includes('talent') || text.includes('operations') || text.includes('admin') || 
    text.includes('facilities') || text.includes('human resources') || text.includes('coordinator')
  ) {
    return 'HR & Operations';
  }
  
  if (
    text.includes('marketing') || text.includes('sales') || text.includes('product manager') || 
    text.includes('pr ') || text.includes('media') || text.includes('design') || 
    text.includes('ux') || text.includes('ui') || text.includes('copywriter') ||
    text.includes('branding') || text.includes('creative')
  ) {
    return 'Marketing, Product & Design';
  }
  
  return 'Other / General';
}

// -------------------------------------------------------------
// GEMINI PARSING ENGINE
// -------------------------------------------------------------

let geminiQuotaExceeded = false;

async function parseJobPostingWithAI(text, jobTitle, jobLocation) {
  if (!GEMINI_API_KEY || geminiQuotaExceeded) return null;
  
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  const cleanText = text.substring(0, 15000); 

  for (const model of models) {
    let retries = 0;
    const maxRetries = 4;
    let baseDelay = 5000; 

    while (retries < maxRetries) {
      try {
        console.log(`[Gemini API] Parsing job details for: "${jobTitle}" using model ${model} (attempt ${retries + 1}/${maxRetries})...`);
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await axios.post(apiUrl, {
          contents: [{
            parts: [{
              text: `Analyze this job posting text and extract the exact details requested.
Title: ${jobTitle}
Location: ${jobLocation}

Job Description Text:
${cleanText}`
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                description: { 
                  type: "STRING", 
                  description: "Extract the EXACT, COMPLETE job description details (responsibilities, requirements, technical criteria) VERBATIM from the page. Do NOT summarize, rewrite, or truncate the text. Simply exclude unrelated website cookies banners, headers, and footer menu navigation items. Preserve the exact vocabulary."
                },
                skills: { 
                  type: "ARRAY", 
                  items: { type: "STRING" },
                  description: "Key technical/non-technical tools or skills mentioned in the job description."
                },
                yearsExperience: { 
                  type: "INTEGER",
                  description: "Minimum years of experience requested as a number. For freshers, graduates, or trainees, specify 0."
                },
                experienceLevel: { 
                  type: "STRING", 
                  enum: ["Entry Level", "Mid-Senior Level", "Director / Lead"],
                  description: "Select Entry Level (0-2 years), Mid-Senior Level (3-7 years), or Director / Lead (8+ years)."
                },
                remoteStatus: { 
                  type: "STRING", 
                  enum: ["Remote", "Hybrid", "Onsite", "Unknown"] 
                },
                employmentType: { 
                  type: "STRING", 
                  enum: ["Full-time", "Part-time", "Contract", "Internship", "Apprenticeship"],
                  description: "Select Full-time, Part-time, Contract, Internship (if title or text specifies intern/trainee), or Apprenticeship (if specifies apprentice)."
                }
              },
              required: ["description", "skills", "yearsExperience", "experienceLevel", "remoteStatus", "employmentType"]
            }
          }
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000
        });

        const candidate = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate) {
          return JSON.parse(candidate);
        }
        break; 
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message || '';
        const status = error.response?.status;
        
        const isQuotaExceeded = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('plan and billing') || errMsg.toLowerCase().includes('billing details');
        if (isQuotaExceeded) {
          console.warn(`[Gemini API] Quota/Billing limit hit: "${errMsg}". Disabling AI parser for the rest of this run.`);
          geminiQuotaExceeded = true;
          return null;
        }

        const isRateLimit = status === 429 || errMsg.toLowerCase().includes('rate limit');
        const isHighDemand = status === 503 || errMsg.toLowerCase().includes('high demand') || errMsg.toLowerCase().includes('spikes in demand') || errMsg.toLowerCase().includes('temporary');
        
        if ((isRateLimit || isHighDemand) && retries < maxRetries - 1) {
          retries++;
          const sleepMs = baseDelay * Math.pow(2, retries - 1) + Math.random() * 2000;
          console.warn(`[Gemini API - ${model}] Rate limited/high demand (status ${status || 'unknown'}): ${errMsg.substring(0, 150)}. Retrying in ${(sleepMs/1000).toFixed(1)}s...`);
          await new Promise(resolve => setTimeout(resolve, sleepMs));
        } else {
          console.warn(`[Gemini API - ${model}] Request failed: ${errMsg.substring(0, 200)}`);
          break; 
        }
      }
    }
  }

  console.warn(`[Gemini API] All model attempts failed. Falling back to rule-based heuristics.`);
  return null;
}

// -------------------------------------------------------------
// ADAPTERS (API & PLAYWRIGHT CRAWLERS)
// -------------------------------------------------------------

async function scrapeWorkday(companyId, companyName, careersUrl) {
  const jobs = [];
  const parsed = new URL(careersUrl);
  const host = parsed.hostname;
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const tenant = host.split('.')[0];
  let site = 'Search';
  if (pathSegments.length > 1) site = pathSegments[1];
  else if (pathSegments.length === 1 && pathSegments[0] !== 'en-US') site = pathSegments[0];

  const apiUrl = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
  let offset = 0;
  const limit = 20;
  let hasMore = true;
  let totalJobsProcessed = 0;

  while (hasMore) {
    try {
      const response = await axios.post(apiUrl, { appliedFacets: {}, limit, offset, searchText: '' }, {
        headers: { 
          ...AXIOS_HEADERS,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const postings = response.data.jobPostings || [];
      if (postings.length === 0) {
        hasMore = false;
        break;
      }

      for (const posting of postings) {
        const normLoc = normalizeLocation(posting.locationsText);
        if (!normLoc) continue;

        // Introduce a small pacing delay to distribute queries and prevent Gemini rate spikes
        await new Promise(resolve => setTimeout(resolve, 1500));

        const jobUrl = `https://${host}/${site.toLowerCase()}${posting.externalPath}`;
        const detailApiUrl = `https://${host}/wday/cxs/${tenant}/${site}${posting.externalPath}`;
        
        let description = '';
        let skills = [];
        let exp = { level: 'Mid-Senior Level', years: 3 };
        let applyUrl = jobUrl;
        let remoteStatus = 'Unknown';
        let empType = 'Full-time';
        let deptName = '';

        try {
          const detailRes = await axios.get(detailApiUrl, { 
            headers: AXIOS_HEADERS,
            timeout: 8000 
          });
          if (detailRes.data && detailRes.data.jobPostingInfo) {
            const info = detailRes.data.jobPostingInfo;
            const rawText = (info.jobDescription || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
            
            const aiParsed = await parseJobPostingWithAI(rawText, posting.title, posting.locationsText);
            if (aiParsed) {
              description = aiParsed.description;
              skills = aiParsed.skills;
              exp = { level: aiParsed.experienceLevel, years: aiParsed.yearsExperience };
              remoteStatus = aiParsed.remoteStatus;
              empType = aiParsed.employmentType;
            } else {
              description = rawText;
              exp = extractExperience(description, posting.title);
              skills = extractSkills(posting.title, description);
              remoteStatus = parseRemoteStatus(posting.title, posting.locationsText || '', description);
              empType = detectEmploymentType(posting.title, description, info.timeType);
            }

            if (info.applyUrl) applyUrl = info.applyUrl;
            deptName = info.department || '';
          }
        } catch (e) {
          description = `Job posting available at ${jobUrl}`;
        }

        jobs.push({
          id: generateJobId(companyId, posting.title, posting.locationsText || '', jobUrl, posting.jobReqId),
          companyId,
          companyName,
          title: posting.title,
          description,
          location: posting.locationsText || 'India',
          city: normLoc.city,
          state: normLoc.state,
          country: 'India',
          experienceLevel: exp.level,
          yearsExperience: exp.years,
          employmentType: empType,
          skills,
          applyUrl,
          jobUrl,
          remoteStatus,
          department: deptName,
          industry: classifyIndustry(posting.title, deptName)
        });
      }

      totalJobsProcessed += postings.length;
      if (postings.length < limit || totalJobsProcessed >= 1000) {
        hasMore = false;
      } else {
        offset += limit;
      }
    } catch (err) {
      console.warn(`[Workday Scraper - ${companyName}] Request at offset ${offset} failed: ${err.message}`);
      if (err.response && err.response.data) {
        console.warn(`[Workday Scraper - ${companyName}] Error response body:`, JSON.stringify(err.response.data));
      }
      hasMore = false;
    }
  }
  return jobs;
}

async function scrapeGreenhouse(companyId, companyName, careersUrl) {
  const jobs = [];
  const parsed = new URL(careersUrl);
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  let token = parsed.pathname.includes('/embed/job_board') ? parsed.searchParams.get('token') : pathSegments[0];
  if (!token) throw new Error('Could not parse Greenhouse company token.');

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
  const response = await axios.get(apiUrl, { 
    headers: AXIOS_HEADERS,
    timeout: 15000 
  });
  const postings = response.data.jobs || [];

  for (const posting of postings) {
    const locationName = posting.location?.name || '';
    const normLoc = normalizeLocation(locationName);
    if (!normLoc) continue;

    const rawText = (posting.content || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
    
    let description = '';
    let skills = [];
    let exp = { level: 'Mid-Senior Level', years: 3 };
    let remoteStatus = 'Unknown';
    let empType = 'Full-time';
    const deptName = posting.departments?.[0]?.name || '';

    const aiParsed = await parseJobPostingWithAI(rawText, posting.title, locationName);
    if (aiParsed) {
      description = aiParsed.description;
      skills = aiParsed.skills;
      exp = { level: aiParsed.experienceLevel, years: aiParsed.yearsExperience };
      remoteStatus = aiParsed.remoteStatus;
      empType = aiParsed.employmentType;
    } else {
      description = rawText;
      exp = extractExperience(description, posting.title);
      skills = extractSkills(posting.title, description);
      remoteStatus = parseRemoteStatus(posting.title, locationName, description);
      empType = detectEmploymentType(posting.title, description, 'Full-time');
    }

    jobs.push({
      id: generateJobId(companyId, posting.title, locationName, posting.absolute_url, posting.id?.toString()),
      companyId,
      companyName,
      title: posting.title,
      description,
      location: locationName,
      city: normLoc.city,
      state: normLoc.state,
      country: 'India',
      experienceLevel: exp.level,
      yearsExperience: exp.years,
      employmentType: empType,
      skills,
      applyUrl: posting.absolute_url,
      jobUrl: posting.absolute_url,
      remoteStatus,
      department: deptName,
      industry: classifyIndustry(posting.title, deptName)
    });
  }
  return jobs;
}

async function scrapeLever(companyId, companyName, careersUrl) {
  const jobs = [];
  const parsed = new URL(careersUrl);
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const token = pathSegments[0];
  if (!token) throw new Error('Could not parse Lever company token.');

  const apiUrl = `https://api.lever.co/v0/postings/${token}?mode=json`;
  const response = await axios.get(apiUrl, { 
    headers: AXIOS_HEADERS,
    timeout: 15000 
  });
  const postings = response.data || [];

  for (const posting of postings) {
    const loc = posting.categories?.location || '';
    const normLoc = normalizeLocation(loc);
    if (!normLoc) continue;

    let rawText = posting.descriptionPlain || '';
    if (posting.lists) {
      posting.lists.forEach(l => {
        rawText += `\n${l.text || ''}\n` + (l.content ? l.content.join('\n') : '');
      });
    }

    let description = '';
    let skills = [];
    let exp = { level: 'Mid-Senior Level', years: 3 };
    let remoteStatus = 'Unknown';
    let empType = 'Full-time';
    const deptName = posting.categories?.department || posting.categories?.team || '';

    const aiParsed = await parseJobPostingWithAI(rawText, posting.title, loc);
    if (aiParsed) {
      description = aiParsed.description;
      skills = aiParsed.skills;
      exp = { level: aiParsed.experienceLevel, years: aiParsed.yearsExperience };
      remoteStatus = aiParsed.remoteStatus;
      empType = aiParsed.employmentType;
    } else {
      description = rawText;
      exp = extractExperience(description, posting.title);
      skills = extractSkills(posting.title, description);
      remoteStatus = parseRemoteStatus(posting.title, loc, description);
      empType = detectEmploymentType(posting.title, description, posting.categories?.commitment);
    }

    jobs.push({
      id: generateJobId(companyId, posting.title, loc, posting.hostedUrl, posting.id),
      companyId,
      companyName,
      title: posting.title,
      description,
      location: loc,
      city: normLoc.city,
      state: normLoc.state,
      country: 'India',
      experienceLevel: exp.level,
      yearsExperience: exp.years,
      employmentType: empType,
      skills,
      applyUrl: posting.applyUrl || posting.hostedUrl,
      jobUrl: posting.hostedUrl,
      remoteStatus,
      department: deptName,
      industry: classifyIndustry(posting.title, deptName)
    });
  }
  return jobs;
}

async function scrapeGeneric(companyId, companyName, careersUrl) {
  const jobs = [];
  
  if (!sharedBrowser) {
    sharedBrowser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-http2']
    });
  }

  const context = await sharedBrowser.newContext({ 
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    console.log(`[Generic Scraper] Opening target URL: ${careersUrl}`);
    try {
      await page.goto(careersUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (gotoErr) {
      console.warn(`[Generic Scraper] Initial navigation failed, retrying with commit strategy: ${gotoErr.message}`);
      await page.goto(careersUrl, { waitUntil: 'commit', timeout: 15000 });
    }
    await page.waitForTimeout(2000);

    let jobLinksCount = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors.filter(a => {
        const href = a.href || '';
        return /\/(job|jobs|posting|careers|vacancy|detail|position)\//i.test(href) || href.includes('detail');
      }).length;
    });

    if (jobLinksCount < 2) {
      console.log(`[Generic Scraper] Found few direct job links (${jobLinksCount}). Checking for "Search Positions" navigation links...`);
      const searchRedirectLink = await page.$(
        'a[href*="search" i] >> text="jobs", a >> text="Search Jobs", a >> text="Open Positions", a >> text="View Openings", a >> text="Job Openings", a >> text="Careers Portal", button >> text="Search Jobs", button >> text="View Jobs"'
      );

      if (searchRedirectLink) {
        console.log('[Generic Scraper] Landing page redirect element found. Navigating...');
        const href = await searchRedirectLink.getAttribute('href');
        if (href) {
          const targetUrl = href.startsWith('http') ? href : new URL(href, careersUrl).toString();
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(2000);
        } else {
          await searchRedirectLink.click();
          await page.waitForTimeout(4000);
        }
      }
    }

    // Attempt to automatically apply location filters for India
    console.log('[Generic Scraper] Checking for location input filters...');
    try {
      const locationInputs = await page.$$(
        'input[placeholder*="location" i], input[placeholder*="city" i], input[placeholder*="country" i], input[id*="location" i], input[name*="location" i], input[class*="location" i], input[aria-label*="location" i]'
      );
      
      let filterApplied = false;
      for (const input of locationInputs) {
        const val = await input.inputValue();
        if (!val || val.toLowerCase().trim() === '') {
          console.log(`[Generic Scraper] Found location input. Entering "India"...`);
          await input.click();
          await input.fill('India');
          await input.press('Enter');
          await page.waitForTimeout(3000);
          filterApplied = true;
          break;
        }
      }

      if (!filterApplied) {
        const selectDropdowns = await page.$$('select');
        for (const select of selectDropdowns) {
          const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.innerText })));
          const indiaOpt = options.find(o => o.text.toLowerCase().includes('india') || o.value.toLowerCase() === 'in' || o.text.toLowerCase() === 'in');
          if (indiaOpt) {
             console.log(`[Generic Scraper] Found location select dropdown. Selecting option: "${indiaOpt.text}"`);
             await select.selectOption(indiaOpt.value);
             await page.waitForTimeout(3000);
             filterApplied = true;
             break;
          }
        }
      }

      if (!filterApplied) {
        const generalSearch = await page.$$(
          'input[placeholder*="search" i], input[placeholder*="keyword" i], input[id*="search" i], input[name*="search" i], input[class*="search" i]'
        );
        for (const input of generalSearch) {
          const val = await input.inputValue();
          if (!val || val.toLowerCase().trim() === '') {
            console.log(`[Generic Scraper] Entering "India" in general search input...`);
            await input.click();
            await input.fill('India');
            await input.press('Enter');
            await page.waitForTimeout(3000);
            break;
          }
        }
      }
    } catch (filterErr) {
      console.warn(`[Generic Scraper] Location filter application failed: ${filterErr.message}`);
    }

    // Traverse pagination pages to collect all job listings
    let pageNum = 1;
    const maxPages = 5;
    const allRawJobs = [];
    const seenUrls = new Set();

    while (pageNum <= maxPages) {
      console.log(`[Generic Scraper] Aggregating jobs from page ${pageNum}...`);
      const rawJobs = await page.evaluate(() => {
        const results = [];
        const anchors = Array.from(document.querySelectorAll('a'));
        for (const a of anchors) {
          const href = a.href;
          if (!href) continue;

          const isJob = /\/(job|jobs|posting|careers|vacancy|detail|position)\//i.test(href) || 
                        href.includes('detail') || 
                        href.includes('career-detail');
          if (!isJob) continue;

          let title = a.innerText.trim();
          if (!title && a.parentElement) title = a.parentElement.innerText.trim();
          if (!title) continue;
          title = title.split('\n')[0].trim();
          if (title.length < 5) continue;

          const boilerplate = [
            'cookie policy', 'privacy policy', 'terms of service', 'terms of use', 'ai usage', 'using ai',
            'our story', 'our teams', 'dashboard', 'profile', 'sign in', 'sign-in', 'login', 'log in', 'log-in',
            'logout', 'log out', 'search & apply', 'homepage', 'deutsch', 'english', 'español', 'français',
            'italiano', 'português', 'japanese', 'german', 'french', 'italian', 'spanish', 'korean', 'chinese',
            'portuguese', 'careers', 'our platform', 'culture', 'benefits', 'awards', 'search', 'apply now',
            'apply', 'you can still apply', 'click here', 'read more', 'learn more', 'go back', 'back to search',
            'view profile', 'talent community', 'talent network', 'join us', 'close', 'cancel', 'accept',
            'decline', 'agree', 'cookies', 'all jobs', 'job search', 'open positions', 'view jobs', 'view openings',
            'job openings', 'careers portal', 'careers home', 'about us', 'contact us', 'home', 'faq', 'help',
            'support', 'sitemap', 'skip to main content', 'main content', 'skip to navigation', 'navigation'
          ];
          if (boilerplate.includes(title.toLowerCase())) continue;

          let loc = 'India';
          let p = a.parentElement;
          let depth = 0;
          while (p && depth < 3) {
            const text = p.innerText || '';
            const matches = text.match(/bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|india/i);
            if (matches) {
              loc = matches[0];
              break;
            }
            p = p.parentElement;
            depth++;
          }

          results.push({ title, url: href, location: loc });
        }
        return results;
      });

      for (const item of rawJobs) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allRawJobs.push(item);
        }
      }

      // Check for a next page button
      const nextButton = await page.$(
        'a[aria-label*="next" i], button[aria-label*="next" i], a[class*="next" i], button[class*="next" i], a >> text="Next", button >> text="Next", a:has-text(">"), button:has-text(">"), [class*="pagination" i] a:has-text("Next")'
      );

      if (nextButton) {
        const isDisabled = await nextButton.evaluate(el => 
          el.hasAttribute('disabled') || 
          el.classList.contains('disabled') || 
          el.getAttribute('aria-disabled') === 'true'
        );
        
        if (!isDisabled) {
          console.log(`[Generic Scraper] Clicking "Next Page" button...`);
          await nextButton.click();
          await page.waitForTimeout(4000);
          pageNum++;
        } else {
          console.log(`[Generic Scraper] Next page button is disabled. Exiting pagination.`);
          break;
        }
      } else {
        break;
      }
    }

    console.log(`[Generic Scraper] Crawling details for ${Math.min(15, allRawJobs.length)} filtered postings...`);

    for (const item of allRawJobs.slice(0, 15)) {
      const normLoc = normalizeLocation(item.location) || normalizeLocation(item.title);
      if (!normLoc) continue;

      // Introduce a small pacing delay to distribute queries and prevent Gemini rate spikes
      await new Promise(resolve => setTimeout(resolve, 1500));

      let rawText = `Job listing available at ${item.url}`;
      let description = '';
      let skills = [];
      let exp = { level: 'Mid-Senior Level', years: 3 };
      let remoteStatus = 'Unknown';
      let empType = 'Full-time';

      try {
        const detailPage = await context.newPage();
        await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        
        rawText = await detailPage.evaluate(() => {
          const mainNode = document.querySelector('main, article, [class*="job-details" i], [class*="description" i], [id*="description" i]');
          if (mainNode) return mainNode.innerText;
          return document.body.innerText;
        });
        rawText = rawText.replace(/\s+/g, ' ').trim();
        
        const aiParsed = await parseJobPostingWithAI(rawText, item.title, item.location);
        if (aiParsed) {
          description = aiParsed.description;
          skills = aiParsed.skills;
          exp = { level: aiParsed.experienceLevel, years: aiParsed.yearsExperience };
          remoteStatus = aiParsed.remoteStatus;
          empType = aiParsed.employmentType;
        } else {
          description = rawText;
          exp = extractExperience(description, item.title);
          skills = extractSkills(item.title, description);
          remoteStatus = parseRemoteStatus(item.title, item.location, description);
          empType = detectEmploymentType(item.title, description, 'Full-time');
        }

        await detailPage.close();
      } catch (err) {
        description = rawText;
        exp = extractExperience(description, item.title);
        skills = extractSkills(item.title, description);
        empType = detectEmploymentType(item.title, description, 'Full-time');
      }

      jobs.push({
        id: generateJobId(companyId, item.title, item.location, item.url),
        companyId,
        companyName,
        title: item.title,
        description,
        location: item.location,
        city: normLoc.city,
        state: normLoc.state,
        country: 'India',
        experienceLevel: exp.level,
        yearsExperience: exp.years,
        employmentType: empType,
        skills,
        applyUrl: item.url,
        jobUrl: item.url,
        remoteStatus,
        industry: classifyIndustry(item.title, '')
      });
    }
  } finally {
    await page.close();
    await context.close();
  }
  return jobs;
}

// -------------------------------------------------------------
// ORCHESTRATION ENGINE (CONCURRENCY POOL AND SYNCHRONIZER)
// -------------------------------------------------------------

async function runLocalScraper() {
  const startTime = Date.now();
  console.log('=== GCC Hunt Local Scraper ===');
  console.log(`Starting crawl at: ${new Date().toLocaleString()}`);
  if (GEMINI_API_KEY) {
    console.log('[AI Integration] Gemini flash parser is ACTIVE.');
  } else {
    console.log('[AI Integration] Gemini is INACTIVE. (Set GEMINI_API_KEY environment variable to activate)');
  }

  const excelPath = path.join(__dirname, '..', 'companies.xlsx');
  if (!fs.existsSync(excelPath)) {
    console.error(`Error: Excel file not found at: ${excelPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let existingJobs = [];
  let existingComps = [];
  let existingLogs = [];

  try {
    if (fs.existsSync(JOBS_PATH)) existingJobs = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8'));
    if (fs.existsSync(COMPANIES_PATH)) existingComps = JSON.parse(fs.readFileSync(COMPANIES_PATH, 'utf-8'));
    if (fs.existsSync(LOGS_PATH)) existingLogs = JSON.parse(fs.readFileSync(LOGS_PATH, 'utf-8'));
  } catch (e) {
    console.warn('Warning: Could not load existing JSON files. Overwriting with empty data.');
  }

  const existingJobsMap = new Map(existingJobs.map(j => [j.id, j]));
  const companiesMap = new Map(existingComps.map(c => [c.id, c]));

  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const excelData = xlsx.utils.sheet_to_json(worksheet);
  
  console.log(`Excel sheet loaded. Found ${excelData.length} companies.`);

  const activeCompanies = [];
  for (const row of excelData) {
    const name = row['Company'];
    const url = row['Actual Job Listing'];
    if (!name || !url) continue;

    const id = slugify(name);
    activeCompanies.push({ id, name: name.trim(), url: url.trim() });
    
    if (!companiesMap.has(id)) {
      companiesMap.set(id, {
        id,
        name: name.trim(),
        careersUrl: url.trim(),
        status: 'idle',
        lastScraped: null
      });
    }
  }

  const finalCompaniesList = Array.from(companiesMap.values()).filter(c => 
    activeCompanies.some(ac => ac.id === c.id)
  );

  let successCount = 0;
  let failedCount = 0;
  let crawledJobsPool = [];

  const limitValue = CRAWL_LIMIT.toLowerCase() === 'all' ? finalCompaniesList.length : parseInt(CRAWL_LIMIT) || 50;
  
  const targetCompanies = finalCompaniesList
    .sort((a, b) => {
      const dateA = a.lastScraped ? new Date(a.lastScraped).getTime() : 0;
      const dateB = b.lastScraped ? new Date(b.lastScraped).getTime() : 0;
      return dateA - dateB;
    })
    .slice(0, limitValue);

  console.log(`\nReady to crawl a batch of ${targetCompanies.length} companies (concurrency: 3).`);

  let index = 0;
  
  async function worker() {
    while (index < targetCompanies.length) {
      const comp = targetCompanies[index++];
      if (!comp) continue;

      const compStartTime = Date.now();
      comp.status = 'scraping';
      console.log(`[Scraper] Starting: "${comp.name}" (${comp.careersUrl})`);

      try {
        const ats = detectATS(comp.careersUrl);
        let jobsResult = [];
        
        if (ats === 'workday') jobsResult = await scrapeWorkday(comp.id, comp.name, comp.careersUrl);
        else if (ats === 'greenhouse') jobsResult = await scrapeGreenhouse(comp.id, comp.name, comp.careersUrl);
        else if (ats === 'lever') jobsResult = await scrapeLever(comp.id, comp.name, comp.careersUrl);
        else jobsResult = await scrapeGeneric(comp.id, comp.name, comp.careersUrl);

        const duration = Date.now() - compStartTime;
        successCount++;
        comp.status = 'success';
        comp.lastScraped = new Date().toISOString();

        console.log(`[Scraper] Success: "${comp.name}" | Found ${jobsResult.length} jobs in ${(duration/1000).toFixed(1)}s.`);
        
        crawledJobsPool.push(...jobsResult);

        existingLogs.unshift({
          id: crypto.randomUUID(),
          companyId: comp.id,
          companyName: comp.name,
          status: 'success',
          jobsFound: jobsResult.length,
          executionTime: duration,
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        const duration = Date.now() - compStartTime;
        failedCount++;
        comp.status = 'failed';
        console.error(`[Scraper] Failed: "${comp.name}" | Error: ${err.message}`);

        existingLogs.unshift({
          id: crypto.randomUUID(),
          companyId: comp.id,
          companyName: comp.name,
          status: 'failed',
          errors: err.message,
          executionTime: duration,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  const workers = Array(Math.min(3, targetCompanies.length)).fill(null).map(worker);
  await Promise.all(workers);

  if (sharedBrowser) {
    await sharedBrowser.close();
  }

  const crawledComps = new Set(targetCompanies.filter(c => c.status === 'success').map(c => c.id));
  const crawledJobIds = new Set(crawledJobsPool.map(j => j.id));

  const finalJobsList = [];
  
  for (const job of existingJobs) {
    if (!crawledComps.has(job.companyId)) {
      finalJobsList.push(job);
    } else if (crawledJobIds.has(job.id)) {
      const freshJob = crawledJobsPool.find(j => j.id === job.id);
      finalJobsList.push({
        ...job,
        ...freshJob,
        updatedAt: new Date().toISOString(),
        dateScraped: new Date().toISOString()
      });
      crawledJobIds.delete(job.id);
    }
  }

  for (const newJob of crawledJobsPool) {
    if (crawledJobIds.has(newJob.id)) {
      const titleWords = newJob.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const companyWords = newJob.companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const cityWords = newJob.city.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const skillWords = newJob.skills.map(s => s.toLowerCase());
      
      newJob.keywords = Array.from(new Set([...titleWords, ...companyWords, ...cityWords, ...skillWords])).filter(w => w.length > 1);
      newJob.createdAt = new Date().toISOString();
      newJob.updatedAt = new Date().toISOString();
      newJob.dateScraped = new Date().toISOString();

      finalJobsList.push(newJob);
      crawledJobIds.delete(newJob.id);
    }
  }

  // Final database deduplication safety pass
  const uniqueFinalJobsList = [];
  const seenFinalIds = new Set();
  for (const job of finalJobsList) {
    if (!seenFinalIds.has(job.id)) {
      seenFinalIds.add(job.id);
      uniqueFinalJobsList.push(job);
    }
  }

  fs.writeFileSync(JOBS_PATH, JSON.stringify(uniqueFinalJobsList, null, 2));
  fs.writeFileSync(COMPANIES_PATH, JSON.stringify(finalCompaniesList, null, 2));
  fs.writeFileSync(LOGS_PATH, JSON.stringify(existingLogs.slice(0, 100), null, 2));

  const totalTime = Date.now() - startTime;
  console.log('\n======================================');
  console.log(`Crawl Finished in ${(totalTime/1000/60).toFixed(1)} mins.`);
  console.log(`Succeeded: ${successCount} | Failed: ${failedCount}`);
  console.log(`Jobs active in local database: ${finalJobsList.length}`);
  console.log('======================================');
}

runLocalScraper().catch(console.error);
