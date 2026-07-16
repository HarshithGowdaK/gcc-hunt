'use strict';

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
  bhubaneswar: { city: 'Bhubaneswar', state: 'Odisha' },
};

const SKILLS_LIST = [
  'React', 'Angular', 'Vue', 'Next.js', 'HTML', 'CSS', 'JavaScript', 'TypeScript',
  'Node.js', 'Express', 'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring Boot',
  'Kotlin', 'Swift', 'Go', 'Golang', 'Rust', 'C++', 'C#', '.NET', 'ASP.NET', 'SQL',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'AWS', 'Azure', 'GCP', 'Docker',
  'Kubernetes', 'Terraform', 'CI/CD', 'Git', 'GitHub', 'DevOps', 'Machine Learning',
  'AI', 'Deep Learning', 'Pandas', 'NumPy', 'Spark', 'Kafka', 'GraphQL', 'REST',
];

const BLOCKED_TITLES = [
  'view and apply', 'open jobs', 'latest vacancies', 'clear filters',
  'load more', 'view all jobs',
  'india (english)', 'canada (english)', 'united states (english)',
  'all other countries (english)', 'fostering belonging',
  'cohesity gives back', 'lca notice', 'careers', 'search jobs',
  'skip to main content', 'skip to content', 'main content',
  'home', 'menu', 'site map', 'privacy', 'terms', 'contact us',
  'accessibility', 'careers home',
];

const COUNTRY_NAME_TITLES = /^(argentina|australia|austria|belgium|brazil|canada|chile|china|colombia|denmark|finland|france|germany|hong kong|indonesia|ireland|israel|italy|japan|korea|mexico|netherlands|new zealand|norway|poland|portugal|singapore|spain|sweden|switzerland|taiwan|thailand|uk|united kingdom|united states|usa|vietnam)$/i;

const LOCATION_NAME_TITLES = /^(africa|asia|europe|middle east|north america|south america|latin america|emea|apac|americas|global|remote|hybrid|on-site|onsite|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|delhi|new delhi|kolkata|ahmedabad|jaipur|indore|india)$/i;

const EXACT_BAD_TITLES = new Set([
  'apply',
  'search',
  'filter',
  'filters',
  'clear',
  'clear filter',
  'clear filters',
]);

function normalizeLocation(locationStr) {
  if (!locationStr) return null;
  const cleanLoc = String(locationStr).toLowerCase();
  const keys = Object.keys(INDIAN_CITIES_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (cleanLoc.includes(key)) return { ...INDIAN_CITIES_MAP[key], country: 'India' };
  }
  if (/\b(india)\b/i.test(cleanLoc) || /\bIN\b/.test(locationStr)) return { city: 'India', state: 'India', country: 'India' };
  return null;
}

function isGenericIndiaLocation(locationStr) {
  const clean = String(locationStr || '').trim().toLowerCase();
  return clean === 'india' || clean === 'in' || clean === 'india, india' || clean === 'remote india' || clean === 'pan india';
}

