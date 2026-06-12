const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry } = require('../core/utils');

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

class EightfoldAdapter extends BaseAdapter {
  static atsName = 'eightfold';

  static detect(url, html) {
    if (/eightfold\.ai/i.test(url)) return { ats: 'eightfold', confidence: 0.98, method: 'url' };
    if (html && /eightfold/i.test(html)) return { ats: 'eightfold', confidence: 0.85, method: 'html' };
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const parsed = new URL(this.careersUrl);
    const host = parsed.hostname;
    
    const apiUrl = `https://${host}/api/apply/v2/jobs`;
    const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 15000 }));
    const postings = response.data.positions || [];

    for (const posting of postings) {
      jobs.push({
        title: posting.name,
        location: posting.location || (posting.locations && posting.locations[0]) || '',
        url: this.careersUrl + '?pid=' + posting.id,
        reqId: posting.id?.toString(),
        _rawText: (posting.job_description || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim()
      });
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

module.exports = EightfoldAdapter;
