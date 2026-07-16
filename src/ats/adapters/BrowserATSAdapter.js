'use strict';

const GenericAdapter = require('./GenericAdapter');

/**
 * Browser-based fallback for ATS platforms without a dedicated API adapter.
 * Uses Playwright only when API discovery is unavailable.
 */
class BrowserATSAdapter extends GenericAdapter {
  constructor(companyId, companyName, careersUrl, atsType = 'generic') {
    super(companyId, companyName, careersUrl);
    this.atsType = atsType || 'generic';
  }

  static detect(url, html) {
    const patterns = {
      successfactors: [/jobs\.sap\.com/i, /successfactors/i],
      cornerstone: [/csod\.com/i, /cornerstoneondemand/i],
      icims: [/\.icims\.com/i],
      taleo: [/\.taleo\.net/i],
      avature: [/\.avature\.net/i],
      jobvite: [/\.jobvite\.com/i],
      beamery: [/\.beamery\.com/i],
      sap: [/jobs\.sap\.com/i],
    };
    for (const [ats, regexes] of Object.entries(patterns)) {
      for (const re of regexes) {
        if (re.test(url)) return { ats, confidence: 0.95, method: 'url' };
        if (html && re.test(html)) return { ats, confidence: 0.80, method: 'html' };
      }
    }
    return null;
  }

  async normalize(jobData, rawText) {
    return {
      ...jobData,
      description: rawText,
      atsType: this.atsType,
    };
  }
}

module.exports = BrowserATSAdapter;
