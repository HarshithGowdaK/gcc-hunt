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
        <RefreshCw className="h-6 w-6 text-[#D16A4A] animate-spin" />
      </div>
    );
  }

  if (error || !jobDetails) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 max-w-md mx-auto px-4 text-center">
        <div className="h-12 w-12 border border-[#E5E1D8] bg-[#FCFAF7] text-[#D16A4A] flex items-center justify-center">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-editorial-serif text-lg font-black text-[#161616] uppercase tracking-tight">Job Listing Not Found</h2>
        <p className="mt-2 text-[10px] text-[#7A8471] uppercase tracking-widest">
          The job listing you are looking for may have expired or been removed.
        </p>
        <Link
          href="/jobs"
          className="mt-6 inline-flex items-center gap-1.5 border border-[#161616] bg-[#161616] px-4 py-2 text-[10px] font-bold text-[#F7F4EE] hover:bg-[#D16A4A] uppercase tracking-widest transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs Search
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto py-8 text-left">
      
      {/* Back Button */}
      <div className="mb-6">
        <Link 
          href="/jobs"
          className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7A8471] hover:text-[#161616] uppercase tracking-widest transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs Search
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Job details (Title, Info, Description) */}
        <article className="col-span-1 lg:col-span-2 border border-[#E5E1D8] bg-[#FCFAF7] p-6 sm:p-8 space-y-8">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-[#E5E1D8] pb-6">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-[#E5E1D8] bg-[#F7F4EE] text-[#161616] font-editorial-serif font-black text-2xl">
                {jobDetails.companyName.charAt(0).toUpperCase()}
              </div>
              
              <div>
                <h1 className="font-editorial-serif text-2xl sm:text-3xl font-black text-[#161616] leading-tight uppercase tracking-tight">
                  {jobDetails.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-[#7A8471]">
                  <span className="text-[#D16A4A]">{jobDetails.companyName}</span>
                  <span className="text-gray-300">•</span>
                  <span className="flex items-center gap-1 text-[#7A8471]">
                    <MapPin className="h-3.5 w-3.5 text-[#7A8471]" />
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
                className="flex-1 sm:flex-initial inline-flex justify-center items-center gap-1.5 bg-[#161616] hover:bg-[#D16A4A] px-5 py-2.5 text-[9px] font-bold text-[#F7F4EE] uppercase tracking-widest transition duration-200"
              >
                Apply for this job
                <ExternalLink className="h-4 w-4" />
              </a>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert('Coordinates copied.');
                }}
                className="border border-[#E5E1D8] bg-[#FCFAF7] px-4 py-2.5 text-[9px] font-bold text-[#7A8471] hover:text-[#161616] hover:border-[#161616] flex items-center justify-center gap-1.5 uppercase tracking-widest"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </div>
          </div>

          {/* Highlights summary grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border border-[#E5E1D8] bg-[#F7F4EE]">
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-[#7A8471] tracking-wider">Experience</span>
              <span className="mt-1.5 text-xs font-bold text-[#161616] flex items-center gap-1.5 uppercase tracking-wide">
                <Briefcase className="h-3.5 w-3.5 text-[#D16A4A]" />
                {jobDetails.experienceLevel || 'Not Specified'}
              </span>
            </div>
            
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-[#7A8471] tracking-wider">Years Exp</span>
              <span className="mt-1.5 text-xs font-bold text-[#161616] flex items-center gap-1.5 uppercase tracking-wide">
                <Layers className="h-3.5 w-3.5 text-[#D16A4A]" />
                {jobDetails.yearsExperience !== undefined && jobDetails.yearsExperience > 0
                  ? (jobDetails.yearsExperienceMax && jobDetails.yearsExperienceMax > jobDetails.yearsExperience
                    ? `${jobDetails.yearsExperience}-${jobDetails.yearsExperienceMax} Years`
                    : `${jobDetails.yearsExperience}+ Years`)
                  : 'Not Specified'}
              </span>
            </div>

            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-[#7A8471] tracking-wider">Workplace Type</span>
              <span className="mt-1.5 text-xs font-bold text-[#161616] uppercase tracking-wide">
                {jobDetails.remoteStatus || 'Onsite'}
              </span>
            </div>

            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-[#7A8471] tracking-wider">Employment Type</span>
              <span className="mt-1.5 text-xs font-bold text-[#161616] uppercase tracking-wide">
                {jobDetails.employmentType || 'Full-time'}
              </span>
            </div>
          </div>

          {/* Detected Skills */}
          <div className="text-left">
            <h3 className="text-[9px] font-black text-[#7A8471] mb-3 uppercase tracking-widest border-b border-[#E5E1D8] pb-1.5">Required Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {jobDetails.skills && jobDetails.skills.length > 0 ? (
                jobDetails.skills.map((skill: string, index: number) => (
                  <span 
                    key={index}
                    className="inline-block border border-[#E5E1D8] bg-[#F7F4EE] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#7A8471]"
                  >
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-[#7A8471] italic">None detected in job details.</span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="border-t border-[#E5E1D8] pt-6 text-left">
            <h3 className="text-[9px] font-black text-[#7A8471] mb-4 uppercase tracking-widest">Job Description</h3>
            <div className="text-xs text-[#161616] leading-relaxed whitespace-pre-line font-normal normal-case tracking-wide">
              {jobDetails.description}
            </div>
          </div>

          {/* Footer stats */}
          <div className="border-t border-[#E5E1D8] pt-6 flex flex-wrap items-center gap-6 text-[9px] font-bold uppercase tracking-widest text-[#7A8471] text-left">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-[#7A8471]" />
              Scraped: {new Date(jobDetails.dateScraped || jobDetails.createdAt).toLocaleDateString()}
            </span>
            {jobDetails.postedDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-[#7A8471]" />
                Posted: {new Date(jobDetails.postedDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </article>

        {/* Right Column: Similar jobs sidebar */}
        <aside className="col-span-1 space-y-6 text-left">
          <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
            <h3 className="font-editorial-serif text-sm font-black text-[#161616] uppercase tracking-tight border-b border-[#E5E1D8] pb-3 mb-4">
              Other Openings at {jobDetails.companyName}
            </h3>

            {similarJobs.length === 0 ? (
              <p className="text-[9px] text-[#7A8471] italic uppercase tracking-wider py-4">No other active jobs listed for this company.</p>
            ) : (
              <div className="space-y-4">
                {similarJobs.map((simJob) => (
                  <div 
                    key={simJob.id}
                    onClick={() => router.push(`/jobs/${simJob.id}`)}
                    className="p-3 border border-[#E5E1D8] hover:border-[#161616] bg-[#FCFAF7] cursor-pointer transition"
                  >
                    <h4 className="text-[10px] font-bold text-[#161616] line-clamp-1 uppercase tracking-wider">{simJob.title}</h4>
                    <div className="mt-2 flex items-center justify-between text-[8px] text-[#7A8471] font-bold uppercase tracking-widest">
                      <span>{simJob.city}</span>
                      <span className="text-[#D16A4A]">{simJob.experienceLevel}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Quick instructions/disclosure */}
          <div className="border border-[#E5E1D8] bg-[#FCFAF7] p-5 text-[9px] text-[#7A8471] space-y-2.5 uppercase tracking-widest font-bold">
            <h4 className="text-[#161616] border-b border-[#E5E1D8] pb-1.5">Scraping Disclaimer</h4>
            <p className="leading-relaxed font-normal text-[#7A8471] lowercase tracking-normal italic">
              GCC Index automatically aggregates jobs daily from company career portals. Always apply directly on the company careers site to ensure your application is registered.
            </p>
          </div>
        </aside>

      </div>
    </div>
  );
}
