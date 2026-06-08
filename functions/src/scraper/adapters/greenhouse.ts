import axios from 'axios';
import { ScrapedJob, ScrapeResult } from '../types';
import { normalizeLocation, extractExperience, extractSkills, parseRemoteStatus, generateJobId } from '../utils';

export async function scrapeGreenhouse(companyId: string, companyName: string, careersUrl: string): Promise<ScrapeResult> {
  const startTime = Date.now();
  const jobs: ScrapedJob[] = [];

  try {
    const parsedUrl = new URL(careersUrl);
    let token = '';

    // Extract token from URL
    // E.g. https://boards.greenhouse.io/github or https://boards.greenhouse.io/embed/job_board?token=github
    if (parsedUrl.pathname.includes('/embed/job_board')) {
      token = parsedUrl.searchParams.get('token') || '';
    } else {
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      // Usually the first segment is the token
      if (pathSegments.length > 0) {
        token = pathSegments[0];
      }
    }

    if (!token) {
      throw new Error(`Could not parse Greenhouse company token from URL: ${careersUrl}`);
    }

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
    console.log(`[Greenhouse Scraper] Querying API: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.data || !response.data.jobs) {
      throw new Error('Invalid Greenhouse response structure.');
    }

    const postings = response.data.jobs;
    console.log(`[Greenhouse Scraper] Found ${postings.length} total postings.`);

    for (const posting of postings) {
      const title = posting.title || '';
      const locationText = posting.location?.name || '';
      const content = posting.content || ''; // Full HTML description
      const jobUrl = posting.absolute_url || '';
      const originalJobId = posting.id ? posting.id.toString() : '';

      // Normalize location and verify if India
      const normLoc = normalizeLocation(locationText);
      if (!normLoc) {
        // Skip non-India postings
        continue;
      }

      // Convert HTML description to plain text
      const cleanDescription = content.replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();

      const expParsed = extractExperience(cleanDescription);
      const skills = extractSkills(title, cleanDescription);
      const remoteStatus = parseRemoteStatus(title, locationText, cleanDescription);
      
      const uniqueId = generateJobId(companyId, title, locationText, jobUrl, originalJobId);

      const dept = posting.departments && posting.departments.length > 0
        ? posting.departments[0].name
        : undefined;

      jobs.push({
        id: uniqueId,
        title,
        description: cleanDescription,
        location: locationText,
        city: normLoc.city,
        state: normLoc.state,
        country: 'India',
        experienceLevel: expParsed.level,
        yearsExperience: expParsed.years,
        employmentType: 'Full-time', // Greenhouse doesn't standardly define type in board API, default to Full-time
        skills,
        applyUrl: jobUrl,
        jobUrl,
        remoteStatus,
        postedDate: posting.updated_at || undefined,
        department: dept
      });
    }

    return {
      success: true,
      jobs,
      executionTime: Date.now() - startTime
    };

  } catch (error: any) {
    return {
      success: false,
      jobs: [],
      error: `Greenhouse scraping error: ${error.message}`,
      executionTime: Date.now() - startTime
    };
  }
}
