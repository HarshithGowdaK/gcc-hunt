'use strict';

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const Queues = require('./core/Queues');
const CircuitBreakers = require('./core/CircuitBreakers');
const Observability = require('./core/Observability');
const Storage = require('./core/Storage');
const ATSRegistry = require('./core/ATSRegistry');
const CloudflareResilience = require('./core/CloudflareResilience');
const AdapterRegistry = require('./core/AdapterRegistry');
const EngineLocation = require('./core/EngineLocation');
const EngineExperience = require('./core/EngineExperience');
const ArbitrationAI = require('./core/ArbitrationAI');
const Deduplicator = require('./core/Deduplicator');
const JobHelpers = require('./core/JobHelpers');
const { buildJobRecord } = require('./core/JobNormalizer');

function loadCompaniesFromExcel() {
  const excelPath = path.join(__dirname, '../companies.xlsx');
  if (!fs.existsSync(excelPath)) return null;
  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  return data.map((row, index) => ({
    id: row.id || `comp_${index}`,
    name: row.name || row.Company || 'Unknown',
    careersUrl: row.careers_url || row['Careers URL'] || row['Actual Job Listing'] || '',
  })).filter(c => c.careersUrl);
}

function loadCompaniesFromJson() {
  const jsonPath = path.join(__dirname, '../web/src/data/companies.json');
  if (!fs.existsSync(jsonPath)) return [];
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return data
    .filter(c => c.careersUrl)
    .map(c => ({ id: c.id, name: c.name, careersUrl: c.careersUrl }));
}

async function loadCompanies() {
  const fromExcel = loadCompaniesFromExcel();
  if (fromExcel && fromExcel.length > 0) return fromExcel;
  const fromJson = loadCompaniesFromJson();
  if (fromJson.length > 0) {
    console.log(`[Orchestrator] Loaded ${fromJson.length} companies from companies.json`);
    return fromJson;
  }
  throw new Error('No companies found. Provide companies.xlsx or web/src/data/companies.json');
}

async function tryGenericFallback(company, atsName) {
  const fallback = AdapterRegistry.createAdapter('generic', company.id, company.name, company.careersUrl);
  try {
    const jobs = await fallback.discoverJobs();
    fallback.recordSuccess(jobs.length);
    return { adapter: fallback, jobs, ats: 'generic', fromFallback: true };
  } catch (err) {
    fallback.recordFailure();
    CircuitBreakers.recordATSFailure(atsName || 'generic');
    throw err;
  }
}

