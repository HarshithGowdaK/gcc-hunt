/**
 * POST /api/export-jobs
 *
 * Accepts filtered job data from the client, validates it, deduplicates it,
 * and returns a base64-encoded .xlsx file for direct browser download.
 *
 * No Google Sheets / Google Drive integration — pure in-process XLSX generation.
 */

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { fetchJobs } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobRecord {
  company: string;       // Company / employer name
  jobType: string;       // One of the seven experience-level values
  jobRole: string;       // Job title / role
  url: string;           // Direct link to the job posting
  datePosted?: string;   // Date the job was posted or scraped
}

/** Valid job-type labels accepted by the platform */
const VALID_JOB_TYPES = new Set([
  'Internship / Apprenticeship',
  'Entry Level',
  'Mid Level',
  'Senior Level',
  'Lead / Management',
  'Executive Leadership',
]);

/** Map v2 shorthand labels to canonical export labels */
const EXPERIENCE_ALIASES: Record<string, string> = {
  Internship: 'Internship / Apprenticeship',
  Apprenticeship: 'Internship / Apprenticeship',
  Graduate: 'Entry Level',
  Entry: 'Entry Level',
  Associate: 'Entry Level',
  Junior: 'Entry Level',
  Mid: 'Mid Level',
  Senior: 'Senior Level',
  Lead: 'Lead / Management',
  Staff: 'Senior Level',
  Principal: 'Senior Level',
  Architect: 'Lead / Management',
  Manager: 'Lead / Management',
  Director: 'Executive Leadership',
};

function normalizeJobType(raw: string): string {
  if (VALID_JOB_TYPES.has(raw)) return raw;
  return EXPERIENCE_ALIASES[raw] || raw;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isValidUrl(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidRecord(job: JobRecord): boolean {
  return (
    typeof job.company === 'string' &&
    typeof job.jobRole === 'string' && 
    typeof job.jobType === 'string'
  );
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicate(jobs: JobRecord[]): JobRecord[] {
  const seen = new Set<string>();
  const result: JobRecord[] = [];
  for (const job of jobs) {
    // Composite key: company + role + url (case-insensitive)
    const key = `${job.company.toLowerCase()}|${job.jobRole.toLowerCase()}|${job.url.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(job);
    }
  }
  return result;
}

// ─── XLSX builder ─────────────────────────────────────────────────────────────

function buildXlsx(jobs: JobRecord[], filename: string): Buffer {
  const wb = XLSX.utils.book_new();

  // Column headers exactly as specified
  const headers = ['Company Name', 'Job Type', 'Job Role', 'Posted Date', 'Job Listing URL'];

  // Build rows — URLs are wrapped in a HYPERLINK formula so they stay clickable
  const rows: (string | { f: string })[][] = jobs.map((job) => [
    job.company.trim(),
    job.jobType,
    job.jobRole.trim(),
    job.datePosted || 'Unknown',
    // Excel HYPERLINK formula: =HYPERLINK("url","url")
    job.url.startsWith('http') ? { f: `HYPERLINK("${job.url.trim()}","${job.url.trim()}")` } : job.url.trim(),
  ]);

  // Prepend headers as a plain row
  const sheetData: unknown[][] = [headers, ...rows];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // ── Column widths ──────────────────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 30 },  // Company Name
    { wch: 18 },  // Job Type
    { wch: 40 },  // Job Role
    { wch: 15 },  // Posted Date
    { wch: 60 },  // Job Listing URL
  ];

  // ── Header row styling (bold, background) via cell metadata ───────────────
  // SheetJS CE does not support rich styling; header formatting is handled
  // client-side in the download helper if needed.

  XLSX.utils.book_append_sheet(wb, ws, 'Jobs');

  // Return as a Node.js Buffer (base64 encoded by caller)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ── 1. Parse input ──────────────────────────────────────────────────────
    const { filters, filename } = body as { filters: any; filename?: string };

    if (!filters) {
      return NextResponse.json(
        { error: 'Request body must include a "filters" object.' },
        { status: 400 }
      );
    }

    filters.limit = 100000;
    const { jobs: rawJobs } = await fetchJobs(filters);

    const jobs: JobRecord[] = rawJobs.map((j: any) => ({
      company: j.companyName || j.companyId || 'Unknown',
      jobType: normalizeJobType(j.experienceLevel || j.employmentType || 'Unknown'),
      jobRole: j.title || 'Unknown',
      url: j.applyUrl || j.jobUrl || j.url || '#',
      datePosted: j.dateScraped
        ? new Date(j.dateScraped).toLocaleDateString()
        : j.postedDate
          ? new Date(j.postedDate).toLocaleDateString()
          : j.createdAt
            ? new Date(j.createdAt).toLocaleDateString()
            : 'Unknown',
    }));

    // ── 2. Validate each record ─────────────────────────────────────────────
    const validJobs = jobs.filter(isValidRecord);

    if (validJobs.length === 0) {
      return NextResponse.json(
        { error: 'No jobs available to export.' },
        { status: 422 }
      );
    }

    // ── 3. Deduplicate ──────────────────────────────────────────────────────
    const uniqueJobs = deduplicate(validJobs);

    // ── 4. Generate XLSX ────────────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const safeFilename = filename?.replace(/[^a-zA-Z0-9_\-]/g, '_') || `jobs_export_${today}`;
    const xlsxBuffer = buildXlsx(uniqueJobs, safeFilename);

    // ── 5. Return file as binary response ───────────────────────────────────
    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeFilename}.xlsx"`,
        'X-Row-Count': String(uniqueJobs.length),
      },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[export-jobs] Error:', message);
    return NextResponse.json(
      { error: 'Failed to generate export: ' + message },
      { status: 500 }
    );
  }
}
