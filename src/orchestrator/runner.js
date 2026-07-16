'use strict';

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const Queues = require('./Queues');
const CircuitBreakers = require('../shared/CircuitBreakers');
const Observability = require('../monitoring/Observability');
const Storage = require('../storage/Storage');
const ATSRegistry = require('../ats/detector/ATSRegistry');
const CloudflareResilience = require('../browser/proxies/CloudflareResilience');
const AdapterRegistry = require('../ats/detector/AdapterRegistry');
const EngineLocation = require('../extraction/parser/EngineLocation');
const EngineExperience = require('../extraction/parser/EngineExperience');
const ArbitrationAI = require('../extraction/ai/ArbitrationAI');
const Deduplicator = require('../deduplication/Deduplicator');
const JobHelpers = require('../shared/JobHelpers');
const { buildJobRecord } = require('../normalization/JobNormalizer');

function slugifyCompanyId(name, fallback) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}

function loadCompaniesFromExcel() {
  const excelPath = path.join(__dirname, '../../companies.xlsx');
  if (!fs.existsSync(excelPath)) return null;
  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  return data.map((row, index) => {
    const name = row.name || row.Company || 'Unknown';
    return {
      id: row.id || slugifyCompanyId(name, `excel_${index}`),
      name,
      careersUrl: row.careers_url || row['Careers URL'] || row['Actual Job Listing'] || '',
      source: 'excel',
    };
  }).filter(c => c.careersUrl);
}

function loadCompaniesFromJson() {
  const jsonPath = path.join(__dirname, '../../web/src/data/companies.json');
  if (!fs.existsSync(jsonPath)) return [];
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return data
    .filter(c => c.careersUrl)
    .map((c, index) => ({
      id: c.id || slugifyCompanyId(c.name, `json_${index}`),
      name: c.name,
      careersUrl: c.careersUrl,
      source: 'json',
    }));
}