async function start() {
  console.log('=== GCC Hunt v2 Orchestrator ===');
  await Storage.load();

  const companies = await loadCompanies();
  const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : companies.length;
  const targetCompanies = companies.slice(0, LIMIT);
  console.log(`Loaded ${targetCompanies.length} companies to crawl.`);

  for (const comp of targetCompanies) {
    Observability.setBaseline(comp.id, Storage.getBaselineCount(comp.id));
  }

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

      let adapter = AdapterRegistry.createAdapter(atsName, company.id, company.name, company.careersUrl);
      let jobs = [];
      let discoveryFailed = false;

      try {
        jobs = await adapter.discoverJobs();
        adapter.recordSuccess(jobs.length);
        CircuitBreakers.recordATSSuccess(atsName);
      } catch (err) {
        discoveryFailed = true;
        adapter.recordFailure();
        CircuitBreakers.recordATSFailure(atsName);
        console.warn(`[Discovery] Adapter ${atsName} failed for ${company.name}: ${err.message}`);
      }

      if (discoveryFailed || (jobs.length === 0 && atsName !== 'generic')) {
        try {
          const fallback = await tryGenericFallback(company, atsName);
          adapter = fallback.adapter;
          jobs = fallback.jobs;
          discoveryFailed = false;
          Observability.recordATS(company.id, 'generic', 0.5, 'fallback');
          console.log(`[Discovery] Generic fallback found ${jobs.length} jobs for ${company.name}`);
        } catch (fallbackErr) {
          console.error(`[Discovery] Generic fallback failed for ${company.name}: ${fallbackErr.message}`);
        }
      }

      if (discoveryFailed) {
        CircuitBreakers.recordCompanyFailure(company.id);
        Storage.saveLog({
          companyId: company.id,
          companyName: company.name,
          status: 'failed',
          reason: 'discovery_failed',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      Observability.recordDiscovery(company.id, jobs.length);
      Observability.recordAdapterCapability(company.id, adapter.getCapability());

      let enqueued = 0;
      let skipped = 0;

      for (const job of jobs) {
        if (!JobHelpers.isValidJobCandidate(job.title)) {
          Observability.recordRejected(company.id, 'invalid_title');
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

        if (!locPreview.isIndia) {
          Observability.recordLocationRejected(company.id, locPreview.country, 'discovery_location_filter');
          skipped++;
          continue;
        }

        if (Deduplicator.isEarlyDuplicate(company.id, job.title, job.location || locPreview.resolvedLocation, job.reqId)) {
          Observability.recordDuplicate(company.id);
          skipped++;
          continue;
        }

        enqueued++;
        Queues.detailQueue.enqueue({ company, adapter, job }).catch(err => {
          console.error(`[Orchestrator] Detail enqueue error: ${err.message}`);
        });
      }

      console.log(`[Discovery] ${company.name} — enqueued ${enqueued}, skipped ${skipped} of ${jobs.length}`);
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
        CircuitBreakers.recordCompanyFailure(company.id);
        Observability.recordRejected(company.id, `detail_fetch: ${err.message}`);
      }
    },

    classification: async ({ company, adapter, job, rawText }) => {
      const fullText = rawText || job._rawText || '';

      const locScore = EngineLocation.evaluate(
        job.title,
        job.location,
        fullText,
        job.atsMetadata || '',
        job.url
      );

      if (!locScore.isIndia) {
        Observability.recordLocationRejected(company.id, locScore.country, 'classification_location_rejected');
        return;
      }

      if (locScore.resolvedLocation) {
        job.location = locScore.resolvedLocation;
      }

      const expResult = EngineExperience.evaluate(job.title, fullText, '');
      const arbitrated = await ArbitrationAI.arbitrate(job, locScore, expResult, company.id, fullText);

      if (!arbitrated.aiUsed) {
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
        Observability.recordDuplicate(company.id);
        return;
      }

      const normalized = adapter.normalize
        ? await adapter.normalize(job, arbitrated.description || fullText)
        : job;

      const record = buildJobRecord({
        company,
        job: { ...normalized, ...job },
        rawText: fullText,
        description: arbitrated.description,
        locScore,
        expResult: {
          level: arbitrated.level || expResult.level,
          years: arbitrated.years ?? expResult.years,
          minYears: arbitrated.minYears ?? expResult.minYears,
          maxYears: arbitrated.maxYears ?? expResult.maxYears,
          validation: arbitrated.validation || expResult.validation,
        },
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
    Storage.updateCompanyStatus(comp.id, metrics.jobsAccepted > 0 ? 'success' : 'empty', metrics.jobsAccepted, quality);

    if (quality.coverageRegression) {
      console.warn(`[Quality] REGRESSION: ${comp.name} — ${quality.warning}`);
    }

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
      quality,
      reasons: metrics.reasons,
      timestamp: new Date().toISOString(),
    });
  }

  await Storage.persist();
  await CloudflareResilience.closeAll();

  console.log('=== Crawl Complete ===');
  console.log('Coverage:', JSON.stringify(Observability.generateCoverageReport(), null, 2));
  console.log('ATS Report:', JSON.stringify(Observability.generateATSReport(), null, 2));
  console.log('Queue Stats:', JSON.stringify(Queues.getAllStats(), null, 2));
}

start().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
