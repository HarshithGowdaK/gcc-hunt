const fs = require('fs');
const path = require('path');

const companiesFile = path.join(__dirname, '../web/src/data/companies.json');
const companies = JSON.parse(fs.readFileSync(companiesFile, 'utf8'));

const company = companies.find(c => c.id === '3m');
console.log('Company 3M details:', JSON.stringify(company, null, 2));
