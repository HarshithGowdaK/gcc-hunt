function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

function generateJobId(companyId, title, location, url, reqId = '') {
  const crypto = require('crypto');
  const str = `${companyId}-${title}-${location}-${url}-${reqId}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
}

module.exports = { sleep, withRetry, generateJobId };
