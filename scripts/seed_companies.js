const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const admin = require('firebase-admin');

// Initialize Firebase Admin
// If FIRESTORE_EMULATOR_HOST is set, it will connect to the local emulator automatically.
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(`Connecting to Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  admin.initializeApp({
    projectId: 'gcc-hunt-dev'
  });
} else {
  // Try initializing with application default credentials or manual service account
  try {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase initialized with service account.');
    } else {
      admin.initializeApp();
      console.log('Firebase initialized with default credentials.');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK. If running locally, set FIRESTORE_EMULATOR_HOST=localhost:8080 or GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
}

const db = admin.firestore();

// Helper to slugify company names
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .trim()                         // Trim leading/trailing whitespace
    .replace(/^-+/, '')             // Trim leading -
    .replace(/-+$/, '');            // Trim trailing -
}

async function seed() {
  const excelPath = path.join(__dirname, '..', 'companies.xlsx');
  
  if (!fs.existsSync(excelPath)) {
    console.error(`Excel file not found at: ${excelPath}`);
    process.exit(1);
  }

  console.log('Reading Excel file...');
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert Excel sheet to JSON
  const data = xlsx.utils.sheet_to_json(worksheet);
  console.log(`Found ${data.length} rows in the sheet.`);

  const batchSize = 400; // Firestore limit is 500, we use 400 to be safe
  let currentBatch = db.batch();
  let operationCount = 0;
  let successCount = 0;

  for (const row of data) {
    const companyName = row['Company'];
    const careersUrl = row['Actual Job Listing'];

    if (!companyName || !careersUrl) {
      continue;
    }

    const companyId = slugify(companyName);
    const companyRef = db.collection('companies').doc(companyId);

    const companyData = {
      id: companyId,
      name: companyName.trim(),
      careersUrl: careersUrl.trim(),
      status: 'idle',
      lastScraped: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    currentBatch.set(companyRef, companyData, { merge: true });
    operationCount++;
    successCount++;

    if (operationCount >= batchSize) {
      console.log(`Committing batch of ${operationCount} companies...`);
      await currentBatch.commit();
      currentBatch = db.batch();
      operationCount = 0;
    }
  }

  // Commit any remaining operations
  if (operationCount > 0) {
    console.log(`Committing remaining ${operationCount} companies...`);
    await currentBatch.commit();
  }

  console.log(`Successfully seeded ${successCount} companies into Firestore!`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
