const fs = require('fs');
const path = require('path');

const jobsFile = path.join(__dirname, '../web/src/data/jobs.json');
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

console.log('Resetting isNew flag for', jobs.length, 'jobs...');
for (const j of jobs) {
  j.isNew = false;
}

fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2), 'utf8');
console.log('Database updated successfully.');
