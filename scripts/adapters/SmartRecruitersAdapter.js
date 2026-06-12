const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry } = require('../core/utils');

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

class SmartRecruitersAdapter extends BaseAdapter {
  static atsName = 'smartrecruiters';

  static detect(url, html) {
    if (/smartrecruiters\.com/i.test(url)) return { ats: 'smartrecruiters', confidence: 0.98, method: 'url' };
    if (html && /smartrecruiters/i.test(html)) return { ats: 'smartrecruiters', confidence: 0.85, method: 'html' };
    return null;
  }

  async discoverJobs() {
    const jobs = [];
    const parsed = new URL(this.careersUrl);
    const companySlug = parsed.pathname.split('/').filter(Boolean).pop();
    
    const apiUrl = `https://api.smartrecruiters.com/v1/companies/${companySlug}/postings`;
    const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 15000 }));
    const postings = response.data.content || [];

    for (const posting of postings) {
      jobs.push({
        title: posting.name,
        location: posting.location?.city || posting.location?.country || '',
        url: `https://jobs.smartrecruiters.com/${companySlug}/${posting.id}`,
        reqId: posting.refNumber || posting.id,
        _detailApiUrl: `https://api.smartrecruiters.com/v1/companies/${companySlug}/postings/${posting.id}`
      });
    }
    return jobs;
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    if (!internalJobRef || !internalJobRef._detailApiUrl) return '';
    try {
      const detailRes = await withRetry(() => axios.get(internalJobRef._detailApiUrl, { headers: AXIOS_HEADERS, timeout: 15000 }));
      let rawText = (detailRes.data.jobAd?.sections?.jobDescription?.text || '') + ' ' + (detailRes.data.jobAd?.sections?.qualifications?.text || '');
      return rawText.replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }

  async normalize(jobData, rawText, locationEngine, experienceEngine, aiArbitrator) {
    return jobData;
  }
}

module.exports = SmartRecruitersAdapter;
