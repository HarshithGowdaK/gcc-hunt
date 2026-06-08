'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, MapPin, Briefcase, Calendar, ExternalLink, 
  Layers, RefreshCw, Share2, Building2 
} from 'lucide-react';
import { fetchJob } from '@/lib/api';
import JobCard from '@/components/JobCard';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [jobDetails, setJobDetails] = useState<any | null>(null);
  const [similarJobs, setSimilarJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadJobDetails() {
      if (!id) return;
      setLoading(true);
      try {
        const res = await fetchJob(id);
        setJobDetails(res.job);
        setSimilarJobs(res.similarJobs || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load job details.');
      } finally {
        setLoading(false);
      }
    }
    loadJobDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (error || !jobDetails) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 max-w-md mx-auto px-4 text-center">
        <div className="h-12 w-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">Job Listing Not Found</h2>
        <p className="mt-2 text-xs text-gray-400">
          The job listing you are looking for may have expired or been removed.
        </p>
        <Link
          href="/jobs"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs Search
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Back Button */}
      <div className="mb-6">
        <Link 
          href="/jobs"
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs Search
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Job details (Title, Info, Description) */}
        <article className="col-span-1 lg:col-span-2 glass-card p-6 sm:p-8 space-y-8">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-white/5 pb-6">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 text-white font-bold text-2xl shadow-lg shadow-indigo-500/10">
                {jobDetails.companyName.charAt(0).toUpperCase()}
              </div>
              
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">{jobDetails.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-400">
                  <span className="font-bold text-indigo-400">{jobDetails.companyName}</span>
                  <span className="text-gray-600">•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    {jobDetails.location}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex sm:flex-col gap-3 shrink-0">
              <a
                href={jobDetails.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-initial inline-flex justify-center items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 transition duration-200"
              >
                Apply for this job
                <ExternalLink className="h-4 w-4" />
              </a>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert('Link copied to clipboard!');
                }}
                className="glass-card px-4 py-2.5 text-xs font-semibold text-gray-300 hover:text-white flex items-center justify-center gap-1.5"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </div>
          </div>

          {/* Highlights summary grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.005]">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Experience</span>
              <span className="mt-1 text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-indigo-400" />
                {jobDetails.experienceLevel || 'Not Specified'}
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Years Exp</span>
              <span className="mt-1 text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-cyan-400" />
                {jobDetails.yearsExperience !== undefined && jobDetails.yearsExperience > 0 ? `${jobDetails.yearsExperience}+ Years` : 'Not Specified'}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Workplace Type</span>
              <span className="mt-1 text-xs font-semibold text-gray-200">
                {jobDetails.remoteStatus || 'Onsite'}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Employment Type</span>
              <span className="mt-1 text-xs font-semibold text-gray-200">
                {jobDetails.employmentType || 'Full-time'}
              </span>
            </div>
          </div>

          {/* Detected Skills */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider text-[11px] text-gray-400">Required Skills</h3>
            <div className="flex flex-wrap gap-2">
              {jobDetails.skills && jobDetails.skills.length > 0 ? (
                jobDetails.skills.map((skill: string, index: number) => (
                  <span 
                    key={index}
                    className="inline-flex items-center rounded bg-indigo-500/5 border border-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300"
                  >
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-500 italic">None detected in job details.</span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="border-t border-white/5 pt-6">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider text-[11px] text-gray-400">Job Description</h3>
            <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
              {jobDetails.description}
            </div>
          </div>

          {/* Footer stats */}
          <div className="border-t border-white/5 pt-6 flex flex-wrap items-center gap-6 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Scraped: {new Date(jobDetails.dateScraped || jobDetails.createdAt).toLocaleDateString()}
            </span>
            {jobDetails.postedDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Posted: {new Date(jobDetails.postedDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </article>

        {/* Right Column: Similar jobs sidebar */}
        <aside className="col-span-1 space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-extrabold text-white text-sm border-b border-white/5 pb-3 mb-4">
              Other Openings at {jobDetails.companyName}
            </h3>

            {similarJobs.length === 0 ? (
              <p className="text-xs text-gray-500 italic py-4">No other active jobs listed for this company.</p>
            ) : (
              <div className="space-y-4">
                {similarJobs.map((simJob) => (
                  <div 
                    key={simJob.id}
                    onClick={() => router.push(`/jobs/${simJob.id}`)}
                    className="p-3 border border-white/5 hover:border-indigo-500/30 bg-white/[0.005] hover:bg-white/[0.02] cursor-pointer rounded-xl transition"
                  >
                    <h4 className="text-xs font-bold text-gray-200 line-clamp-1">{simJob.title}</h4>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-500">
                      <span>{simJob.city}</span>
                      <span>{simJob.experienceLevel}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Quick instructions/disclosure */}
          <div className="glass-card p-6 text-xs text-gray-500 space-y-2.5">
            <h4 className="font-bold text-gray-400">Scraping Disclaimer</h4>
            <p>
              GCC Hunt automatically aggregates jobs daily from company career portals.
              Always apply directly on the company careers site to ensure your application is registered.
            </p>
          </div>
        </aside>

      </div>
    </div>
  );
}
