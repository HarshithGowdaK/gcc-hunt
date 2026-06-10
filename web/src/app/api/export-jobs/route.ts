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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobRecord {
  company: string;       // Company / employer name
  jobType: string;       // One of the seven experience-level values
  jobRole: string;       // Job title / role
  url: string;           // Direct link to the job posting
}

/** Valid job-type labels accepted by the platform */
const VALID_JOB_TYPES = new Set([
  'Internship',
  'Apprenticeship',
  'Fresher',
  'Entry Level',
  'Mid Level',
  'Senior Level',
  'Lead Level',
]);

// ─── Validation helpers ───────────────────────────────────────────────────────

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidRecord(job: JobRecord): boolean {
  return (
    typeof job.company === 'string' && job.company.trim().length > 0 &&
    typeof job.jobType === 'string' && VALID_JOB_TYPES.has(job.jobType) &&
    typeof job.jobRole === 'string' && job.jobRole.trim().length > 0 &&
    typeof job.url === 'string' && isValidUrl(job.url.trim())
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
  const headers = ['Company Name', 'Job Type', 'Job Role', 'Job Listing URL'];

  // Build rows — URLs are wrapped in a HYPERLINK formula so they stay clickable
  const rows: (string | { f: string })[][] = jobs.map((job) => [
    job.company.trim(),
    job.jobType,
    job.jobRole.trim(),
    // Excel HYPERLINK formula: =HYPERLINK("url","url")
    { f: `HYPERLINK("${job.url.trim()}","${job.url.trim()}")` },
  ]);

  // Prepend headers as a plain row
  const sheetData: unknown[][] = [headers, ...rows];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // ── Column widths ──────────────────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 30 },  // Company Name
    { wch: 18 },  // Job Type
    { wch: 40 },  // Job Role
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
    const { jobs, filename } = body as { jobs: JobRecord[]; filename?: string };

    if (!Array.isArray(jobs)) {
      return NextResponse.json(
        { error: 'Request body must include a "jobs" array.' },
        { status: 400 }
      );
    }

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
