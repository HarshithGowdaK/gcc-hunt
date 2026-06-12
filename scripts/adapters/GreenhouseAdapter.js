const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry } = require('../core/utils');

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

class GreenhouseAdapter extends BaseAdapter {
  static atsName = 'greenhouse';

  static detect(url, html) {
    if (/greenhouse\.io/i.test(url)) return { ats: 'greenhouse', confidence: 0.98, method: 'url' };
    if (html && /greenhouse\.io|boards-api\.greenhouse/i.test(html)) return { ats: 'greenhouse', confidence: 0.88, method: 'html' };
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const parsed = new URL(this.careersUrl);
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    let token = parsed.pathname.includes('/embed/job_board')
      ? parsed.searchParams.get('token')
      : pathSegments[0];
    
    if (!token) throw new Error('Could not parse Greenhouse company token.');

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
    const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 60000 }));
    const postings = response.data.jobs || [];

    for (const posting of postings) {
      jobs.push({
        title: posting.title,
        location: posting.location?.name || '',
        url: posting.absolute_url,
        reqId: posting.id?.toString(),
        _rawText: (posting.content || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim()
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

module.exports = GreenhouseAdapter;
