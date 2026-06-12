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
  'india (english)', 'canada (english)', 'united states (english)',
  'all other countries (english)', 'fostering belonging',
  'cohesity gives back', 'lca notice', 'careers', 'search jobs',
  'skip to main content', 'skip to content', 'main content',
  'home', 'menu', 'site map', 'privacy', 'terms', 'contact us',
  'accessibility', 'search', 'careers home',
];

const COUNTRY_NAME_TITLES = /^(argentina|australia|austria|belgium|brazil|canada|chile|china|colombia|denmark|finland|france|germany|hong kong|indonesia|ireland|israel|italy|japan|korea|mexico|netherlands|new zealand|norway|poland|portugal|singapore|spain|sweden|switzerland|taiwan|thailand|uk|united kingdom|united states|usa|vietnam)$/i;

function normalizeLocation(locationStr) {
  if (!locationStr) return null;
  const cleanLoc = String(locationStr).toLowerCase();
  for (const key of Object.keys(INDIAN_CITIES_MAP)) {
    if (cleanLoc.includes(key)) return { ...INDIAN_CITIES_MAP[key], country: 'India' };
  }
  if (/\b(india|in)\b/i.test(cleanLoc)) return { city: 'India', state: 'India', country: 'India' };
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
  if (t.length < 3) return false;
  if (COUNTRY_NAME_TITLES.test(t.trim())) return false;
  for (const b of BLOCKED_TITLES) {
    if (t.includes(b)) return false;
  }
  return true;
}

function isObviousNonIndiaRole(title) {
  return /\b(europe|emea|germany|france|italy|poland|australia|new zealand|canada|united states|usa|uk|saudi|japan|china|singapore|korea|argentina|chile|brazil|mexico)\b/i.test(String(title || ''));
}

module.exports = {
  INDIAN_CITIES_MAP,
  normalizeLocation,
  parseRemoteStatus,
  detectEmploymentType,
  extractSkills,
  classifyIndustry,
  isValidJobCandidate,
  isObviousNonIndiaRole,
};
