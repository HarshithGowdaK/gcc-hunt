'use server';

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Type definitions to ensure TypeScript compiler satisfies previous interfaces
interface Job {
  id: string;
  title: string;
  companyName: string;
  companyId: string;
  location: string;
  city: string;
  state: string;
  experienceLevel?: string;
  yearsExperience?: number;
  yearsExperienceMax?: number;
  employmentType?: string;
  skills: string[];
  applyUrl: string;
  jobUrl: string;
  postedDate?: string;
  remoteStatus?: 'Remote' | 'Hybrid' | 'Onsite' | 'Unknown';
  createdAt: string;
  keywords?: string[];
  department?: string;
  description: string;
  dateScraped?: string;
  industry?: string;

  // New fields persisted
  experience_min?: number | null;
  experience_max?: number | null;
  experience_midpoint?: number | null;
  experience_text?: string | null;
  career_level?: string;
  classification_confidence?: number;
  classification_version?: string;
  warning?: string | null;
  needs_review?: boolean;
  classification_source?: string;
  isNew?: boolean;
  hrLinkedin?: string;
}

const cache = {
  jobs: { data: [] as Job[], mtime: 0 },
  companies: { data: [] as any[], mtime: 0 },
  logs: { data: [] as any[], mtime: 0 }
};

function readData(filename: string, cacheKey: 'jobs' | 'companies' | 'logs') {
  const filePath = path.join(process.cwd(), 'src/data', filename);
  
  if (filename === 'jobs.json') {
    const gzPath = filePath + '.gz';
    if (fs.existsSync(gzPath)) {
      const stats = fs.statSync(gzPath);
      if (stats.mtimeMs > cache[cacheKey].mtime) {
        const compressed = fs.readFileSync(gzPath);
        cache[cacheKey].data = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
        cache[cacheKey].mtime = stats.mtimeMs;
      }
      return cache[cacheKey].data;
    }
  }

  if (!fs.existsSync(filePath)) return [];
  
  const stats = fs.statSync(filePath);
  if (stats.mtimeMs > cache[cacheKey].mtime) {
    cache[cacheKey].data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    cache[cacheKey].mtime = stats.mtimeMs;
  }
  return cache[cacheKey].data;
}

function getTypedJobs(): Job[] { return readData('jobs.json', 'jobs'); }
function getTypedCompanies(): any[] { return readData('companies.json', 'companies'); }
function getTypedLogs(): any[] { return readData('scrape_logs.json', 'logs'); }

