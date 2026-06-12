'use strict';

const JobHelpers = require('./JobHelpers');

class EngineLocation {
  constructor() {
    this.INDIA_REGEX = /\b(india|pan\s*india|remote\s*india|india\s*remote|india\s*preferred|bangalore\s*urban|bangalore|bengaluru|hyderabad|chennai|pune|mumbai|gurugram|gurgaon|noida|ahmedabad|kolkata|kochi|coimbatore|in-ka|in-tg|blr|hyd)\b/i;
    this.INDIA_REMOTE_REGEX = /\b(remote\s*india|india\s*remote|india\s*preferred|pan\s*india|work\s*from\s*home.*india)\b/i;
    this.FOREIGN_REGEX = /\b(europe|emea|germany|france|italy|poland|australia|new zealand|canada|united states|usa|uk|saudi|japan|china|singapore|korea|argentina|chile|brazil|mexico|netherlands|sweden|norway|denmark|belgium|switzerland|austria|ireland|israel|hong kong|taiwan|thailand|vietnam)\b/i;
    this.FOREIGN_SHIFT_REGEX = /\b(uk\s*shift|us\s*shift|europe\s*shift|night\s*shift\s*uk)\b/i;
    this.MIN_CONFIDENCE = 0.45;
  }

  _scoreField(text, weight, label, evidence, isIndiaSignal) {
    if (!text) return 0;
    if (this.INDIA_REGEX.test(text) || this.INDIA_REMOTE_REGEX.test(text)) {
      evidence.push(`${label}: India signal detected`);
      return weight;
    }
    if (this.FOREIGN_REGEX.test(text) && !this.INDIA_REGEX.test(text)) {
      evidence.push(`${label}: Foreign location signal: ${text.substring(0, 80)}`);
      return -weight * 0.8;
    }
    return 0;
  }

  evaluate(title, locationField, description, atsMetadata = '', url = '') {
    const evidence = [];
    let confidence = 0;

    confidence += this._scoreField(locationField, 60, 'Location field', evidence, true);
    confidence += this._scoreField(atsMetadata, 20, 'ATS metadata', evidence, true);
    confidence += this._scoreField(description, 10, 'Description', evidence, true);
    confidence += this._scoreField(title, 5, 'Title', evidence, true);
    confidence += this._scoreField(url, 5, 'URL', evidence, true);

    // India evidence overrides foreign shift references (e.g. UK Shift (Bangalore))
    const hasIndiaEvidence = evidence.some(e => e.includes('India signal'));
    if (hasIndiaEvidence && (this.FOREIGN_SHIFT_REGEX.test(title) || this.FOREIGN_SHIFT_REGEX.test(locationField))) {
      evidence.push('Foreign shift reference overridden by India location evidence');
      confidence = Math.max(confidence, 55);
    }

    // Strong foreign title without India location — reject
    if (JobHelpers.isObviousNonIndiaRole(title) && !hasIndiaEvidence) {
      confidence -= 40;
      evidence.push('Title contains foreign geography without India evidence');
    }

    // Country-name titles (Argentina, Chile) are navigation artifacts
    const titleTrim = String(title || '').trim();
    if (/^(argentina|australia|austria|belgium|brazil|canada|chile|china|colombia|france|germany|japan|mexico|singapore|spain|uk|usa)$/i.test(titleTrim)) {
      confidence -= 60;
      evidence.push(`Title is a country/region name (${titleTrim}) — likely navigation link`);
    }

    const normalizedConfidence = Math.max(0, Math.min(100, confidence)) / 100;
    const isIndia = normalizedConfidence >= this.MIN_CONFIDENCE && confidence > 0;

    let resolvedLocation = locationField || '';
    if (!resolvedLocation && hasIndiaEvidence) {
      resolvedLocation = 'India';
    }

    return {
      country: isIndia ? 'India' : 'Unknown',
      confidence: normalizedConfidence,
      evidence,
      isIndia,
      resolvedLocation,
    };
  }

  normalizeCityState(rawLocation) {
    const norm = JobHelpers.normalizeLocation(rawLocation);
    if (norm) return { city: norm.city, state: norm.state };
    const lower = String(rawLocation || '').toLowerCase();
    let city = 'Unknown';
    let state = 'Unknown';
    if (/bangalore|bengaluru|blr|in-ka|karnataka/.test(lower)) { city = 'Bangalore'; state = 'Karnataka'; }
    else if (/hyderabad|hyd|in-tg|telangana/.test(lower)) { city = 'Hyderabad'; state = 'Telangana'; }
    else if (/chennai|tamil nadu/.test(lower)) { city = 'Chennai'; state = 'Tamil Nadu'; }
    else if (/pune/.test(lower)) { city = 'Pune'; state = 'Maharashtra'; }
    else if (/mumbai/.test(lower)) { city = 'Mumbai'; state = 'Maharashtra'; }
    else if (/gurgaon|gurugram/.test(lower)) { city = 'Gurgaon'; state = 'Haryana'; }
    else if (/noida/.test(lower)) { city = 'Noida'; state = 'Uttar Pradesh'; }
    else if (/kochi/.test(lower)) { city = 'Kochi'; state = 'Kerala'; }
    else if (/ahmedabad/.test(lower)) { city = 'Ahmedabad'; state = 'Gujarat'; }
    else if (/kolkata/.test(lower)) { city = 'Kolkata'; state = 'West Bengal'; }
    else if (/\bindia\b/.test(lower)) { city = 'India'; state = 'India'; }
    return { city, state };
  }

  quickIndiaCheck(title, location, url) {
    const result = this.evaluate(title, location, '', '', url);
    return result.isIndia;
  }
}

module.exports = new EngineLocation();
