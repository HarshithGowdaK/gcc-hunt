'use strict';

class BaseAdapter {
  static atsName = 'base';

  /**
   * Static ATS detection hook — each adapter can contribute URL/HTML signals.
   */
  static detect(url, html) {
    return null;
  }

  constructor(companyId, companyName, careersUrl, atsType) {
    this.companyId = companyId;
    this.companyName = companyName;
    this.careersUrl = careersUrl;
    this.atsType = atsType || this.constructor.atsName || 'generic';
    this.capability = {
      coverageScore: 0,
      confidenceScore: 0,
      lastSuccess: null,
      failureRate: 0,
      successes: 0,
      failures: 0,
    };
  }

  async discoverJobs() {
    throw new Error('discoverJobs() must be implemented by adapter');
  }

  async fetchJob(jobUrl, reqId, internalJobRef) {
    throw new Error('fetchJob() must be implemented by adapter');
  }

  async normalize(jobData, rawText) {
    return {
      ...jobData,
      description: rawText,
    };
  }

  recordSuccess(jobsFound = 0) {
    this.capability.successes += 1;
    this.capability.lastSuccess = new Date().toISOString();
    this.capability.coverageScore = jobsFound;
    const total = this.capability.successes + this.capability.failures;
    this.capability.failureRate = total > 0 ? this.capability.failures / total : 0;
    this.capability.confidenceScore = Math.min(1, 0.5 + (this.capability.successes * 0.1));
  }

  recordFailure() {
    this.capability.failures += 1;
    const total = this.capability.successes + this.capability.failures;
    this.capability.failureRate = total > 0 ? this.capability.failures / total : 1;
    this.capability.confidenceScore = Math.max(0, 1 - this.capability.failureRate);
  }

  getCapability() {
    return { ...this.capability, ats: this.atsType };
  }
}

module.exports = BaseAdapter;
