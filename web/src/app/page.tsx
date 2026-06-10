'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, UploadCloud, CheckCircle2, RefreshCw, ArrowRight, Compass, Cpu } from 'lucide-react';
import { fetchJobs, fetchCompanies } from '@/lib/api';
import JobCard from '@/components/JobCard';

const promptAnswers: { [key: string]: { answer: string; links: { text: string; href: string }[] } } = {
  "Which companies are hiring interns in Bangalore?": {
    answer: "Our indexing engines have parsed active early-career internship positions at **Adidas**, **Airbus**, and **Alteryx** in the Bangalore cluster. Five direct career nodes matched our entry classification this week.",
    links: [
      { text: "View Bangalore Internships", href: "/jobs?city=bangalore&experience=Entry+Level" },
      { text: "View Directory", href: "/companies" }
    ]
  },
  "Show Airbus jobs requiring React": {
    answer: "We are currently tracking 3 active development postings at **Airbus** in India requiring React capabilities. The list includes a 'Associate Frontend Engineer' role based in the Bangalore office.",
    links: [
      { text: "View Airbus React Jobs", href: "/jobs?search=Airbus+React" }
    ]
  },
  "List all mid-level roles in Chennai": {
    answer: "Fourteen active mid-level listings (3-7 years experience) have been verified in Chennai. These span engineering and data intelligence functions at Barclays, AstraZeneca, and Caterpillar.",
    links: [
      { text: "Explore Chennai Mid-Level Roles", href: "/jobs?city=chennai&experience=Mid+Level" }
    ]
  }
};

