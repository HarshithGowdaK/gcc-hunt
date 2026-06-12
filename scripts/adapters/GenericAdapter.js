const BaseAdapter = require('./BaseAdapter');
const CloudflareResilience = require('../core/CloudflareResilience');
const { sleep } = require('../core/utils');

class GenericAdapter extends BaseAdapter {
  static atsName = 'generic';

  static detect() {
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const context = await CloudflareResilience.getContext();
    const page = await context.newPage();
    const seenUrls = new Set();
    
    try {
      await page.goto(this.careersUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      let pageNum = 1;
      let hasMore = true;

      while (hasMore && pageNum <= 10) {
        await sleep(3000); // Allow JS rendering
        
        // Auto-scroll to trigger lazy loading if any
        await page.evaluate(async () => {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(r => setTimeout(r, 1000));
        });

        // Kill any cookie banners intercepting clicks
        await this._killCookieBanners(page);

        // Extract job links
        const rawJobs = await page.evaluate(() => {
          const results = [];
          for (const a of Array.from(document.querySelectorAll('a'))) {
            const href = a.href;
            if (!href) continue;
            
            const isJob = /\/(job|jobs|posting|position|opportunity|opening)\//i.test(href) ||
                          href.includes('jobId=') || href.includes('job_id=') ||
                          href.includes('gh_jid=') || href.includes('/job-description/') ||
                          href.includes('/job-details/') || href.includes('/careers/job/');
            
            if (!isJob) continue;

            let title = (a.innerText || '').trim();
            if (!title && a.parentElement) title = a.parentElement.innerText.trim();
            if (!title) continue;
            title = title.split('\n')[0].trim();
            if (title.length < 3) continue;

            // Strict job filter
            const titleLower = title.toLowerCase();
            const badWords = [
              'privacy', 'cookie', 'terms', 'language', 'accessibility', 'learn more', 
              'read more', 'about us', 'contact us', 'benefits', 'culture', 'our story',
              'skip', 'english', 'corporate', 'back to', 'search results', 'apply now', 'save job'
            ];
            if (badWords.some(w => titleLower.includes(w))) continue;
            if (titleLower === 'jobs' || titleLower === 'careers' || titleLower === 'locations') continue;

            // Extract location heuristically from DOM parents
            let loc = null;
            let p = a.parentElement;
            let depth = 0;
            while (p && depth < 3) {
              const m = (p.innerText || '').match(/bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|\bindia\b/i);
              if (m) { loc = m[0]; break; }
              p = p.parentElement; depth++;
            }
            results.push({ title, url: href, location: loc });
          }
          return results;
        });

        for (const item of rawJobs) {
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            jobs.push(item);
          }
        }

        // Try to click "Next"
        const nextButton = await page.$('a[aria-label*="next" i], button[aria-label*="next" i], a[class*="next" i], button[class*="next" i], a >> text="Next", button >> text="Next"');
        if (nextButton) {
          await this._killCookieBanners(page);
          const isDisabled = await nextButton.evaluate(el => el.hasAttribute('disabled') || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true');
          if (!isDisabled) {
            await nextButton.click();
            pageNum++;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
    } catch (err) {
      console.warn(`[GenericAdapter] Error crawling ${this.careersUrl}: ${err.message}`);
    } finally {
      await page.close();
      CloudflareResilience.releaseContext(context);
    }

    return jobs;
  }

  async _killCookieBanners(page) {
    await page.evaluate(() => {
      const selectors = [
        '[id*="cookie" i]', '[class*="cookie" i]',
        '[id*="consent" i]', '[class*="consent" i]',
        '#onetrust-banner-sdk', '#onetrust-consent-sdk',
        '#system-ialert'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky' || style.zIndex > 100) {
            el.remove();
          }
        });
      });
    });
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    if (internalJobRef?._rawText) return internalJobRef._rawText;

    const context = await CloudflareResilience.getContext();
    const page = await context.newPage();
    let rawText = '';

    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      rawText = await page.evaluate(() => {
        const main = document.querySelector('main, article, [class*="job-details" i], [class*="description" i]');
        return (main || document.body).innerText;
      });
      rawText = rawText.replace(/\s+/g, ' ').trim();
      if (!rawText) throw new Error('parse_failure: Extracted text is empty');
    } finally {
      await page.close();
      CloudflareResilience.releaseContext(context);
    }

    return rawText;
  }

  async normalize(jobData, rawText) {
    return { ...jobData, description: rawText };
  }
}

module.exports = GenericAdapter;
