const axios = require('axios');
const BaseAdapter = require('./BaseAdapter');
const { withRetry } = require('../core/utils');

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

class LeverAdapter extends BaseAdapter {
  static atsName = 'lever';

  static detect(url, html) {
    if (/lever\.co/i.test(url)) return { ats: 'lever', confidence: 0.98, method: 'url' };
    if (html && /lever\.co/i.test(html)) return { ats: 'lever', confidence: 0.85, method: 'html' };
    return null;
  }
  async discoverJobs() {
    const jobs = [];
    const parsed = new URL(this.careersUrl);
    const token = parsed.pathname.split('/').filter(Boolean)[0];
    if (!token) throw new Error('Could not parse Lever company token.');

    const apiUrl = `https://api.lever.co/v0/postings/${token}?mode=json`;
    const response = await withRetry(() => axios.get(apiUrl, { headers: AXIOS_HEADERS, timeout: 60000 }));
    const postings = response.data || [];

    for (const posting of postings) {
      let rawText = posting.descriptionPlain || '';
      if (posting.lists) {
        posting.lists.forEach(l => {
          const contentStr = Array.isArray(l.content) ? l.content.join('\n') : (l.content || '');
          rawText += `\n${l.text || ''}\n` + contentStr;
        });
      }

      jobs.push({
        title: posting.title,
        location: posting.categories?.location || '',
        url: posting.hostedUrl,
        reqId: posting.id,
        _rawText: rawText.replace(/<[^>]*>/g, '\n').replace(/\s+/g, ' ').trim()
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

module.exports = LeverAdapter;
