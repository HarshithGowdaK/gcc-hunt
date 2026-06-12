const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry } = require('../core/utils');

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

class WorkdayAdapter extends BaseAdapter {
  static atsName = 'workday';

  static detect(url, html) {
    if (/myworkdayjobs\.com/i.test(url)) return { ats: 'workday', confidence: 0.98, method: 'url' };
    if (html && /myworkdayjobs|wday\/cxs/i.test(html)) return { ats: 'workday', confidence: 0.88, method: 'html' };
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const parsed = new URL(this.careersUrl);
    const host = parsed.hostname;
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const tenant = host.split('.')[0];
    let site = 'Search';
    if (pathSegments.length > 1) site = pathSegments[1];
    else if (pathSegments.length === 1 && pathSegments[0] !== 'en-US') site = pathSegments[0];

    const apiUrl = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    let offset = 0;
    const limit = 20;
    let hasMore = true;

    while (hasMore) {
      const response = await withRetry(() => axios.post(
        apiUrl,
        { appliedFacets: {}, limit, offset, searchText: '' },
        { headers: { ...AXIOS_HEADERS, 'Content-Type': 'application/json' }, timeout: 15000 }
      ));

      const postings = response.data.jobPostings || [];
      if (postings.length === 0) break;

      for (const posting of postings) {
        jobs.push({
          title: posting.title,
          location: posting.locationsText,
          url: `https://${host}/${site.toLowerCase()}${posting.externalPath}`,
          reqId: posting.jobReqId,
          _detailApiUrl: `https://${host}/wday/cxs/${tenant}/${site}${posting.externalPath}`
        });
      }

      if (postings.length < limit) hasMore = false;
      else offset += limit;
    }

    return jobs;
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    if (!internalJobRef || !internalJobRef._detailApiUrl) return '';
    const detailRes = await withRetry(() => axios.get(internalJobRef._detailApiUrl, { timeout: 15000 }));
    if (detailRes.data?.jobPostingInfo) {
      const info = detailRes.data.jobPostingInfo;
      return (info.jobDescription || '').replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  async normalize(jobData, rawText, locationEngine, experienceEngine, aiArbitrator) {
    // Already handled centrally in the runner orchestration (Location, Experience, AI)
    // This method is just to satisfy the BaseAdapter interface for custom fields if needed
    return jobData;
  }
}

module.exports = WorkdayAdapter;
