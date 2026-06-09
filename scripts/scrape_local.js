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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CRAWL_LIMIT = process.env.LIMIT || '50'; // defaults to 50, set to 'all' for complete run

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
  if (cleanLoc.includes('india') || cleanLoc.includes('in')) {
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

function extractExperience(description) {
  const text = description.toLowerCase();
  
  if (
    text.includes('fresher') || 
    text.includes('no experience') || 
    text.includes('0 years') || 
    text.includes('0-1 years') || 
    text.includes('graduate role') ||
    text.includes('intern') || 
    text.includes('junior developer')
  ) {
    return { years: 0, level: 'Entry Level' };
  }

  const regexes = [
    /(\d+)\s*(?:to|-)\s*(\d+)\s*years?/g,
    /(\d+)\+?\s*years?\s*(?:of\s*)?experience/g
  ];
  let years;
  for (const regex of regexes) {
    const match = regex.exec(text);
    if (match) {
      years = parseInt(match[1], 10);
      break;
    }
  }
  let level = 'Mid-Senior Level';
  if (years !== undefined) {
    if (years <= 2) level = 'Entry Level';
    else if (years >= 8) level = 'Director / Lead';
  }
  return { years: years || 3, level };
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
 * Classifies jobs into high-level industries based on title and department.
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
// CHATGPT PARSING ENGINE
// -------------------------------------------------------------

async function parseJobPostingWithAI(text, jobTitle, jobLocation) {
  if (!OPENAI_API_KEY) return null;
  
  try {
    const cleanText = text.substring(0, 8000);
    
    console.log(`[ChatGPT API] Parsing job details for: "${jobTitle}"...`);
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an HR parsing assistant. Extract job metadata from text and return a strict JSON format.'
        },
        {
          role: 'user',
          content: `Analyze this job posting and extract the following details in JSON format:
1. "description": Extract the EXACT, COMPLETE job description details (responsibilities, requirements, technical criteria) VERBATIM from the page. Do NOT summarize, rewrite, or truncate the text. Simply exclude unrelated website cookies banners, headers, and footer menu navigation items. Preserve the exact vocabulary.
2. "skills": String array of technical/non-technical tools mentioned.
3. "yearsExperience": Minimum years of experience requested as a number. If it is for freshers, graduates, or trainees, specify 0.
4. "experienceLevel": Specify either "Entry Level", "Mid-Senior Level", or "Director / Lead".
5. "remoteStatus": Specify either "Remote", "Hybrid", "Onsite", or "Unknown".
6. "employmentType": "Full-time", "Part-time", "Contract", or "Internship".

Format output as valid JSON:
{
  "description": "...",
  "skills": ["React", "Python"],
  "yearsExperience": 0,
  "experienceLevel": "Entry Level",
  "remoteStatus": "Hybrid",
  "employmentType": "Full-time"
}

Text:
Title: ${jobTitle}
Location: ${jobLocation}
${cleanText}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    return JSON.parse(res.data.choices[0].message.content);
  } catch (error) {
    console.warn(`[ChatGPT API] Parsing failed: ${error.message}. Falling back to rule-based heuristics.`);
    return null;
  }
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
  const response = await axios.post(apiUrl, { appliedFacets: {}, limit: 30, offset: 0, searchText: '' }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    timeout: 15000
  });

  const postings = response.data.jobPostings || [];
  for (const posting of postings) {
    const normLoc = normalizeLocation(posting.locationsText);
    if (!normLoc) continue;

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
      const detailRes = await axios.get(detailApiUrl, { timeout: 8000 });
      if (detailRes.data && detailRes.data.jobPostingInfo) {
        const info = detailRes.data.jobPostingInfo;
        const rawText = (info.jobDescription || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
        
        // Attempt AI parse
        const aiParsed = await parseJobPostingWithAI(rawText, posting.title, posting.locationsText);
        if (aiParsed) {
          description = aiParsed.description;
          skills = aiParsed.skills;
          exp = { level: aiParsed.experienceLevel, years: aiParsed.yearsExperience };
          remoteStatus = aiParsed.remoteStatus;
          empType = aiParsed.employmentType;
        } else {
          // Rule-based fallback (exact descriptions)
          description = rawText;
          exp = extractExperience(description);
          skills = extractSkills(posting.title, description);
          remoteStatus = parseRemoteStatus(posting.title, posting.locationsText || '', description);
          empType = info.timeType || 'Full-time';
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
  return jobs;
}

async function scrapeGreenhouse(companyId, companyName, careersUrl) {
  const jobs = [];
  const parsed = new URL(careersUrl);
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  let token = parsed.pathname.includes('/embed/job_board') ? parsed.searchParams.get('token') : pathSegments[0];
  if (!token) throw new Error('Could not parse Greenhouse company token.');

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
  const response = await axios.get(apiUrl, { timeout: 15000 });
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
      exp = extractExperience(description);
      skills = extractSkills(posting.title, description);
      remoteStatus = parseRemoteStatus(posting.title, locationName, description);
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
  const response = await axios.get(apiUrl, { timeout: 15000 });
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
    let empType = posting.categories?.commitment || 'Full-time';
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
      exp = extractExperience(description);
      skills = extractSkills(posting.title, description);
      remoteStatus = parseRemoteStatus(posting.title, loc, description);
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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  const context = await sharedBrowser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    console.log(`[Generic Scraper] Opening target URL: ${careersUrl}`);
    await page.goto(careersUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Heuristically verify if we are on a landing page rather than a job listings board
    let jobLinksCount = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors.filter(a => {
        const href = a.href || '';
        return /\/(job|jobs|posting|careers|vacancy|detail|position)\//i.test(href) || href.includes('detail');
      }).length;
    });

    // Landing Page Redirection: Search for a link/button to redirect to the actual listings board
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

    // Heuristically extract visible anchors again on search board page
    const rawJobs = await page.evaluate(() => {
      const results = [];
      const anchors = Array.from(document.querySelectorAll('a'));
      const seen = new Set();
      for (const a of anchors) {
        const href = a.href;
        if (!href || seen.has(href)) continue;

        const isJob = /\/(job|jobs|posting|careers|vacancy|detail|position)\//i.test(href) || 
                      href.includes('detail') || 
                      href.includes('career-detail');
        if (!isJob) continue;

        let title = a.innerText.trim();
        if (!title && a.parentElement) title = a.parentElement.innerText.trim().split('\n')[0];
        if (!title || title.length < 5) continue;

        // Parent climbing to identify locations
        let loc = 'India';
        let p = a.parentElement;
        let depth = 0;
        while (p && depth < 3) {
          const text = p.innerText || '';
          const matches = text.match(/bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi/i);
          if (matches) {
            loc = matches[0];
            break;
          }
          p = p.parentElement;
          depth++;
        }

        seen.add(href);
        results.push({ title, url: href, location: loc });
      }
      return results;
    });

    console.log(`[Generic Scraper] Crawling details for ${Math.min(8, rawJobs.length)} filtered postings...`);

    // Crawl details for valid India items
    for (const item of rawJobs.slice(0, 8)) {
      const normLoc = normalizeLocation(item.location) || normalizeLocation(item.title);
      if (!normLoc) continue;

      let rawText = `Job listing available at ${item.url}`;
      let description = '';
      let skills = [];
      let exp = { level: 'Mid-Senior Level', years: 3 };
      let remoteStatus = 'Unknown';
      let empType = 'Full-time';

      try {
        const detailPage = await context.newPage();
        await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        
        // Find main details card node to get exact description
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
          // Exact text match logic
          description = rawText;
          exp = extractExperience(description);
          skills = extractSkills(item.title, description);
          remoteStatus = parseRemoteStatus(item.title, item.location, description);
        }

        await detailPage.close();
      } catch (err) {
        description = rawText;
        exp = extractExperience(description);
        skills = extractSkills(item.title, description);
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
  if (OPENAI_API_KEY) {
    console.log('[AI Integration] ChatGPT GPT-4o-mini parser is ACTIVE.');
  } else {
    console.log('[AI Integration] ChatGPT is INACTIVE. (Set OPENAI_API_KEY environment variable to activate)');
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
    }
  }

  fs.writeFileSync(JOBS_PATH, JSON.stringify(finalJobsList, null, 2));
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
