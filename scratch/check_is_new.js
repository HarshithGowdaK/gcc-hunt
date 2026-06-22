const fs = require('fs');
const path = require('path');

const jobsFile = path.join(__dirname, '../web/src/data/jobs.json');
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

console.log('Total jobs:', jobs.length);
const newJobs = jobs.filter(j => j.isNew === true);
const oldJobsWithIsNew = jobs.filter(j => j.isNew === false);
const undefinedIsNew = jobs.filter(j => j.isNew === undefined);

console.log('Jobs with isNew === true:', newJobs.length);
console.log('Jobs with isNew === false:', oldJobsWithIsNew.length);
console.log('Jobs with isNew === undefined:', undefinedIsNew.length);

if (newJobs.length > 0) {
  console.log('\nSample of isNew === true:');
  newJobs.slice(0, 5).forEach(j => {
    console.log(`- ${j.title} (${j.companyName}) - Scraped: ${j.dateScraped} - Created: ${j.createdAt}`);
  });
}
