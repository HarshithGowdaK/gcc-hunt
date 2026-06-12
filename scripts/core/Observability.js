'use strict';

class Observability {
  constructor() {
    this.metrics = new Map();
    this.baselineJobCounts = new Map();
  }

  setBaseline(companyId, count) {
    this.baselineJobCounts.set(companyId, count);
  }

  getCompanyMetrics(companyId) {
    if (!this.metrics.has(companyId)) {
      this.metrics.set(companyId, {
        jobsDiscovered: 0,
        jobsParsed: 0,
        jobsAccepted: 0,
        jobsRejected: 0,
        duplicatesRemoved: 0,
        locationRejected: 0,
        aiCalls: 0,
        aiOverrides: 0,
        aiSkipped: 0,
        atsDetected: null,
        atsConfidence: null,
        atsMethod: null,
        paginationFailures: 0,
        adapterCapability: null,
        reasons: {
          rejections: {},
          locationFailures: {},
          aiSkipReasons: {},
          atsSelection: {},
        },
      });
    }
    return this.metrics.get(companyId);
  }

  recordDiscovery(companyId, count) {
    this.getCompanyMetrics(companyId).jobsDiscovered += count;
  }

  recordParsed(companyId) {
    this.getCompanyMetrics(companyId).jobsParsed += 1;
  }

  recordAccepted(companyId) {
    this.getCompanyMetrics(companyId).jobsAccepted += 1;
  }

  recordRejected(companyId, reason) {
    const m = this.getCompanyMetrics(companyId);
    m.jobsRejected += 1;
    m.reasons.rejections[reason] = (m.reasons.rejections[reason] || 0) + 1;
  }

  recordDuplicate(companyId) {
    this.getCompanyMetrics(companyId).duplicatesRemoved += 1;
  }

  recordLocationRejected(companyId, locationName, reason) {
    const m = this.getCompanyMetrics(companyId);
    m.locationRejected += 1;
    const key = reason || locationName || 'unknown';
    m.reasons.locationFailures[key] = (m.reasons.locationFailures[key] || 0) + 1;
  }

  recordAICall(companyId, override = false) {
    const m = this.getCompanyMetrics(companyId);
    m.aiCalls += 1;
    if (override) m.aiOverrides += 1;
  }

  recordAISkipped(companyId, reason) {
    const m = this.getCompanyMetrics(companyId);
    m.aiSkipped += 1;
    m.reasons.aiSkipReasons[reason] = (m.reasons.aiSkipReasons[reason] || 0) + 1;
  }

  recordATS(companyId, atsName, confidence, method) {
    const m = this.getCompanyMetrics(companyId);
    m.atsDetected = atsName;
    m.atsConfidence = confidence;
    m.atsMethod = method;
    m.reasons.atsSelection[atsName] = { confidence, method };
  }

  recordPaginationFailure(companyId) {
    this.getCompanyMetrics(companyId).paginationFailures += 1;
  }

  recordAdapterCapability(companyId, capability) {
    this.getCompanyMetrics(companyId).adapterCapability = capability;
  }

  generateQualityReport(companyId) {
    const m = this.getCompanyMetrics(companyId);
    const extractionScore = m.jobsDiscovered > 0 ? m.jobsParsed / m.jobsDiscovered : 0;
    const classificationScore = m.jobsParsed > 0 ? m.jobsAccepted / m.jobsParsed : 0;
    const baseline = this.baselineJobCounts.get(companyId) || 0;
    const coverageRegression = baseline > 20 && m.jobsAccepted < baseline * 0.1;

    return {
      qualityScore: ((extractionScore + classificationScore) / 2).toFixed(2),
      coverageScore: m.jobsAccepted,
      extractionScore: extractionScore.toFixed(2),
      classificationScore: classificationScore.toFixed(2),
      baselineJobs: baseline,
      coverageRegression,
      warning: coverageRegression
        ? `Coverage dropped from ${baseline} to ${m.jobsAccepted} jobs — investigate ATS adapter`
        : null,
    };
  }

  generateCoverageReport() {
    const report = {};
    for (const [id, m] of this.metrics) {
      report[id] = {
        discovered: m.jobsDiscovered,
        parsed: m.jobsParsed,
        accepted: m.jobsAccepted,
        rejected: m.jobsRejected,
        duplicates: m.duplicatesRemoved,
        quality: this.generateQualityReport(id),
      };
    }
    return report;
  }

  generateATSReport() {
    const atsStats = {};
    for (const [, m] of this.metrics) {
      const ats = m.atsDetected || 'unknown';
      if (!atsStats[ats]) atsStats[ats] = { companies: 0, jobsAccepted: 0, failures: 0 };
      atsStats[ats].companies += 1;
      atsStats[ats].jobsAccepted += m.jobsAccepted;
      atsStats[ats].failures += m.jobsRejected;
    }
    return atsStats;
  }

  getAllMetrics() {
    return Object.fromEntries(this.metrics);
  }
}

module.exports = new Observability();
