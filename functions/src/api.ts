import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as admin from 'firebase-admin';
import { runScraperQueue, scrapeCompany } from './scraper/scheduler';
import { slugify } from './scraper/utils';


// Initialize Express app
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const db = admin.firestore();

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

// Authentication middleware to check if user has admin claims
export async function checkAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Option to bypass auth in local emulator mode for testing
  if (process.env.FIRESTORE_EMULATOR_HOST && req.headers['x-bypass-auth'] === 'true') {
    req.user = { uid: 'emulator-admin', admin: true } as any;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Missing token.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    if (!decodedToken.admin) {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    req.user = decodedToken;
    next();
  } catch (error: any) {
    return res.status(401).json({ error: `Unauthorized. Invalid token: ${error.message}` });
  }
}

// -------------------------------------------------------------
// PUBLIC APIS
// -------------------------------------------------------------

/**
 * GET /api/jobs - Query jobs with filters, search, and pagination
 */
app.get('/jobs', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const sortBy = (req.query.sortBy as string) || 'recent';
    
    const { company, city, experienceLevel, employmentType, remoteStatus, search } = req.query;

    let query: admin.firestore.Query = db.collection('jobs');

    // Filter applications
    if (company) {
      query = query.where('companyId', '==', company);
    }
    if (city) {
      query = query.where('city', '==', city);
    }
    if (experienceLevel) {
      query = query.where('experienceLevel', '==', experienceLevel);
    }
    if (employmentType) {
      query = query.where('employmentType', '==', employmentType);
    }
    if (remoteStatus) {
      query = query.where('remoteStatus', '==', remoteStatus);
    }

    // Apply keywords search filter if specified
    if (search && typeof search === 'string') {
      const searchWord = search.toLowerCase().trim();
      if (searchWord) {
        query = query.where('keywords', 'array-contains', searchWord);
      }
    }

    // Sorting
    if (sortBy === 'recent') {
      // Sort by postedDate first (if exists) or fall back to createdAt
      query = query.orderBy('createdAt', 'desc');
    } else if (sortBy === 'oldest') {
      query = query.orderBy('createdAt', 'asc');
    } else if (sortBy === 'company') {
      query = query.orderBy('companyName', 'asc');
    }

    // Execute query for pagination
    const totalSnap = await query.get();
    const totalJobs = totalSnap.size;

    // Offset implementation
    const offset = (page - 1) * limit;
    let paginatedQuery = query;
    
    if (offset > 0) {
      // In Firestore, using offset incurs standard read charges. For small to mid-scale, this is fine.
      paginatedQuery = query.offset(offset);
    }
    
    paginatedQuery = paginatedQuery.limit(limit);
    const snap = await paginatedQuery.get();
    
    const jobsList: any[] = [];
    snap.forEach(doc => {
      jobsList.push({ id: doc.id, ...doc.data() });
    });

    res.json({
      jobs: jobsList,
      pagination: {
        page,
        limit,
        totalJobs,
        totalPages: Math.ceil(totalJobs / limit)
      }
    });

  } catch (error: any) {
    res.status(500).json({ error: `Failed to fetch jobs: ${error.message}` });
  }
});

/**
 * GET /api/jobs/:id - Get details of a single job listing
 */
app.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const jobId = req.params.id;
    const doc = await db.collection('jobs').doc(jobId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Job listing not found.' });
    }

    const jobData = { id: doc.id, ...doc.data() };
    
    // Fetch 3 similar jobs from same department/field (optional helper)
    const similarSnap = await db.collection('jobs')
      .where('companyId', '==', (jobData as any).companyId)
      .limit(4)
      .get();
    
    const similarJobs: any[] = [];
    similarSnap.forEach(sDoc => {
      if (sDoc.id !== jobId) {
        similarJobs.push({ id: sDoc.id, ...sDoc.data() });
      }
    });

    return res.json({
      job: jobData,
      similarJobs: similarJobs.slice(0, 3)
    });

  } catch (error: any) {
    return res.status(500).json({ error: `Failed to fetch job details: ${error.message}` });
  }
});

/**
 * GET /api/companies - Get list of all companies
 */
app.get('/companies', async (req: Request, res: Response) => {
  try {
    const snap = await db.collection('companies').get();
    const companies: any[] = [];
    snap.forEach(doc => {
      companies.push({ id: doc.id, ...doc.data() });
    });

    // Enforce sorting
    companies.sort((a, b) => a.name.localeCompare(b.name));
    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ error: `Failed to fetch companies: ${error.message}` });
  }
});