async function loadCompanies() {
  const source = String(process.env.COMPANIES_SOURCE || 'merged').toLowerCase();
  const fromExcel = loadCompaniesFromExcel() || [];
  const fromJson = loadCompaniesFromJson();

  if (source === 'excel') {
    console.log(`[Orchestrator] Loaded ${fromExcel.length} companies from companies.xlsx`);
    return fromExcel;
  }
  if (source === 'json') {
    console.log(`[Orchestrator] Loaded ${fromJson.length} companies from companies.json`);
    return fromJson;
  }

  const merged = [];
  const seen = new Set();
  for (const company of [...fromExcel, ...fromJson]) {
    const key = `${company.name || ''}|${company.careersUrl || ''}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(company);
  }
  if (merged.length > 0) {
    console.log(`[Orchestrator] Loaded ${merged.length} merged companies (${fromExcel.length} Excel, ${fromJson.length} JSON)`);
    return merged;
  }
  if (fromJson.length > 0) {
    console.log(`[Orchestrator] Loaded ${fromJson.length} companies from companies.json`);
    return fromJson;
  }
  throw new Error('No companies found. Provide companies.xlsx or web/src/data/companies.json');
}

async function discoverWithAdapter(company, atsName) {
  const adapter = AdapterRegistry.createAdapter(atsName, company.id, company.name, company.careersUrl);
  const jobs = await adapter.discoverJobs();
  adapter.recordSuccess(jobs.length);
  return { adapter, jobs, ats: atsName };
}

async function tryFallbackAdapters(company, primaryAtsName) {
  const fallbackNames = [];
  if (primaryAtsName && primaryAtsName !== 'generic') fallbackNames.push('generic');
  if (!fallbackNames.includes('generic')) fallbackNames.push('generic');

  let lastErr = null;
  for (const fallbackName of fallbackNames) {
    const fallback = AdapterRegistry.createAdapter(fallbackName, company.id, company.name, company.careersUrl);
    try {
      const jobs = await fallback.discoverJobs();
      fallback.recordSuccess(jobs.length);
      return { adapter: fallback, jobs, ats: fallbackName, fromFallback: true };
    } catch (err) {
      lastErr = err;
      fallback.recordFailure();
      CircuitBreakers.recordATSFailure(primaryAtsName || fallbackName);
    }
  }

  if (lastErr) throw lastErr;
  throw new Error('No fallback adapters available');
}

function getListingLocationHint(company) {
  const extracted = JobHelpers.extractIndianLocation(company.careersUrl);
  if (extracted?.location) return extracted.location;
  if (/\b(india|ind|locationcountry|country=india|ccode=in|location=india|keywords=india|mylocation=india)\b/i.test(company.careersUrl)) {
    return 'India';
  }
  return '';
}

async function start() {
  console.log('=== GCC Hunt v2 Orchestrator ===');
  await Storage.load();

  const successfulCompanyIds = new Set();

  const companies = await loadCompanies();
  const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : companies.length;
  let targetCompanies = companies.slice(0, LIMIT);
  if (process.env.COMPANY_ID) {
    targetCompanies = companies.filter(c => c.id === process.env.COMPANY_ID);
  }
  console.log(`Loaded ${targetCompanies.length} companies to crawl.`);

  for (const comp of targetCompanies) {
    Observability.setBaseline(comp.id, Storage.getBaselineCount(comp.id));
  }

  const runDiagnostics = new Map();

  Queues.init({
    discovery: async (company) => {
      if (CircuitBreakers.isCompanyPaused(company.id)) return;

      const atsDetection = await ATSRegistry.discover(company.careersUrl);
      Observability.recordATS(company.id, atsDetection.ats, atsDetection.confidence, atsDetection.method);

      let atsName = atsDetection.ats;
      if (CircuitBreakers.isATSThrottled(atsName)) {
        console.warn(`[Discovery] ATS ${atsName} throttled — using generic for ${company.name}`);
        atsName = 'generic';
      }

      console.log(`[Discovery] ${company.name} → ATS: ${atsDetection.ats} (${atsDetection.confidence}, ${atsDetection.method})`);

      const listingLocationHint = getListingLocationHint(company);
      let adapter = AdapterRegistry.createAdapter(atsName, company.id, company.name, company.careersUrl);
      let jobs = [];
      let discoveryFailed = false;
      let failureReason = null;
      let responseStatus = 200;

      try {
        const discovered = await discoverWithAdapter(company, atsName);
        adapter = discovered.adapter;
        jobs = discovered.jobs;
        CircuitBreakers.recordATSSuccess(atsName);
        if ((adapter.constructor.atsName || adapter.atsType) === 'generic' && jobs.length === 0) {
          Observability.recordGenericFailure(company.id, adapter.lastFailureReason || 'noCards');
        }
        if ((adapter.constructor.atsName || adapter.atsType) === 'generic') {
          Observability.recordGenericDiagnostics(company.id, adapter.diagnostics);
        }
      } catch (err) {
        discoveryFailed = true;
        failureReason = err.message;
        responseStatus = err.response?.status || 500;
        adapter.recordFailure();
        CircuitBreakers.recordATSFailure(atsName);
        console.warn(`[Discovery] Adapter ${atsName} failed for ${company.name}: ${err.message}`);
      }

      let fallbackUsed = false;
      if (discoveryFailed || (jobs.length === 0 && atsName !== 'generic')) {
        try {
          fallbackUsed = true;
          const fallback = await tryFallbackAdapters(company, atsName);
          adapter = fallback.adapter;
          jobs = fallback.jobs;
          if (jobs.length === 0) {
            Observability.recordGenericFailure(company.id, adapter.lastFailureReason || 'noCards');
          }
          Observability.recordGenericDiagnostics(company.id, adapter.diagnostics);
          discoveryFailed = false;
          Observability.recordATS(company.id, 'generic', 0.5, 'fallback');
          console.log(`[Discovery] Generic fallback found ${jobs.length} jobs for ${company.name}`);
        } catch (fallbackErr) {
          console.error(`[Discovery] Generic fallback failed for ${company.name}: ${fallbackErr.message}`);
        }
      }

      const diag = {
        company: company.name,
        source: company.source || null,
        careersUrl: company.careersUrl,
        ats: atsDetection.ats,
        status: discoveryFailed ? (responseStatus || 500) : 200,
        fallbackUsed,
        failureReason: discoveryFailed ? failureReason : null,
        listingLocationHint: listingLocationHint || null,
      };
      runDiagnostics.set(company.id, diag);

      if (discoveryFailed && jobs.length === 0) {
        CircuitBreakers.recordCompanyFailure(company.id);
        Storage.saveLog({
          companyId: company.id,
          companyName: company.name,
          status: 'failed',
          reason: 'discovery_failed',
          timestamp: new Date().toISOString(),
          atsDiagnostics: diag
        });
        return;
      }

      Observability.recordDiscovery(company.id, jobs.length);
      Observability.recordAdapterCapability(company.id, adapter.getCapability());
      successfulCompanyIds.add(company.id);

      let enqueued = 0;
      let skipped = 0;
      let reused = 0;

      for (const job of jobs) {
        if (listingLocationHint && !String(job.location || '').trim()) {
          job.location = listingLocationHint;
          job.locationSource = 'listing_filter';
        }
        if (listingLocationHint) {
          job.atsMetadata = [job.atsMetadata, company.careersUrl, listingLocationHint].filter(Boolean).join(' ');
        }

        const candidateRejection = JobHelpers.getJobCandidateRejectionReason(job) ||
          (!JobHelpers.isLikelyJobUrl(job.url) ? 'not_job_url' : null);
        if (candidateRejection) {
          job.rejectionReason = candidateRejection;
          Observability.recordRejected(company.id, candidateRejection);
          skipped++;
          continue;
        }

        const locPreview = EngineLocation.evaluate(
          job.title,
          job.location,
          job._rawText || '',
          job.atsMetadata || '',
          job.url
        );

        const hasListingLocation = !!String(job.location || '').trim();
        if ((hasListingLocation && !locPreview.isIndia) || locPreview.country !== 'India' && locPreview.country !== 'Unknown') {
          job.rejectionReason = 'non_india_location';
          Observability.recordLocationRejected(company.id, locPreview.country, 'discovery_location_filter');
          skipped++;
          continue;
        }

        const resolvedLoc = locPreview.resolvedLocation || job.location || '';

        if (Deduplicator.isEarlyDuplicate(company.id, job.title, resolvedLoc, job.reqId)) {
          job.rejectionReason = 'duplicate';
          Observability.recordDuplicate(company.id);
          skipped++;
          continue;
        }

        // Check if job exists in previous scrape
        const previousJob = Deduplicator.findPreviousJob(company.id, job.title, resolvedLoc, job.reqId);
        if (previousJob) {
          console.log(`[Discovery] Reusing previously scraped job: ${job.title} (${company.name})`);
          previousJob.isNew = false;
          previousJob.dateScraped = new Date().toISOString();
          Storage.saveJob(previousJob);
          Observability.recordAccepted(company.id);
          reused++;
          continue;
        }

        enqueued++;
        Queues.detailQueue.enqueue({ company, adapter, job }).catch(err => {
          console.error(`[Orchestrator] Detail enqueue error: ${err.message}`);
        });
      }

      console.log(`[Discovery] ${company.name} — reused ${reused}, enqueued ${enqueued}, skipped ${skipped} of ${jobs.length}`);
      CircuitBreakers.recordCompanySuccess(company.id);
    },

    detail: async ({ company, adapter, job }) => {
      if (CircuitBreakers.isCompanyPaused(company.id)) return;
      try {
        const rawText = await adapter.fetchJob(job.url, job.reqId, job);
        Observability.recordParsed(company.id);

        Queues.classificationQueue.enqueue({ company, adapter, job, rawText }).catch(err => {
          console.error(`[Orchestrator] Classification enqueue error: ${err.message}`);
        });
      } catch (err) {
        Observability.recordRejected(company.id, `detail_fetch: ${err.message}`);
      }
    },

    classification: async ({ company, adapter, job, rawText }) => {
      const fullText = JobHelpers.stripBoilerplateSections(rawText || job._rawText || '');

      const locScore = EngineLocation.evaluate(
        job.title,
        job.location,
        fullText,
        job.atsMetadata || '',
        job.url
      );

      if (!locScore.isIndia) {
        job.rejectionReason = 'classification_location_rejected';
        Observability.recordLocationRejected(company.id, locScore.country, 'classification_location_rejected');
        return;
      }

      if (locScore.resolvedLocation) {
        job.location = locScore.resolvedLocation;
      }

      const expResult = EngineExperience.evaluate(job.title, fullText, '');
      const arbitrated = await ArbitrationAI.arbitrate(job, locScore, expResult, company.id, fullText);

      if (arbitrated.aiUsed) {
        Observability.recordAICall(company.id, true);
      } else {
        Observability.recordAISkipped(company.id, arbitrated.arbitrationReason || arbitrated.skipReason || 'rules_sufficient');
      }

      const fingerprints = Deduplicator.calculateFingerprints(
        company.id,
        job.title,
        job.location || locScore.resolvedLocation,
        job.reqId,
        arbitrated.description || fullText
      );

      if (!fingerprints) {
        job.rejectionReason = 'duplicate';
        Observability.recordDuplicate(company.id);
        return;
      }

      const normalized = adapter.normalize
        ? await adapter.normalize(job, arbitrated.description || fullText)
        : job;

      const atsNameForLog = adapter.constructor.atsName || adapter.atsType || 'generic';
      const finalExpResult = {
        level: arbitrated.career_level || arbitrated.level || expResult.level,
        career_level: arbitrated.career_level || arbitrated.level || expResult.level,
        years: arbitrated.years ?? expResult.years,
        minYears: arbitrated.minYears ?? expResult.minYears,
        maxYears: arbitrated.maxYears ?? expResult.maxYears,
        midpoint: arbitrated.midpoint ?? expResult.midpoint,
        experience_text: arbitrated.experience_text || expResult.experience_text,
        classification_confidence: arbitrated.classification_confidence ?? expResult.classification_confidence,
        classification_source: arbitrated.classification_source || expResult.classification_source,
        experience_source: arbitrated.experience_source || expResult.experience_source,
        experience_extracted_by: arbitrated.experience_extracted_by || expResult.experience_extracted_by,
        classification_reason: arbitrated.classification_reason || expResult.classification_reason,
        warning: arbitrated.warning || expResult.warning,
        needs_review: arbitrated.needs_review !== undefined ? arbitrated.needs_review : expResult.needs_review,
        validation: arbitrated.validation || expResult.validation,
      };

      console.log(`[Experience] Found range ${finalExpResult.experience_text || 'None'}`);
      console.log(`[Classification] ${finalExpResult.career_level}`);
      console.log(`[Confidence] ${finalExpResult.classification_confidence}`);
      console.log(`[ATS] ${atsNameForLog}`);
      console.log(`[Source] ${finalExpResult.classification_source}`);

      const record = buildJobRecord({
        company,
        job: { ...normalized, ...job },
        rawText: fullText,
        description: arbitrated.description,
        locScore,
        expResult: finalExpResult,
        skills: arbitrated.skills,
        remoteStatus: arbitrated.remoteStatus,
        employmentType: arbitrated.employmentType,
        fingerprints,
        arbitrationMeta: {
          aiUsed: arbitrated.aiUsed,
          reason: arbitrated.arbitrationReason || arbitrated.skipReason,
          locationConfidence: locScore.confidence,
          experienceConfidence: expResult.confidence,
        },
      });

      if (arbitrated.location) {
        record.location = arbitrated.location;
        const norm = JobHelpers.normalizeLocation(arbitrated.location);
        if (norm) {
          record.city = norm.city;
          record.state = norm.state;
        }
      }

      Storage.saveJob(record);
      Observability.recordAccepted(company.id);
    },

    ai: async (payload) => {
      return ArbitrationAI.runAIWorker(payload);
    },
  });

  for (const comp of targetCompanies) {
    Queues.discoveryQueue.enqueue(comp);
  }

  console.log('[Orchestrator] Queues running...');
  await Queues.drainAll();

  for (const comp of targetCompanies) {
    const metrics = Observability.getCompanyMetrics(comp.id);
    const quality = Observability.generateQualityReport(comp.id);
    const atsDiag = runDiagnostics.get(comp.id) || null;
    Storage.updateCompanyStatus(comp, metrics.jobsAccepted > 0 ? 'success' : 'empty', metrics.jobsAccepted, quality, atsDiag);

    if (quality.coverageRegression) {
      console.warn(`[Quality] REGRESSION: ${comp.name} — ${quality.warning}`);
      
      const prevAts = 'unknown'; // Note: Without historical ATS per company in baseline, we store 'unknown'
      const currentAts = metrics.atsDetected || 'unknown';
      
      Storage.quarantineFailedScrape(
        comp.id, 
        comp.name, 
        quality, 
        Storage.previousJobs, 
        metrics.jobsAccepted, 
        prevAts, 
        currentAts
      );
      
      Storage.revertCompanyJobs(comp.id);
      successfulCompanyIds.delete(comp.id);
    }

    console.log(`[ATS Detection] ${comp.name}: Detected=${metrics.atsDetected || 'none'}, Confidence=${metrics.atsConfidence || 0}, Validated=${String(metrics.atsMethod).includes('validated')}`);

    Storage.saveLog({
      companyId: comp.id,
      companyName: comp.name,
      status: metrics.jobsAccepted > 0 ? 'success' : 'empty',
      jobsDiscovered: metrics.jobsDiscovered,
      jobsAccepted: metrics.jobsAccepted,
      jobsRejected: metrics.jobsRejected,
      duplicatesRemoved: metrics.duplicatesRemoved,
      locationRejected: metrics.locationRejected,
      aiCalls: metrics.aiCalls,
      aiSkipped: metrics.aiSkipped,
      atsDetected: metrics.atsDetected,
      atsConfidence: metrics.atsConfidence,
      atsValidated: String(metrics.atsMethod).includes('validated'),
      quality,
      reasons: metrics.reasons,
      timestamp: new Date().toISOString(),
      atsDiagnostics: atsDiag
    });
  }

  await Storage.persist(successfulCompanyIds);
  await CloudflareResilience.closeAll();

  console.log('=== Crawl Complete ===');
  
  let totalSucceeded = 0;
  let totalRegressions = 0;
  let totalTimeouts = 0;
  let totalFallbacks = 0;
  let totalLlmCalls = 0;
  
  for (const comp of targetCompanies) {
    const metrics = Observability.getCompanyMetrics(comp.id);
    const quality = Observability.generateQualityReport(comp.id);
    
    if (metrics.jobsAccepted > 0 && !quality.coverageRegression) totalSucceeded++;
    if (quality.coverageRegression) totalRegressions++;
    if (metrics.genericFailures && metrics.genericFailures.timeout) totalTimeouts += metrics.genericFailures.timeout;
    if (metrics.atsMethod && String(metrics.atsMethod).includes('fallback')) totalFallbacks++;
    totalLlmCalls += metrics.aiCalls || 0;
  }
  
  const fallbackRate = targetCompanies.length > 0 ? (totalFallbacks / targetCompanies.length * 100).toFixed(1) + '%' : '0%';

  console.log('\n==================');
  console.log('     SUMMARY      ');
  console.log('==================');
  console.log(`Companies:          ${targetCompanies.length}`);
  console.log(`Succeeded:          ${totalSucceeded}`);
  console.log(`Regressions:        ${totalRegressions}`);
  console.log(`Timeouts:           ${totalTimeouts}`);
  console.log(`Fallbacks:          ${fallbackRate} (${totalFallbacks})`);
  console.log(`LLM Calls:          ${totalLlmCalls}`);
  console.log(`Coverage Preserved: ${totalRegressions}`); // Each regression preserves previous jobs
  console.log('==================\n');

  console.log('Coverage:', JSON.stringify(Observability.generateCoverageReport(), null, 2));
  console.log('ATS Report:', JSON.stringify(Observability.generateATSReport(), null, 2));
  console.log('Queue Stats:', JSON.stringify(Queues.getAllStats(), null, 2));
  
  // Persist ATS Health
  Storage.persistAtsHealth(Observability.generateATSReport());
}

if (require.main === module) {
  start().catch(err => {
    console.error('[Fatal]', err);
    process.exit(1);
  });
}

module.exports = {
  start,
  loadCompanies,
};
