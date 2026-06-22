const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

function slugifyCompanyId(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function run() {
  const dataDir = path.join(__dirname, '../web/src/data');
  const companiesFile = path.join(dataDir, 'companies.json');
  const jobsFile = path.join(dataDir, 'jobs.json');

  if (!fs.existsSync(companiesFile)) {
    console.error('companies.json not found!');
    process.exit(1);
  }

  const companies = JSON.parse(fs.readFileSync(companiesFile, 'utf8'));
  const companyIds = new Set(companies.map(c => c.id));
  const companyNames = new Map(companies.map(c => [c.name.toLowerCase().trim(), c.id]));

  const excelPath = '/Users/harshithgowda/Desktop/hunt_gcc/GCCs LinkedIn HR.xlsx';
  if (!fs.existsSync(excelPath)) {
    console.error('GCCs LinkedIn HR.xlsx not found!');
    process.exit(1);
  }

  console.log('Reading Excel file...');
  const workbook = xlsx.readFile(excelPath);
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  console.log(`Loaded ${data.length} rows from Excel.`);

  const hrMap = new Map(); // Maps companyId -> linkedinLink

  for (const row of data) {
    const rawName = row.Company;
    const linkedin = row['HR / Recruiter / Hiring Manager'];

    if (!rawName || !linkedin || String(rawName).toLowerCase().includes('not found')) {
      continue;
    }

    const slug = slugifyCompanyId(rawName);
    let matchedCompanyId = null;

    if (companyIds.has(slug)) {
      matchedCompanyId = slug;
    } else {
      const nameKey = String(rawName).toLowerCase().trim();
      if (companyNames.has(nameKey)) {
        matchedCompanyId = companyNames.get(nameKey);
      }
    }

    if (matchedCompanyId) {
      hrMap.set(matchedCompanyId, linkedin);
    }
  }

  console.log(`Mapped LinkedIn profiles for ${hrMap.size} companies.`);

  // Update companies.json
  let companiesUpdated = 0;
  for (const comp of companies) {
    if (hrMap.has(comp.id)) {
      comp.hrLinkedin = hrMap.get(comp.id);
      companiesUpdated++;
    }
  }
  fs.writeFileSync(companiesFile, JSON.stringify(companies, null, 2), 'utf8');
  console.log(`Updated ${companiesUpdated} companies in companies.json.`);

  // Update jobs.json
  if (fs.existsSync(jobsFile)) {
    const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
    let jobsUpdated = 0;
    
    for (const job of jobs) {
      // Check if job is strictly in Bangalore
      if (job.city && job.city.toLowerCase() === 'bangalore') {
        const linkedin = hrMap.get(job.companyId);
        if (linkedin) {
          job.hrLinkedin = linkedin;
          jobsUpdated++;
        }
      }
    }
    
    fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2), 'utf8');
    console.log(`Updated ${jobsUpdated} Bangalore jobs with HR LinkedIn link in jobs.json.`);
  } else {
    console.log('jobs.json not found, skipping job updates.');
  }

  console.log('Done!');
}

run().catch(console.error);
