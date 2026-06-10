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
        <RefreshCw className="h-6 w-6 text-[#D16A4A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto py-8 space-y-8 animate-slide-up text-left">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#E5E1D8] pb-5">
        <div>
          <h1 className="text-xl font-editorial-serif font-black text-[#161616] uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[#D16A4A]" />
            Control Center Dashboard
          </h1>
          <p className="text-[9px] font-bold text-[#7A8471] uppercase tracking-wider mt-1">Deploy automated configs and monitor crawler nodes status.</p>
        </div>

        <button
          onClick={handleTriggerQueue}
          disabled={actionLoading !== null}
          className="inline-flex items-center gap-2 bg-[#161616] text-[#F7F4EE] hover:bg-[#D16A4A] px-4 py-2 text-xs font-bold transition disabled:opacity-50 uppercase tracking-widest"
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
        <div className="p-3.5 border border-[#E5E1D8] bg-[#FCFAF7] text-[#D16A4A] text-xs flex items-center justify-between font-bold uppercase tracking-wider">
          <span>{globalScrapingMsg}</span>
          <button onClick={() => setGlobalScrapingMsg(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grid of Stats Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#7A8471] font-bold uppercase tracking-widest">Monitored GCCs</span>
            <Building2 className="h-4 w-4 text-[#7A8471]" />
          </div>
          <p className="mt-2 text-2xl font-editorial-serif font-black text-[#161616]">{totalCompanies}</p>
        </div>

        <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#7A8471] font-bold uppercase tracking-widest">Successful Crawls</span>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-editorial-serif font-black text-emerald-700">{successCount}</p>
        </div>

        <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#7A8471] font-bold uppercase tracking-widest">Failed Crawls</span>
            <AlertTriangle className="h-4 w-4 text-[#D16A4A]" />
          </div>
          <p className="mt-2 text-2xl font-editorial-serif font-black text-[#D16A4A]">{failedCount}</p>
        </div>

        <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#7A8471] font-bold uppercase tracking-widest">Scraping Queue</span>
            <RefreshCw className="h-4 w-4 text-[#BCA37F] animate-spin" />
          </div>
          <p className="mt-2 text-2xl font-editorial-serif font-black text-[#BCA37F]">{scrapingCount}</p>
        </div>
      </div>

      {/* Upload Zone & Logs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Upload Excel Dropzone */}
        <section className="lg:col-span-1 border border-[#E5E1D8] bg-[#FCFAF7] p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-[10px] font-bold text-[#161616] uppercase tracking-widest mb-2 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#D16A4A]" />
              Import Companies
            </h3>
            <p className="text-[10px] text-[#7A8471] leading-relaxed mb-4">
              Add new Global Capability Centers by uploading a spreadsheet. Required headers: <b>Company</b> and <b>Actual Job Listing</b>.
            </p>

            {/* Dropzone container */}
            <div className="relative border border-dashed border-[#E5E1D8] hover:border-[#161616] p-6 text-center cursor-pointer bg-[#F7F4EE] transition">
              <input
                type="file"
                accept=".xlsx, .xls"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleExcelUpload}
                disabled={uploading}
              />
              
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 border border-[#E5E1D8] bg-[#FCFAF7] text-[#7A8471] flex items-center justify-center">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block">
                    {uploading ? 'Parsing File...' : 'Choose or Drag Spreadsheet'}
                  </span>
                  <span className="text-[8px] text-[#7A8471] block mt-1">Excel formats only (.xlsx, .xls)</span>
                </div>
              </div>
            </div>
          </div>

          {uploadMsg && (
            <div className={`mt-4 p-3 border text-[10px] leading-relaxed font-bold uppercase tracking-wider ${
              uploadMsg.type === 'success' 
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700' 
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              {uploadMsg.text}
            </div>
          )}
        </section>

        {/* Crawl Run Logs */}
        <section className="lg:col-span-2 border border-[#E5E1D8] bg-[#FCFAF7] p-6">
          <h3 className="text-[10px] font-bold text-[#161616] uppercase tracking-widest mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#D16A4A]" />
            Recent Scrape Logs
          </h3>

          <div className="max-h-[300px] overflow-y-auto custom-scrollbar border border-[#E5E1D8]">
            <table className="w-full text-left border-collapse text-[10px] uppercase font-bold tracking-wider">
              <thead className="bg-[#F7F4EE] text-[#7A8471] sticky top-0 border-b border-[#E5E1D8]">
                <tr>
                  <th className="p-3">Company</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Jobs Found</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E1D8]/60 text-[#161616]">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[#7A8471] italic">No logs recorded. Run the crawler.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F7F4EE]/30">
                      <td className="p-3 font-semibold">{log.companyName}</td>
                      <td className="p-3">
                        <span className={`font-bold ${
                          log.status === 'success' 
                            ? 'text-emerald-700' 
                            : 'text-[#D16A4A]'
                        }`}>
                          {log.status}
                        </span>
                        {log.errors && (
                          <span className="text-[8px] text-red-600/70 block mt-0.5 max-w-[200px] truncate" title={log.errors}>
                            {log.errors}
                          </span>
                        )}
                      </td>
                      <td className="p-3">{log.jobsFound || 0}</td>
                      <td className="p-3 text-[#7A8471]">{(log.executionTime / 1000).toFixed(1)}s</td>
                      <td className="p-3 text-[#7A8471]">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Company Directory Section */}
      <section className="border border-[#E5E1D8] bg-[#FCFAF7] p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h3 className="text-[10px] font-bold text-[#161616] uppercase tracking-widest flex items-center gap-2">
            <Database className="h-4 w-4 text-[#D16A4A]" />
            Monitored Corporate Portals
          </h3>

          {/* Search Box */}
          <div className="w-full sm:w-72 flex items-center border-b border-[#161616] pb-1">
            <Search className="h-4 w-4 text-[#7A8471] mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search companies..."
              className="bg-transparent border-0 outline-none text-[#161616] placeholder-[#7A8471] w-full text-xs font-bold uppercase tracking-wider"
              value={compSearch}
              onChange={(e) => setCompSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto custom-scrollbar border border-[#E5E1D8]">
          <table className="w-full text-left border-collapse text-[10px] uppercase font-bold tracking-wider">
            <thead className="bg-[#F7F4EE] text-[#7A8471] sticky top-0 border-b border-[#E5E1D8]">
              <tr>
                <th className="p-3">Company Name</th>
                <th className="p-3">Target Careers Portal</th>
                <th className="p-3">Sync Status</th>
                <th className="p-3">Last Checked</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E1D8]/60 text-[#161616]">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[#7A8471] italic">No companies matching search criteria.</td>
                </tr>
              ) : (
                filteredCompanies.map((comp) => (
                  <tr key={comp.id} className="hover:bg-[#F7F4EE]/30">
                    <td className="p-3 font-semibold">{comp.name}</td>
                    <td className="p-3">
                      <a 
                        href={comp.careersUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[#D16A4A] hover:underline inline-flex items-center gap-1 max-w-[250px] truncate"
                      >
                        {comp.careersUrl}
                      </a>
                    </td>
                    <td className="p-3">
                      <span className={`font-bold ${
                        comp.status === 'success' 
                          ? 'text-emerald-700' 
                          : comp.status === 'failed'
                          ? 'text-[#D16A4A]'
                          : comp.status === 'scraping'
                          ? 'text-[#BCA37F] animate-pulse'
                          : 'text-[#7A8471]'
                      }`}>
                        {comp.status}
                      </span>
                    </td>
                    <td className="p-3 text-[#7A8471]">
                      {comp.lastScraped 
                        ? new Date(comp.lastScraped).toLocaleString() 
                        : 'Never'
                      }
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleManualScrape(comp.id)}
                        disabled={actionLoading !== null}
                        className="p-1.5 border border-[#E5E1D8] bg-[#F7F4EE] hover:border-[#161616] text-[#7A8471] hover:text-[#161616] transition disabled:opacity-30"
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
