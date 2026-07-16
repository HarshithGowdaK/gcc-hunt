const fs = require('fs');
const xlsx = require('xlsx');

const excel = xlsx.readFile('companies.xlsx');
const sheet = excel.Sheets[excel.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet);
const validNames = new Set(data.map(r => r.name || r.Company || 'Unknown'));
function slugifyCompanyId(name, fallback) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}
const validIds = new Set(data.map((r, i) => r.id || slugifyCompanyId(r.name || r.Company, `excel_${i}`)));

const comps = JSON.parse(fs.readFileSync('web/src/data/companies.json', 'utf8'));
const filtered = comps.filter(c => validIds.has(c.id) || validNames.has(c.name));
fs.writeFileSync('web/src/data/companies.json', JSON.stringify(filtered, null, 2));
console.log(`Filtered companies.json down to ${filtered.length} companies.`);
