/**
 * JobsPage — integration example
 *
 * Shows how to wire the filter state, filtered results, and
 * <DownloadSheetButton> together in a single page component.
 *
 * Replace the mock `ALL_JOBS` array with your real data source
 * (API call, SWR hook, React Query, etc.).
 */

'use client';

import React, { useState, useMemo } from 'react';
import { DownloadSheetButton } from '@/components/DownloadSheetButton';
import type { ExportJob } from '@/hooks/useExportJobs';

// ─── Constants ────────────────────────────────────────────────────────────────

const JOB_TYPES = [
  'Internship',
  'Apprenticeship',
  'Fresher',
  'Entry Level',
  'Mid Level',
  'Senior Level',
  'Lead Level',
] as const;

type JobType = (typeof JOB_TYPES)[number];

// ─── Mock data (replace with real data) ──────────────────────────────────────

const ALL_JOBS: ExportJob[] = [
  { company: 'Google',    jobType: 'Internship',   jobRole: 'Software Engineering Intern',   url: 'https://careers.google.com/jobs/1' },
  { company: 'Microsoft', jobType: 'Entry Level',  jobRole: 'Software Engineer',             url: 'https://careers.microsoft.com/jobs/2' },
  { company: 'Amazon',    jobType: 'Senior Level', jobRole: 'Senior Data Engineer',          url: 'https://amazon.jobs/3' },
  { company: 'Meta',      jobType: 'Mid Level',    jobRole: 'Product Manager',               url: 'https://metacareers.com/4' },
  { company: 'Stripe',    jobType: 'Lead Level',   jobRole: 'Staff Engineer',                url: 'https://stripe.com/jobs/5' },
  { company: 'Infosys',   jobType: 'Fresher',      jobRole: 'Systems Engineer Trainee',      url: 'https://infosys.com/careers/6' },
  { company: 'Deloitte',  jobType: 'Apprenticeship', jobRole: 'Technology Apprentice',       url: 'https://deloitte.com/careers/7' },
];

// ─── Page component ───────────────────────────────────────────────────────────

export default function JobsPage() {
  // Multi-select filter state (empty Set = "All")
  const [selectedTypes, setSelectedTypes] = useState<Set<JobType>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Toggle a job-type filter chip
  const toggleType = (type: JobType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  // Derived: filtered + searched jobs
  const filteredJobs: ExportJob[] = useMemo(() => {
    let results = ALL_JOBS;

    // Apply job-type filter
    if (selectedTypes.size > 0) {
      results = results.filter((j) => selectedTypes.has(j.jobType as JobType));
    }

    // Apply search query (company or role)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (j) =>
          j.company.toLowerCase().includes(q) ||
          j.jobRole.toLowerCase().includes(q)
      );
    }

    return results;
  }, [selectedTypes, searchQuery]);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <h1 className="text-2xl font-bold text-gray-900">Job Listings</h1>

      {/* ── Filters row ──────────────────────────────────────────────── */}
      <section aria-label="Job type filters" className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {JOB_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              aria-pressed={selectedTypes.has(type)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                selectedTypes.has(type)
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400',
              ].join(' ')}
            >
              {type}
            </button>
          ))}

          {selectedTypes.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTypes(new Set())}
              className="px-3 py-1.5 rounded-full text-sm text-gray-500 border border-dashed border-gray-300 hover:text-red-600"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Search */}
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by company or role…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </section>

      {/* ── Results header with Download button ──────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-600">
          {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} found
          {selectedTypes.size > 0 && (
            <> for <strong>{[...selectedTypes].join(', ')}</strong></>
          )}
        </p>

        {/* ↓ The only thing you need to add to your existing page ↓ */}
        <DownloadSheetButton jobs={filteredJobs} />
      </div>

      {/* ── Results table ─────────────────────────────────────────────── */}
      {filteredJobs.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Company Name', 'Job Type', 'Job Role', 'Apply'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-gray-600 tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredJobs.map((job, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{job.company}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                      {job.jobType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{job.jobRole}</td>
                  <td className="px-4 py-3">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Apply →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-gray-400">
          No jobs match your current filters.
        </div>
      )}
    </main>
  );
}
