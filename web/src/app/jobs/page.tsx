'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Search, MapPin, Briefcase, Calendar, ChevronLeft, ChevronRight, 
  ExternalLink, Layers, SlidersHorizontal, RefreshCw, X, ShieldAlert
} from 'lucide-react';
import { fetchJobs, fetchJob, fetchCompanies, fetchFilters } from '@/lib/api';
import JobCard from '@/components/JobCard';

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

  return (
    <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Mobile filter toggle and search bar */}
      <div className="flex items-center gap-3 md:hidden mb-4">
        <form onSubmit={(e) => { e.preventDefault(); updateUrl({ search }); }} className="flex-1">
          <div className="glass-card flex items-center px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-gray-500 mr-2" />
            <input
              type="text"
              placeholder="Search keyword..."
              className="bg-transparent border-0 outline-none text-white placeholder-gray-500 flex-1 w-full text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </form>
        
        <button
          onClick={() => setShowMobileFilters(true)}
          className="glass-card p-2 text-gray-400 hover:text-white"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </div>

      {/* Main Grid Layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        
        {/* Left Filters Panel (Desktop) */}
        <aside className="hidden md:block col-span-1 glass-card p-5 sticky top-24 self-start max-h-[85vh] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
            <h2 className="font-bold text-white flex items-center gap-2 text-sm">
              <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
              Filters
            </h2>
            <button 
              onClick={handleResetFilters}
              className="text-xs text-gray-400 hover:text-white transition font-medium"
            >
              Reset All
            </button>
          </div>

          <div className="space-y-4">
            {/* Search keywords */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Keywords</label>
              <div className="glass-card flex items-center px-3 py-2 text-sm bg-white/[0.01]">
                <Search className="h-4 w-4 text-gray-500 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="React, AWS..."
                  className="bg-transparent border-0 outline-none text-white placeholder-gray-500 text-xs w-full"
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
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Company</label>
              <select
                className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                value={selectedCompany}
                onChange={(e) => {
                  setSelectedCompany(e.target.value);
                  setPage(1);
                  updateUrl({ company: e.target.value, page: 1 });
                }}
              >
                <option value="">All Companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* City Select */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">City</label>
              <select
                className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
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
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Workplace Type</label>
              <select
                className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                value={selectedRemote}
                onChange={(e) => {
                  setSelectedRemote(e.target.value);
                  setPage(1);
                  updateUrl({ remoteStatus: e.target.value, page: 1 });
                }}
              >
                <option value="">All Types</option>
                {filterOptions.remoteStatuses.map((rem) => (
                  <option key={rem} value={rem}>{rem}</option>
                ))}
              </select>
            </div>

            {/* Industry Select */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Industry Category</label>
              <select
                className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                value={selectedIndustry}
                onChange={(e) => {
                  setSelectedIndustry(e.target.value);
                  setPage(1);
                  updateUrl({ industry: e.target.value, page: 1 });
                }}
              >
                <option value="">All Industries</option>
                {filterOptions.industries && filterOptions.industries.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            {/* Experience Level Select */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Experience Level</label>
              <select
                className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                value={selectedExp}
                onChange={(e) => {
                  setSelectedExp(e.target.value);
                  setPage(1);
                  updateUrl({ experienceLevel: e.target.value, page: 1 });
                }}
              >
                <option value="">All Levels</option>
                {filterOptions.experienceLevels.map((exp) => (
                  <option key={exp} value={exp}>{exp}</option>
                ))}
              </select>
            </div>

            {/* Employment Type Select */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Employment Type</label>
              <select
                className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
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
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Sort By</label>
              <select
                className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                  updateUrl({ sortBy: e.target.value, page: 1 });
                }}
              >
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest</option>
                <option value="company">Company Name</option>
              </select>
            </div>
          </div>
        </aside>

        {/* Center Job Cards List */}
        <div className="col-span-1 md:col-span-2 space-y-4">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Showing <b>{jobs.length}</b> jobs (Total: {pagination.totalJobs})</span>
            <span className="hidden sm:inline">Page {pagination.page} of {pagination.totalPages}</span>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="glass-card p-6 h-48 animate-pulse bg-white/[0.01]" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="glass-card text-center py-20">
              <Briefcase className="mx-auto h-12 w-12 text-gray-600" />
              <h3 className="mt-4 text-sm font-semibold text-white">No jobs match your search</h3>
              <p className="mt-2 text-xs text-gray-400">Try adjusting your filters or clearing search terms.</p>
              <button 
                onClick={handleResetFilters}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
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
            <div className="flex items-center justify-center gap-2 pt-6 border-t border-white/5">
              <button
                disabled={page <= 1}
                onClick={() => { setPage(page - 1); updateUrl({ page: page - 1 }); }}
                className="glass-card p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              {Array.from({ length: pagination.totalPages }).map((_, idx) => {
                const pNum = idx + 1;
                if (pagination.totalPages > 6 && Math.abs(pNum - page) > 2 && pNum !== 1 && pNum !== pagination.totalPages) {
                  if (pNum === 2 || pNum === pagination.totalPages - 1) {
                    return <span key={idx} className="text-gray-600 px-1 text-xs">...</span>;
                  }
                  return null;
                }
                
                return (
                  <button
                    key={idx}
                    onClick={() => { setPage(pNum); updateUrl({ page: pNum }); }}
                    className={`h-9 w-9 rounded-lg text-xs font-bold transition flex items-center justify-center ${
                      page === pNum
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 border border-indigo-500'
                        : 'glass-card text-gray-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                disabled={page >= pagination.totalPages}
                onClick={() => { setPage(page + 1); updateUrl({ page: page + 1 }); }}
                className="glass-card p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right Sticky Job Details Panel (Desktop) */}
        <aside className="hidden md:block col-span-1 glass-card p-6 sticky top-24 self-start max-h-[85vh] overflow-y-auto custom-scrollbar">
          {detailLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-7 w-2/3 bg-white/5 rounded" />
              <div className="h-4 w-1/3 bg-white/5 rounded" />
              <div className="h-32 bg-white/5 rounded mt-6" />
            </div>
          ) : activeJobDetails ? (
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h2 className="text-xl font-extrabold text-white">{activeJobDetails.title}</h2>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-400">{activeJobDetails.companyName}</span>
                  <span className="text-xs text-gray-500">{activeJobDetails.city}, India</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <a
                  href={activeJobDetails.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 hover:shadow-lg transition"
                >
                  Quick Apply
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                
                <Link
                  href={`/jobs/${activeJobDetails.id}`}
                  className="glass-card px-4 py-2.5 text-xs font-semibold text-gray-200 hover:text-white flex items-center justify-center"
                >
                  Full Page
                </Link>
              </div>

              <div className="border-t border-white/5 pt-4 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 font-medium">Workplace Type</span>
                  <span className="text-gray-300 font-semibold">{activeJobDetails.remoteStatus || 'Onsite'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 font-medium">Experience Level</span>
                  <span className="text-gray-300 font-semibold">{activeJobDetails.experienceLevel || 'Mid level'}</span>
                </div>
                {activeJobDetails.industry && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 font-medium">Industry</span>
                    <span className="text-gray-300 font-semibold">{activeJobDetails.industry}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 font-medium">Employment Type</span>
                  <span className="text-gray-300 font-semibold">{activeJobDetails.employmentType || 'Full-time'}</span>
                </div>
              </div>

              {/* Skills */}
              <div className="border-t border-white/5 pt-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Detected Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {activeJobDetails.skills && activeJobDetails.skills.length > 0 ? (
                    activeJobDetails.skills.map((skill: string, index: number) => (
                      <span 
                        key={index}
                        className="inline-flex items-center rounded bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500 italic">None detected</span>
                  )}
                </div>
              </div>

              {/* Job Description (Verbatim) */}
              <div className="border-t border-white/5 pt-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Job Description</h3>
                <div className="text-xs text-gray-400 leading-relaxed whitespace-pre-line line-clamp-[10]">
                  {activeJobDetails.description}
                </div>
                <Link
                  href={`/jobs/${activeJobDetails.id}`}
                  className="mt-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 block"
                >
                  Read full job description...
                </Link>
              </div>

              {/* Similar Jobs */}
              {similarJobs.length > 0 && (
                <div className="border-t border-white/5 pt-4 space-y-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Other Openings at {activeJobDetails.companyName}</h3>
                  <div className="space-y-2">
                    {similarJobs.map((simJob) => (
                      <div 
                        key={simJob.id}
                        onClick={() => { setActiveJobId(simJob.id); updateUrl({ activeId: simJob.id }); }}
                        className="p-2.5 rounded-lg border border-white/5 hover:border-indigo-500/30 cursor-pointer bg-white/[0.005] hover:bg-white/[0.02] transition"
                      >
                        <h4 className="text-xs font-bold text-gray-200 line-clamp-1">{simJob.title}</h4>
                        <span className="text-[10px] text-gray-500">{simJob.city}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-24 text-gray-500 text-xs">
              Select a job from the list to view complete details.
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Filters Overlay */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-80 h-full bg-[#0a071c] p-6 shadow-xl overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                <h2 className="font-bold text-white flex items-center gap-2 text-sm">
                  <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
                  Filters
                </h2>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-gray-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Search keywords */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Keywords</label>
                  <div className="glass-card flex items-center px-3 py-2 text-sm bg-white/[0.01]">
                    <Search className="h-4 w-4 text-gray-500 mr-2 shrink-0" />
                    <input
                      type="text"
                      placeholder="React, AWS..."
                      className="bg-transparent border-0 outline-none text-white placeholder-gray-500 text-xs w-full"
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
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Company</label>
                  <select
                    className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                    value={selectedCompany}
                    onChange={(e) => {
                      setSelectedCompany(e.target.value);
                      setPage(1);
                      updateUrl({ company: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Companies</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* City Select */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">City</label>
                  <select
                    className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
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
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Workplace Type</label>
                  <select
                    className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                    value={selectedRemote}
                    onChange={(e) => {
                      setSelectedRemote(e.target.value);
                      setPage(1);
                      updateUrl({ remoteStatus: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Types</option>
                    {filterOptions.remoteStatuses.map((rem) => (
                      <option key={rem} value={rem}>{rem}</option>
                    ))}
                  </select>
                </div>

                {/* Industry Category select (Mobile) */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Industry Category</label>
                  <select
                    className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                    value={selectedIndustry}
                    onChange={(e) => {
                      setSelectedIndustry(e.target.value);
                      setPage(1);
                      updateUrl({ industry: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Industries</option>
                    {filterOptions.industries && filterOptions.industries.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>

                {/* Experience Level */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Experience Level</label>
                  <select
                    className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                    value={selectedExp}
                    onChange={(e) => {
                      setSelectedExp(e.target.value);
                      setPage(1);
                      updateUrl({ experienceLevel: e.target.value, page: 1 });
                    }}
                  >
                    <option value="">All Levels</option>
                    {filterOptions.experienceLevels.map((exp) => (
                      <option key={exp} value={exp}>{exp}</option>
                    ))}
                  </select>
                </div>

                {/* Employment Type */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Employment Type</label>
                  <select
                    className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
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
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Sort By</label>
                  <select
                    className="w-full glass-card bg-[#0a071c] text-white px-3 py-2 text-xs outline-none border-white/5 border"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(1);
                      updateUrl({ sortBy: e.target.value, page: 1 });
                    }}
                  >
                    <option value="recent">Most Recent</option>
                    <option value="oldest">Oldest</option>
                    <option value="company">Company Name</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3 pt-6 border-t border-white/5">
              <button
                onClick={handleResetFilters}
                className="flex-1 glass-card py-2 text-xs font-bold text-gray-300 hover:text-white"
              >
                Reset
              </button>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-500"
              >
                Apply Filters
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
        <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
      </div>
    }>
      <JobsContent />
    </Suspense>
  );
}
