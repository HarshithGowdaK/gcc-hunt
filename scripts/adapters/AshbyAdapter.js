const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry } = require('../core/utils');

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

class AshbyAdapter extends BaseAdapter {
  static atsName = 'ashby';

  static detect(url, html) {
    if (/ashbyhq\.com/i.test(url)) return { ats: 'ashby', confidence: 0.98, method: 'url' };
    if (html && /ashbyhq/i.test(html)) return { ats: 'ashby', confidence: 0.88, method: 'html' };
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const parsed = new URL(this.careersUrl);
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const boardName = pathSegments[pathSegments.length - 1]; // e.g. ashbyhq.com/companyname

    if (!boardName) throw new Error('Could not parse Ashby board name.');

    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${boardName}`;
    const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 15000 }));
    const postings = response.data.jobs || [];

    for (const posting of postings) {
      jobs.push({
        title: posting.title,
        location: posting.location || '',
        url: posting.jobUrl || `https://jobs.ashbyhq.com/${boardName}/${posting.id}`,
        reqId: posting.id?.toString(),
      });
    }
    return jobs;
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    // We need to fetch the detailed job info from the API
    // Actually Ashby provides full HTML description via the API endpoint if we fetch the specific job
    const boardName = new URL(this.careersUrl).pathname.split('/').filter(Boolean).pop();
    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${boardName}/${reqId}`;
    
    try {
      const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 15000 }));
      if (response.data?.job?.descriptionHtml) {
        return response.data.job.descriptionHtml.replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
      }
    } catch (e) {
      // Fallback or ignore
    }
    return '';
  }

  async normalize(jobData, rawText, locationEngine, experienceEngine, aiArbitrator) {
    return jobData;
  }
}

module.exports = AshbyAdapter;
