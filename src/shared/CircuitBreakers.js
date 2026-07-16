class CircuitBreakers {
  constructor() {
    this.companyFailures = new Map();
    this.atsFailures = new Map();
    this.aiFailures = 0;
    
    this.COMPANY_THRESHOLD = 5;
    this.ATS_THRESHOLD = 15;
    this.AI_THRESHOLD = 10;

    this.pausedCompanies = new Set();
    this.throttledATS = new Set();
    this.aiDisabled = false;
  }

  recordCompanyFailure(companyId) {
    const current = (this.companyFailures.get(companyId) || 0) + 1;
    this.companyFailures.set(companyId, current);
    if (current >= this.COMPANY_THRESHOLD) {
      this.pausedCompanies.add(companyId);
      console.warn(`[CircuitBreaker] Company ${companyId} paused due to ${current} consecutive failures.`);
    }
  }

  recordCompanySuccess(companyId) {
    this.companyFailures.set(companyId, 0);
    this.pausedCompanies.delete(companyId);
  }

  isCompanyPaused(companyId) {
    return this.pausedCompanies.has(companyId);
  }

  recordATSFailure(atsName) {
    const current = (this.atsFailures.get(atsName) || 0) + 1;
    this.atsFailures.set(atsName, current);
    if (current >= this.ATS_THRESHOLD) {
      this.throttledATS.add(atsName);
      console.warn(`[CircuitBreaker] ATS ${atsName} throttled due to ${current} consecutive failures.`);
    }
  }

  recordATSSuccess(atsName) {
    this.atsFailures.set(atsName, 0);
    this.throttledATS.delete(atsName);
  }

  isATSThrottled(atsName) {
    return this.throttledATS.has(atsName);
  }

  recordAIFailure() {
    this.aiFailures += 1;
    if (this.aiFailures >= this.AI_THRESHOLD) {
      this.aiDisabled = true;
      console.warn(`[CircuitBreaker] AI Arbitration disabled due to ${this.aiFailures} consecutive provider failures.`);
    }
  }

  recordAISuccess() {
    this.aiFailures = 0;
    this.aiDisabled = false;
  }

  isAIDisabled() {
    return this.aiDisabled;
  }
}

module.exports = new CircuitBreakers();
