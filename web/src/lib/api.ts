import jobsData from '../data/jobs.json';
import companiesData from '../data/companies.json';
import logsData from '../data/scrape_logs.json';

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
}

// Convert untyped static data imports to typed arrays
const typedJobs = jobsData as Job[];
const typedCompanies = companiesData as any[];
const typedLogs = logsData as any[];

export async function fetchJobs(filters: {
  page?: number;
  limit?: number;
  company?: string;
  city?: string;
  experienceLevel?: string;
  employmentType?: string;
  remoteStatus?: string;
  search?: string;
  sortBy?: string;
  industry?: string;
} = {}) {
  await new Promise(resolve => setTimeout(resolve, 50));

  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const sortBy = filters.sortBy || 'recent';

  let list = [...typedJobs];

  // Apply filters
  if (filters.company) {
    list = list.filter(j => j.companyId === filters.company);
  }
  if (filters.city) {
    list = list.filter(j => j.city && j.city.toLowerCase() === filters.city?.toLowerCase());
  }
  if (filters.experienceLevel) {
    if (filters.experienceLevel === 'Internships') {
      list = list.filter(j =>
        j.experienceLevel === 'Internship / Apprenticeship' ||
        j.experienceLevel === 'Internship' ||
        j.experienceLevel === 'Apprenticeship'
      );
    } else if (filters.experienceLevel === 'Lead / Management') {
      list = list.filter(j =>
        j.experienceLevel === 'Lead / Management' ||
        j.experienceLevel === 'Lead Level' ||
        j.experienceLevel === 'Lead / Manager'
      );
    } else if (filters.experienceLevel === 'Executive Leadership') {
      list = list.filter(j =>
        j.experienceLevel === 'Executive Leadership' ||
        j.experienceLevel === 'Director / Executive'
      );
    } else {
      list = list.filter(j => j.experienceLevel === filters.experienceLevel);
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
  
  const job = typedJobs.find(j => j.id === id);
  if (!job) {
    throw new Error('Job listing not found.');
  }

  const similarJobs = typedJobs
    .filter(j => j.companyId === job.companyId && j.id !== id)
    .slice(0, 3);

  return {
    job,
    similarJobs
  };
}

export async function fetchCompanies() {
  await new Promise(resolve => setTimeout(resolve, 30));
  const sortedComps = [...typedCompanies];
  sortedComps.sort((a, b) => a.name.localeCompare(b.name));
  return sortedComps;
}

export async function fetchFilters() {
  await new Promise(resolve => setTimeout(resolve, 30));

  const cities = new Set<string>();
  const departments = new Set<string>();
  const employmentTypes = new Set<string>(['Full-time', 'Part-time', 'Contract', 'Internship', 'Apprenticeship']);
  const experienceLevels = new Set<string>([
    'Internships',
    'Entry Level',
    'Mid Level',
    'Senior Level',
    'Lead / Management',
    'Executive Leadership',
  ]);
  const remoteStatuses = new Set<string>(['Onsite', 'Hybrid', 'Remote']);
  const industries = new Set<string>();

  typedJobs.forEach(job => {
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
  return typedLogs.slice(0, limit);
}
