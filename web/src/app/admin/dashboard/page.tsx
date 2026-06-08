'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { 
  fetchCompanies, fetchScrapeLogs, triggerRescrape, uploadExcelCompanies 
} from '@/lib/api';
import { 
  Building2, Calendar, CheckCircle, Clock, Database, FileSpreadsheet, 
  HelpCircle, Play, RefreshCw, AlertTriangle, ShieldAlert, Upload, Search, X
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();

  // Redirect if not admin
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin');
    }
  }, [user, isAdmin, loading, router]);

  // Data states
  const [companies, setCompanies] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [compSearch, setCompSearch] = useState('');
  
  // Scraper action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [globalScrapingMsg, setGlobalScrapingMsg] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // Excel Upload states
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Load dashboard tables
  const loadDashboardData = async () => {
    try {
      const compData = await fetchCompanies();
      setCompanies(compData);
      
      const logData = await fetchScrapeLogs(15);
      setLogs(logData);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (user && isAdmin) {
      loadDashboardData();
    }
  }, [user, isAdmin]);

  // Handle single company manual crawl
  const handleManualScrape = async (companyId: string) => {
    setActionLoading(companyId);
    try {
      const res = await triggerRescrape(companyId);
      alert(res.message || `Crawl complete. Found ${res.jobsFound} jobs.`);
      loadDashboardData();
    } catch (err: any) {
      alert(`Manual scrape failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Trigger global queue scraper batch run
  const handleTriggerQueue = async () => {
    setActionLoading('global-queue');
    try {
      const res = await triggerRescrape('all');
      setGlobalScrapingMsg(res.message || 'Scraper queue successfully running in background.');
      setTimeout(() => setGlobalScrapingMsg(null), 10000);
      loadDashboardData();
    } catch (err: any) {
      alert(`Queue trigger failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Client-side Excel parsing and loading
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMsg(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawRows: any[] = XLSX.utils.sheet_to_json(ws);

        // Map column formats (Support the exact sheet format Company & Actual Job Listing)
        const parsedList = rawRows.map(row => {
          const name = row['Company'] || row['company'] || row['Name'] || row['name'];
          const url = row['Actual Job Listing'] || row['careersUrl'] || row['url'] || row['Careers Page'];
          return { company: name, url };
        }).filter(item => item.company && item.url);

        if (parsedList.length === 0) {
          throw new Error('No valid company records found. Ensure sheet has "Company" and "Actual Job Listing" columns.');
        }

        console.log(`[Upload] Uploading parsed list:`, parsedList);
        const res = await uploadExcelCompanies(parsedList);
        
        setUploadMsg({
          type: 'success',
          text: res.message || `Successfully processed sheet. Seeded ${res.successCount} companies.`
        });
        loadDashboardData();
      } catch (err: any) {
        setUploadMsg({
          type: 'error',
          text: err.message || 'Failed to read/process Excel file.'
        });
      } finally {
        setUploading(false);
        // Clear input value so same file can be uploaded again if needed
        e.target.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  // Filter list of companies in search panel
  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(compSearch.toLowerCase()) || 
    c.id.toLowerCase().includes(compSearch.toLowerCase())
  );

  // Stats calculation
  const totalCompanies = companies.length;
  const successCount = companies.filter(c => c.status === 'success').length;
  const failedCount = companies.filter(c => c.status === 'failed').length;
  const scrapingCount = companies.filter(c => c.status === 'scraping').length;

  if (loading || dashboardLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-indigo-400" />
            Control Center Dashboard
          </h1>
          <p className="text-xs text-gray-400 mt-1">Deploy automated cron configurations and monitor crawlers status.</p>
        </div>

        <button
          onClick={handleTriggerQueue}
          disabled={actionLoading !== null}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 transition disabled:opacity-50"
        >
          {actionLoading === 'global-queue' ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Initializing Scrapers...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run Crawlers Queue
            </>
          )}
        </button>
      </div>

      {globalScrapingMsg && (
        <div className="p-3.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center justify-between">
          <span>{globalScrapingMsg}</span>
          <button onClick={() => setGlobalScrapingMsg(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grid of Stats Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Monitored GCCs</span>
            <Building2 className="h-5 w-5 text-gray-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-white">{totalCompanies}</p>
        </div>

        <div className="glass-card p-5 border-emerald-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Successful Crawls</span>
            <CheckCircle className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-400">{successCount}</p>
        </div>

        <div className="glass-card p-5 border-rose-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Failed Crawls</span>
            <AlertTriangle className="h-5 w-5 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-rose-400">{failedCount}</p>
        </div>

        <div className="glass-card p-5 border-indigo-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Scraping In Progress</span>
            <RefreshCw className="h-5 w-5 text-indigo-400 animate-spin" />
          </div>
          <p className="mt-2 text-2xl font-black text-indigo-400">{scrapingCount}</p>
        </div>
      </div>

      {/* Upload Zone & Logs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Upload Excel Dropzone */}
        <section className="lg:col-span-1 glass-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              Import Companies
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Add new Global Capability Centers by uploading a spreadsheet. Required headers: <b>Company</b> and <b>Actual Job Listing</b>.
            </p>

            {/* Dropzone container */}
            <div className="relative border border-dashed border-white/10 hover:border-indigo-500/40 rounded-xl p-6 text-center cursor-pointer bg-white/[0.003] hover:bg-white/[0.015] transition">
              <input
                type="file"
                accept=".xlsx, .xls"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleExcelUpload}
                disabled={uploading}
              />
              
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/10">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-200">
                    {uploading ? 'Parsing File...' : 'Choose or Drag Spreadsheet'}
                  </span>
                  <span className="text-[10px] text-gray-500 block mt-1">Excel formats only (.xlsx, .xls)</span>
                </div>
              </div>
            </div>
          </div>

          {uploadMsg && (
            <div className={`mt-4 p-3 rounded-lg text-xs leading-relaxed ${
              uploadMsg.type === 'success' 
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}>
              {uploadMsg.text}
            </div>
          )}
        </section>

        {/* Crawl Run Logs */}
        <section className="lg:col-span-2 glass-card p-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-400" />
            Recent Scrape Logs
          </h3>

          <div className="max-h-[300px] overflow-y-auto custom-scrollbar border border-white/5 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#0a071c] text-gray-500 sticky top-0 border-b border-white/5">
                <tr>
                  <th className="p-3">Company</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Jobs Found</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-gray-500 italic">No logs recorded. Run the crawler.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.005]">
                      <td className="p-3 font-semibold text-gray-200">{log.companyName}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          log.status === 'success' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {log.status}
                        </span>
                        {log.errors && (
                          <span className="text-[10px] text-rose-400/70 block mt-1 max-w-[200px] truncate" title={log.errors}>
                            {log.errors}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-gray-300 font-semibold">{log.jobsFound || 0}</td>
                      <td className="p-3 text-gray-400">{(log.executionTime / 1000).toFixed(1)}s</td>
                      <td className="p-3 text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Company Directory Section */}
      <section className="glass-card p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-400" />
            Monitored Corporate Portals
          </h3>

          {/* Search Box */}
          <div className="glass-card flex items-center px-3 py-1.5 text-xs bg-white/[0.005] w-full sm:w-72">
            <Search className="h-4 w-4 text-gray-500 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search companies..."
              className="bg-transparent border-0 outline-none text-white placeholder-gray-500 w-full"
              value={compSearch}
              onChange={(e) => setCompSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto custom-scrollbar border border-white/5 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#0a071c] text-gray-500 sticky top-0 border-b border-white/5">
              <tr>
                <th className="p-3">Company Name</th>
                <th className="p-3">Target Careers Portal</th>
                <th className="p-3">Sync Status</th>
                <th className="p-3">Last Checked</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-gray-300">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500 italic">No companies matching search criteria.</td>
                </tr>
              ) : (
                filteredCompanies.map((comp) => (
                  <tr key={comp.id} className="hover:bg-white/[0.005]">
                    <td className="p-3 font-semibold text-white">{comp.name}</td>
                    <td className="p-3">
                      <a 
                        href={comp.careersUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 max-w-[250px] truncate"
                      >
                        {comp.careersUrl}
                      </a>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        comp.status === 'success' 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : comp.status === 'failed'
                          ? 'bg-rose-500/10 text-rose-400'
                          : comp.status === 'scraping'
                          ? 'bg-indigo-500/10 text-indigo-400 animate-pulse'
                          : 'bg-white/5 text-gray-400'
                      }`}>
                        {comp.status}
                      </span>
                    </td>
                    <td className="p-3 text-gray-400">
                      {comp.lastScraped 
                        ? new Date(comp.lastScraped).toLocaleString() 
                        : 'Never'
                      }
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleManualScrape(comp.id)}
                        disabled={actionLoading !== null}
                        className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition disabled:opacity-30"
                        title="Trigger Crawl"
                      >
                        {actionLoading === comp.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
