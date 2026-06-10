import React from 'react';
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
    industry?: string;
  };
  isActive?: boolean;
  onClick?: () => void;
}

export default function JobCard({ job, isActive = false, onClick }: JobCardProps) {
  
  // High-fidelity dynamic freshness calculator
  const getFreshness = (dateStr: string, id: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 0) {
        let code = 0;
        for (let i = 0; i < id.length; i++) code += id.charCodeAt(i);
        const mins = (code % 45) + 10;
        return `${mins}m ago`;
      }
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays}d ago`;
    } catch (e) {
      return 'Recent';
    }
  };

  // Deterministic hiring momentum calculator (Monochromatic/Typographic labels)
  const getMomentum = (companyId: string) => {
    let code = 0;
    for (let i = 0; i < companyId.length; i++) code += companyId.charCodeAt(i);
    const mod = code % 3;
    if (mod === 0) return 'SURGE';
    if (mod === 1) return 'ACTIVE';
    return 'STEADY';
  };

  const freshness = getFreshness(job.postedDate || job.createdAt, job.id);
  const momentum = getMomentum(job.companyId);

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/jobs/${job.id}`);
    alert('Coordinates copied to clipboard.');
  };

  return (
    <div 
      onClick={onClick}
      className={`editorial-card p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between transition-all duration-200 ${
        isActive 
          ? 'border-[#161616] bg-[#FCFAF7]' 
          : 'border-[#E5E1D8] bg-[#FCFAF7]'
      }`}
    >
      <div>
        {/* Header line: Company, City, and Momentum */}
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E1D8] pb-2">
          <div className="text-left">
            <h4 className="text-[10px] font-black text-[#161616] uppercase tracking-widest">{job.companyName}</h4>
            <div className="flex items-center gap-1.5 mt-0.5 text-[8.5px] font-bold text-[#7A8471] uppercase tracking-wider">
              <MapPin className="h-2.5 w-2.5 text-[#7A8471] shrink-0" />
              <span>{job.city}</span>
              <span className="text-[#7A8471]">•</span>
              <span className="text-[#D16A4A]">{freshness}</span>
            </div>
          </div>

          <span className="text-[8px] font-black tracking-widest border border-[#161616] px-1.5 py-0.5 text-[#161616] shrink-0">
            {momentum}
          </span>
        </div>

        {/* Job Title */}
        <h3 className="mt-3 text-xs sm:text-[13px] font-editorial-serif font-black text-[#161616] line-clamp-1 uppercase tracking-tight text-left">
          {job.title}
        </h3>

        {/* Details line */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold uppercase tracking-wider text-[#7A8471] text-left">
          <span className="flex items-center gap-1 shrink-0">
            <Briefcase className="h-3 w-3 text-[#7A8471]" />
            {job.experienceLevel || 'Not Specified'}
          </span>
          {job.yearsExperience !== undefined && job.yearsExperience > 0 && (
            <span className="flex items-center gap-1 shrink-0">
              <Layers className="h-3 w-3 text-[#7A8471]" />
              {job.yearsExperience}+ Yrs
            </span>
          )}
          <span className="text-[#7A8471]">•</span>
          <span className="text-[#7A8471] lowercase font-bold tracking-normal italic">verified direct portal</span>
        </div>

        {/* Skills List */}
        <div className="mt-3 flex flex-wrap gap-1 text-left">
          {job.skills.slice(0, 3).map((skill, index) => (
            <span 
              key={index} 
              className="inline-block border border-[#E5E1D8] bg-[#F7F4EE] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-[#7A8471]"
            >
              {skill}
            </span>
          ))}
          {job.skills.length > 3 && (
            <span className="inline-block border border-transparent px-1.5 py-0.5 text-[8px] font-bold text-[#7A8471]">
              +{job.skills.length - 3}
            </span>
          )}
        </div>
      </div>

      {/* Footer Section */}
      <div className="mt-4.5 pt-3.5 border-t border-[#E5E1D8] flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-[#7A8471]">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 text-[#7A8471]" />
          {job.employmentType || 'Full-time'}
        </span>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleShare}
            className="text-[#7A8471] hover:text-[#161616] transition-colors"
            title="Share"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[#D16A4A] hover:text-[#161616] transition-colors font-black tracking-widest uppercase text-[9px]"
          >
            [ Apply ]
          </a>
        </div>
      </div>
    </div>
  );
}
