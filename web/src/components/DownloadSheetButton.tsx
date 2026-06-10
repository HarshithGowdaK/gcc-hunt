/**
 * DownloadSheetButton
 *
 * A self-contained button component that:
 *  - Accepts the currently filtered job list as a prop
 *  - Calls useExportJobs on click
 *  - Shows loading spinner, success, and error states inline
 *  - Auto-clears the status banner after 5 seconds
 */

'use client';

import React, { useEffect } from 'react';
import { useExportJobs, ExportJob } from '@/hooks/useExportJobs';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DownloadSheetButtonProps {
  /** The filtered jobs currently displayed in the results list */
  jobs: ExportJob[];
  /** Optional extra CSS classes for the button wrapper */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DownloadSheetButton({ jobs, className = '' }: DownloadSheetButtonProps) {
  const { exportStatus, exportMessage, triggerExport, resetExportStatus } = useExportJobs();

  const isLoading = exportStatus === 'loading';
  const isSuccess = exportStatus === 'success';
  const isError   = exportStatus === 'error';

  // Auto-dismiss the status banner after 5 seconds
  useEffect(() => {
    if (exportStatus === 'idle') return;
    const timer = setTimeout(resetExportStatus, 5000);
    return () => clearTimeout(timer);
  }, [exportStatus, resetExportStatus]);

  const handleClick = () => {
    if (isLoading) return;
    triggerExport(jobs);
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>

      {/* ── Button ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-label="Download filtered jobs as Excel spreadsheet"
        className={[
          // Base
          'inline-flex justify-center items-center gap-1.5 px-4 py-2.5 w-full',
          'text-[9px] font-black uppercase tracking-widest transition-all',
          // Colours
          isLoading
            ? 'border border-[#E5E1D8] bg-[#E5E1D8] text-[#7A8471] cursor-not-allowed'
            : 'bg-[#161616] text-[#F7F4EE] hover:bg-[#D16A4A]',
        ].join(' ')}
      >
        {isLoading ? (
          <>
            {/* Spinner */}
            <svg
              className="animate-spin h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Generating…
          </>
        ) : (
          <>
            {/* Download icon */}
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
            </svg>
            Download Sheet
          </>
        )}
      </button>

      {/* ── Status banner ────────────────────────────────────────────── */}
      {exportMessage && (isSuccess || isError) && (
        <div
          role="status"
          aria-live="polite"
          className={[
            'flex items-center gap-2 px-3 py-2 text-[9px] uppercase tracking-widest font-bold mt-2',
            isSuccess ? 'bg-[#FCFAF7] text-[#7A8471] border border-[#E5E1D8]' : '',
            isError   ? 'bg-[#FCFAF7] text-[#D16A4A] border border-[#D16A4A]' : '',
          ].join(' ')}
        >
          {/* Icon */}
          {isSuccess && (
            <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          {isError && (
            <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {exportMessage}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={resetExportStatus}
            aria-label="Dismiss"
            className="ml-auto text-current opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
