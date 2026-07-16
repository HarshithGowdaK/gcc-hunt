'use strict';

const JobHelpers = require('../../shared/JobHelpers');

class EngineLocation {
  constructor() {
    this.INDIA_REGEX = /\b(india|pan\s*india|remote\s*india|india\s*remote|india\s*preferred|bangalore\s*urban|bangalore|bengaluru|hyderabad|chennai|pune|mumbai|gurugram|gurgaon|noida|ahmedabad|kolkata|kochi|coimbatore|in-ka|in-tg|blr|hyd)\b/i;
    this.INDIA_REMOTE_REGEX = /\b(remote\s*india|india\s*remote|india\s*preferred|pan\s*india|work\s*from\s*home.*india)\b/i;
    this.FOREIGN_REGEX = /\b(europe|emea|germany|france|italy|poland|australia|new zealand|canada|united states|usa|uk|saudi|japan|china|singapore|korea|argentina|chile|brazil|mexico|netherlands|sweden|norway|denmark|belgium|switzerland|austria|ireland|israel|hong kong|taiwan|thailand|vietnam)\b/i;
    this.FOREIGN_SHIFT_REGEX = /\b(uk\s*shift|us\s*shift|europe\s*shift|night\s*shift\s*uk)\b/i;
    this.MIN_CONFIDENCE = 0.45;
  }

  _scoreField(text, weight, label, evidence, options = {}) {
    if (!text) return 0;
    const isIndia = this.INDIA_REGEX.test(text) ||
                    this.INDIA_REMOTE_REGEX.test(text) ||
                    (label !== 'Description' && /\bIN\b/.test(text));
    if (isIndia) {
      evidence.push(`${label}: India signal detected`);
      return weight;
    }
    const hasForeign = this.FOREIGN_REGEX.test(text) || (label !== 'Description' && /\b(US|UK|CA|IL|DE|FR|PL|AU|NZ|SG)\b/.test(text));
    if (options.allowForeign !== false && hasForeign && !this.INDIA_REGEX.test(text) && !/\bIN\b/.test(text)) {
      evidence.push(`${label}: Foreign location signal: ${text.substring(0, 80)}`);
      return -weight * 0.8;
    }
    return 0;
  }

  evaluate(title, locationField, description, atsMetadata = '', url = '') {
    const evidence = [];

    // Explicitly reject foreign location fields and ATS metadata before extraction
    const locationFieldStr = String(locationField || '').trim();
    if (locationFieldStr) {
      const isIndiaSignal = this.INDIA_REGEX.test(locationFieldStr) || /\bIN\b/.test(locationFieldStr);
      const isGenericRemote = /\b(remote|wfh|home|anywhere|flexible|virtual|pan)\b/i.test(locationFieldStr);
      if (!isIndiaSignal && !isGenericRemote) {
        evidence.push(`Location field explicitly foreign: ${locationField}`);
        return {
          country: 'Foreign',
          confidence: 0,
          evidence,
          isIndia: false,
          resolvedLocation: locationField,
        };
      }
    }

    const atsMetadataStr = String(atsMetadata || '').trim();
    if (!locationFieldStr && atsMetadataStr) {
      const isIndiaSignal = this.INDIA_REGEX.test(atsMetadataStr) || /\bIN\b/.test(atsMetadataStr);
      const isGenericRemote = /\b(remote|wfh|home|anywhere|flexible|virtual|pan)\b/i.test(atsMetadataStr);
      if (!isIndiaSignal && !isGenericRemote) {
        evidence.push(`ATS metadata explicitly foreign: ${atsMetadata}`);
        return {
          country: 'Foreign',
          confidence: 0,
          evidence,
          isIndia: false,
          resolvedLocation: '',
        };
      }
    }

    let confidence = 0;
    const detailLocation = JobHelpers.extractIndianLocation(locationField, atsMetadata, description);
    const effectiveLocationField = detailLocation?.location || locationField;

    if (detailLocation && (!locationField || JobHelpers.isGenericIndiaLocation(locationField) || detailLocation.location !== locationField)) {
      evidence.push(`Structured/detail location extracted: ${detailLocation.location}`);
    }

    confidence += this._scoreField(effectiveLocationField, 65, 'Location field', evidence);
    confidence += this._scoreField(atsMetadata, 25, 'ATS metadata', evidence);
    confidence += this._scoreField(description, 8, 'Description', evidence, { allowForeign: false });
    confidence += this._scoreField(url, 5, 'URL', evidence);

    const titleHasForeignOnly = this.FOREIGN_REGEX.test(title || '') && !this.INDIA_REGEX.test(title || '');
    if (titleHasForeignOnly) {
      evidence.push('Title foreign geography ignored as possible team/department/business unit text');
    }

    // India evidence overrides foreign shift references (e.g. UK Shift (Bangalore))
    const hasIndiaEvidence = evidence.some(e => e.includes('India signal'));
    if (hasIndiaEvidence && (this.FOREIGN_SHIFT_REGEX.test(title) || this.FOREIGN_SHIFT_REGEX.test(locationField))) {
      evidence.push('Foreign shift reference overridden by India location evidence');
      confidence = Math.max(confidence, 55);
    }

    // Country-name titles (Argentina, Chile) are navigation artifacts
    const titleTrim = String(title || '').trim();
    if (/^(argentina|australia|austria|belgium|brazil|canada|chile|china|colombia|denmark|finland|france|germany|hong kong|indonesia|ireland|israel|italy|japan|korea|mexico|netherlands|new zealand|norway|poland|portugal|singapore|spain|sweden|switzerland|taiwan|thailand|uk|united kingdom|united states|usa|vietnam|europe|emea|apac|americas|global)$/i.test(titleTrim)) {
      confidence -= 60;
      evidence.push(`Title is a country/region name (${titleTrim}) — likely navigation link`);
    }

    const normalizedConfidence = Math.max(0, Math.min(100, confidence)) / 100;
    const isIndia = normalizedConfidence >= this.MIN_CONFIDENCE && confidence > 0;

    let resolvedLocation = effectiveLocationField || '';
    if (!resolvedLocation && hasIndiaEvidence) {
      resolvedLocation = 'India';
    }

    let country = 'Unknown';
    if (isIndia) {
      country = 'India';
    } else {
      const lowerLoc = (locationField || '').toLowerCase();
      const lowerMetadata = (atsMetadata || '').toLowerCase();
      const checkText = lowerLoc + ' ' + lowerMetadata;
      const foreignMatch = checkText.match(this.FOREIGN_REGEX);
      if (foreignMatch) {
        const matchStr = foreignMatch[0];
        country = matchStr.charAt(0).toUpperCase() + matchStr.slice(1);
      }
    }

    return {
      country,
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
