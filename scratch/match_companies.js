const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const companiesFile = path.join(__dirname, '../web/src/data/companies.json');
const companies = JSON.parse(fs.readFileSync(companiesFile, 'utf8'));
const companyIds = new Set(companies.map(c => c.id));
const companyNames = new Map(companies.map(c => [c.name.toLowerCase().trim(), c.id]));

function slugifyCompanyId(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const file = '/Users/harshithgowda/Desktop/hunt_gcc/GCCs LinkedIn HR.xlsx';
const workbook = xlsx.readFile(file);
const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

let matched = 0;
let unmatched = [];

for (const row of data) {
  const rawName = row.Company;
  const slug = slugifyCompanyId(rawName);
  const directMatch = companyIds.has(slug);
  const nameMatch = companyNames.get(rawName.toLowerCase().trim());
  
  if (directMatch || nameMatch) {
    matched++;
  } else {
    unmatched.push(rawName);
  }
}

console.log('Total Excel rows:', data.length);
console.log('Successfully matched companies:', matched);
console.log('Unmatched companies count:', unmatched.length);
console.log('\nSample unmatched companies (first 20):');
console.log(unmatched.slice(0, 20));
