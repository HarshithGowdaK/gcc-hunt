const { axiosRequest, getScrapeLimit } = require('../core/utils');
const BaseAdapter = require('./BaseAdapter');
const JobHelpers = require('../core/JobHelpers');

const AXIOS_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

class SuccessFactorsAdapter extends BaseAdapter {
  static atsName = 'successfactors';

  static detect(url, html) {
    if (/successfactors\.com/i.test(url) || /jobs\.sap\.com/i.test(url) || /careers\.sap\.com/i.test(url)) {
      return { ats: 'successfactors', confidence: 0.98, method: 'url' };
    }
    if (html && (/successfactors/i.test(html) || /jobs\.sap\.com/i.test(html))) {
      return { ats: 'successfactors', confidence: 0.88, method: 'html' };
    }
    return null;
  }

  async discoverJobs() {
    const parsed = new URL(this.careersUrl);
    const host = parsed.hostname;

    const endpointsToTry = [
      { type: 'rss', url: `https://${host}/services/rss/job/?locale=en_US` },
      { type: 'rss', url: `https://${host}/services/rss/job/` },
      { type: 'csb', url: `https://${host}/careers/api/v1/search?q=` }
    ];

    let jobs = [];
    let success = false;

    for (const item of endpointsToTry) {
      try {
        const response = await axiosRequest({
          url: item.url,
          method: 'GET',
          headers: AXIOS_HEADERS,
          timeout: 15000
        });

        // Log diagnostics for Part 1
        console.log({
          company: this.companyName,
          ats: 'successfactors',
          endpoint: item.url,
          status: response.status,
          headers: response.headers,
          error: null
        });

        if (item.type === 'rss') {
          const rawXml = typeof response.data === 'string' ? response.data : '';
          const rssJobs = this._parseSFXml(rawXml);
          if (rssJobs && rssJobs.length > 0) {
            jobs = rssJobs.map(rj => ({
              title: rj.title,
              location: rj.location || '',
              url: rj.url,
              reqId: rj.reqId,
              _rawText: rj.description,
              postedDate: rj.postedDate
            }));
            success = true;
            break;
          }
        } else if (item.type === 'csb') {
          const seen = new Set();
          const maxOffset = getScrapeLimit('SCRAPE_MAX_OFFSET', 5000);
          for (let startRow = 0; startRow <= maxOffset; startRow += 25) {
            const pageUrl = `${item.url}&startRow=${startRow}`;
            const pageResponse = startRow === 0 ? response : await axiosRequest({
              url: pageUrl,
              method: 'GET',
              headers: AXIOS_HEADERS,
              timeout: 15000
            });
            const rawData = pageResponse.data || {};
            const postings = this._findPostingsInObject(rawData) || [];
            console.log(`[SuccessFactors] ${this.companyName}: startRow=${startRow}, postings=${postings.length}`);

            for (const p of postings) {
              const key = p.jobReqId || p.reqId || p.id || p.url || p.title || p.jobTitle;
              if (seen.has(key)) continue;
              seen.add(key);
              jobs.push({
                title: p.title || p.jobTitle || '',
                location: p.location || p.city || '',
                url: p.url || p.link || `https://${host}/career?company=${this.companyId}&career_job_req_id=${p.jobReqId || p.reqId}`,
                reqId: p.jobReqId || p.reqId || '',
                _rawText: p.description || ''
              });
            }

            if (postings.length < 25) break;
          }
          if (jobs.length > 0) {
            success = true;
            break;
          }
        }
      } catch (err) {
        console.log({
          company: this.companyName,
          ats: 'successfactors',
          endpoint: item.url,
          status: err.response?.status || null,
          headers: err.response?.headers || null,
          error: err.message
        });
      }
    }

    if (success && jobs.length > 0) {
      this.recordSuccess(jobs.length);
      return jobs;
    }

    throw new Error(`SuccessFactors endpoints failed for ${this.companyName}`);
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    if (internalJobRef && internalJobRef._rawText) {
      return internalJobRef._rawText;
    }

    // Try normal HTTP get to fetch job description page
    try {
      const response = await axiosRequest({
        url: jobUrl,
        method: 'GET',
        headers: AXIOS_HEADERS,
        timeout: 15000
      });
      const html = typeof response.data === 'string' ? response.data : '';
      if (html) {
        // Strip tags
        let text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                       .replace(/<style[\s\S]*?<\/style>/gi, '')
                       .replace(/<[^>]*>/g, '\n')
                       .replace(/\s+/g, ' ')
                       .trim();
        return text;
      }
    } catch (e) {
      console.warn(`[SuccessFactors] Detail fetch failed via HTTP: ${e.message}. Using browser fallback.`);
    }

    // Fall back to Playwright if HTTP failed
    const CloudflareResilience = require('../core/CloudflareResilience');
    const context = await CloudflareResilience.getContext();
    const page = await context.newPage();
    let rawText = '';
    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      rawText = await page.evaluate(() => {
        const main = document.querySelector('main, article, [class*="job-details" i], [class*="description" i], #job-description');
        return (main || document.body).innerText;
      });
      rawText = rawText.replace(/\s+/g, ' ').trim();
    } finally {
      await page.close();
      await CloudflareResilience.releaseContext(context);
    }
    return rawText;
  }

  _parseSFXml(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const content = match[1];
      const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/i);
      const descriptionMatch = content.match(/<description>([\s\S]*?)<\/description>/i);
      const pubDateMatch = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const guidMatch = content.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);

      if (titleMatch && linkMatch) {
        const cleanTitle = titleMatch[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
        const cleanLink = linkMatch[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
        const cleanDesc = descriptionMatch ? descriptionMatch[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1') : '';
        const cleanGuid = guidMatch ? guidMatch[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1') : '';
        const cleanTextDesc = cleanDesc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const extractedLocation = JobHelpers.extractIndianLocation(cleanTitle, cleanTextDesc);

        items.push({
          title: cleanTitle,
          url: cleanLink,
          location: extractedLocation?.location || '',
          description: cleanTextDesc,
          reqId: cleanGuid,
          postedDate: pubDateMatch ? new Date(pubDateMatch[1].trim()).toISOString() : null
        });
      }
    }
    return items;
  }

  _findPostingsInObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj.jobPostings)) return obj.jobPostings;
    if (Array.isArray(obj.postings)) return obj.postings;
    if (Array.isArray(obj.jobs)) return obj.jobs;
    if (Array.isArray(obj.searchResults)) return obj.searchResults;
    if (Array.isArray(obj.results)) return obj.results;
    for (const key of Object.keys(obj)) {
      const res = this._findPostingsInObject(obj[key]);
      if (res) return res;
    }
    return null;
  }
}

module.exports = SuccessFactorsAdapter;