/**
 * GET /api/filters - Fetch dynamic lists of filters based on active jobs in database
 */
app.get('/filters', async (req: Request, res: Response) => {
  try {
    const jobsSnap = await db.collection('jobs').limit(500).get();
    
    const cities = new Set<string>();
    const departments = new Set<string>();
    const employmentTypes = new Set<string>();
    const experienceLevels = new Set<string>();
    const remoteStatuses = new Set<string>();

    jobsSnap.forEach(doc => {
      const data = doc.data();
      if (data.city) cities.add(data.city);
      if (data.department) departments.add(data.department);
      if (data.employmentType) employmentTypes.add(data.employmentType);
      if (data.experienceLevel) experienceLevels.add(data.experienceLevel);
      if (data.remoteStatus) remoteStatuses.add(data.remoteStatus);
    });

    res.json({
      cities: Array.from(cities).sort(),
      departments: Array.from(departments).sort(),
      employmentTypes: Array.from(employmentTypes).sort(),
      experienceLevels: Array.from(experienceLevels).sort(),
      remoteStatuses: Array.from(remoteStatuses).sort()
    });

  } catch (error: any) {
    res.status(500).json({ error: `Failed to load filters: ${error.message}` });
  }
});

// -------------------------------------------------------------
// ADMIN PROTECTED APIS
// -------------------------------------------------------------

/**
 * POST /api/admin/rescrape - Trigger manual scrape for one or a batch of companies
 */
app.post('/admin/rescrape', checkAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { companyId, limit, concurrency } = req.body;

    if (companyId && companyId !== 'all') {
      console.log(`[Admin API] Manual scrape triggered for company: ${companyId}`);
      const result = await scrapeCompany(companyId);
      return res.json({
        message: `Scrape complete for ${companyId}`,
        success: result.success,
        jobsFound: result.jobs.length,
        error: result.error
      });
    } else {
      console.log(`[Admin API] Scheduled queue scrape triggered manually.`);
      const batchLimit = parseInt(limit) || 10;
      const conc = parseInt(concurrency) || 3;

      // Run background task so request doesn't timeout
      runScraperQueue(conc, batchLimit)
        .then(stats => console.log(`[Admin API] Queue run finished:`, stats))
        .catch(err => console.error(`[Admin API] Queue run failed:`, err));

      return res.json({
        message: `Scraper queue started in background. Batch limit: ${batchLimit}. Concurrency: ${conc}.`
      });
    }

  } catch (error: any) {
    return res.status(500).json({ error: `Scrape execution failed: ${error.message}` });
  }
});

/**
 * GET /api/admin/scrape-logs - Fetch crawlers history logs
 */
app.get('/admin/scrape-logs', checkAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const snap = await db.collection('scrape_logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const logs: any[] = [];
    snap.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: `Failed to fetch logs: ${error.message}` });
  }
});

/**
 * POST /api/admin/upload-excel - Seed or append new companies via JSON raw structure
 * (We support uploading parsed Excel rows as JSON directly from frontend for serverless simplicity)
 */
app.post('/admin/upload-excel', checkAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { companies } = req.body; // Array of { company: string, url: string }
    
    if (!companies || !Array.isArray(companies)) {
      return res.status(400).json({ error: 'Invalid payload: companies must be an array.' });
    }

    console.log(`[Admin API] Upload request received for ${companies.length} companies.`);

    const batchSize = 400;
    let currentBatch = db.batch();
    let operationCount = 0;
    let successCount = 0;

    for (const row of companies) {
      const name = row.company;
      const url = row.url;

      if (!name || !url) continue;

      const companyId = slugify(name);
      const companyRef = db.collection('companies').doc(companyId);

      const companyData = {
        id: companyId,
        name: name.trim(),
        careersUrl: url.trim(),
        status: 'idle',
        lastScraped: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      currentBatch.set(companyRef, companyData, { merge: true });
      operationCount++;
      successCount++;

      if (operationCount >= batchSize) {
        await currentBatch.commit();
        currentBatch = db.batch();
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      await currentBatch.commit();
    }

    return res.json({
      message: `Successfully processed list. Seeded/updated ${successCount} companies.`,
      successCount
    });

  } catch (error: any) {
    return res.status(500).json({ error: `Failed to import companies: ${error.message}` });
  }
});

export default app;
