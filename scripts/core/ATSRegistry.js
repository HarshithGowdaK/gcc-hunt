'use strict';

const axios = require('axios');
const { JSDOM } = require('jsdom');
const { getAdapterClass } = require('./AdapterRegistry');

const API_PATTERNS = {
  workday: [/wday\/cxs\//i, /myworkdayjobs\.com/i],
  greenhouse: [/boards-api\.greenhouse\.io/i, /boards\.greenhouse\.io/i],
  lever: [/jobs\.lever\.co/i, /api\.lever\.co/i],
  smartrecruiters: [/api\.smartrecruiters\.com/i, /smartrecruiters\.com/i],
  eightfold: [/eightfold\.ai\/api/i],
  oracle: [/oraclecloud\.com/i, /hcmUI/i],
  phenom: [/phenompeople\.com/i, /phenom\.com/i],
  successfactors: [/successfactors/i, /jobs\.sap\.com/i],
  icims: [/icims\.com/i],
  taleo: [/taleo\.net/i],
  ashby: [/api\.ashbyhq\.com/i, /jobs\.ashbyhq\.com/i],
};

class ATSRegistry {
  constructor() {
    this.urlPatterns = {
      workday: [/myworkdayjobs\.com/i],
      greenhouse: [/boards\.greenhouse\.io/i, /greenhouse\.io/i],
      lever: [/jobs\.lever\.co/i, /lever\.co/i],
      smartrecruiters: [/careers\.smartrecruiters\.com/i, /jobs\.smartrecruiters\.com/i],
      eightfold: [/\.eightfold\.ai/i],
      successfactors: [/jobs\.sap\.com/i, /successfactors\.com/i, /career\d+\.successfactors\.(com|eu)/i],
      oracle: [/oraclecloud\.com/i, /fa-[\w\-]+\.oraclecloud\.com/i],
      cornerstone: [/csod\.com/i, /cornerstoneondemand\.com/i],
      phenom: [/phenompeople\.com/i, /phenom\.com/i],
      icims: [/\.icims\.com/i],
      taleo: [/\.taleo\.net/i],
      avature: [/\.avature\.net/i],
      jobvite: [/\.jobvite\.com/i],
      beamery: [/\.beamery\.com/i],
      sap: [/jobs\.sap\.com/i],
      ashby: [/\.ashbyhq\.com/i],
    };

    this.domSignatures = {
      workday: ['meta[name="application-name"][content="Workday"]', 'script[src*="myworkdayjobs"]'],
      greenhouse: ['script[src*="greenhouse.io"]'],
      lever: ['script[src*="lever.co"]'],
      smartrecruiters: ['script[src*="smartrecruiters.com"]'],
      eightfold: ['script[src*="eightfold.ai"]'],
      successfactors: ['link[href*="successfactors.com"]', 'meta[name="generator"][content*="SuccessFactors"]'],
      oracle: ['script[src*="oraclecloud.com"]'],
      cornerstone: ['script[src*="csod.com"]'],
      phenom: ['script[src*="phenom"]', 'meta[name="generator"][content*="Phenom"]'],
      icims: ['script[src*="icims.com"]', 'iframe[src*="icims.com"]'],
      taleo: ['script[src*="taleo.net"]'],
      avature: ['script[src*="avature.net"]'],
      jobvite: ['script[src*="jobvite.com"]'],
      beamery: ['script[src*="beamery.com"]'],
      ashby: ['script[src*="ashbyhq.com"]'],
    };
  }

  _adapterDetect(url, html) {
    const candidates = [];
    for (const atsName of Object.keys(this.urlPatterns)) {
      try {
        const AdapterClass = getAdapterClass(atsName);
        if (AdapterClass.detect) {
          const result = AdapterClass.detect(url, html);
          if (result) candidates.push(result);
        }
      } catch {
        // Adapter may not implement detect
      }
    }
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => b.confidence - a.confidence)[0];
  }

  _urlDetect(url) {
    for (const [ats, patterns] of Object.entries(this.urlPatterns)) {
      if (patterns.some(p => p.test(url))) {
        return { ats, confidence: 0.98, method: 'url' };
      }
    }
    return null;
  }

  _htmlDetect(html) {
    if (!html || typeof html !== 'string') return null;
    const scores = [];

    for (const [ats, sigs] of Object.entries(this.domSignatures)) {
      let matched = 0;
      for (const sig of sigs) {
        if (html.includes(sig.replace(/\[.*?\]/g, '').replace(/"/g, ''))) matched++;
      }
      const apiPatterns = API_PATTERNS[ats];
      if (apiPatterns && apiPatterns.some(p => p.test(html))) matched++;
      if (matched > 0) {
        scores.push({ ats, confidence: 0.70 + (matched * 0.08), method: 'dom' });
      }
    }

    try {
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      for (const [ats, sigs] of Object.entries(this.domSignatures)) {
        for (const sig of sigs) {
          if (doc.querySelector(sig)) {
            scores.push({ ats, confidence: 0.92, method: 'dom_signature' });
          }
        }
      }
    } catch {
      // DOM parse failure — rely on string heuristics
    }

    if (scores.length === 0) return null;
    return scores.sort((a, b) => b.confidence - a.confidence)[0];
  }

  async discover(url) {
    const adapterResult = this._adapterDetect(url, '');
    if (adapterResult && adapterResult.confidence >= 0.95) return adapterResult;

    const urlResult = this._urlDetect(url);
    if (urlResult) return urlResult;

    try {
      const response = await axios.get(url, {
        timeout: 12000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const html = typeof response.data === 'string' ? response.data : '';
      const htmlAdapter = this._adapterDetect(url, html);
      if (htmlAdapter && htmlAdapter.confidence >= 0.80) return htmlAdapter;

      const htmlResult = this._htmlDetect(html);
      if (htmlResult && htmlResult.confidence >= 0.70) return htmlResult;
    } catch (e) {
      console.warn(`[ATSRegistry] HTML discovery failed for ${url}: ${e.message}`);
    }

    if (adapterResult) return adapterResult;

    return { ats: 'generic', confidence: 0.50, method: 'fallback' };
  }
}

module.exports = new ATSRegistry();
