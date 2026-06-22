const fs = require('fs');
const path = require('path');
const Deduplicator = require('../scripts/core/Deduplicator');
const Storage = require('../scripts/core/Storage');

async function test() {
  await Storage.load();

  console.log('Previous jobs loaded:', Storage.previousJobs.length);
  const m3Jobs = Storage.previousJobs.filter(j => j.companyId === '3m');
  console.log('3M previous jobs:', m3Jobs.length);

  for (const j of m3Jobs) {
    // Simulate what the Workday adapter returns for this job
    // From clinical specialist sample:
    // title: "Clinical Specialist -South 2"
    // location: "Chennai, Tamil Nadu, India" or what was raw Workday location?
    // Let's test different locations:
    console.log(`\nJob title: "${j.title}"`);
    console.log(`Saved primary: ${j.fingerprints.primary}`);
    console.log(`Saved secondary: ${j.fingerprints.secondary}`);

    // If discovered, reqId would be R01165037
    // Let's find reqId from applyUrl:
    const reqMatch = j.applyUrl.match(/_([R\d]+)$/i);
    const reqId = reqMatch ? reqMatch[1] : '';
    console.log(`Guessed reqId: "${reqId}"`);

    // Let's test with different locations
    const locationsToTest = [
      j.location,
      'Chennai, Tamil Nadu, India',
      'IN-Tamil-Nadu-Chennai',
      'IN, Tamil Nadu, Chennai'
    ];

    for (const loc of locationsToTest) {
      const fps = Deduplicator.buildFingerprints('3m', j.title, loc, reqId, '');
      console.log(`- Testing loc "${loc}":`);
      console.log(`  Calculated primary: ${fps.primary} -> Match primary? ${Storage.previousJobsMap.has(fps.primary)}`);
      console.log(`  Calculated secondary: ${fps.secondary} -> Match secondary? ${Storage.previousJobsMap.has(fps.secondary)}`);
    }
  }
}

test().catch(console.error);
