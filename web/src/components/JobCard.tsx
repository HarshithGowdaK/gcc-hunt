import React from 'react';
import Link from 'next/link';
import { MapPin, Briefcase, Calendar, ChevronRight, Share2, Layers } from 'lucide-react';

interface JobCardProps {
  job: {
    id: string;
    title: string;
    companyName: string;
    companyId: string;
    location: string;
    city: string;
    state: string;
    experienceLevel?: string;
    yearsExperience?: number;
    employmentType?: string;
    skills: string[];
    applyUrl: string;
    jobUrl: string;
    postedDate?: string;
    remoteStatus?: 'Remote' | 'Hybrid' | 'Onsite' | 'Unknown';
    createdAt: string;
  };
  isActive?: boolean;
  onClick?: () => void;
}

export default function JobCard({ job, isActive = false, onClick }: JobCardProps) {
  // Format posted date relative
  const getRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays} days ago`;
    } catch (e) {
      return 'Recent';
    }
  };

  // Generate a robust deterministic color theme for company logos
  const getCompanyColor = (name: string) => {
    const colors = [
      'from-pink-500 to-rose-500',
      'from-purple-600 to-indigo-600',
      'from-blue-500 to-indigo-500',
      'from-emerald-500 to-teal-500',
      'from-amber-500 to-orange-500',
      'from-cyan-500 to-blue-600'
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }
    return colors[sum % colors.length];
  };

  const formattedDate = getRelativeTime(job.postedDate || job.createdAt);
  const companyLogoColor = getCompanyColor(job.companyName);

  return (
    <div 
      onClick={onClick}
      className={`glass-card p-5 cursor-pointer relative overflow-hidden transition-all duration-300 flex flex-col justify-between h-full group ${
        isActive 
          ? 'glass-card-active shadow-[0_0_20px_rgba(99,102,241,0.15)]' 
          : 'glass-card-hover'
      }`}
    >
      <div>
        {/* Card Header (Logo + Company + Tags) */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Dynamic Company Logo Placeholder */}
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr ${companyLogoColor} text-white font-bold text-lg shadow-inner shadow-white/10`}>
              {job.companyName.charAt(0).toUpperCase()}
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-200 group-hover:text-white transition duration-200 line-clamp-1">{job.companyName}</h4>
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                <MapPin className="h-3 w-3 shrink-0" />
                {job.city}, {job.state}
              </span>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {job.remoteStatus && job.remoteStatus !== 'Unknown' && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                job.remoteStatus === 'Remote' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' 
                  : job.remoteStatus === 'Hybrid'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/10'
              }`}>
                {job.remoteStatus}
              </span>
            )}
            
            {job.employmentType && (
              <span className="inline-flex items-center rounded-full bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] font-medium text-gray-300">
                {job.employmentType}
              </span>
            )}
          </div>
        </div>

        {/* Job Title */}
        <h3 className="mt-4 font-sans text-[17px] font-bold text-white group-hover:text-indigo-300 transition duration-200 line-clamp-1">
          {job.title}
        </h3>

        {/* Experience details */}
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" />
            {job.experienceLevel || 'Not Specified'}
          </span>
          {job.yearsExperience !== undefined && job.yearsExperience > 0 && (
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {job.yearsExperience}+ Yrs Exp
            </span>
          )}
        </div>

        {/* Skills Section */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.skills.slice(0, 4).map((skill, index) => (
            <span 
              key={index} 
              className="inline-flex items-center rounded bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300 hover:bg-indigo-500/10 transition"
            >
              {skill}
            </span>
          ))}
          {job.skills.length > 4 && (
            <span className="inline-flex items-center rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-gray-400 border border-white/5">
              +{job.skills.length - 4} more
            </span>
          )}
        </div>
      </div>

      {/* Footer Section */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {formattedDate}
        </span>

        <div className="flex items-center gap-3">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(`${window.location.origin}/jobs/${job.id}`);
              alert('Job link copied!');
            }}
            title="Copy Job Link" 
            className="p-1.5 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition"
          >
            <Share2 className="h-4 w-4" />
          </button>
          
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 transition duration-200"
          >
            Apply
            <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
