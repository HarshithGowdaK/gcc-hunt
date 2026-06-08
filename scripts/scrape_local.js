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

// Data output file paths
const DATA_DIR = path.join(__dirname, '..', 'web', 'src', 'data');
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json');
const COMPANIES_PATH = path.join(DATA_DIR, 'companies.json');
const LOGS_PATH = path.join(DATA_DIR, 'scrape_logs.json');

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
  return { years, level };
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

    try {
      const detailRes = await axios.get(detailApiUrl, { timeout: 8000 });
      if (detailRes.data && detailRes.data.jobPostingInfo) {
        const info = detailRes.data.jobPostingInfo;
        description = (info.jobDescription || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
        exp = extractExperience(description);
        skills = extractSkills(posting.title, description);
        if (info.applyUrl) applyUrl = info.applyUrl;
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
      employmentType: posting.timeType || 'Full-time',
      skills,
      applyUrl,
      jobUrl,
      remoteStatus: parseRemoteStatus(posting.title, posting.locationsText || '', description)
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

    const description = (posting.content || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
    const exp = extractExperience(description);
    const skills = extractSkills(posting.title, description);

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
      employmentType: 'Full-time',
      skills,
      applyUrl: posting.absolute_url,
      jobUrl: posting.absolute_url,
      remoteStatus: parseRemoteStatus(posting.title, locationName, description),
      department: posting.departments?.[0]?.name
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

    let desc = posting.descriptionPlain || '';
    if (posting.lists) {
      posting.lists.forEach(l => {
        desc += `\n${l.text || ''}\n` + (l.content ? l.content.join('\n') : '');
      });
    }

    const exp = extractExperience(desc);
    const skills = extractSkills(posting.title, desc);

    jobs.push({
      id: generateJobId(companyId, posting.title, loc, posting.hostedUrl, posting.id),
      companyId,
      companyName,
      title: posting.title,
      description: desc,
      location: loc,
      city: normLoc.city,
      state: normLoc.state,
      country: 'India',
      experienceLevel: exp.level,
      yearsExperience: exp.years,
      employmentType: posting.categories?.commitment || 'Full-time',
      skills,
      applyUrl: posting.applyUrl || posting.hostedUrl,
      jobUrl: posting.hostedUrl,
      remoteStatus: parseRemoteStatus(posting.title, loc, desc),
      department: posting.categories?.department
    });
  }
  return jobs;
}

async function scrapeGeneric(companyId, companyName, careersUrl) {
  const jobs = [];
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    await page.goto(careersUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Heuristically extract visible anchors
    const rawJobs = await page.evaluate(() => {
      const results = [];
      const anchors = Array.from(document.querySelectorAll('a'));
      const seen = new Set();
      for (const a of anchors) {
        const href = a.href;
        if (!href || seen.has(href)) continue;

        const isJob = /\/(job|jobs|posting|careers|vacancy|detail|position)\//i.test(href) || href.includes('detail');
        if (!isJob) continue;

        let title = a.innerText.trim();
        if (!title && a.parentElement) title = a.parentElement.innerText.trim().split('\n')[0];
        if (!title || title.length < 5) continue;

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

    for (const item of rawJobs.slice(0, 5)) {
      const normLoc = normalizeLocation(item.location) || normalizeLocation(item.title);
      if (!normLoc) continue;

      let desc = `Job listing available at ${item.url}`;
      let exp = { level: 'Mid-Senior Level', years: 3 };
      let skills = [];

      try {
        const detailPage = await context.newPage();
        await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        desc = await detailPage.evaluate(() => document.body.innerText);
        desc = desc.replace(/\s+/g, ' ').trim();
        exp = extractExperience(desc);
        skills = extractSkills(item.title, desc);
        await detailPage.close();
      } catch (err) {}

      jobs.push({
        id: generateJobId(companyId, item.title, item.location, item.url),
        companyId,
        companyName,
        title: item.title,
        description: desc,
        location: item.location,
        city: normLoc.city,
        state: normLoc.state,
        country: 'India',
        experienceLevel: exp.level,
        yearsExperience: exp.years,
        employmentType: 'Full-time',
        skills,
        applyUrl: item.url,
        jobUrl: item.url,
        remoteStatus: parseRemoteStatus(item.title, item.location, desc)
      });
    }
  } finally {
    if (browser) await browser.close();
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

  const batchLimit = 25; 
  const targetCompanies = finalCompaniesList
    .sort((a, b) => {
      const dateA = a.lastScraped ? new Date(a.lastScraped).getTime() : 0;
      const dateB = b.lastScraped ? new Date(b.lastScraped).getTime() : 0;
      return dateA - dateB;
    })
    .slice(0, batchLimit);

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
