const BaseAdapter = require('./BaseAdapter');
const CloudflareResilience = require('../../browser/proxies/CloudflareResilience');
const JobHelpers = require('../../shared/JobHelpers');
const { sleep, getScrapeLimit } = require('../../shared/utils');

class BrassringAdapter extends BaseAdapter {
  static atsName = 'brassring';

  static detect(url, html) {
    if (/brassring\.com|kenexa/i.test(url)) return { ats: 'brassring', confidence: 0.98, method: 'url' };
    if (html && /brassring\.com|kenexa/i.test(html)) return { ats: 'brassring', confidence: 0.88, method: 'html' };
    return null;
  }

  async discoverJobs() {
    const context = await CloudflareResilience.getContext();
    const page = await context.newPage();
    const seen = new Set();
    const jobs = [];

    try {
      await page.goto(this.careersUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(err => {
        console.warn(`[Brassring] Initial navigation did not fully settle for ${this.companyName}: ${err.message}`);
      });
      await page.waitForSelector('.jobProperty.jobtitle', { timeout: 15000 }).catch(() => {});
      await sleep(3000);

      const maxPages = getScrapeLimit('SCRAPE_MAX_PAGES', 100);
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        await page.evaluate(async () => {
          if (!document.body) return;
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(r => setTimeout(r, 1000));
        });

        const rawJobs = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('a[href*="brassring.com"], a[href*="jobdetails"], a[href*="jobdetail"], a[href*="JobDetail"], a[href*="jobId"], a[href*="jobid"]'));
          const results = rows.map(a => {
            const parent = a.closest('tr, li, article, [class*="job" i], [class*="result" i], [role="row"]') || a.parentElement;
            const text = (parent?.innerText || a.innerText || '').replace(/\s+/g, ' ').trim();
            const title = (a.innerText || text.split(/\s{2,}|\n/)[0] || '').replace(/\s+/g, ' ').trim();
            const locMatch = text.match(/bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|delhi|india/i);
            const reqMatch = a.href.match(/[?&](?:jobid|jobId|JobID|reqid|reqId)=([^&#]+)/i) || text.match(/\b\d{5,}\b/);
            return {
              title,
              url: a.href,
              location: locMatch ? locMatch[0] : '',
              reqId: reqMatch ? decodeURIComponent(reqMatch[1] || reqMatch[0]) : '',
              _rawText: text
            };
          });

          const scripts = Array.from(document.querySelectorAll('script'));
          const addJob = (value, depth = 0) => {
            if (!value || depth > 8) return;
            if (Array.isArray(value)) {
              value.forEach(item => addJob(item, depth + 1));
              return;
            }
            if (typeof value !== 'object') return;
            const title = value.JobTitle || value.jobTitle || value.title || value.Title || value.name;
            const jobId = value.JobID || value.jobId || value.jobid || value.reqId || value.ReqId || value.id;
            const rawUrl = value.JobUrl || value.jobUrl || value.url || value.link;
            if (title && (jobId || rawUrl)) {
              let url = rawUrl || location.href;
              try {
                const u = new URL(url, location.href);
                if (jobId && !/[?&](?:jobid|jobId|JobID)=/i.test(u.href)) u.searchParams.set('jobid', jobId);
                url = u.href;
              } catch {}
              const loc = value.Location || value.location || value.City || value.city || value.Country || '';
              results.push({
                title: String(title).replace(/\s+/g, ' ').trim(),
                url,
                location: String(loc || '').replace(/\s+/g, ' ').trim(),
                reqId: jobId ? String(jobId) : '',
                _rawText: JSON.stringify(value).replace(/\s+/g, ' ')
              });
            }
            for (const child of Object.values(value)) {
              if (child && typeof child === 'object') addJob(child, depth + 1);
            }
          };

          for (const script of scripts) {
            const text = script.textContent || '';
            if (!/(job|requisition|req|brassring)/i.test(text) || text.length > 2000000) continue;
            const jsonMatches = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/g) || [];
            for (const jsonText of jsonMatches.slice(0, 5)) {
              try { addJob(JSON.parse(jsonText)); } catch {}
            }
          }

          return results;
        });

        for (const frame of page.frames()) {
          if (frame === page.mainFrame()) continue;
          try {
            const frameJobs = await frame.evaluate(() => {
              return Array.from(document.querySelectorAll('a[href*="brassring.com"], a[href*="jobdetails"], a[href*="jobdetail"], a[href*="JobDetail"], a[href*="jobId"], a[href*="jobid"]')).map(a => {
                const parent = a.closest('tr, li, article, [class*="job" i], [class*="result" i], [role="row"]') || a.parentElement;
                const text = (parent?.innerText || a.innerText || '').replace(/\s+/g, ' ').trim();
                const title = (a.innerText || text.split(/\s{2,}|\n/)[0] || '').replace(/\s+/g, ' ').trim();
                const locMatch = text.match(/bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|kochi|delhi|india/i);
                const reqMatch = a.href.match(/[?&](?:jobid|jobId|JobID|reqid|reqId)=([^&#]+)/i) || text.match(/\b\d{5,}\b/);
                return {
                  title,
                  url: a.href,
                  location: locMatch ? locMatch[0] : '',
                  reqId: reqMatch ? decodeURIComponent(reqMatch[1] || reqMatch[0]) : '',
                  _rawText: text
                };
              });
            });
            rawJobs.push(...frameJobs);
          } catch {}
        }

        for (const item of rawJobs) {
          if (!JobHelpers.isLikelyJobUrl(item.url)) continue;
          if (JobHelpers.getJobCandidateRejectionReason(item)) continue;
          const key = item.url || `${item.title}:${item.reqId}`;
          if (!seen.has(key)) {
            seen.add(key);
            jobs.push(item);
          }
        }

        const next = await page.$('a[aria-label*="next" i], button[aria-label*="next" i], a[id*="next" i], button[id*="next" i], a[class*="next" i], button[class*="next" i]');
        if (!next) break;
        const disabled = await next.evaluate(el => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || /\bdisabled\b/i.test(el.className || ''));
        if (disabled) break;
        await next.click();
        await sleep(2500);
      }
    } finally {
      await page.close();
      CloudflareResilience.releaseContext(context);
    }

    if (jobs.length === 0) throw new Error(`Brassring discovery found no jobs for ${this.companyName}`);
    this.recordSuccess(jobs.length);
    return jobs;
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    if (internalJobRef?._rawText && internalJobRef._rawText.length > 300) return internalJobRef._rawText;

    const context = await CloudflareResilience.getContext();
    const page = await context.newPage();
    let rawText = internalJobRef?._rawText || '';
    try {
      await page.goto(jobUrl, { waitUntil: 'commit', timeout: 35000 }).catch(err => {
        console.warn(`[Brassring] Detail navigation did not fully settle for ${this.companyName}: ${err.message}`);
      });
      await sleep(2000);
      rawText = await page.evaluate(() => {
        const main = document.querySelector('main, article, [class*="description" i], [class*="job" i], #jobdetail, #jobDescription');
        return (main || document.body).innerText;
      });
      rawText = rawText.replace(/\s+/g, ' ').trim();
    } finally {
      await page.close();
      CloudflareResilience.releaseContext(context);
    }
    return rawText;
  }

  async normalize(jobData, rawText) {
    return { ...jobData, description: rawText, atsType: 'brassring' };
  }
}

module.exports = BrassringAdapter;
