'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Search, MapPin, Briefcase, Calendar, ChevronLeft, ChevronRight, 
  ExternalLink, SlidersHorizontal, RefreshCw, X, ShieldAlert, Cpu, Layers, Bookmark
} from 'lucide-react';
import { fetchJobs, fetchJob, fetchCompanies, fetchFilters } from '@/lib/api';
import JobCard from '@/components/JobCard';
import ExportButton from '@/components/ExportButton';

function JobsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Search & Filter state
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [selectedCompany, setSelectedCompany] = useState(searchParams.get('company') || '');
  const [selectedCity, setSelectedCity] = useState(searchParams.get('city') || '');
  const [selectedExp, setSelectedExp] = useState(searchParams.get('experienceLevel') || '');
  const [selectedType, setSelectedType] = useState(searchParams.get('employmentType') || '');
  const [selectedRemote, setSelectedRemote] = useState(searchParams.get('remoteStatus') || '');
  const [selectedIndustry, setSelectedIndustry] = useState(searchParams.get('industry') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'recent');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));

  // Lists populated from API
  const [companies, setCompanies] = useState<any[]>([]);
  const [filterOptions, setFilterOptions] = useState<{
    cities: string[];
    departments: string[];
    employmentTypes: string[];
    experienceLevels: string[];
    remoteStatuses: string[];
    industries: string[];
  }>({
    cities: [],
    departments: [],
    employmentTypes: [],
    experienceLevels: [],
    remoteStatuses: [],
    industries: []
  });

  // Jobs listing states
  const [jobs, setJobs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalJobs: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Active Selected Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(searchParams.get('activeId') || null);
  const [activeJobDetails, setActiveJobDetails] = useState<any | null>(null);
  const [similarJobs, setSimilarJobs] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Saved Jobs State
  const [savedJobs, setSavedJobs] = useState<any[]>([]);

  // UI state
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Load companies & dynamic filter options on mount
  useEffect(() => {
    async function loadFilters() {
      try {
        const compData = await fetchCompanies();
        const filtData = await fetchFilters();
        setCompanies(compData);
        setFilterOptions(filtData);
      } catch (e) {
        console.error('Failed to load filter options:', e);
      }
    }
    loadFilters();

    // Load saved jobs from local storage
    const stored = localStorage.getItem('saved_jobs');
    if (stored) {
      try {
        setSavedJobs(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Fetch jobs when query changes
  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      try {
        const res = await fetchJobs({
          page,
          limit: 10,
          company: selectedCompany,
          city: selectedCity,
          experienceLevel: selectedExp,
          employmentType: selectedType,
          remoteStatus: selectedRemote,
          industry: selectedIndustry,
          search,
          sortBy
        });

        setJobs(res.jobs || []);
        setPagination(res.pagination || { page: 1, limit: 10, totalJobs: 0, totalPages: 1 });
        
        // Auto select first job in list if activeJobId is not set
        if (res.jobs && res.jobs.length > 0 && !activeJobId) {
          setActiveJobId(res.jobs[0].id);
        }
      } catch (e) {
        console.error('Failed to query jobs:', e);
      } finally {
        setLoading(false);
      }
    }

    loadJobs();
  }, [page, selectedCompany, selectedCity, selectedExp, selectedType, selectedRemote, selectedIndustry, sortBy, search]);

  // Fetch individual job details when activeJobId changes
  useEffect(() => {
    async function loadDetails() {
      if (!activeJobId) {
        setActiveJobDetails(null);
        setSimilarJobs([]);
        return;
      }
      setDetailLoading(true);
      try {
        const res = await fetchJob(activeJobId);
        setActiveJobDetails(res.job);
        setSimilarJobs(res.similarJobs || []);
      } catch (e) {
        console.error('Failed to load job details:', e);
      } finally {
        setDetailLoading(false);
      }
    }
    loadDetails();
  }, [activeJobId]);

  // Handle URL Sync
  const updateUrl = (newParams: any) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([key, val]) => {
      if (val === null || val === undefined || val === '') {
        params.delete(key);
      } else {
        params.set(key, val.toString());
      }
    });
    router.replace(`/jobs?${params.toString()}`);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCompany('');
    setSelectedCity('');
    setSelectedExp('');
    setSelectedType('');
    setSelectedRemote('');
    setSelectedIndustry('');
    setSortBy('recent');
    setPage(1);
    updateUrl({
      search: '',
      company: '',
      city: '',
      experienceLevel: '',
      employmentType: '',
      remoteStatus: '',
      industry: '',
      sortBy: 'recent',
      page: 1
    });
  };

  // Saved job toggle handler
  const handleToggleSave = () => {
    if (!activeJobDetails) return;
    const isSaved = savedJobs.some(j => j.id === activeJobDetails.id);
    let updated = [];
    if (isSaved) {
      updated = savedJobs.filter(j => j.id !== activeJobDetails.id);
    } else {
      updated = [...savedJobs, { 
        id: activeJobDetails.id, 
        title: activeJobDetails.title, 
        companyName: activeJobDetails.companyName 
      }];
    }
    setSavedJobs(updated);
    localStorage.setItem('saved_jobs', JSON.stringify(updated));
  };

  const isCurrentJobSaved = activeJobDetails && savedJobs.some(j => j.id === activeJobDetails.id);

  return (
    <div className="flex-1 flex flex-col pt-6 text-left">
      
      {/* Mobile filters toggler */}
      <div className="flex items-center gap-3 md:hidden mb-4">
        <form onSubmit={(e) => { e.preventDefault(); updateUrl({ search }); }} className="flex-1">
          <div className="border border-[#E5E1D8] bg-[#FCFAF7] flex items-center px-3 py-2 text-xs">
            <Search className="h-4 w-4 text-[#7A8471] mr-2" />
            <input
              type="text"
              placeholder="Search catalog..."
              className="bg-transparent border-0 outline-none text-[#161616] placeholder-[#7A8471] flex-1 w-full text-xs font-bold uppercase tracking-wider"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </form>
        
        <button
          onClick={() => setShowMobileFilters(true)}
          className="border border-[#E5E1D8] bg-[#FCFAF7] p-2.5 text-[#7A8471] hover:text-[#161616]"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Main Grid Layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* Left Filters Panel (Desktop) */}
        <aside className="hidden md:block md:col-span-3 border border-[#E5E1D8] bg-[#FCFAF7] p-5 sticky top-24 self-start max-h-[82vh] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-3 mb-4">
            <h2 className="font-sans text-[10px] font-black tracking-widest uppercase text-[#161616] flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#D16A4A]" />
              Filter Index
            </h2>
            <button 
              onClick={handleResetFilters}
              className="text-[9px] uppercase tracking-widest text-[#D16A4A] hover:underline font-bold transition-colors"
            >
              Reset
            </button>
          </div>

          <div className="space-y-4">
            {/* Search keywords */}
            <div>
              <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1">Keywords</label>
              <div className="flex items-center border border-[#E5E1D8] bg-[#F7F4EE] px-2.5 py-1.5 text-xs focus-within:border-[#D16A4A] transition-all">
                <Search className="h-3.5 w-3.5 text-[#7A8471] mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Skill, stack, role..."
                  className="bg-transparent border-0 outline-none text-[#161616] placeholder-[#7A8471] text-xs w-full"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                    updateUrl({ search: e.target.value, page: 1 });
                  }}
                />
              </div>
            </div>

            {/* Company Select */}
            <div>
              <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1">GCC Enterprise</label>
              <select
                className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-[#161616] px-2 py-1.5 text-xs outline-none focus:border-[#D16A4A] font-bold uppercase tracking-wider"
                value={selectedCompany}
                onChange={(e) => {
                  setSelectedCompany(e.target.value);
                  setPage(1);
                  updateUrl({ company: e.target.value, page: 1 });
                }}
              >
                <option value="">All Corporations</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* City Select */}
            <div>
              <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1">Metropolitan area</label>
              <select
                className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-[#161616] px-2 py-1.5 text-xs outline-none focus:border-[#D16A4A] font-bold uppercase tracking-wider"
                value={selectedCity}
                onChange={(e) => {
                  setSelectedCity(e.target.value);
                  setPage(1);
                  updateUrl({ city: e.target.value, page: 1 });
                }}
              >
                <option value="">All Cities</option>
                {filterOptions.cities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>

            {/* Workplace Type Select */}
            <div>
              <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1">Deployment style</label>
              <select
                className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-[#161616] px-2 py-1.5 text-xs outline-none focus:border-[#D16A4A] font-bold uppercase tracking-wider"
                value={selectedRemote}
                onChange={(e) => {
                  setSelectedRemote(e.target.value);
                  setPage(1);
                  updateUrl({ remoteStatus: e.target.value, page: 1 });
                }}
              >
                <option value="">All Styles</option>
                {filterOptions.remoteStatuses.map((rem) => (
                  <option key={rem} value={rem}>{rem}</option>
                ))}
              </select>
            </div>

            {/* Industry Select */}
            <div>
              <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1">Division</label>
              <select
                className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-[#161616] px-2 py-1.5 text-xs outline-none focus:border-[#D16A4A] font-bold uppercase tracking-wider"
                value={selectedIndustry}
                onChange={(e) => {
                  setSelectedIndustry(e.target.value);
                  setPage(1);
                  updateUrl({ industry: e.target.value, page: 1 });
                }}
              >
                <option value="">All Divisions</option>
                {filterOptions.industries && filterOptions.industries.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            {/* Experience Level Select */}
            <div>
              <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1">Experience Bracket</label>
              <select
                className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-[#161616] px-2 py-1.5 text-xs outline-none focus:border-[#D16A4A] font-bold uppercase tracking-wider"
                value={selectedExp}
                onChange={(e) => {
                  setSelectedExp(e.target.value);
                  setPage(1);
                  updateUrl({ experienceLevel: e.target.value, page: 1 });
                }}
              >
                <option value="">All Brackets</option>
                {filterOptions.experienceLevels.map((exp) => (
                  <option key={exp} value={exp}>{exp}</option>
                ))}
              </select>
            </div>

            {/* Employment Type Select */}
            <div>
              <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1">Commitment style</label>
              <select
                className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-[#161616] px-2 py-1.5 text-xs outline-none focus:border-[#D16A4A] font-bold uppercase tracking-wider"
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setPage(1);
                  updateUrl({ employmentType: e.target.value, page: 1 });
                }}
              >
                <option value="">All Commitments</option>
                {filterOptions.employmentTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Sorting */}
            <div>
              <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1">Order by</label>
              <select
                className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-[#161616] px-2 py-1.5 text-xs outline-none focus:border-[#D16A4A] font-bold uppercase tracking-wider"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                  updateUrl({ sortBy: e.target.value, page: 1 });
                }}
              >
                <option value="recent">Index Recency</option>
                <option value="oldest">Indexer Age</option>
                <option value="company">Corporate A-Z</option>
              </select>
            </div>

            {/* Saved Jobs Checklist */}
            <div className="border-t border-[#E5E1D8] pt-4 mt-4 text-left">
              <h3 className="text-[9px] font-black text-[#161616] uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                <Bookmark className="h-3 w-3 text-[#D16A4A]" />
                Saved coordinates
              </h3>
              {savedJobs.length === 0 ? (
                <span className="text-[9px] text-[#7A8471] uppercase tracking-wider italic font-bold">Cache empty</span>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                  {savedJobs.map((sj) => (
                    <div 
                      key={sj.id} 
                      onClick={() => { setActiveJobId(sj.id); updateUrl({ activeId: sj.id }); }}
                      className={`flex items-center justify-between text-[10px] cursor-pointer py-1 border-b border-[#E5E1D8]/60 transition-colors ${
                        activeJobId === sj.id ? 'text-[#D16A4A] font-black' : 'text-[#7A8471] hover:text-[#161616]'
                      }`}
                    >
                      <span className="truncate max-w-[130px] font-medium">{sj.title}</span>
                      <span className="text-[8px] text-[#7A8471] font-bold shrink-0 uppercase tracking-widest">{sj.companyName.charAt(0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </aside>

        {/* Center Job Cards List */}
        <div className="col-span-1 md:col-span-5 space-y-4">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-[#7A8471] mb-1 font-bold">
            <span>Indexed <b>{jobs.length}</b> nodes (Total: {pagination.totalJobs})</span>
            <div className="flex items-center gap-4">
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <ExportButton filters={{ experienceLevel: selectedExp, division: selectedIndustry }} />
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="border border-[#E5E1D8] bg-[#FCFAF7] h-32 shimmer" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="border border-[#E5E1D8] bg-[#FCFAF7] text-center py-16">
              <Briefcase className="mx-auto h-8 w-8 text-[#7A8471]" />
              <h3 className="mt-3 text-[10px] font-bold text-[#161616] uppercase tracking-widest">No matching registry</h3>
              <p className="mt-1 text-[9px] text-[#7A8471] uppercase tracking-wider">Reset search filters to calibrate.</p>
              <button 
                onClick={handleResetFilters}
                className="mt-5 inline-flex items-center border border-[#161616] hover:bg-[#161616] hover:text-[#F7F4EE] px-3.5 py-2 text-[8px] font-bold uppercase tracking-widest text-[#161616] transition-all"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {jobs.map((job) => (
                <JobCard 
                  key={job.id} 
                  job={job}
                  isActive={activeJobId === job.id}
                  onClick={() => {
                    setActiveJobId(job.id);
                    updateUrl({ activeId: job.id });
                  }}
                />
              ))}
            </div>
          )}

          {/* Numbered Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-4 border-t border-[#E5E1D8]">
              <button
                disabled={page <= 1}
                onClick={() => { setPage(page - 1); updateUrl({ page: page - 1 }); }}
                className="border border-[#E5E1D8] bg-[#FCFAF7] p-2 text-[#7A8471] hover:text-[#161616] disabled:opacity-20 disabled:pointer-events-none transition-all"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              
              {Array.from({ length: pagination.totalPages }).map((_, idx) => {
                const pNum = idx + 1;
                if (pagination.totalPages > 6 && Math.abs(pNum - page) > 2 && pNum !== 1 && pNum !== pagination.totalPages) {
                  if (pNum === 2 || pNum === pagination.totalPages - 1) {
                    return <span key={idx} className="text-[#7A8471] px-1 text-[9px] font-bold">...</span>;
                  }
                  return null;
                }
                
                return (
                  <button
                    key={idx}
                    onClick={() => { setPage(pNum); updateUrl({ page: pNum }); }}
                    className={`h-7 w-7 text-[9px] font-bold transition-all flex items-center justify-center ${
                      page === pNum
                        ? 'border border-[#161616] bg-[#161616] text-[#F7F4EE]'
                        : 'border border-[#E5E1D8] bg-[#FCFAF7] text-[#7A8471] hover:text-[#161616] hover:border-[#161616]'
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                disabled={page >= pagination.totalPages}
                onClick={() => { setPage(page + 1); updateUrl({ page: page + 1 }); }}
                className="border border-[#E5E1D8] bg-[#FCFAF7] p-2 text-[#7A8471] hover:text-[#161616] disabled:opacity-20 disabled:pointer-events-none transition-all"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right Sticky Job Details Panel (Desktop) */}
        <aside className="hidden md:block md:col-span-4 border border-[#E5E1D8] bg-[#FCFAF7] p-6 sticky top-24 self-start max-h-[82vh] overflow-y-auto custom-scrollbar">
          {detailLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-5 w-2/3 bg-gray-200 rounded" />
              <div className="h-3 w-1/3 bg-gray-200 rounded" />
              <div className="h-28 bg-gray-200 rounded mt-6" />
            </div>
          ) : activeJobDetails ? (
            <div className="space-y-5 text-left">
              {/* Header */}
              <div>
                <span className="text-[8px] font-black tracking-widest text-[#D16A4A] uppercase block mb-2">
                  TELEMETRY REPORT ACTIVE // MATCH MAPPING
                </span>
                
                <h2 className="font-editorial-serif text-lg font-black text-[#161616] leading-tight uppercase tracking-tight">
                  {activeJobDetails.title}
                </h2>
                <div className="mt-2 flex items-center justify-between border-b border-[#E5E1D8] pb-3">
                  <span className="text-[11px] font-black uppercase text-[#161616]">{activeJobDetails.companyName}</span>
                  <span className="text-[9px] font-bold text-[#7A8471] tracking-wider uppercase">{activeJobDetails.city}, India</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <a
                  href={activeJobDetails.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex justify-center items-center gap-1 bg-[#161616] text-[#F7F4EE] hover:bg-[#D16A4A] px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest transition-all"
                >
                  [ Apply Direct ]
                </a>
                
                <button
                  onClick={handleToggleSave}
                  className="border border-[#E5E1D8] bg-[#FCFAF7] hover:border-[#161616] px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-[#7A8471] hover:text-[#161616] transition-colors"
                >
                  {isCurrentJobSaved ? 'Unsave Node' : 'Save Node'}
                </button>
              </div>

              {/* Persona Analysis Module */}
              <div className="border border-[#E5E1D8] bg-[#F7F4EE] p-4 space-y-2.5 text-[9px] tracking-widest uppercase font-bold text-[#7A8471]">
                <h4 className="text-[8px] font-black text-[#D16A4A] uppercase tracking-widest border-b border-[#E5E1D8] pb-1.5 mb-1 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-[#D16A4A]" />
                  Ideal Candidate Persona
                </h4>
                <div className="flex justify-between border-b border-[#E5E1D8]/60 pb-1.5">
                  <span className="text-[#7A8471] font-semibold">Experience Tier</span>
                  <span className="text-[#161616]">{activeJobDetails.experienceLevel || 'Mid Level'} ({activeJobDetails.yearsExperience || '0-2'} yrs)</span>
                </div>
                <div className="flex justify-between border-b border-[#E5E1D8]/60 pb-1.5">
                  <span className="text-[#7A8471] font-semibold">Deployment model</span>
                  <span className="text-[#161616]">{activeJobDetails.remoteStatus || 'Onsite'}</span>
                </div>
                {activeJobDetails.industry && (
                  <div className="flex justify-between border-b border-[#E5E1D8]/60 pb-1.5">
                    <span className="text-[#7A8471] font-semibold">Division</span>
                    <span className="text-[#161616] text-right truncate max-w-[150px]">{activeJobDetails.industry}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#7A8471] font-semibold">Telemetry Source</span>
                  <span className="text-[#7A8471] font-black">
                    VERIFIED DIRECT PORTAL
                  </span>
                </div>
              </div>

              {/* Skills */}
              <div className="border-t border-[#E5E1D8] pt-3">
                <h3 className="text-[9px] font-black text-[#7A8471] uppercase tracking-widest mb-2">Parsed Skills Core</h3>
                <div className="flex flex-wrap gap-1">
                  {activeJobDetails.skills && activeJobDetails.skills.length > 0 ? (
                    activeJobDetails.skills.map((skill: string, index: number) => (
                      <span 
                        key={index}
                        className="inline-block border border-[#E5E1D8] bg-[#F7F4EE] px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-[#7A8471]"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-[8px] text-[#7A8471] italic uppercase">None detected</span>
                  )}
                </div>
              </div>

              {/* Job Description */}
              <div className="border-t border-[#E5E1D8] pt-3">
                <h3 className="text-[9px] font-black text-[#7A8471] uppercase tracking-widest mb-2">Job Description</h3>
                <div className="text-[11px] text-[#161616] leading-relaxed whitespace-pre-line line-clamp-[10] font-normal uppercase tracking-wide normal-case">
                  {activeJobDetails.description}
                </div>
                <Link
                  href={`/jobs/${activeJobDetails.id}`}
                  className="mt-2.5 text-[9px] font-black text-[#D16A4A] hover:text-[#161616] block uppercase tracking-widest underline underline-offset-2"
                >
                  Inspect complete node...
                </Link>
              </div>

              {/* Similar Jobs */}
              {similarJobs.length > 0 && (
                <div className="border-t border-[#E5E1D8] pt-3 space-y-2.5">
                  <h3 className="text-[9px] font-black text-[#7A8471] uppercase tracking-widest">Co-occurring listings</h3>
                  <div className="space-y-2">
                    {similarJobs.map((simJob) => (
                      <div 
                        key={simJob.id}
                        onClick={() => { setActiveJobId(simJob.id); updateUrl({ activeId: simJob.id }); }}
                        className="p-3 border border-[#E5E1D8] hover:border-[#161616] cursor-pointer bg-[#FCFAF7] transition-all"
                      >
                        <h4 className="text-[10px] font-bold text-[#161616] line-clamp-1 uppercase tracking-wider">{simJob.title}</h4>
                        <span className="text-[8px] text-[#7A8471] tracking-widest uppercase font-bold">{simJob.city}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-[#7A8471] text-[9px] uppercase tracking-widest font-black">
              Select coordinates.
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Filters Overlay */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-80 h-full bg-[#F7F4EE] p-5 shadow-xl overflow-y-auto flex flex-col justify-between border-l border-[#E5E1D8]">
            <div>
              <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-3 mb-4">
                <h2 className="font-bold text-[#161616] flex items-center gap-2 text-xs uppercase tracking-wider">
                  <SlidersHorizontal className="h-4 w-4 text-[#D16A4A]" />
                  Filters
                </h2>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="p-1 text-[#7A8471] hover:text-black"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Search keywords */}
                <div>
                  <label className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block mb-1.5">Keywords</label>
                  <div className="flex items-center border border-[#E5E1D8] bg-[#FCFAF7] px-2.5 py-1.5 text-xs">
                    <Search className="h-4 w-4 text-[#7A8471] mr-2 shrink-0" />
                    <input
                      type="text"
                      placeholder="React, AWS..."
                      className="bg-transparent border-0 outline-none text-[#161616] placeholder-[#7A8471] text-xs w-full"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                        updateUrl({ search: e.target.value, page: 1 });
                      }}
                    />
                  </div>
                </div>

                {/* Company Select */}
                <div>
                  <label className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block mb-1.5">GCC Company</label>
                  <select
                    className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-black px-2.5 py-1.5 text-xs outline-none"
                    value={selectedCompany}
                    onChange={(e) => {
                      setSelectedCompany(e.target.value);
                      setPage(1);
                      updateUrl({ company: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All GCCs</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* City Select */}
                <div>
                  <label className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block mb-1.5">Metropolitan Hub</label>
                  <select
                    className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-black px-2.5 py-1.5 text-xs outline-none"
                    value={selectedCity}
                    onChange={(e) => {
                      setSelectedCity(e.target.value);
                      setPage(1);
                      updateUrl({ city: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Cities</option>
                    {filterOptions.cities.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>

                {/* Workplace Type */}
                <div>
                  <label className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block mb-1.5">Workplace Style</label>
                  <select
                    className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-black px-2.5 py-1.5 text-xs outline-none"
                    value={selectedRemote}
                    onChange={(e) => {
                      setSelectedRemote(e.target.value);
                      setPage(1);
                      updateUrl({ remoteStatus: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Styles</option>
                    {filterOptions.remoteStatuses.map((rem) => (
                      <option key={rem} value={rem}>{rem}</option>
                    ))}
                  </select>
                </div>

                {/* Industry Category */}
                <div>
                  <label className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block mb-1.5">Division</label>
                  <select
                    className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-black px-2.5 py-1.5 text-xs outline-none"
                    value={selectedIndustry}
                    onChange={(e) => {
                      setSelectedIndustry(e.target.value);
                      setPage(1);
                      updateUrl({ industry: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Divisions</option>
                    {filterOptions.industries && filterOptions.industries.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>

                {/* Experience Tier */}
                <div>
                  <label className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block mb-1.5">Experience Bracket</label>
                  <select
                    className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-black px-2.5 py-1.5 text-xs outline-none"
                    value={selectedExp}
                    onChange={(e) => {
                      setSelectedExp(e.target.value);
                      setPage(1);
                      updateUrl({ experienceLevel: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Brackets</option>
                    {filterOptions.experienceLevels.map((exp) => (
                      <option key={exp} value={exp}>{exp}</option>
                    ))}
                  </select>
                </div>

                {/* Employment Type */}
                <div>
                  <label className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block mb-1.5">Commitment Style</label>
                  <select
                    className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-black px-2.5 py-1.5 text-xs outline-none"
                    value={selectedType}
                    onChange={(e) => {
                      setSelectedType(e.target.value);
                      setPage(1);
                      updateUrl({ employmentType: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Commitments</option>
                    {filterOptions.employmentTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Sorting */}
                <div>
                  <label className="text-[9px] font-bold text-[#161616] uppercase tracking-widest block mb-1.5">Sort Parameter</label>
                  <select
                    className="w-full border border-[#E5E1D8] bg-[#FCFAF7] text-black px-2.5 py-1.5 text-xs outline-none"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(1);
                      updateUrl({ sortBy: e.target.value, page: 1 });
                    }}
                  >
                    <option value="recent">Index Recency</option>
                    <option value="oldest">Indexer Age</option>
                    <option value="company">Corporate A-Z</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3 pt-6 border-t border-[#E5E1D8]">
              <button
                onClick={handleResetFilters}
                className="flex-1 border border-[#E5E1D8] bg-[#FCFAF7] py-2 text-xs font-bold uppercase tracking-wider text-[#7A8471]"
              >
                Reset
              </button>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 bg-[#161616] text-[#F7F4EE] py-2 text-xs font-bold uppercase tracking-wider"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-[#D16A4A] animate-spin" />
      </div>
    }>
      <JobsContent />
    </Suspense>
  );
}
