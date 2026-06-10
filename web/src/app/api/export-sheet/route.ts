import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// Parse credentials from environment variable
// You can supply the raw JSON string of your service account key here
const getGoogleAuth = () => {
  try {
    const credentialsStr = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!credentialsStr) return null;
    
    const credentials = JSON.parse(credentialsStr);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
  } catch (err) {
    console.error('Error parsing Google credentials:', err);
    return null;
  }
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { experienceLevel, division } = body;

    // 1. Verify Authentication Setup
    const auth = getGoogleAuth();
    if (!auth) {
      return NextResponse.json(
        { error: 'Google Cloud Credentials not configured on the server. Please add GOOGLE_APPLICATION_CREDENTIALS_JSON to your environment variables.' },
        { status: 503 }
      );
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // 2. Read jobs.json database
    const jobsPath = path.join(process.cwd(), 'src', 'data', 'jobs.json');
    let jobs = [];
    if (fs.existsSync(jobsPath)) {
      jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
    }

    // 3. Filter the jobs based on user criteria
    let filteredJobs = jobs;
    if (experienceLevel && experienceLevel !== 'All') {
      filteredJobs = filteredJobs.filter((job: any) => job.experienceLevel === experienceLevel);
    }
    if (division && division !== 'All') {
      // In this setup, division acts as industry/department
      filteredJobs = filteredJobs.filter((job: any) => job.department === division || job.industry === division);
    }

    // 4. Remove duplicate jobs (company + title + location)
    const uniqueJobsMap = new Map();
    for (const job of filteredJobs) {
      const uniqueKey = `${job.companyId || job.company}-${job.title}-${job.location}`.toLowerCase();
      
      // If job already exists, keep the most recently fetched one
      if (uniqueJobsMap.has(uniqueKey)) {
        const existingJob = uniqueJobsMap.get(uniqueKey);
        const existingTime = new Date(existingJob.dateScraped || 0).getTime();
        const newTime = new Date(job.dateScraped || 0).getTime();
        if (newTime > existingTime) {
          uniqueJobsMap.set(uniqueKey, job);
        }
      } else {
        uniqueJobsMap.set(uniqueKey, job);
      }
    }
    const deduplicatedJobs = Array.from(uniqueJobsMap.values());

    // 5. Sort by fetched_timestamp descending
    deduplicatedJobs.sort((a: any, b: any) => {
      const timeA = new Date(a.dateScraped || 0).getTime();
      const timeB = new Date(b.dateScraped || 0).getTime();
      return timeB - timeA;
    });

    // 6. Create a new Google Sheet
    const sheetTitle = `${experienceLevel || 'All'} - ${division || 'All'} Jobs`;
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: sheetTitle,
        },
      },
    });
    const spreadsheetId = spreadsheet.data.spreadsheetId;

    // 7. Populate columns: Company, Job Title, Location, Experience Level, Division, Apply URL, Fetched Timestamp
    const headers = ['Company', 'Job Title', 'Location', 'Experience Level', 'Division/Industry', 'Apply URL', 'Fetched Timestamp'];
    const rows = deduplicatedJobs.map((job: any) => [
      job.company || job.companyId || 'Unknown',
      job.title || 'N/A',
      job.location || 'N/A',
      job.experienceLevel || 'N/A',
      job.industry || job.division || 'N/A',
      job.url || 'N/A',
      job.dateScraped ? new Date(job.dateScraped).toLocaleString() : 'N/A'
    ]);

    const values = [headers, ...rows];

    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId!,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    // 8. Generate read-only sharing link
    await drive.permissions.create({
      fileId: spreadsheetId!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // 9. Return the link to the user
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    return NextResponse.json({ url: spreadsheetUrl });

  } catch (error: any) {
    console.error('Error generating Google Sheet:', error);
    return NextResponse.json(
      { error: 'Failed to generate Google Sheet: ' + (error.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
