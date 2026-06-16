const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry, getScrapeLimit } = require('../core/utils');

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

class OracleAdapter extends BaseAdapter {
  static atsName = 'oracle';

  static detect(url, html) {
    if (/oraclecloud\.com/i.test(url)) return { ats: 'oracle', confidence: 0.98, method: 'url' };
    if (html && /oraclecloud/i.test(html)) return { ats: 'oracle', confidence: 0.85, method: 'html' };
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const parsed = new URL(this.careersUrl);
    const host = parsed.hostname;

    try {
      const limit = 100;
      const seen = new Set();

      const maxOffset = getScrapeLimit('SCRAPE_MAX_OFFSET', 5000);
      for (let offset = 0; offset <= maxOffset; offset += limit) {
        const apiUrl = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=all&finder=findReqs;siteNumber=CX_1,limit=${limit},offset=${offset}`;
        const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 15000 }));
        const postings = response.data.items || [];
        console.log(`[OracleAdapter] ${this.companyName}: offset=${offset}, postings=${postings.length}`);

        for (const posting of postings) {
          const key = posting.Id?.toString() || posting.RequisitionNumber || posting.Title;
          if (seen.has(key)) continue;
          seen.add(key);
          jobs.push({
            title: posting.Title,
            location: posting.PrimaryLocation || posting.Locations || '',
            url: `https://${host}/hcmUI/CandidateExperience/en/sites/CX_1/job/${posting.Id}`,
            reqId: posting.Id?.toString(),
            _rawText: (posting.ShortDescription || posting.Description || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim()
          });
        }

        const hasMore = response.data.hasMore === true;
        if (!hasMore || postings.length < limit) break;
      }
    } catch (e) {
      console.warn(`[OracleAdapter] Fast API failed, falling back. Error: ${e.message}`);
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

module.exports = OracleAdapter;
