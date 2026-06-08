import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// This must be called first before any collections or databases are referenced.
admin.initializeApp();

import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import app from './api';
import { runScraperQueue } from './scraper/scheduler';

// Host the REST API on Cloud Functions (Express wrapper)
// Allow v2 function to handle up to 60s requests and 512MiB of memory
export const api = onRequest({
  memory: '512MiB',
  timeoutSeconds: 60,
  cors: true
}, app);

// Daily scraper schedule. Runs every 24 hours (usually midnight).
// Configured with 2GiB memory and 60 minutes timeout to allow Playwright browser execution.
export const scheduledScraper = onSchedule({
  schedule: '0 0 * * *',
  timeoutSeconds: 3600,
  memory: '2GiB'
}, async (event) => {
  console.log('[Scheduler Trigger] Cron job started for scraper queue.');
  try {
    // Process 25 companies concurrently (concurrency level of 3)
    const stats = await runScraperQueue(3, 25);
    console.log('[Scheduler Trigger] Scraper cron completed successfully:', stats);
  } catch (error: any) {
    console.error('[Scheduler Trigger] Scraper cron failed:', error.message);
  }
});
