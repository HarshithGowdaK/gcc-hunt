/**
 * useExportJobs
 *
 * Custom React hook that handles the full lifecycle of exporting filtered
 * job results to an .xlsx file:
 *   1. Validates that jobs exist
 *   2. POSTs to /api/export-jobs
 *   3. Streams the binary response and triggers a browser download
 *   4. Exposes loading / success / error state to the caller
 */

import { useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportJob {
  company: string;
  jobType: string;
  jobRole: string;
  url: string;
}

export type ExportStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseExportJobsReturn {
  exportStatus: ExportStatus;
  exportMessage: string;
  triggerExport: (jobs: ExportJob[]) => Promise<void>;
  resetExportStatus: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useExportJobs(): UseExportJobsReturn {
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportMessage, setExportMessage] = useState('');

  const resetExportStatus = useCallback(() => {
    setExportStatus('idle');
    setExportMessage('');
  }, []);

  const triggerExport = useCallback(async (jobs: ExportJob[]) => {
    // ── Guard: nothing to export ──────────────────────────────────────────
    if (!jobs || jobs.length === 0) {
      setExportStatus('error');
      setExportMessage('No jobs available to export.');
      return;
    }

    setExportStatus('loading');
    setExportMessage('');

    try {
      // ── Build filename: jobs_export_YYYY-MM-DD.xlsx ────────────────────
      const today = new Date().toISOString().split('T')[0];
      const filename = `jobs_export_${today}`;

      // ── POST filtered jobs to the API ──────────────────────────────────
      const response = await fetch('/api/export-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs, filename }),
      });

      if (!response.ok) {
        // Try to extract a server-provided error message
        let serverError = 'Export failed. Please try again.';
        try {
          const json = await response.json();
          if (json?.error) serverError = json.error;
        } catch {
          // ignore parse error; keep default message
        }
        throw new Error(serverError);
      }

      // ── Stream blob and trigger download ───────────────────────────────
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${filename}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();

      // Clean up immediately after click is dispatched
      requestAnimationFrame(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);
      });

      setExportStatus('success');
      setExportMessage('Excel file downloaded successfully.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed. Please try again.';
      setExportStatus('error');
      setExportMessage(message);
      console.error('[useExportJobs]', message);
    }
  }, []);

  return { exportStatus, exportMessage, triggerExport, resetExportStatus };
}
