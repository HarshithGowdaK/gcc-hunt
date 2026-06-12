'use strict';

const crypto = require('crypto');
const Storage = require('./Storage');

class Deduplicator {
  _normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  _hashContent(text) {
    if (!text) return '';
    const normalizedText = text.replace(/\s+/g, '');
    return crypto.createHash('sha1').update(normalizedText).digest('hex');
  }

  buildFingerprints(companyId, title, location, reqId, description) {
    const primary = reqId ? `${companyId}:${reqId}` : null;
    const normTitle = this._normalizeString(title);
    const normLoc = this._normalizeString(location);
    const secondary = `${companyId}:${normTitle}:${normLoc}:${reqId || 'no_req'}`;
    const content = description && description.length > 50 ? this._hashContent(description) : null;
    return { primary, secondary, content };
  }

  /**
   * Early discovery-stage dedup — uses normalized location, not hardcoded suffix.
   */
  isEarlyDuplicate(companyId, title, location, reqId) {
    const fps = this.buildFingerprints(companyId, title, location || '', reqId, '');
    if (fps.primary && Storage.primaryFingerprints.has(fps.primary)) return true;
    if (fps.secondary && Storage.secondaryFingerprints.has(fps.secondary)) return true;
    return false;
  }

  calculateFingerprints(companyId, title, location, reqId, description) {
    const fingerprints = this.buildFingerprints(companyId, title, location, reqId, description);
    if (Storage.isDuplicate(fingerprints)) return null;
    return fingerprints;
  }
}

module.exports = new Deduplicator();
