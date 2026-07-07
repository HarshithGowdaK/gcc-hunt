const fs = require('fs');
const xlsx = require('xlsx');

const companiesFile = './web/src/data/companies.json';
let companies = [];
if (fs.existsSync(companiesFile)) {
  companies = JSON.parse(fs.readFileSync(companiesFile, 'utf8'));
}

const wb = xlsx.readFile('./companies.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);

let added = 0;
for (const row of data) {
  const name = String(row['Company'] || '').trim();
  const url = String(row['Official Career Page'] || row['Actual Job Listing'] || '').trim();
  if (!name) continue;
  
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  const existing = companies.find(c => c.id === id);
  if (!existing) {
    companies.push({
      id,
      name,
      careersUrl: url,
      status: 'pending',
      lastScraped: null,
      jobsFound: 0,
      quality: null,
      atsDiagnostics: null
    });
    added++;
  }
}

fs.writeFileSync(companiesFile, JSON.stringify(companies, null, 2), 'utf8');
console.log(`Synced ${added} missing companies to JSON.`);