export async function fetchJobs(filters: {
  page?: number;
  limit?: number;
  company?: string;
  city?: string;
  experienceLevel?: string;
  experience?: string;
  employmentType?: string;
  remoteStatus?: string;
  search?: string;
  sortBy?: string;
  industry?: string;
  isNew?: string;
  hasHrLinkedin?: string;
} = {}) {
  await new Promise(resolve => setTimeout(resolve, 50));

  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const sortBy = filters.sortBy || 'recent';

  let list = [...getTypedJobs()];

  // Deduplicate by company, title, and city/location to prevent duplicate listings
  const seenKeys = new Set<string>();
  list = list.filter(j => {
    const comp = (j.companyId || j.companyName || '').toLowerCase().trim();
    const title = (j.title || '').toLowerCase().trim();
    const city = (j.city || j.location || '').toLowerCase().trim();
    const key = `${comp}:${title}:${city}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // Apply filters
  if (filters.isNew === 'true') {
    list = list.filter(j => j.isNew === true);
  }
  if (filters.hasHrLinkedin === 'true') {
    list = list.filter(j => !!j.hrLinkedin);
  }
  if (filters.company) {
    list = list.filter(j => j.companyId === filters.company);
  }
  if (filters.city) {
    list = list.filter(j => j.city && j.city.toLowerCase() === filters.city?.toLowerCase());
  }
  const expLevel = filters.experienceLevel || filters.experience;
  if (expLevel) {
    const levels = expLevel.split(',').filter(Boolean);
    if (levels.length > 0) {
      list = list.filter(j => 
        (j.career_level && levels.includes(j.career_level)) ||
        (j.experienceLevel && levels.includes(j.experienceLevel))
      );
    }
  }
  if (filters.employmentType) {
    list = list.filter(j => j.employmentType === filters.employmentType);
  }
  if (filters.remoteStatus) {
    list = list.filter(j => j.remoteStatus === filters.remoteStatus);
  }
  if (filters.industry) {
    list = list.filter(j => j.industry === filters.industry);
  }

  // Keywords filter
  if (filters.search) {
    const searchWord = filters.search.toLowerCase().trim();
    list = list.filter(j => {
      if (j.keywords && j.keywords.includes(searchWord)) {
        return true;
      }
      return (
        j.title.toLowerCase().includes(searchWord) ||
        j.companyName.toLowerCase().includes(searchWord) ||
        (j.city && j.city.toLowerCase().includes(searchWord)) ||
        j.skills.some(s => s.toLowerCase().includes(searchWord)) ||
        (j.department && j.department.toLowerCase().includes(searchWord)) ||
        (j.industry && j.industry.toLowerCase().includes(searchWord))
      );
    });
  }

  // Sorting
  if (sortBy === 'recent') {
    list.sort((a, b) => {
      const dateA = a.postedDate || a.createdAt;
      const dateB = b.postedDate || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  } else if (sortBy === 'oldest') {
    list.sort((a, b) => {
      const dateA = a.postedDate || a.createdAt;
      const dateB = b.postedDate || b.createdAt;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
  } else if (sortBy === 'company') {
    list.sort((a, b) => a.companyName.localeCompare(b.companyName));
  }

  const totalJobs = list.length;
  const offset = (page - 1) * limit;
  const paginatedList = list.slice(offset, offset + limit);

  return {
    jobs: paginatedList,
    pagination: {
      page,
      limit,
      totalJobs,
      totalPages: Math.ceil(totalJobs / limit)
    }
  };
}

export async function fetchJob(id: string) {
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const job = getTypedJobs().find(j => j.id === id);
  if (!job) {
    throw new Error('Job listing not found.');
  }

  const similarJobs = getTypedJobs()
    .filter(j => j.companyId === job.companyId && j.id !== id)
    .slice(0, 3);

  return {
    job,
    similarJobs
  };
}

export async function fetchCompanies() {
  await new Promise(resolve => setTimeout(resolve, 30));
  const sortedComps = [...getTypedCompanies()];
  sortedComps.sort((a, b) => a.name.localeCompare(b.name));
  return sortedComps;
}

export async function fetchFilters() {
  await new Promise(resolve => setTimeout(resolve, 30));

  const cities = new Set<string>();
  const departments = new Set<string>();
  const employmentTypes = new Set<string>(['Full-time', 'Part-time', 'Contract', 'Internship', 'Apprenticeship']);
  const experienceLevels = new Set<string>([
    'Internship',
    'Fresher',
    'Entry Level',
    'Associate',
    'Mid',
    'Senior',
    'Lead',
    'Principal',
  ]);
  const remoteStatuses = new Set<string>(['Onsite', 'Hybrid', 'Remote']);
  const industries = new Set<string>();

  getTypedJobs().forEach(job => {
    if (job.city) cities.add(job.city);
    if (job.department) departments.add(job.department);
    if (job.remoteStatus) remoteStatuses.add(job.remoteStatus);
    if (job.industry) industries.add(job.industry);
  });

  return {
    cities: Array.from(cities).sort(),
    departments: Array.from(departments).sort(),
    employmentTypes: Array.from(employmentTypes),
    experienceLevels: Array.from(experienceLevels),
    remoteStatuses: Array.from(remoteStatuses),
    industries: Array.from(industries).sort()
  };
}

// -------------------------------------------------------------
// MOCKED ADMIN OPERATIONS (Static Fallbacks)
// -------------------------------------------------------------

export async function triggerRescrape(companyId: string = 'all') {
  return {
    message: "Data refresh runs locally on your MacBook! Run 'npm run scrape' in your terminal, then push changes to GitHub to redeploy to Vercel.",
    success: true,
    jobsFound: 0
  };
}

export async function uploadExcelCompanies(companies: { company: string; url: string }[]) {
  return {
    message: "Admin imports are mocked. To update corporate listings, edit 'companies.xlsx' locally on your Mac, and run 'npm run scrape'.",
    successCount: companies.length
  };
}

export async function fetchScrapeLogs(limit: number = 30) {
  return getTypedLogs().slice(0, limit);
}
