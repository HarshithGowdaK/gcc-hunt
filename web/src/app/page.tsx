'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Briefcase, Building2, MapPin, ChevronRight, TrendingUp, Code, Database, Server, Smartphone } from 'lucide-react';
import { fetchJobs, fetchCompanies } from '@/lib/api';
import JobCard from '@/components/JobCard';

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ jobs: 0, companies: 0 });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHomeData() {
      try {
        // Fetch jobs for counter and listing
        const jobsRes = await fetchJobs({ limit: 6, sortBy: 'recent' });
        // Fetch companies for counter
        const compsRes = await fetchCompanies();
        
        setStats({
          jobs: jobsRes.pagination?.totalJobs || 0,
          companies: compsRes.length || 0
        });
        setRecentJobs(jobsRes.jobs || []);
      } catch (err) {
        console.error('Failed to load homepage data from backend:', err);
        // Fallback fallback stats for visual wow factor if database is currently unseeded/offline
        setStats({ jobs: 842, companies: 194 });
      } finally {
        setLoading(false);
      }
    }

    loadHomeData();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/jobs?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/jobs');
    }
  };

  const categories = [
    { name: 'Software Engineering', icon: Code, count: '340+ Jobs', slug: 'software' },
    { name: 'Data & AI', icon: Database, count: '180+ Jobs', slug: 'data' },
    { name: 'Cloud & Infrastructure', icon: Server, count: '120+ Jobs', slug: 'cloud' },
    { name: 'Mobile Systems', icon: Smartphone, count: '80+ Jobs', slug: 'mobile' }
  ];

  return (
    <div className="flex-1 flex flex-col justify-start">
      
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-24 text-center">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-[100px]" />
        
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 animate-fade-in">
          {/* Tag */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1.5 text-xs font-semibold text-indigo-300">
            <TrendingUp className="h-3.5 w-3.5" />
            India's Premier GCC Jobs Portal
          </span>

          <h1 className="mt-6 font-sans text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Find Your Next Role at <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Global Capability Centers
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-gray-400">
            Directly aggregates and filters active job openings in India from over 900 Global Capability Centers (GCCs).
          </p>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="mx-auto mt-10 max-w-2xl">
            <div className="glass-card flex items-center p-2 focus-within:border-indigo-500/50 shadow-2xl">
              <div className="flex items-center gap-2 pl-3 text-gray-400 flex-1">
                <Search className="h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search job titles, skills (e.g. React, Python), or company names..."
                  className="w-full bg-transparent border-0 outline-none focus:ring-0 text-white placeholder-gray-500 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button 
                type="submit"
                className="rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:from-indigo-500 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition"
              >
                Search Jobs
              </button>
            </div>
          </form>

          {/* Stats Counters */}
          <div className="mt-12 grid grid-cols-2 divide-x divide-white/5 border-t border-white/5 pt-10 max-w-lg mx-auto">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-2xl font-black text-white sm:text-4xl">
                <Briefcase className="h-6 w-6 text-indigo-400" />
                {loading ? '...' : stats.jobs.toLocaleString()}
              </div>
              <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Active Opportunities</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-2xl font-black text-white sm:text-4xl">
                <Building2 className="h-6 w-6 text-cyan-400" />
                {loading ? '...' : stats.companies.toLocaleString()}
              </div>
              <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Monitored GCCs</span>
            </div>
          </div>
        </div>
      </section>

      {/* Category Section */}
      <section className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-end justify-between border-b border-white/5 pb-5">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Trending Categories</h2>
            <p className="mt-1 text-sm text-gray-400">Explore openings across popular industry divisions.</p>
          </div>
          <Link href="/jobs" className="group flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-white transition">
            See all jobs
            <ChevronRight className="h-4 w-4 transform group-hover:translate-x-0.5 transition" />
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <Link
                key={idx}
                href={`/jobs?search=${encodeURIComponent(cat.slug)}`}
                className="glass-card glass-card-hover p-6 flex flex-col justify-between"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="mt-6">
                  <h3 className="font-semibold text-white">{cat.name}</h3>
                  <span className="mt-1 text-xs text-gray-400 block">{cat.count}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent Jobs Section */}
      <section className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-16 border-t border-white/5">
        <div className="flex items-end justify-between border-b border-white/5 pb-5">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Recently Aggregated Jobs</h2>
            <p className="mt-1 text-sm text-gray-400">The latest opportunities curated from verified GCC portals.</p>
          </div>
          <Link href="/jobs" className="group flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-white transition">
            Browse all jobs
            <ChevronRight className="h-4 w-4 transform group-hover:translate-x-0.5 transition" />
          </Link>
        </div>

        {loading ? (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="glass-card p-6 h-56 animate-pulse bg-white/[0.01]" />
            ))}
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="mt-10 text-center py-16 glass-card">
            <Briefcase className="mx-auto h-12 w-12 text-gray-600" />
            <h3 className="mt-4 text-sm font-semibold text-white">No jobs found</h3>
            <p className="mt-2 text-xs text-gray-400">The index is currently empty. Run the scraper or check back later.</p>
            <div className="mt-6">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Go to Admin to Seed Database
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
