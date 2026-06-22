const fs = require('fs');
const path = require('path');

const jobsFile = path.join(__dirname, '../web/src/data/jobs.json');
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

let reqIdFormat = 0;
let titleLocFormat = 0;

for (const j of jobs) {
  if (j.fingerprints && j.fingerprints.secondary) {
    const parts = j.fingerprints.secondary.split(':');
    // If there are more than 2 parts, it's likely title:location (because title and location would split by colons or normalizer string)
    // Wait, let's see how they look
    if (j.fingerprints.secondary.includes('http') || parts.length === 2 && !isNaN(parts[1])) {
      reqIdFormat++;
    } else {
      titleLocFormat++;
    }
  }
}

console.log('Total jobs with secondary fingerprints:', jobs.length);
console.log('reqId format:', reqIdFormat);
console.log('title:location format:', titleLocFormat);

// Print first 10 secondary fingerprints
console.log('\nFirst 10 secondary fingerprints:');
jobs.slice(0, 10).forEach(j => {
  console.log(`- ${j.fingerprints?.secondary} (Title: "${j.title}", Location: "${j.location}")`);
});
