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
    this.previousJobs = [];
    this.previousJobsMap = new Map();
    this.logs = [];
    this.companies = [];
    this.primaryFingerprints = new Set();
    this.secondaryFingerprints = new Set();
    this.contentFingerprints = new Set();
    this.baselineCounts = new Map();
  }

  async load() {
    let previousJobs = [];
    try {
      if (fs.existsSync(this.jobsFile)) {
        previousJobs = JSON.parse(fs.readFileSync(this.jobsFile, 'utf8'));
      }
      this.jobs = [];
      this.previousJobs = previousJobs;
      this.previousJobsMap = new Map();
      this.primaryFingerprints.clear();
      this.secondaryFingerprints.clear();
      this.contentFingerprints.clear();
      this.baselineCounts.clear();
      console.log('[Storage] Starting fresh in memory; existing jobs.json will be replaced only after successful persist.');
    } catch (e) {
      console.warn('[Storage] Failed to read existing jobs.json baseline:', e.message);
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

    for (const job of previousJobs) {
      const cid = job.companyId;
      this.baselineCounts.set(cid, (this.baselineCounts.get(cid) || 0) + 1);
      
      if (job.fingerprints) {
        if (job.fingerprints.secondary) {
          const cleanSec = String(job.fingerprints.secondary).replace(/&amp;/g, '&');
          this.previousJobsMap.set(cleanSec, job);
        }
        if (job.fingerprints.primary) {
          this.previousJobsMap.set(job.fingerprints.primary, job);
        }
      }
    }

    console.log(`[Storage] Loaded ${previousJobs.length} existing jobs for baseline; current scrape starts empty.`);
  }

  getBaselineCount(companyId) {
    return this.baselineCounts.get(companyId) || 0;
  }

  isDuplicate(fingerprints) {
    if (!fingerprints) return false;
    if (fingerprints.primary && this.primaryFingerprints.has(fingerprints.primary)) return true;
    if (fingerprints.secondary && this.secondaryFingerprints.has(fingerprints.secondary)) return true;
    if (fingerprints.content && this.contentFingerprints.has(fingerprints.content)) return true;
    return false;
  }

  saveJob(job) {
    if (job.city && job.city.toLowerCase() === 'bangalore') {
      const comp = this.companies.find(c => c.id === job.companyId);
      if (comp && comp.hrLinkedin) {
        job.hrLinkedin = comp.hrLinkedin;
      }
    }
    this.jobs.push(job);
    if (job.fingerprints) {
      if (job.fingerprints.primary) this.primaryFingerprints.add(job.fingerprints.primary);
      if (job.fingerprints.secondary) this.secondaryFingerprints.add(job.fingerprints.secondary);
      if (job.fingerprints.content) this.contentFingerprints.add(job.fingerprints.content);
    }
  }

  saveLog(log) {
    this.logs.unshift(log);
  }

  updateCompanyStatus(companyId, status, jobCount, qualityReport, atsDiagnostics = null) {
    const idx = this.companies.findIndex(c => c.id === companyId);
    const entry = {
      id: companyId,
      status,
      lastScraped: new Date().toISOString(),
      jobsFound: jobCount,
      quality: qualityReport,
      atsDiagnostics
    };
    if (idx >= 0) {
      this.companies[idx] = { ...this.companies[idx], ...entry };
    }
  }

  async persist(scrapedCompanyIds = new Set()) {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });

    // Find previous jobs of companies that were NOT successfully scraped in this run
    const nonScrapedCompanyJobs = this.previousJobs.filter(
      job => !scrapedCompanyIds.has(job.companyId)
    ).map(job => ({ ...job, isNew: false })); // Make sure they are not marked as new

    // Merge current run's jobs with nonScrapedCompanyJobs
    const finalJobs = [...this.jobs, ...nonScrapedCompanyJobs];

    const tempJobs = this.jobsFile + '.tmp';
    const tempLogs = this.logsFile + '.tmp';
    const tempCompanies = this.companiesFile + '.tmp';

    fs.writeFileSync(tempJobs, JSON.stringify(finalJobs, null, 2), 'utf8');
    fs.renameSync(tempJobs, this.jobsFile);

    fs.writeFileSync(tempLogs, JSON.stringify(this.logs, null, 2), 'utf8');
    fs.renameSync(tempLogs, this.logsFile);

    if (this.companies.length > 0) {
      fs.writeFileSync(tempCompanies, JSON.stringify(this.companies, null, 2), 'utf8');
      fs.renameSync(tempCompanies, this.companiesFile);
    }

    console.log(`[Storage] Persisted ${finalJobs.length} jobs (${this.jobs.length} from current scrape, ${nonScrapedCompanyJobs.length} preserved), ${this.logs.length} logs.`);
  }
}

module.exports = new Storage();
