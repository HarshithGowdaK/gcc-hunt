'use strict';

const fs = require('fs');
const path = require('path');

class Storage {
  constructor() {
    this.dataDir = path.join(__dirname, '../../web/src/data');
    this.jobsFile = path.join(this.dataDir, 'jobs.json');
    this.logsFile = path.join(this.dataDir, 'scrape_logs.json');
    this.companiesFile = path.join(this.dataDir, 'companies.json');

    this.jobs = [];
    this.logs = [];
    this.companies = [];
    this.primaryFingerprints = new Map();
    this.secondaryFingerprints = new Map();
    this.contentFingerprints = new Map();
    this.baselineCounts = new Map();
  }

  async load() {
    try {
      if (fs.existsSync(this.jobsFile)) {
        this.jobs = JSON.parse(fs.readFileSync(this.jobsFile, 'utf8'));
      }
    } catch (e) {
      console.warn('[Storage] Failed to load jobs.json:', e.message);
    }

    try {
      if (fs.existsSync(this.logsFile)) {
        this.logs = JSON.parse(fs.readFileSync(this.logsFile, 'utf8'));
      }
    } catch (e) {
      console.warn('[Storage] Failed to load scrape_logs.json:', e.message);
    }

    try {
      if (fs.existsSync(this.companiesFile)) {
        this.companies = JSON.parse(fs.readFileSync(this.companiesFile, 'utf8'));
      }
    } catch (e) {
      console.warn('[Storage] Failed to load companies.json:', e.message);
    }

    for (const job of this.jobs) {
      if (job.fingerprints) {
        const meta = { id: job.id, title: job.title, companyId: job.companyId };
        if (job.fingerprints.primary) this.primaryFingerprints.set(job.fingerprints.primary, meta);
        if (job.fingerprints.secondary) this.secondaryFingerprints.set(job.fingerprints.secondary, meta);
        if (job.fingerprints.content) this.contentFingerprints.set(job.fingerprints.content, meta);
      }
      const cid = job.companyId;
      this.baselineCounts.set(cid, (this.baselineCounts.get(cid) || 0) + 1);
    }

    console.log(`[Storage] Loaded ${this.jobs.length} existing jobs.`);
  }

  getBaselineCount(companyId) {
    return this.baselineCounts.get(companyId) || 0;
  }

  isDuplicate(fps) {
    if (!fps) return false;
    if (fps.primary && this.primaryFingerprints.has(fps.primary)) return true;
    if (fps.secondary && this.secondaryFingerprints.has(fps.secondary)) return true;
    if (fps.content && this.contentFingerprints.has(fps.content)) return true;
    return false;
  }

  getMatchedJobMeta(fps) {
    if (!fps) return null;
    if (fps.primary && this.primaryFingerprints.has(fps.primary)) return this.primaryFingerprints.get(fps.primary);
    if (fps.secondary && this.secondaryFingerprints.has(fps.secondary)) return this.secondaryFingerprints.get(fps.secondary);
    if (fps.content && this.contentFingerprints.has(fps.content)) return this.contentFingerprints.get(fps.content);
    return null;
  }

  addFingerprints(fps, jobMeta) {
    if (!fps) return;
    if (fps.primary) this.primaryFingerprints.set(fps.primary, jobMeta);
    if (fps.secondary) this.secondaryFingerprints.set(fps.secondary, jobMeta);
    if (fps.content) this.contentFingerprints.set(fps.content, jobMeta);
  }

  saveJob(job) {
    this.jobs.push(job);
    if (job.fingerprints) {
      const meta = { id: job.id, title: job.title, companyId: job.companyId };
      this.addFingerprints(job.fingerprints, meta);
    }
  }

  saveLog(log) {
    this.logs.unshift(log);
  }

  updateCompanyStatus(companyId, status, jobCount, qualityReport) {
    const idx = this.companies.findIndex(c => c.id === companyId);
    const entry = {
      id: companyId,
      status,
      lastScraped: new Date().toISOString(),
      jobsFound: jobCount,
      quality: qualityReport,
    };
    if (idx >= 0) {
      this.companies[idx] = { ...this.companies[idx], ...entry };
    }
  }

  async persist() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });

    const tempJobs = this.jobsFile + '.tmp';
    const tempLogs = this.logsFile + '.tmp';
    const tempCompanies = this.companiesFile + '.tmp';

    fs.writeFileSync(tempJobs, JSON.stringify(this.jobs, null, 2), 'utf8');
    fs.renameSync(tempJobs, this.jobsFile);

    fs.writeFileSync(tempLogs, JSON.stringify(this.logs, null, 2), 'utf8');
    fs.renameSync(tempLogs, this.logsFile);

    if (this.companies.length > 0) {
      fs.writeFileSync(tempCompanies, JSON.stringify(this.companies, null, 2), 'utf8');
      fs.renameSync(tempCompanies, this.companiesFile);
    }

    console.log(`[Storage] Persisted ${this.jobs.length} jobs, ${this.logs.length} logs.`);
  }
}

module.exports = new Storage();
