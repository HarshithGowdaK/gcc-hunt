import * as crypto from 'crypto';

// Mapping of common Indian cities to their respective states
const INDIAN_CITIES_MAP: { [key: string]: { city: string; state: string } } = {
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
  chandigarh: { city: 'Chandigarh', state: 'Punjab' },
  lucknow: { city: 'Lucknow', state: 'Uttar Pradesh' }
};

// Popular tech skills to extract from description
const SKILLS_LIST = [
  'React', 'Angular', 'Vue', 'Next.js', 'HTML', 'CSS', 'JavaScript', 'TypeScript',
  'Node.js', 'Express', 'NestJS', 'Python', 'Django', 'Flask', 'FastAPI', 'Java',
  'Spring Boot', 'Spring', 'Kotlin', 'Swift', 'Objective-C', 'Go', 'Golang', 'Rust',
  'C++', 'C#', '.NET', 'ASP.NET', 'PHP', 'Laravel', 'Ruby', 'Rails', 'SQL',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Cassandra', 'DynamoDB', 'Oracle',
  'Firebase', 'Firestore', 'AWS', 'Azure', 'GCP', 'Google Cloud', 'Docker',
  'Kubernetes', 'Terraform', 'CI/CD', 'Git', 'GitHub', 'GitLab', 'Jenkins',
  'Ansible', 'Linux', 'DevOps', 'Machine Learning', 'AI', 'Deep Learning', 'NLP',
  'Computer Vision', 'PyTorch', 'TensorFlow', 'Pandas', 'NumPy', 'Spark', 'Hadoop',
  'Kafka', 'RabbitMQ', 'GraphQL', 'REST', 'Microservices', 'Agile', 'Scrum',
  'Jira', 'Figma', 'UI/UX', 'QA', 'Testing', 'Selenium', 'Playwright', 'Cypress',
  'Jest', 'Mocha', 'Tableau', 'Power BI', 'Scala', 'Haskell', 'Elasticsearch',
  'Redux', 'GraphQL', 'Sass', 'Webpack', 'Vite'
];

/**
 * Normalizes a location string to check if it represents an Indian location.
 * If yes, resolves the city, state, and country. If not, returns null.
 */
export function normalizeLocation(locationStr: string): { city: string; state: string; country: string } | null {
  if (!locationStr) return null;
  const cleanLoc = locationStr.toLowerCase();

  // Quick check for India context
  const hasIndia = cleanLoc.includes('india') || cleanLoc.includes('in');

  // Search for known Indian cities
  for (const key of Object.keys(INDIAN_CITIES_MAP)) {
    // Exact word boundary check or simple inclusion
    const cityIndex = cleanLoc.indexOf(key);
    if (cityIndex !== -1) {
      const match = INDIAN_CITIES_MAP[key];
      return {
        city: match.city,
        state: match.state,
        country: 'India'
      };
    }
  }

  // If "India" is explicitly mentioned but no specific city is matched, return general values
  if (hasIndia) {
    return {
      city: 'India',
      state: 'India',
      country: 'India'
    };
  }

  return null;
}

/**
 * Parses remote, hybrid, or onsite status from title, location, or description.
 */
export function parseRemoteStatus(title: string, location: string, description: string): 'Remote' | 'Hybrid' | 'Onsite' | 'Unknown' {
  const combinedText = `${title} ${location} ${description}`.toLowerCase();
  
  if (combinedText.includes('work from home') || combinedText.includes('wfh') || combinedText.includes('remote')) {
    return 'Remote';
  }
  if (combinedText.includes('hybrid') || combinedText.includes('flexible work') || combinedText.includes('work from anywhere')) {
    return 'Hybrid';
  }
  if (combinedText.includes('onsite') || combinedText.includes('on-site') || combinedText.includes('office')) {
    return 'Onsite';
  }
  
  return 'Unknown';
}

/**
 * Extracts years of experience from job details, if available.
 */
export function extractExperience(description: string): { years?: number; level: string } {
  const text = description.toLowerCase();
  
  // Regex to match "3+ years", "5-8 years", "experience of 4 years", etc.
  const regexes = [
    /(\d+)\s*(?:to|-)\s*(\d+)\s*years?/g,
    /(\d+)\+?\s*years?\s*(?:of\s*)?experience/g,
    /experience\s*(?:of\s*)?(\d+)\+?\s*years?/g,
    /(\d+)\s*yrs/g
  ];

  let years: number | undefined;

  for (const regex of regexes) {
    const match = regex.exec(text);
    if (match) {
      if (match[2]) {
        // Range matched, take the minimum
        years = parseInt(match[1], 10);
      } else {
        years = parseInt(match[1], 10);
      }
      break;
    }
  }

  // Determine experience level based on years or keywords
  let level = 'Mid-Senior Level';
  if (years !== undefined) {
    if (years <= 2) level = 'Entry Level';
    else if (years >= 8) level = 'Director / Lead';
    else level = 'Mid-Senior Level';
  } else {
    // Keyword fallback
    if (text.includes('intern') || text.includes('graduate') || text.includes('entry level') || text.includes('junior')) {
      level = 'Entry Level';
      years = 0;
    } else if (text.includes('director') || text.includes('principal') || text.includes('architect') || text.includes('lead') || text.includes('manager')) {
      level = 'Director / Lead';
      years = 8;
    }
  }

  return { years, level };
}

/**
 * Extracts list of skills matching our pre-defined list.
 */
export function extractSkills(title: string, description: string): string[] {
  const combined = `${title} ${description}`;
  const detectedSkills = new Set<string>();

  for (const skill of SKILLS_LIST) {
    // Regex boundary check for exact words (e.g. "Go" should not match "good")
    // Escape special characters in skills like .NET, C++
    const escapedSkill = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedSkill}\\b`, 'i');
    if (regex.test(combined)) {
      detectedSkills.add(skill);
    }
  }

  return Array.from(detectedSkills);
}

/**
 * Generates a stable unique hash for deduplication.
 */
export function generateJobId(companyId: string, title: string, location: string, url: string, originalId?: string): string {
  if (originalId) {
    return `${companyId}-${originalId}`.replace(/[^a-zA-Z0-9\-_]/g, '');
  }

  // Create hash of fields
  const content = `${companyId.trim()}|${title.trim()}|${location.trim()}|${url.trim()}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 24);
}

/**
 * Slugifies string for database IDs.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .trim()                         // Trim leading/trailing whitespace
    .replace(/^-+/, '')             // Trim leading -
    .replace(/-+$/, '');            // Trim trailing -
}
