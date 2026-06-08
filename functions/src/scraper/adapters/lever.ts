import axios from 'axios';
import { ScrapedJob, ScrapeResult } from '../types';
import { normalizeLocation, extractExperience, extractSkills, parseRemoteStatus, generateJobId } from '../utils';

export async function scrapeLever(companyId: string, companyName: string, careersUrl: string): Promise<ScrapeResult> {
  const startTime = Date.now();
  const jobs: ScrapedJob[] = [];

  try {
    const parsedUrl = new URL(careersUrl);
    
    // Extract token from Lever URL
    // E.g. https://jobs.lever.co/netflix -> token = netflix
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    let token = '';

    if (pathSegments.length > 0) {
      token = pathSegments[0];
    }

    if (!token) {
      throw new Error(`Could not parse Lever company token from URL: ${careersUrl}`);
    }

    const apiUrl = `https://api.lever.co/v0/postings/${token}?mode=json`;
    console.log(`[Lever Scraper] Querying API: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Invalid Lever response structure.');
    }

    const postings = response.data;
    console.log(`[Lever Scraper] Found ${postings.length} total postings.`);

    for (const posting of postings) {
      const title = posting.title || '';
      const locationText = posting.categories?.location || '';
      const originalJobId = posting.id || '';
      const jobUrl = posting.hostedUrl || '';
      const applyUrl = posting.applyUrl || jobUrl;

      // Normalize location and verify if India
      const normLoc = normalizeLocation(locationText);
      if (!normLoc) {
        // Skip non-India postings
        continue;
      }

      // Format description from Lever content blocks
      let descriptionText = '';
      if (posting.descriptionPlain) {
        descriptionText += posting.descriptionPlain + '\n\n';
      }
      if (posting.lists && Array.isArray(posting.lists)) {
        for (const list of posting.lists) {
          if (list.text) {
            descriptionText += `**${list.text}**\n`;
          }
          if (list.content && Array.isArray(list.content)) {
            descriptionText += list.content.map((item: string) => `- ${item}`).join('\n') + '\n\n';
          }
        }
      }
      if (posting.additionalPlain) {
        descriptionText += posting.additionalPlain;
      }

      descriptionText = descriptionText.trim();

      const expParsed = extractExperience(descriptionText);
      const skills = extractSkills(title, descriptionText);
      const remoteStatus = parseRemoteStatus(title, locationText, descriptionText);
      
      const uniqueId = generateJobId(companyId, title, locationText, jobUrl, originalJobId);

      const dept = posting.categories?.department || posting.categories?.team;
      const commit = posting.categories?.commitment || 'Full-time';

      jobs.push({
        id: uniqueId,
        title,
        description: descriptionText,
        location: locationText,
        city: normLoc.city,
        state: normLoc.state,
        country: 'India',
        experienceLevel: expParsed.level,
        yearsExperience: expParsed.years,
        employmentType: commit,
        skills,
        applyUrl,
        jobUrl,
        remoteStatus,
        postedDate: posting.createdAt ? new Date(posting.createdAt).toISOString() : undefined,
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
      error: `Lever scraping error: ${error.message}`,
      executionTime: Date.now() - startTime
    };
  }
}
