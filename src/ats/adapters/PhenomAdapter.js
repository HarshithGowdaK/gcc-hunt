const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry, getScrapeLimit } = require('../../shared/utils');

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

class PhenomAdapter extends BaseAdapter {
  static atsName = 'phenom';

  static detect(url, html) {
    if (/phenom/i.test(url)) return { ats: 'phenom', confidence: 0.95, method: 'url' };
    if (html && /phenom/i.test(html)) return { ats: 'phenom', confidence: 0.82, method: 'html' };
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const parsed = new URL(this.careersUrl);
    const host = parsed.hostname;
    
    try {
      const size = 50;
      const seen = new Set();

      const maxOffset = getScrapeLimit('SCRAPE_MAX_OFFSET', 5000);
      for (let from = 0; from <= maxOffset; from += size) {
        const apiUrl = `https://${host}/api/jobs?from=${from}&size=${size}`;
        const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 15000 }));
        const postings = response.data?.hits || response.data?.data?.hits || [];
        console.log(`[PhenomAdapter] ${this.companyName}: from=${from}, postings=${postings.length}`);

        for (const posting of postings) {
          const key = posting.reqId || posting.id?.toString() || posting.title;
          if (seen.has(key)) continue;
          seen.add(key);
          jobs.push({
            title: posting.title,
            location: posting.location || posting.city || posting.country || '',
            url: `https://${host}/job/${posting.reqId || posting.id}`,
            reqId: posting.reqId || posting.id?.toString(),
            _rawText: (posting.description || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim()
          });
        }

        const total = response.data?.total || response.data?.data?.total;
        if (postings.length < size) break;
        if (total && jobs.length >= total) break;
      }
    } catch (e) {
      console.warn(`[PhenomAdapter] API failed for ${host}, error: ${e.message}`);
      throw e;
    }

    return jobs;
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    return internalJobRef._rawText || '';
  }

  async normalize(jobData, rawText, locationEngine, experienceEngine, aiArbitrator) {
    return jobData;
  }
}

module.exports = PhenomAdapter;
