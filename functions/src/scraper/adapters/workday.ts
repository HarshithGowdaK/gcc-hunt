import axios from 'axios';
import { ScrapedJob, ScrapeResult } from '../types';
import { normalizeLocation, extractExperience, extractSkills, parseRemoteStatus, generateJobId } from '../utils';

export async function scrapeWorkday(companyId: string, companyName: string, careersUrl: string): Promise<ScrapeResult> {
  const startTime = Date.now();
  const jobs: ScrapedJob[] = [];
  
  try {
    const parsedUrl = new URL(careersUrl);
    const host = parsedUrl.hostname;
    
    // Parse tenant and site
    // E.g. https://3m.wd1.myworkdayjobs.com/en-US/Search -> host = 3m.wd1.myworkdayjobs.com, path = /en-US/Search
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    const tenant = host.split('.')[0]; // E.g., '3m' or '3m.wd1'
    
    let site = 'Search';
    if (pathSegments.length > 1) {
      site = pathSegments[1];
    } else if (pathSegments.length === 1 && pathSegments[0] !== 'en-US') {
      site = pathSegments[0];
    }

    const apiUrl = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    console.log(`[Workday Scraper] Querying list API: ${apiUrl}`);

    let offset = 0;
    const limit = 20;
    let totalCount = 1;
    let page = 1;

    while (offset < totalCount) {
      console.log(`[Workday Scraper] Fetching page ${page} (offset: ${offset})...`);
      const response = await axios.post(apiUrl, {
        appliedFacets: {},
        limit,
        offset,
        searchText: ''
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });

      if (!response.data || !response.data.jobPostings) {
        throw new Error('Invalid Workday response structure.');
      }

      totalCount = response.data.total || 0;
      const postings = response.data.jobPostings;
      
      if (postings.length === 0) break;

      for (const posting of postings) {
        const title = posting.title;
        const externalPath = posting.externalPath; // E.g. /job/Bangalore/Software-Engineer_JR12345
        const locationText = posting.locationsText || '';
        
        // Normalize location and verify if it is in India
        const normLoc = normalizeLocation(locationText);
        if (!normLoc) {
          // Skip jobs outside India
          continue;
        }

        const jobUrl = `https://${host}/${site.toLowerCase()}${externalPath}`;
        const detailApiUrl = `https://${host}/wday/cxs/${tenant}/${site}${externalPath}`;
        
        // Fetch detailed job details to get full description and fields
        let description = '';
        let skills: string[] = [];
        let expLevel = 'Mid-Senior Level';
        let yearsExp = 3;
        let empType = 'Full time';
        let originalJobId = '';
        let applyUrl = jobUrl;

        try {
          // Add brief rate limiting (100ms) before hitting details API
          await new Promise(resolve => setTimeout(resolve, 150));
          const detailRes = await axios.get(detailApiUrl, {
            headers: { 'Accept': 'application/json' },
            timeout: 8000
          });
          
          if (detailRes.data && detailRes.data.jobPostingInfo) {
            const info = detailRes.data.jobPostingInfo;
            description = info.jobDescription || '';
            empType = info.timeType || 'Full time';
            originalJobId = info.jobReqId || '';
            
            // Re-normalize location with detailed locations if available
            let detailLoc = info.location || locationText;
            const detailedNormLoc = normalizeLocation(detailLoc);
            if (detailedNormLoc) {
              normLoc.city = detailedNormLoc.city;
              normLoc.state = detailedNormLoc.state;
            }

            // Extract experience & skills
            const expParsed = extractExperience(description);
            expLevel = expParsed.level;
            yearsExp = expParsed.years || 3;
            skills = extractSkills(title, description);

            if (info.applyUrl) {
              applyUrl = info.applyUrl;
            }
          }
        } catch (detailErr: any) {
          console.warn(`[Workday Scraper] Failed to fetch job details for ${title}: ${detailErr.message}`);
          description = `Location: ${locationText}. Job posting available at ${jobUrl}`;
        }

        const remoteStatus = parseRemoteStatus(title, locationText, description);
        const uniqueId = generateJobId(companyId, title, locationText, jobUrl, originalJobId);

        jobs.push({
          id: uniqueId,
          title,
          description,
          location: locationText,
          city: normLoc.city,
          state: normLoc.state,
          country: 'India',
          experienceLevel: expLevel,
          yearsExperience: yearsExp,
          employmentType: empType,
          skills,
          applyUrl,
          jobUrl,
          remoteStatus,
          postedDate: posting.postedOn ? new Date().toISOString() : undefined // Workday doesn't always provide raw date
        });
      }

      offset += limit;
      page++;
      
      // Pause slightly between page loads
      await new Promise(resolve => setTimeout(resolve, 500));
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
      error: `Workday scraping error: ${error.message}`,
      executionTime: Date.now() - startTime
    };
  }
}