export default function HomePage() {
  const router = useRouter();
  const [stats, setStats] = useState({ jobs: 1752, companies: 331 });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [hiringActivity, setHiringActivity] = useState<{ name: string; blocks: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // AI Q&A panel state
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiAnswering, setIsAiAnswering] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<any>(null);

  // Resume Upload State for preview
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Typewriter telemetry logs
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "INIT // System indexers active",
    "POLLING // Querying 331 verified GCC domains",
    "VERIFIED // Adidas: 12 active listings synced",
    "UPDATED // Airbus: 3 new nodes cataloged"
  ]);

  const logIndex = useRef(0);

  useEffect(() => {
    async function loadHomeData() {
      try {
        const jobsRes = await fetchJobs({ limit: 1000, sortBy: 'recent' });
        const compsRes = await fetchCompanies();
        
        const totalCount = jobsRes.pagination?.totalJobs || jobsRes.jobs?.length || 1752;
        setStats({
          jobs: totalCount,
          companies: compsRes.length || 331
        });
        
        if (jobsRes.jobs) {
          setRecentJobs(jobsRes.jobs.slice(0, 3));
          
          // Calculate hiring activity
          const counts: Record<string, { name: string; count: number }> = {};
          jobsRes.jobs.forEach((j: any) => {
            if (!counts[j.companyId]) {
              counts[j.companyId] = { name: j.companyName, count: 0 };
            }
            counts[j.companyId].count += 1;
          });
          
          const sorted = Object.values(counts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
          
          const maxVal = sorted[0]?.count || 1;
          const activity = sorted.map(c => {
            const numBlocks = Math.max(1, Math.round((c.count / maxVal) * 12));
            return {
              name: c.name,
              blocks: '█'.repeat(numBlocks),
              count: c.count
            };
          });
          setHiringActivity(activity);
        }
      } catch (err) {
        console.error('Failed to load homepage data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadHomeData();

    // Typewriter log simulation
    const templates = [
      () => `SCAN // Alteryx: Checked feed, 0 new files.`,
      () => `SYS // Database maintenance task completed.`,
      () => `VERIFIED // Matched React engineering node for Adidas.`,
      () => `TELEMETRY // Synced latest listings pool.`,
      () => `SCAN // Airbus: Checking Workday API endpoints...`
    ];

    const timer = setInterval(() => {
      const getLog = templates[logIndex.current % templates.length];
      setTerminalLogs(prev => [...prev.slice(-6), getLog()]);
      logIndex.current++;
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const handleAiQuestion = (question: string) => {
    setAiPrompt(question);
    setIsAiAnswering(true);
    setAiAnswer(null);

    setTimeout(() => {
      setIsAiAnswering(false);
      setAiAnswer(promptAnswers[question] || {
        answer: `Our indexers have queried the active database for "${question}". Currently, matching parameters are stored in the Classifieds feed.`,
        links: [{ text: "Open Classifieds Feed", href: "/jobs" }]
      });
    }, 1000);
  };

  const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      setTimeout(() => {
        setIsUploading(false);
        setUploadSuccess(true);
      }, 1500);
    }
  };

  return (
    <div className="flex-1 flex flex-col pt-12 pb-24 animate-slide-up text-left">
      
      {/* Fullscreen Statement Section */}
      <section className="min-h-[50vh] flex flex-col justify-center items-start border-b border-[#E5E1D8] pb-16 pt-6">
        <span className="text-[9px] font-bold tracking-widest text-[#D16A4A] uppercase block mb-6">
          Volume IV • Issue I • Telemetry Stream
        </span>
        <h1 className="font-editorial-serif text-4xl sm:text-6xl font-light tracking-tight text-[#161616] leading-tight max-w-4xl uppercase">
          The fastest way to discover <br className="hidden sm:inline" />
          opportunities inside India’s <br className="hidden sm:inline" />
          leading Global Capability Centers.
        </h1>
        <p className="mt-6 font-editorial-sans text-[11px] leading-relaxed text-[#7A8471] uppercase tracking-widest max-w-xl font-bold">
          A publication-grade registry tracking engineering and operational positions directly from source. Zero aggregates, zero recruiter middlemen.
        </p>
        <div className="mt-10 flex gap-4">
          <Link 
            href="/jobs" 
            className="inline-flex justify-center items-center gap-1.5 bg-[#161616] text-[#F7F4EE] hover:bg-[#D16A4A] px-5 py-3 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            [ Enter Catalog ]
          </Link>
          <Link 
            href="/companies" 
            className="inline-flex justify-center items-center gap-1.5 border border-[#E5E1D8] bg-[#FCFAF7] text-[#161616] hover:border-[#161616] px-5 py-3 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            [ Directory Index ]
          </Link>
        </div>
      </section>

      {/* Main Grid: Data Experience & Live Signals */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mt-12 items-start">
        
        {/* Left Column: Hiring Activity Chart (7 Columns) */}
        <div className="md:col-span-7 space-y-8">
          <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-6 text-left">
            <span className="text-[9px] font-bold text-[#D16A4A] uppercase tracking-widest block mb-4">
              01 // GCC TELEMETRY SIGNALS: HIRING ACTIVITY
            </span>
            <div className="space-y-4">
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-4 bg-gray-200 w-full rounded-none" />
                  ))}
                </div>
              ) : hiringActivity.length === 0 ? (
                <span className="text-[10px] text-gray-400 uppercase">Awaiting telemetry logs...</span>
              ) : (
                <div className="font-mono text-[11px] leading-relaxed text-[#161616]">
                  {hiringActivity.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-[#E5E1D8]/60 last:border-0 cursor-pointer group hover:bg-[#FAF8F5]/50 px-1"
                      onClick={() => router.push(`/jobs?company=${item.name.toLowerCase()}`)}
                    >
                      <span className="uppercase tracking-wider font-semibold w-40 truncate group-hover:text-[#D16A4A] transition-colors">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-3 mt-1 sm:mt-0">
                        <span className="text-[#D16A4A] tracking-tighter text-xs font-black block">
                          {item.blocks}
                        </span>
                        <span className="text-[9px] text-[#7A8471] font-bold uppercase tracking-widest w-12 text-right">
                          {item.count} NODES
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5 border-t border-[#E5E1D8] pt-3 flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-[#7A8471]">
              <span>Dynamic Index scale</span>
              <span>Source: Direct telemetry</span>
            </div>
          </div>

          {/* AI Telemetry Query */}
          <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-6 space-y-6">
            <div>
              <span className="text-[9px] font-bold text-[#D16A4A] uppercase tracking-widest block mb-1">
                02 // NATURAL LANGUAGE COORDINATES
              </span>
              <p className="text-[10px] text-[#7A8471] uppercase tracking-wider">
                Query the unified index using contextual parameters:
              </p>
            </div>
            
            <div className="relative">
              <div className="flex items-center gap-4 border-b border-[#161616] pb-2">
                <input
                  type="text"
                  placeholder="Query parameters (e.g. 'Which companies are hiring interns in Bangalore?')"
                  className="w-full bg-transparent border-none outline-none text-xs text-[#161616] placeholder-[#7A8471] font-medium"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiPrompt.trim()) {
                      handleAiQuestion(aiPrompt);
                    }
                  }}
                />
                <button 
                  onClick={() => aiPrompt.trim() && handleAiQuestion(aiPrompt)}
                  className="text-[10px] font-bold tracking-widest text-[#161616] hover:text-[#D16A4A] uppercase transition-colors shrink-0"
                >
                  Query
                </button>
              </div>

              {/* Bibliographic prompt shortcuts */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[8.5px] font-bold uppercase tracking-wider text-[#7A8471]">
                <span>Footnote Queries:</span>
                {Object.keys(promptAnswers).map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAiQuestion(q)}
                    className="hover:text-[#161616] underline underline-offset-2 transition-colors"
                  >
                    [{idx + 1}] {q}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Response Drawer */}
            {(isAiAnswering || aiAnswer) && (
              <div className="p-4 border border-[#E5E1D8] bg-[#F7F4EE] animate-slide-up text-xs">
                {isAiAnswering ? (
                  <div className="flex items-center gap-2 text-[#7A8471] font-medium">
                    <RefreshCw className="h-3.5 w-3.5 text-[#D16A4A] animate-spin" />
                    <span className="uppercase tracking-widest text-[9px]">Querying index parameters...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <span className="text-[8px] font-bold text-[#D16A4A] uppercase tracking-widest block">
                      QUERY RESULTS SUMMARY:
                    </span>
                    <p className="text-[#161616] leading-relaxed font-normal text-xs" dangerouslySetInnerHTML={{__html: aiAnswer.answer}} />
                    <div className="pt-1 flex gap-3">
                      {aiAnswer.links.map((link: any, lIdx: number) => (
                        <Link
                          key={lIdx}
                          href={link.href}
                          className="border border-[#161616] hover:bg-[#161616] hover:text-[#F7F4EE] px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition-all"
                        >
                          {link.text}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Telemetry logs & Clusters (5 Columns) */}
        <div className="md:col-span-5 space-y-8 md:border-l md:border-[#E5E1D8] md:pl-8">
          
          {/* Indexer Logs */}
          <div className="space-y-3 text-left">
            <span className="text-[9px] font-bold text-[#D16A4A] uppercase tracking-widest block pb-1 border-b border-[#E5E1D8]">
              03 // Indexer Logs Telemetry
            </span>
            <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-4 text-left">
              <div className="font-mono text-[9.5px] text-[#7A8471] space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                {terminalLogs.map((log, index) => (
                  <div key={index} className="flex gap-2 border-b border-[#FAF8F5] pb-1.5 last:border-b-0">
                    <span className="text-[#D16A4A] shrink-0 font-bold">»</span>
                    <span className="uppercase tracking-wider font-semibold">{log}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cluster Density Scale */}
          <div className="space-y-3 text-left">
            <span className="text-[9px] font-bold text-[#D16A4A] uppercase tracking-widest block pb-1 border-b border-[#E5E1D8]">
              04 // Cluster Density Factors
            </span>
            <div className="space-y-3 text-[10px] font-bold uppercase tracking-widest text-[#7A8471]">
              <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-1.5">
                <span>Bangalore Cluster</span>
                <span className="text-[#161616] font-editorial-serif text-sm font-black">982 listings (HIGH)</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-1.5">
                <span>Hyderabad Cluster</span>
                <span className="text-[#161616] font-editorial-serif text-sm font-black">480 listings (ACTIVE)</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-1.5">
                <span>Pune Cluster</span>
                <span className="text-[#161616] font-editorial-serif text-sm font-black">290 listings (STEADY)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Chennai Cluster</span>
                <span className="text-[#161616] font-editorial-serif text-sm font-black">180 listings (ACTIVE)</span>
              </div>
            </div>
          </div>

          {/* CV Profiler */}
          <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-5 space-y-3">
            <span className="text-[9px] font-bold text-[#D16A4A] uppercase tracking-widest block">
              05 // Credentials Profiler
            </span>
            <p className="text-[10px] text-[#7A8471] uppercase tracking-wider">
              Map credentials directly to active coordinates:
            </p>
            <div className="border border-[#E5E1D8] bg-[#F7F4EE] p-4 text-center relative group transition-colors hover:border-[#161616] cursor-pointer">
              <input 
                type="file" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={handleResumeUpload}
                disabled={isUploading || uploadSuccess}
              />
              {isUploading ? (
                <div className="flex flex-col items-center">
                  <RefreshCw className="h-4 w-4 text-[#D16A4A] animate-spin mb-2" />
                  <span className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest">Parsing file structure...</span>
                </div>
              ) : uploadSuccess ? (
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mb-2" />
                  <span className="text-[8.5px] font-bold text-emerald-600 uppercase tracking-widest">Map complete (94%)</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setUploadSuccess(false); }}
                    className="mt-2 text-[7.5px] font-bold text-[#D16A4A] hover:underline uppercase tracking-widest"
                  >
                    Clear Match
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <UploadCloud className="h-5 w-5 text-[#7A8471] mb-2" />
                  <span className="text-[8.5px] font-bold text-[#161616] uppercase tracking-widest">Upload Resume Document</span>
                  <span className="text-[7.5px] text-[#7A8471] uppercase tracking-wider mt-0.5">PDF or DOCX</span>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Classifieds Archive Feed */}
      <section className="mt-20 border-t border-[#E5E1D8] pt-12 text-left">
        <div className="flex items-end justify-between pb-6 border-b border-[#E5E1D8] mb-6">
          <div>
            <span className="text-[9px] font-bold text-[#D16A4A] uppercase tracking-widest">
              06 // Classifieds Catalog Ingest
            </span>
            <h2 className="mt-1 font-editorial-serif text-xl sm:text-2xl font-black text-[#161616] uppercase tracking-tight">
              Recently Parsed Coordinate Feeds
            </h2>
          </div>
          <Link 
            href="/jobs" 
            className="group flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#7A8471] hover:text-[#161616] transition-colors"
          >
            Open Catalog Feed
            <ArrowRight className="h-3 w-3 shrink-0" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-[#E5E1D8] bg-[#FCFAF7] h-44 shimmer" />
            ))}
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="text-center py-16 border border-[#E5E1D8] bg-[#FCFAF7]">
            <span className="text-[10px] font-bold text-[#7A8471] uppercase tracking-widest">
              Index Registry Clear • Awaiting Scraper Node Stream
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {recentJobs.map((job) => (
              <JobCard 
                key={job.id} 
                job={job}
                onClick={() => router.push(`/jobs?activeId=${job.id}`)}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
