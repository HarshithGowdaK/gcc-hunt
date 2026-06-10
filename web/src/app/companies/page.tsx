'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Compass, ArrowUpRight } from 'lucide-react';
import { fetchCompanies, fetchJobs } from '@/lib/api';

export default function CompaniesDirectory() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDirectoryData() {
      try {
        const compData = await fetchCompanies();
        const jobsRes = await fetchJobs({ limit: 10000 });
        
        // Count positions per company
        const counts: Record<string, number> = {};
        if (jobsRes.jobs) {
          jobsRes.jobs.forEach((j: any) => {
            counts[j.companyId] = (counts[j.companyId] || 0) + 1;
          });
        }
        
        setCompanies(compData);
        setJobCounts(counts);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadDirectoryData();
  }, []);

  const filtered = companies.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Group companies alphabetically
  const groupedCompanies: Record<string, any[]> = {};
  filtered
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((comp) => {
      const firstLetter = comp.name.charAt(0).toUpperCase();
      const key = /^[A-Z]$/.test(firstLetter) ? firstLetter : '#';
      if (!groupedCompanies[key]) {
        groupedCompanies[key] = [];
      }
      groupedCompanies[key].push(comp);
    });

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

  return (
    <div className="flex-1 flex flex-col pt-10 animate-slide-up text-left">
      
      {/* Header */}
      <div className="border-b border-[#E5E1D8] pb-6 mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D16A4A]/20 bg-[#F7F4EE] px-3.5 py-1 text-[9px] font-bold tracking-widest uppercase text-[#D16A4A]">
          <Compass className="h-3 w-3" />
          VERIFIED CORPORATE REGISTRIES
        </span>
        <h1 className="mt-3 font-editorial-serif text-3xl sm:text-4xl font-black tracking-tight text-[#161616] uppercase">
          GCC Directory Index
        </h1>
        <p className="mt-1.5 text-[9.5px] text-[#7A8471] uppercase tracking-widest font-bold">
          An alphabetical catalog mapping active telemetry scrapers and verified portals.
        </p>
      </div>

      {/* Control panel: Search + Quick Alphabet Jumper */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-center mb-8 pb-6 border-b border-[#E5E1D8] text-[10px] font-bold uppercase tracking-widest text-[#7A8471]">
        {/* Search */}
        <div className="w-full md:max-w-xs flex items-center border-b border-[#161616] pb-1.5">
          <Search className="h-3.5 w-3.5 text-[#7A8471] mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search index by name..."
            className="bg-transparent border-0 outline-none text-[#161616] placeholder-[#7A8471] text-xs w-full font-bold uppercase tracking-wider"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Quick jump letters list */}
        <div className="hidden lg:flex flex-wrap gap-2 text-[8.5px] font-black tracking-widest text-[#7A8471]/50">
          {alphabet.map((letter) => {
            const hasItems = !!groupedCompanies[letter];
            return (
              <a
                key={letter}
                href={hasItems ? `#index-section-${letter}` : undefined}
                className={`px-1.5 py-0.5 transition-colors ${
                  hasItems 
                    ? 'text-[#161616] hover:text-[#D16A4A] cursor-pointer underline' 
                    : 'text-[#7A8471]/30 pointer-events-none'
                }`}
              >
                {letter}
              </a>
            );
          })}
        </div>
      </div>

      {/* Directory alphabetical lists */}
      {loading ? (
        <div className="space-y-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border border-[#E5E1D8] bg-[#FCFAF7] h-24 shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-[#E5E1D8] bg-[#FCFAF7]">
          <span className="text-[10px] font-bold text-[#7A8471] uppercase tracking-widest">
            No registered GCC indices match your search criteria.
          </span>
        </div>
      ) : (
        <div className="space-y-12">
          {alphabet.map((letter) => {
            const list = groupedCompanies[letter];
            if (!list || list.length === 0) return null;

            return (
              <div 
                key={letter} 
                id={`index-section-${letter}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4 border-t border-[#E5E1D8]/60 scroll-mt-24"
              >
                {/* Large Letter Indicator */}
                <div className="md:col-span-2">
                  <span className="font-editorial-serif text-5xl font-black text-[#D16A4A] leading-none block">
                    {letter}
                  </span>
                  <span className="text-[8px] font-bold text-[#7A8471] uppercase tracking-widest block mt-1">
                    {list.length} Tracked
                  </span>
                </div>

                {/* List of Companies */}
                <div className="md:col-span-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {list.map((comp) => {
                    const count = jobCounts[comp.id] || 0;
                    return (
                      <div
                        key={comp.id}
                        onClick={() => router.push(`/jobs?company=${comp.id}`)}
                        className="border border-[#E5E1D8] bg-[#FCFAF7] p-5 cursor-pointer hover:border-[#161616] transition-all flex flex-col justify-between group"
                      >
                        <div className="flex justify-between items-start">
                          <h3 className="font-editorial-serif text-sm font-black text-[#161616] uppercase tracking-tight group-hover:text-[#D16A4A] transition-colors leading-snug">
                            {comp.name}
                          </h3>
                          <ArrowUpRight className="h-3.5 w-3.5 text-[#7A8471] group-hover:text-[#161616] transition-colors shrink-0" />
                        </div>
                        
                        <div className="mt-5 pt-3.5 border-t border-[#E5E1D8] flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-[#7A8471]">
                          <span className="truncate max-w-[120px] font-semibold text-[#7A8471]/80">
                            {comp.careersUrl.replace(/https?:\/\/(www\.)?/, '').split('/')[0]}
                          </span>
                          <span className="text-[#161616]">
                            [ {count} Classifieds ]
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
