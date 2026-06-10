'use client';

import React, { useState } from 'react';
import { Download, Loader2, ExternalLink, AlertCircle } from 'lucide-react';

interface ExportButtonProps {
  filters: {
    experienceLevel?: string;
    division?: string;
  };
}

export default function ExportButton({ filters }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/export-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filters),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate Google Sheet');
      }

      if (data.url) {
        // Open the generated Google Sheet in a new tab
        window.open(data.url, '_blank');
      } else {
        throw new Error('No URL returned from server');
      }
    } catch (err: any) {
      console.error('Export Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#D16A4A] text-[#F7F4EE] text-xs font-bold uppercase tracking-wider hover:bg-[#161616] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating Sheet...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Export to Google Sheets
          </>
        )}
      </button>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 max-w-xs text-red-600 bg-red-50 p-2 border border-red-100 text-[10px] leading-tight text-left">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
