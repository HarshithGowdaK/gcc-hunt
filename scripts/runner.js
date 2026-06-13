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

function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}
loadEnv();

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
  let targetCompanies = companies;
  if (process.env.COMPANY_ID) {
    const q = process.env.COMPANY_ID.toLowerCase();
    targetCompanies = companies.filter(c => c.id.toLowerCase() === q || c.name.toLowerCase().includes(q));
  } else {
    const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : companies.length;
    targetCompanies = companies.slice(0, LIMIT);
  }
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
          Observability.recordRejected(company.id, 'invalid_title', 'validation');
          console.warn(JSON.stringify({ rejected: true, reason: "invalid_title", stage: "validation", title: job.title }));
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

        if (!locPreview.isIndia && locPreview.country !== 'Unknown') {
          Observability.recordLocationRejected(company.id, locPreview.country, 'discovery_location_filter');
          console.warn(JSON.stringify({ rejected: true, reason: `location_rejected_${locPreview.country}`, stage: "discovery_location", title: job.title }));
          skipped++;
          continue;
        }

        const fps = Deduplicator.buildFingerprints(company.id, job.title, job.location || locPreview.resolvedLocation, job.reqId, '');
        if (Deduplicator.isEarlyDuplicate(company.id, job.title, job.location || locPreview.resolvedLocation, job.reqId)) {
          Observability.recordDuplicate(company.id);
          const matchedMeta = Storage.getMatchedJobMeta(fps);
          console.warn(JSON.stringify({ 
            rejected: true, 
            reason: "duplicate_early", 
            stage: "discovery_dedup", 
            title: job.title,
            matchedJobId: matchedMeta?.id,
            matchedCompany: matchedMeta?.companyId,
            matchedTitle: matchedMeta?.title
          }));
          skipped++;
          continue;
        }

        enqueued++;
        Observability.recordQueued(company.id);
        Queues.detailQueue.enqueue({ company, adapter, job }).catch(err => {
          console.error(`[Orchestrator] Detail enqueue error: ${err.message}`);
        });
      }

      console.log(`[Discovery] ${company.name} — enqueued ${enqueued}, skipped ${skipped} of ${jobs.length}`);
      CircuitBreakers.recordCompanySuccess(company.id);
    },

    detail: async ({ company, adapter, job }) => {
      console.log(`[Diagnostic] DETAIL_START - Job: ${job.reqId || job.title}`);
      Observability.recordDetailStart(company.id);
      
      if (CircuitBreakers.isCompanyPaused(company.id)) return;
      try {
        const rawText = await adapter.fetchJob(job.url, job.reqId, job);
        console.log(`[Diagnostic] DETAIL_SUCCESS - Job: ${job.reqId || job.title}`);
        Observability.recordDetailSuccess(company.id);
        Observability.recordParsed(company.id);

        Queues.classificationQueue.enqueue({ company, adapter, job, rawText }).catch(err => {
          console.error(`[Orchestrator] Classification enqueue error: ${err.message}`);
        });
      } catch (err) {
        let reason = 'parse_failure';
        if (err.message.includes('timeout') || err.message.includes('Timeout')) {
          reason = 'timeout';
          console.log(`[Diagnostic] DETAIL_TIMEOUT - Job: ${job.reqId || job.title}`);
        } else if (err.message.includes('403')) {
          reason = '403_forbidden';
        } else if (err.message.includes('404')) {
          reason = '404_not_found';
        } else if (err.message.includes('missing_detail_url')) {
          reason = 'missing_detail_url';
        } else {
          console.log(`[Diagnostic] DETAIL_FAIL - Job: ${job.reqId || job.title} - ${err.message}`);
        }
        
        Observability.recordDetailFailure(company.id, reason);
        CircuitBreakers.recordCompanyFailure(company.id);
        Observability.recordRejected(company.id, `detail_fetch_${reason}`, 'detail_fetch');
        console.warn(JSON.stringify({ 
          rejected: true, 
          stage: "detail", 
          reason: reason, 
          company: company.name, 
          title: job.title, 
          url: job.url,
          statusCode: err.response?.status || (err.message.match(/\b(403|404|429|500|502|503|504)\b/)?.[0] || 'none'),
          error: err.message
        }));
      }
    },

    classification: async ({ company, adapter, job, rawText }) => {
      const fullText = rawText || job._rawText || '';

      if (!JobHelpers.isValidJobPosting(fullText)) {
        Observability.recordRejected(company.id, 'invalid_job_posting_page', 'page_validation');
        console.warn(JSON.stringify({ 
          rejected: true, 
          reason: "invalid_job_posting_page", 
          stage: "classification_page_validation", 
          title: job.title,
          url: job.url 
        }));
        return;
      }

      const locScore = EngineLocation.evaluate(
        job.title,
        job.location,
        fullText,
        job.atsMetadata || '',
        job.url
      );

      if (!locScore.isIndia && locScore.country !== 'Unknown') {
        Observability.recordLocationRejected(company.id, locScore.country, 'classification_location_rejected');
        Observability.recordRejected(company.id, `classification_location_rejected_${locScore.country}`, 'classification_location');
        console.warn(JSON.stringify({ rejected: true, reason: `classification_location_rejected_${locScore.country}`, stage: "classification_location", title: job.title }));
        return;
      }

      if (locScore.resolvedLocation) {
        job.location = locScore.resolvedLocation;
      }

      const expResult = EngineExperience.evaluate(job.title, fullText, '');
      const arbitrated = await ArbitrationAI.arbitrate(job, locScore, expResult, company.id, fullText);

      // Post-arbitration location check
      const finalLoc = arbitrated.location || job.location || locScore.resolvedLocation;
      const finalLocScore = EngineLocation.evaluate(
        job.title,
        finalLoc,
        fullText,
        job.atsMetadata || '',
        job.url
      );

      if (!finalLocScore.isIndia) {
        Observability.recordLocationRejected(company.id, finalLocScore.country || 'Unknown', 'classification_post_arbitration_rejected');
        Observability.recordRejected(company.id, `classification_location_rejected_${finalLocScore.country}`, 'classification_location_post_arbitration');
        console.warn(JSON.stringify({ rejected: true, reason: `classification_location_rejected_${finalLocScore.country}`, stage: "classification_location_post_arbitration", title: job.title, location: finalLoc }));
        return;
      }

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
        console.warn(JSON.stringify({ rejected: true, reason: "duplicate_content", stage: "classification_dedup", title: job.title }));
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
          effectiveYears: arbitrated.effectiveYears ?? expResult.effectiveYears,
          confidence: arbitrated.confidence ?? expResult.confidence,
          hasConflict: arbitrated.hasConflict ?? expResult.hasConflict,
          classificationSource: arbitrated.classificationSource || expResult.classificationSource || 'rule-engine',
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
      console.log(`[Diagnostic] Job: "${record.title}" | minYears: ${record.minYears} | maxYears: ${record.maxYears} | effectiveYears: ${record.effectiveYears} | finalLevel: "${record.experienceLevel}" | source: ${record.classificationSource}`);
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
  console.log('\n=== Company Health Dashboard ===');
  const coverageReport = Observability.generateCoverageReport();
  console.table(coverageReport);
  
  console.log('\n=== Detail Failure Distribution ===');
  console.table(Observability.generateFailureDistribution());
  
  console.log('\n=== PIPELINE ASSERTIONS ===');
  let imbalanceFound = false;
  for (const m of coverageReport) {
    if (m.queued !== m.detailStarted || m.detailStarted !== (m.detailSucceeded + m.detailFailed)) {
      console.warn(`[PIPELINE_ERROR] Imbalance detected for ${m.company}: Queued(${m.queued}) != Started(${m.detailStarted}) OR Started(${m.detailStarted}) != Success(${m.detailSucceeded}) + Fail(${m.detailFailed})`);
      imbalanceFound = true;
    }
  }
  if (!imbalanceFound) console.log('[OK] All pipeline queues perfectly balanced.');
  
  console.log('ATS Report:', JSON.stringify(Observability.generateATSReport(), null, 2));
  console.log('Queue Stats:', JSON.stringify(Queues.getAllStats(), null, 2));
}

start().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
