export interface ScrapedJob {
  id?: string;
  title: string;
  description: string;
  location: string;
  city: string;
  state: string;
  country: string;
  experienceLevel?: string;
  yearsExperience?: number;
  department?: string;
  industry?: string;
  employmentType?: string;
  skills: string[];
  applyUrl: string;
  jobUrl: string;
  postedDate?: string; // ISO String
  remoteStatus: 'Remote' | 'Hybrid' | 'Onsite' | 'Unknown';
  salary?: string;
}

export interface Company {
  id: string;
  name: string;
  careersUrl: string;
  logoUrl?: string;
  industry?: string;
  status: 'idle' | 'scraping' | 'failed' | 'success';
  lastScraped?: string; // ISO String
}

export interface ScrapeResult {
  success: boolean;
  jobs: ScrapedJob[];
  error?: string;
  executionTime: number;
}
