const axios = require('axios');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      const delay = (baseDelay * Math.pow(2, attempt - 1)) + (Math.random() * 1000);
      await sleep(delay);
    }
  }
}

async function axiosRequest(config, maxRetries = 3, baseDelay = 1000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const headers = config.headers || {};
      headers['User-Agent'] = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      headers['Accept'] = headers['Accept'] || 'application/json, text/plain, */*';
      headers['Accept-Language'] = headers['Accept-Language'] || 'en-US,en;q=0.9';
      headers['Connection'] = 'keep-alive';
      config.headers = headers;
      return await axios(config);
    } catch (err) {
      attempt++;
      const status = err.response?.status;
      if (status && [400, 401, 403, 404].includes(status) && status !== 429) {
        throw err;
      }
      if (attempt >= maxRetries) throw err;
      const delay = (baseDelay * Math.pow(2, attempt - 1)) + (Math.random() * 1000);
      await sleep(delay);
    }
  }
}

function generateJobId(companyId, title, location, url, reqId = '') {
  const crypto = require('crypto');
  const str = `${companyId}-${title}-${location}-${url}-${reqId}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
}

function getScrapeLimit(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

module.exports = { sleep, withRetry, axiosRequest, generateJobId, getScrapeLimit, USER_AGENTS };
