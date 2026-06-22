const fs = require('fs');
const path = require('path');

const jobsFile = path.join(__dirname, '../web/src/data/jobs.json');
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

const m3Jobs = jobs.filter(j => j.companyId === '3m');
console.log('Total 3M jobs in jobs.json:', m3Jobs.length);

const new3M = m3Jobs.filter(j => j.isNew === true);
const old3M = m3Jobs.filter(j => j.isNew === false);

console.log('3M jobs with isNew === true:', new3M.length);
console.log('3M jobs with isNew === false:', old3M.length);

console.log('\n--- Sample of 3M isNew === true ---');
new3M.slice(0, 3).forEach(j => {
  console.log('Title:', j.title);
  console.log('Location:', j.location);
  console.log('ApplyUrl:', j.applyUrl);
  console.log('Fingerprints:', j.fingerprints);
});

console.log('\n--- Sample of 3M isNew === false ---');
old3M.slice(0, 3).forEach(j => {
  console.log('Title:', j.title);
  console.log('Location:', j.location);
  console.log('ApplyUrl:', j.applyUrl);
  console.log('Fingerprints:', j.fingerprints);
});
