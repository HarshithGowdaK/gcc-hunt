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
        genericFailures: {
          noCards: 0,
          selectorMiss: 0,
          blocked: 0,
          timeout: 0,
          other: 0,
        },
        genericDiagnostics: {
          jobCardCounts: [],
          paginationCount: 0,
          extractedUrlCounts: [],
          indiaFilter: [],
        },
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
    m.jobsRejected += 1;
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

  recordGenericFailure(companyId, reason) {
    const m = this.getCompanyMetrics(companyId);
    const key = m.genericFailures[reason] !== undefined ? reason : 'other';
    m.genericFailures[key] += 1;
  }

  recordGenericDiagnostics(companyId, diagnostics = {}) {
    const m = this.getCompanyMetrics(companyId);
    m.genericDiagnostics.jobCardCounts.push(...(diagnostics.jobCardCounts || []));
    m.genericDiagnostics.extractedUrlCounts.push(...(diagnostics.extractedUrlCounts || []));
    m.genericDiagnostics.paginationCount += diagnostics.paginationCount || 0;
    if (diagnostics.indiaFilter) m.genericDiagnostics.indiaFilter.push(diagnostics.indiaFilter);
  }

  recordAdapterCapability(companyId, capability) {
    this.getCompanyMetrics(companyId).adapterCapability = capability;
  }

  generateQualityReport(companyId) {
    const m = this.getCompanyMetrics(companyId);
    const extractionScore = m.jobsDiscovered > 0 ? m.jobsParsed / m.jobsDiscovered : 0;
    const classificationScore = m.jobsParsed > 0 ? m.jobsAccepted / m.jobsParsed : 0;
    const coverageScore = m.jobsDiscovered > 0 ? m.jobsAccepted / m.jobsDiscovered : 0;
    const baseline = this.baselineJobCounts.get(companyId) || 0;
    const coverageRegression = baseline > 20 && m.jobsAccepted < baseline * 0.1;

    return {
      qualityScore: ((0.5 * coverageScore) + (0.3 * extractionScore) + (0.2 * classificationScore)).toFixed(2),
      coverageScore: coverageScore.toFixed(2),
      jobsAccepted: m.jobsAccepted,
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
        genericFailures: m.genericFailures,
        genericDiagnostics: m.genericDiagnostics,
        reasons: m.reasons,
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
      if (!atsStats[ats].genericFailures) {
        atsStats[ats].genericFailures = { noCards: 0, selectorMiss: 0, blocked: 0, timeout: 0, other: 0 };
      }
      atsStats[ats].companies += 1;
      atsStats[ats].jobsAccepted += m.jobsAccepted;
      atsStats[ats].failures += m.jobsRejected;
      if (ats === 'generic') {
        for (const [reason, count] of Object.entries(m.genericFailures)) {
          atsStats[ats].genericFailures[reason] = (atsStats[ats].genericFailures[reason] || 0) + count;
        }
      }
    }
    return atsStats;
  }

  getAllMetrics() {
    return Object.fromEntries(this.metrics);
  }
}

module.exports = new Observability();
