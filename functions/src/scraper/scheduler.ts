import * as admin from 'firebase-admin';
import { detectATS } from './ats-detector';
import { scrapeWorkday } from './adapters/workday';
import { scrapeGreenhouse } from './adapters/greenhouse';
import { scrapeLever } from './adapters/lever';
import { scrapeGeneric } from './adapters/generic';
import { ScrapeResult, ScrapedJob } from './types';

const db = admin.firestore();

/**
 * Runs the scraper for a single company and synchronizes results with Firestore.
 */
export async function scrapeCompany(companyId: string): Promise<ScrapeResult> {
  const startTime = Date.now();
  
  // Set status to scraping
  const companyRef = db.collection('companies').doc(companyId);
  await companyRef.update({ status: 'scraping' });

  let companyName = '';
  let careersUrl = '';
  
  try {
    const compDoc = await companyRef.get();
    if (!compDoc.exists) {
      throw new Error(`Company ${companyId} not found in database.`);
    }

    const data = compDoc.data()!;
    companyName = data.name;
    careersUrl = data.careersUrl;

    if (!careersUrl) {
      throw new Error(`Company ${companyName} has no careers URL.`);
    }

    // Detect ATS
    const ats = detectATS(careersUrl);
    console.log(`[Scheduler] Scraper for "${companyName}" (${companyId}) detected ATS: ${ats}`);

    let result: ScrapeResult;

    switch (ats) {
      case 'workday':
        result = await scrapeWorkday(companyId, companyName, careersUrl);
        break;
      case 'greenhouse':
        result = await scrapeGreenhouse(companyId, companyName, careersUrl);
        break;
      case 'lever':
        result = await scrapeLever(companyId, companyName, careersUrl);
        break;
      default:
        // Try generic playwright
        result = await scrapeGeneric(companyId, companyName, careersUrl);
        break;
    }

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`[Scheduler] Successfully scraped "${companyName}". Syncing ${result.jobs.length} jobs.`);
      await syncJobs(companyId, companyName, result.jobs);
      
      // Update company status to success
      await companyRef.update({
        status: 'success',
        lastScraped: new Date().toISOString()
      });

      // Write scrape log
      await db.collection('scrape_logs').add({
        companyId,
        companyName,
        status: 'success',
        jobsFound: result.jobs.length,
        executionTime: duration,
        timestamp: new Date().toISOString()
      });

      return { ...result, executionTime: duration };
    } else {
      throw new Error(result.error || 'Unknown scraping error.');
    }

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[Scheduler] Scraper failed for "${companyName || companyId}": ${error.message}`);
    
    // Update company status to failed
    await companyRef.update({
      status: 'failed'
    });

    // Write scrape log
    await db.collection('scrape_logs').add({
      companyId,
      companyName: companyName || companyId,
      status: 'failed',
      errors: error.message,
      executionTime: duration,
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      jobs: [],
      error: error.message,
      executionTime: duration
    };
  }
}

/**
 * Synchronizes scraped jobs with Firestore:
 * - Inserts new jobs
 * - Updates existing jobs
 * - Deletes jobs that are no longer active (removed jobs)
 */
async function syncJobs(companyId: string, companyName: string, scrapedJobs: ScrapedJob[]) {
  const batch = db.batch();
  const timestamp = new Date().toISOString();
  
  // 1. Get all currently stored active jobs for this company
  const existingJobsSnap = await db.collection('jobs')
    .where('companyId', '==', companyId)
    .get();

  const existingJobsMap = new Map<string, admin.firestore.DocumentSnapshot>();
  existingJobsSnap.forEach(doc => {
    existingJobsMap.set(doc.id, doc);
  });

  const scrapedJobIds = new Set<string>();

  // 2. Add or update scraped jobs
  for (const job of scrapedJobs) {
    if (!job.id) continue;
    scrapedJobIds.add(job.id);
    const jobRef = db.collection('jobs').doc(job.id);

    const jobDoc = existingJobsMap.get(job.id);
    
    // Generate keywords for basic search indexing
    const titleWords = job.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const companyWords = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const cityWords = job.city.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const skillWords = job.skills.map(s => s.toLowerCase());
    const keywords = Array.from(new Set([...titleWords, ...companyWords, ...cityWords, ...skillWords])).filter(w => w.length > 1);

    const jobData: any = {
      ...job,
      companyId,
      companyName,
      keywords,
      updatedAt: timestamp,
      dateScraped: timestamp
    };

    if (!jobDoc) {
      // New Job
      jobData.createdAt = timestamp;
      batch.set(jobRef, jobData);
    } else {
      // Existing Job: merge updates
      batch.set(jobRef, jobData, { merge: true });
    }
  }

  // 3. Detect and delete removed jobs
  for (const [jobId, doc] of existingJobsMap.entries()) {
    if (!scrapedJobIds.has(jobId)) {
      console.log(`[Sync] Deleting removed job: ${doc.data()?.title} (${jobId})`);
      const jobRef = db.collection('jobs').doc(jobId);
      batch.delete(jobRef);
    }
  }

  await batch.commit();
}

/**
 * Main coordinator function that processes the queue.
 * Concurrency limits the number of parallel headless browser executions.
 */
export async function runScraperQueue(limit = 3, maxCompanies = 20): Promise<{ processed: number; succeeded: number }> {
  console.log(`[Scheduler] Starting scraper queue. Concurrency: ${limit}, Limit: ${maxCompanies}`);
  
  // Fetch companies order by lastScraped ascending (oldest scraped first), and filter status !== 'scraping'
  // (We handle 'scraping' status reset elsewhere or if it gets stuck, we can clear it)
  const query = db.collection('companies')
    .where('status', '!=', 'scraping')
    .limit(maxCompanies);
  
  const snap = await query.get();
  
  // Firestore doesn't support order by different field when we have a '!=' query easily without index setup.
  // We sort in memory for simplicity.
  const companies = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))
    .sort((a, b) => {
      const dateA = a.lastScraped ? new Date(a.lastScraped).getTime() : 0;
      const dateB = b.lastScraped ? new Date(b.lastScraped).getTime() : 0;
      return dateA - dateB;
    });

  if (companies.length === 0) {
    console.log('[Scheduler] No companies pending scraping in queue.');
    return { processed: 0, succeeded: 0 };
  }

  console.log(`[Scheduler] Selected ${companies.length} companies to scrape in this batch.`);

  let processed = 0;
  let succeeded = 0;
  let index = 0;

  // Worker pool implementation
  async function worker() {
    while (index < companies.length) {
      const comp = companies[index++];
      if (comp) {
        processed++;
        const res = await scrapeCompany(comp.id);
        if (res.success) {
          succeeded++;
        }
      }
    }
  }

  const workers = Array(Math.min(limit, companies.length)).fill(null).map(worker);
  await Promise.all(workers);

  console.log(`[Scheduler] Queue run complete. Processed: ${processed}, Succeeded: ${succeeded}`);
  return { processed, succeeded };
}