function extractIndianLocation(...sources) {
  const cityKeys = Object.keys(INDIAN_CITIES_MAP).sort((a, b) => b.length - a.length);

  for (const source of sources) {
    const text = String(source || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const focused = text.slice(0, 2500);
    for (const key of cityKeys) {
      const escaped = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const match = focused.match(new RegExp(`\\b${escaped}\\b`, 'i'));
      if (match) {
        const norm = INDIAN_CITIES_MAP[key];
        return {
          location: `${norm.city}, ${norm.state}, India`,
          city: norm.city,
          state: norm.state,
          country: 'India',
          matched: match[0],
        };
      }
    }
  }

  for (const source of sources) {
    const text = String(source || '');
    const isLongText = text.length > 300;
    const hasIndiaSignal = /\b(india|remote\s*india|india\s*remote|pan\s*india)\b/i.test(text) || (!isLongText && /\bIN\b/.test(text));
    if (hasIndiaSignal) {
      return {
        location: 'India',
        city: 'India',
        state: 'India',
        country: 'India',
        matched: 'India',
      };
    }
  }

  return null;
}

function parseRemoteStatus(title, location, description) {
  const combined = `${title} ${location} ${description}`.toLowerCase();
  if (/\b(remote|work from home|wfh|anywhere)\b/.test(combined)) {
    if (/\b(india|indian)\b/.test(combined) || /\bremote\s+india\b/.test(combined)) return 'Remote';
    if (!/\b(europe|emea|us|usa|uk|canada|australia)\b/.test(combined)) return 'Remote';
    return 'Remote';
  }
  if (/\bhybrid\b/.test(combined) || /\bflexible\b/.test(combined)) return 'Hybrid';
  if (/\bonsite\b/.test(combined) || /\boffice\b/.test(combined)) return 'Onsite';
  return 'Unknown';
}

function detectEmploymentType(title, description, defaultVal) {
  const text = `${title} ${description || ''}`.toLowerCase();
  if (/\binternship\b|\bintern\b|\btrainee\b/.test(text)) return 'Internship';
  if (/\bapprenticeship\b|\bapprentice\b/.test(text)) return 'Apprenticeship';
  if (/\bcontract\b|\btemporary\b|\bfreelance\b/.test(text)) return 'Contract';
  if (/\bpart-time\b|\bpart time\b/.test(text)) return 'Part-time';
  if (defaultVal) {
    const d = String(defaultVal).toLowerCase();
    if (d.includes('full')) return 'Full-time';
    if (d.includes('part')) return 'Part-time';
    if (d.includes('contract')) return 'Contract';
    if (d.includes('intern')) return 'Internship';
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

function stripBoilerplateSections(text) {
  if (!text) return '';
  let cleaned = String(text);
  const stopPatterns = [
    /\bA little about ADP\b/i,
    /\bAbout ADP\b/i,
    /\bWHY ADP\??\b/i,
    /\bLife\s*@\s*ADP\b/i,
    /\bDiversity,\s*Equity,\s*Inclusion\b/i,
    /\bDiversity\s*&\s*Equal Employment Opportunity\b/i,
    /\bEqual Employment Opportunity\b/i,
    /\bEthics at ADP\b/i,
    /\bCorporate Social Responsibility\b/i,
    /\bInclusion and Diversity\b/i,
  ];

  const firstStop = stopPatterns
    .map(pattern => {
      const match = cleaned.match(pattern);
      return match ? match.index : -1;
    })
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstStop !== undefined) {
    cleaned = cleaned.substring(0, firstStop);
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

function classifyIndustry(title, department) {
  const text = `${title} ${department || ''}`.toLowerCase();
  if (/software|developer|engineer|programmer|architect|tech|data|cloud|devops|system|infrastructure|security|coder|qa |testing|network/.test(text)) {
    return 'Engineering & Technology';
  }
  if (/legal|law|counsel|compliance|attorney|patent|solicitor|paralegal/.test(text)) {
    return 'Legal & Law';
  }
  if (/finance|accounting|audit|tax|fp&a|treasury/.test(text)) return 'Finance & Accounting';
  if (/hr|human resources|recruiting|talent|people ops/.test(text)) return 'Human Resources';
  if (/sales|marketing|brand|growth|demand/.test(text)) return 'Sales & Marketing';
  if (/operations|supply chain|logistics|procurement/.test(text)) return 'Operations';
  return 'Other';
}

function isValidJobCandidate(title) {
  const t = String(title || '').trim().toLowerCase();
  if (t.length < 5) return false;
  if (EXACT_BAD_TITLES.has(t)) return false;
  if (COUNTRY_NAME_TITLES.test(t.trim())) return false;
  if (LOCATION_NAME_TITLES.test(t.trim())) return false;
  for (const b of BLOCKED_TITLES) {
    if (t === b || t.includes(b)) return false;
  }
  return true;
}

function getJobCandidateRejectionReason(job) {
  const title = String(job?.title || '').trim();
  const url = String(job?.url || job?.jobUrl || job?.applyUrl || '').trim();
  const t = title.toLowerCase();
  if (!title) return 'missing_title';
  if (title.length < 5) return 'title_too_short';
  if (EXACT_BAD_TITLES.has(t)) return 'bad_title';
  if (COUNTRY_NAME_TITLES.test(t)) return 'country_filter_link';
  if (LOCATION_NAME_TITLES.test(t)) return 'location_filter_link';
  for (const b of BLOCKED_TITLES) {
    if (t === b || t.includes(b)) return 'bad_title';
  }
  if (!url) return 'missing_url';
  if (!/^https?:\/\//i.test(url)) return 'bad_url';
  return null;
}

function isLikelyJobUrl(url) {
  const href = String(url || '');
  if (!href) return false;
  try {
    const parsed = new URL(href);
    if (/jobs\.adp\.com$/i.test(parsed.hostname)) {
      return /^\/[a-z]{2}\/jobs\/ind[\w-]+\//i.test(parsed.pathname) ||
        /^\/jobs\/ind[\w-]+\//i.test(parsed.pathname);
    }
  } catch {
    // Fall through to the generic URL checks below.
  }
  const hasJobSignal = /\/(job|jobs|posting|position|opportunity|opening)\//i.test(href) ||
    /[?&](jobId|job_id|gh_jid|career_job_req_id|jobReqId|req_id)=/i.test(href) ||
    /\/job-description\/|\/job-details\/|\/careers\/job\//i.test(href) ||
    /brassring\.com\/.*(?:jobdetails|jobdetail|search\/jobdetails)/i.test(href);
  const isFilterOnly = /[?&](mylocation|location|country|filter|facet)=/i.test(href) &&
    !/[?&](jobId|job_id|gh_jid|career_job_req_id|jobReqId|req_id)=/i.test(href) &&
    !/\/(job|posting|position|opportunity|opening)\//i.test(href);
  return hasJobSignal && !isFilterOnly;
}

function isObviousNonIndiaRole(title) {
  return /\b(europe|emea|germany|france|italy|poland|australia|new zealand|canada|united states|usa|uk|saudi|japan|china|singapore|korea|argentina|chile|brazil|mexico)\b/i.test(String(title || ''));
}

module.exports = {
  INDIAN_CITIES_MAP,
  normalizeLocation,
  isGenericIndiaLocation,
  extractIndianLocation,
  parseRemoteStatus,
  detectEmploymentType,
  extractSkills,
  stripBoilerplateSections,
  classifyIndustry,
  isValidJobCandidate,
  getJobCandidateRejectionReason,
  isLikelyJobUrl,
  isObviousNonIndiaRole,
};
