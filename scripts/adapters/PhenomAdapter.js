const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry } = require('../core/utils');

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
    
    const apiUrl = `https://${host}/api/jobs?from=0&size=50`;
    try {
      const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 15000 }));
      const postings = response.data?.hits || response.data?.data?.hits || [];

      for (const posting of postings) {
        jobs.push({
          title: posting.title,
          location: posting.location || posting.city || posting.country || '',
          url: `https://${host}/job/${posting.reqId || posting.id}`,
          reqId: posting.reqId || posting.id?.toString(),
          _rawText: (posting.description || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim()
        });
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
