import { chromium } from 'playwright';
import { ScrapedJob, ScrapeResult } from '../types';
import { normalizeLocation, extractExperience, extractSkills, parseRemoteStatus, generateJobId } from '../utils';

export async function scrapeGeneric(companyId: string, companyName: string, careersUrl: string): Promise<ScrapeResult> {
  const startTime = Date.now();
  const jobs: ScrapedJob[] = [];
  let browser;

  try {
    console.log(`[Generic Scraper] Launching Playwright browser for ${companyName}...`);
    // Launch headless browser
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    
    // Set timeout limits
    page.setDefaultTimeout(25000);
    page.setDefaultNavigationTimeout(25000);

    console.log(`[Generic Scraper] Navigating to: ${careersUrl}`);
    await page.goto(careersUrl, { waitUntil: 'networkidle' });

    // Attempt to locate and apply location filter (heuristics)
    try {
      // Look for a location filter input box
      const locationInputs = await page.$$(
        'input[placeholder*="location" i], input[placeholder*="country" i], input[placeholder*="city" i], input[id*="location" i], input[name*="location" i]'
      );

      if (locationInputs.length > 0) {
        console.log(`[Generic Scraper] Found location filter input, typing "India"...`);
        const input = locationInputs[0];
        await input.click();
        await input.fill('India');
        await page.waitForTimeout(1000);
        
        // Check if there is an autocomplete list item for India and click it
        const suggestion = await page.$('[class*="suggest" i] >> text="India", [class*="option" i] >> text="India", [id*="option" i] >> text="India"');
        if (suggestion) {
          await suggestion.click();
        } else {
          await input.press('Enter');
        }
        await page.waitForTimeout(2000);
      }
    } catch (filterErr) {
      console.log(`[Generic Scraper] Could not apply location filters: ${(filterErr as Error).message}. Will parse visible jobs.`);
    }

    let hasNextPage = true;
    let pageCount = 1;
    const maxPages = 5; // Prevent infinite loops
    const processedUrls = new Set<string>();

    while (hasNextPage && pageCount <= maxPages) {
      console.log(`[Generic Scraper] Scraping page ${pageCount}...`);
      
      // Heuristically find job postings elements
      // Typically, job links point to '/job/', '/jobs/', '/posting/', '/careers/', '/vacancy/'
      const links = await page.$$('a[href*="/job/" i], a[href*="/jobs/" i], a[href*="/posting/" i], a[href*="/careers/" i], a[href*="/vacancy/" i], a[href*="/careers/detail" i]');
      
      console.log(`[Generic Scraper] Found ${links.length} potential job link elements on page ${pageCount}.`);

      // Evaluate links and extract basic card details
      const rawJobs = await page.evaluate(() => {
        const results: { title: string; url: string; location: string }[] = [];
        const seenUrls = new Set<string>();

        // Query all anchor tags
        const anchors = Array.from(document.querySelectorAll('a'));
        
        for (const a of anchors) {
          const href = a.href;
          if (!href) continue;
          
          // Filter candidate URLs
          const isJobUrl = /\/(job|jobs|posting|careers|vacancy|detail|position)\//i.test(href) || 
                            href.includes('careers/detail') || 
                            href.includes('career-detail');
          
          if (!isJobUrl || seenUrls.has(href)) continue;

          // Find container to extract location and title
          // Climb up to 4 parents to search for location strings
          let parent: HTMLElement | null = a.parentElement;
          let locationText = '';
          let titleText = a.innerText.trim();

          // If the anchor has no text, look inside for text
          if (!titleText) {
            const innerHeaders = a.querySelectorAll('h1, h2, h3, h4, span, strong');
            if (innerHeaders.length > 0) {
              titleText = (innerHeaders[0] as HTMLElement).innerText.trim();
            }
          }

          if (!titleText || titleText.length < 3) continue;

          let depth = 0;
          while (parent && depth < 4) {
            const text = parent.innerText || '';
            
            // Search for location patterns in text lines
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
              if (line.toLowerCase().includes('location:') || 
                  line.toLowerCase().includes('office:') || 
                  line.toLowerCase().includes('india') ||
                  /bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi/i.test(line)) {
                
                // Skip title match line
                if (line.includes(titleText)) continue;
                locationText = line.replace(/location:|office:/gi, '').trim();
                break;
              }
            }
            if (locationText) break;
            parent = parent.parentElement;
            depth++;
          }

          seenUrls.add(href);
          results.push({
            title: titleText,
            url: href,
            location: locationText || 'India' // default fallback if we suspect it's India
          });
        }

        return results;
      });

      console.log(`[Generic Scraper] Processed and filtered down to ${rawJobs.length} unique candidates.`);

      // For each candidate, verify location and fetch details
      for (const rawJob of rawJobs) {
        if (processedUrls.has(rawJob.url)) continue;
        processedUrls.add(rawJob.url);

        const normLoc = normalizeLocation(rawJob.location) || normalizeLocation(rawJob.title);
        if (!normLoc) {
          // If no city matches and doesn't mention India, skip
          continue;
        }

        // Navigate to the detail page in a separate page (using tab context) to parse details
        let description = '';
        let skills: string[] = [];
        let expLevel = 'Mid-Senior Level';
        let yearsExp = 3;
        let empType = 'Full-time';

        try {
          const detailPage = await context.newPage();
          await detailPage.goto(rawJob.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          
          // Heuristic to get job description (body text excluding headers, footers, navs)
          description = await detailPage.evaluate(() => {
            // Find main container
            const main = document.querySelector('main, article, [class*="job-details" i], [class*="description" i], [id*="description" i]');
            if (main) return (main as HTMLElement).innerText;
            return document.body.innerText;
          });

          // Perform cleanup on description text
          description = description.replace(/\s+/g, ' ').trim();

          const expParsed = extractExperience(description);
          expLevel = expParsed.level;
          yearsExp = expParsed.years || 3;
          skills = extractSkills(rawJob.title, description);

          // Detect employment type (Contract, Part-time, Full-time)
          const descLower = description.toLowerCase();
          if (descLower.includes('part-time') || descLower.includes('part time')) empType = 'Part-time';
          else if (descLower.includes('contract') || descLower.includes('temporary')) empType = 'Contract';
          else if (descLower.includes('internship') || descLower.includes('intern')) empType = 'Internship';

          await detailPage.close();
        } catch (detailErr) {
          console.warn(`[Generic Scraper] Could not fetch detail page for ${rawJob.url}: ${(detailErr as Error).message}`);
          description = `Check posting at ${rawJob.url}`;
        }

        const remoteStatus = parseRemoteStatus(rawJob.title, rawJob.location, description);
        const uniqueId = generateJobId(companyId, rawJob.title, rawJob.location, rawJob.url);

        jobs.push({
          id: uniqueId,
          title: rawJob.title,
          description,
          location: rawJob.location,
          city: normLoc.city,
          state: normLoc.state,
          country: 'India',
          experienceLevel: expLevel,
          yearsExperience: yearsExp,
          employmentType: empType,
          skills,
          applyUrl: rawJob.url,
          jobUrl: rawJob.url,
          remoteStatus
        });
      }

      // Pagination traversal
      // Look for buttons containing "Next", ">", "Load More", "Show More"
      try {
        const nextButton = await page.$(
          'a >> text="Next", button >> text="Next", a >> text=">", button >> text=">", [class*="next" i], [id*="next" i], button >> text="Load More", button >> text="Show More"'
        );

        if (nextButton) {
          const isVisible = await nextButton.isVisible();
          const isEnabled = await nextButton.isEnabled();
          if (isVisible && isEnabled) {
            console.log('[Generic Scraper] Clicking pagination element...');
            await nextButton.click();
            pageCount++;
            await page.waitForTimeout(3000); // Wait for page to reload
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          } else {
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      } catch (pagErr) {
        console.log(`[Generic Scraper] Pagination click error: ${(pagErr as Error).message}. Ending traversal.`);
        hasNextPage = false;
      }
    }

    await browser.close();
    console.log(`[Generic Scraper] Finished scraping ${companyName}. Found ${jobs.length} India-based jobs.`);

    return {
      success: true,
      jobs,
      executionTime: Date.now() - startTime
    };

  } catch (error: any) {
    if (browser) await browser.close();
    return {
      success: false,
      jobs: [],
      error: `Generic Playwright scraping error: ${error.message}`,
      executionTime: Date.now() - startTime
    };
  }
}
