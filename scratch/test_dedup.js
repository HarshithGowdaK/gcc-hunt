const fs = require('fs');
const path = require('path');
const Deduplicator = require('../scripts/core/Deduplicator');
const Storage = require('../scripts/core/Storage');

async function test() {
  await Storage.load();

  // Freshly discovered job details during colgate-palmolive scrape
  const discoveredJobs = [
    {
      title: 'Territory Business Lead (Bangalore, KA, IN)',
      location: 'Bangalore', // location detected at discovery
      reqId: 'https://jobs.colgate.com/job/Bangalore-Territory-Business-Lead-KA/1385232900/?feedId=null&utm_source=J2WRSS&utm_medium=rss&utm_campaign=J2W_RSS'
    },
    {
      title: 'CDT Finance Manager, Saudi (Jeddah, 02, SA)',
      location: 'Jeddah, Jeddah, Kingdom of Saudi Arabia',
      reqId: 'https://jobs.colgate.com/job/Jeddah-CDT-Finance-Manager%2C-Saudi-02/1393262300/?feedId=null&utm_source=J2WRSS&utm_medium=rss&utm_campaign=J2W_RSS'
    }
  ];

  console.log('\n--- Simulating findPreviousJob with normalizations ---');

  // Let's manually clean secondary keys in previousJobsMap
  const cleanPreviousJobsMap = new Map();
  for (const [key, job] of Storage.previousJobsMap.entries()) {
    const cleanKey = key.replace(/&amp;/g, '&');
    cleanPreviousJobsMap.set(cleanKey, job);
  }

  for (const job of discoveredJobs) {
    const fps = Deduplicator.buildFingerprints('colgate-palmolive', job.title, job.location, job.reqId, '');
    const cleanSec = fps.secondary ? fps.secondary.replace(/&amp;/g, '&') : null;
    
    console.log(`\nDiscovered: ${job.title}`);
    console.log(`Generated secondary: ${cleanSec}`);
    
    if (cleanSec && cleanPreviousJobsMap.has(cleanSec)) {
      console.log('✅ MATCH FOUND by normalized secondary fingerprint!');
      const match = cleanPreviousJobsMap.get(cleanSec);
      console.log(`Reused Job Title: ${match.title}`);
    } else {
      console.log('❌ NO MATCH.');
    }
  }
}

test().catch(console.error);
