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
  successfactors: [/successfactors\.com/i, /jobs\.sap\.com/i],
  brassring: [/gateway\.brassring\.com/i, /sjobs\.brassring\.com/i],
  icims: [/icims\.com/i],
  taleo: [/taleo\.net/i],
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
      brassring: [/brassring\.com/i, /kenexa/i],
      oracle: [/oraclecloud\.com/i, /fa-[\w\-]+\.oraclecloud\.com/i],
      cornerstone: [/csod\.com/i, /cornerstoneondemand\.com/i],
      phenom: [/phenompeople\.com/i, /phenom\.com/i],
      icims: [/\.icims\.com/i],
      taleo: [/\.taleo\.net/i],
      avature: [/\.avature\.net/i],
      jobvite: [/\.jobvite\.com/i],
      beamery: [/\.beamery\.com/i],
      sap: [/jobs\.sap\.com/i],
    };

    this.domSignatures = {
      workday: ['meta[name="application-name"][content="Workday"]', 'script[src*="myworkdayjobs"]'],
      greenhouse: ['script[src*="greenhouse.io"]'],
      lever: ['script[src*="lever.co"]'],
      smartrecruiters: ['script[src*="smartrecruiters.com"]'],
      eightfold: ['script[src*="eightfold.ai"]'],
      successfactors: ['link[href*="successfactors.com"]', 'meta[name="generator"][content*="SuccessFactors"]'],
      brassring: ['script[src*="brassring.com"]', 'iframe[src*="brassring.com"]', 'link[href*="brassring.com"]'],
      oracle: ['script[src*="oraclecloud.com"]'],
      cornerstone: ['script[src*="csod.com"]'],
      phenom: ['script[src*="phenom"]', 'meta[name="generator"][content*="Phenom"]'],
      icims: ['script[src*="icims.com"]', 'iframe[src*="icims.com"]'],
      taleo: ['script[src*="taleo.net"]'],
      avature: ['script[src*="avature.net"]'],
      jobvite: ['script[src*="jobvite.com"]'],
      beamery: ['script[src*="beamery.com"]'],
    };
  }

  _adapterCandidates(url, html) {
    const candidates = [];
    const seenAdapters = new Set(Object.keys(this.urlPatterns));
    for (const atsName of seenAdapters) {
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
    return candidates;
  }

  _urlCandidates(url) {
    const candidates = [];
    for (const [ats, patterns] of Object.entries(this.urlPatterns)) {
      if (patterns.some(p => p.test(url))) {
        candidates.push({ ats, confidence: 0.98, method: 'url' });
      }
    }
    return candidates;
  }

  _htmlCandidates(html) {
    if (!html || typeof html !== 'string') return [];
    const scores = [];

    for (const [ats, patterns] of Object.entries(API_PATTERNS)) {
      const matched = patterns.some(p => p.test(html));
      const apiPatterns = API_PATTERNS[ats];
      if (matched || (apiPatterns && apiPatterns.some(p => p.test(html)))) {
        scores.push({ ats, confidence: 0.78, method: 'html_pattern' });
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
      // DOM parse failure
    }

    return scores;
  }

  _selectBestCandidate(candidates) {
    if (!candidates.length) return null;
    const byAts = new Map();
    for (const candidate of candidates) {
      const current = byAts.get(candidate.ats);
      if (!current || candidate.confidence > current.confidence) {
        byAts.set(candidate.ats, candidate);
      }
    }
    return Array.from(byAts.values()).sort((a, b) => b.confidence - a.confidence)[0];
  }

  async discover(url) {
    let detected = { ats: 'generic', confidence: 0.50, method: 'fallback' };
    let html = '';
    const candidates = [
      ...this._adapterCandidates(url, ''),
      ...this._urlCandidates(url),
    ];

    try {
      const response = await axios.get(url, {
        timeout: 12000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        },
      });
      html = typeof response.data === 'string' ? response.data : '';
      candidates.push(...this._adapterCandidates(url, html));
      candidates.push(...this._htmlCandidates(html));
    } catch (e) {
      console.warn(`[ATSRegistry] HTML discovery failed for ${url}: ${e.message}`);
    }

    const best = this._selectBestCandidate(candidates);
    if (best && best.confidence >= 0.70) detected = best;

    const candidateSummary = candidates
      .map(c => `${c.ats}:${c.confidence.toFixed(2)}:${c.method}`)
      .join(', ');
    if (candidateSummary) {
      console.log(`[ATSRegistry] Candidates for ${url}: ${candidateSummary}`);
    }

    if (detected.ats === 'workday') {
      const validationConfidence = await this._validateWorkday(url);
      const finalConfidence = Math.min(detected.confidence, validationConfidence);
      if (finalConfidence > 0.70) {
        return { ...detected, confidence: finalConfidence, method: `${detected.method}_validated` };
      }
      console.log(`[ATSRegistry] Workday validation confidence ${validationConfidence.toFixed(2)} for ${url}. Falling back to generic.`);
      return { ats: 'generic', confidence: 0.50, method: 'fallback_after_validation_low_confidence' };
    } else if (detected.ats === 'successfactors') {
      const validationConfidence = await this._validateSuccessFactors(url);
      const finalConfidence = Math.min(detected.confidence, validationConfidence);
      if (finalConfidence > 0.70) {
        return { ...detected, confidence: finalConfidence, method: `${detected.method}_validated` };
      }
      console.log(`[ATSRegistry] SuccessFactors validation confidence ${validationConfidence.toFixed(2)} for ${url}. Falling back to generic.`);
      return { ats: 'generic', confidence: 0.50, method: 'fallback_after_validation_low_confidence' };
    }

    return detected;
  }

  async _validateWorkday(url) {
    if (/myworkdayjobs\.com/i.test(url)) return 1.0;
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
      if (response.status === 200 && contentType.includes('application/json')) return 1.0;
      const html = typeof response.data === 'string' ? response.data : '';
      if (!html) return 0.25;

      const cxsMatch = html.match(/https?:\/\/[^"']+\/wday\/cxs\/[^"']+\/jobs/i) ||
        html.match(/\/wday\/cxs\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/jobs/i);
      if (cxsMatch) {
        const parsed = new URL(url);
        const apiUrl = cxsMatch[0].startsWith('http')
          ? cxsMatch[0]
          : `https://${parsed.hostname}${cxsMatch[0]}`;
        const apiResponse = await axios.post(apiUrl, { appliedFacets: {}, limit: 1, offset: 0, searchText: '' }, {
          timeout: 10000,
          validateStatus: () => true,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });
        const apiContentType = String(apiResponse.headers?.['content-type'] || '').toLowerCase();
        if (apiResponse.status === 200 && apiContentType.includes('application/json')) return 0.95;
        if ([401, 403, 429].includes(apiResponse.status)) return 0.78;
      }

      // If we got here on a custom domain, we couldn't find/validate the CXS API.
      // Do NOT blindly trust generic HTML hints like application-name="Workday" because they lead to false positives (e.g. Accenture).
      return 0.35;
    } catch (e) {
      return 0.35;
    }
  }

  async _validateSuccessFactors(url) {
    if (/successfactors\.com|jobs\.sap\.com|careers\.sap\.com/i.test(url)) return 1.0;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const rssUrl = `https://${host}/services/rss/job/`;
      const response = await axios.get(rssUrl, {
        timeout: 10000,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (response.status === 200) return 0.95;
      if (response.status === 403) return 0.78;
    } catch (e) {
      return 0.72;
    }
    return 0.35;
  }
}

module.exports = new ATSRegistry();
