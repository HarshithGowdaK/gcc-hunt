import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="w-full border-t border-[#E5E1D8] pt-12 pb-16 text-xs text-[#7A8471]">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start text-left">
        
        {/* Column 1: Editorial Identity */}
        <div className="md:col-span-5 space-y-3">
          <span className="font-editorial-serif text-sm font-black uppercase tracking-tight text-[#161616]">
            The Global Capability Index
          </span>
          <p className="text-[11px] leading-relaxed font-normal text-[#7A8471] uppercase tracking-wider">
            An independent cryptographic registry tracking workplace nodes, corporate structures, and engineering listings directly from primary Global Capability Centers. Built for research, alignment, and transparency.
          </p>
        </div>

        {/* Column 2: Index Map Navigation */}
        <div className="md:col-span-3 space-y-3">
          <h4 className="text-[9px] font-bold uppercase tracking-widest text-[#161616]">Index Navigation</h4>
          <div className="flex flex-col gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            <Link href="/" className="hover:text-[#161616] transition-colors">Intelligence</Link>
            <Link href="/jobs" className="hover:text-[#161616] transition-colors">Classifieds</Link>
            <Link href="/companies" className="hover:text-[#161616] transition-colors">Corporations</Link>
            <Link href="/legal" className="text-[#D16A4A] hover:text-[#161616] transition-colors">Regulatory Disclaimers</Link>
          </div>
        </div>

        {/* Column 3: Legal fair-use & status */}
        <div className="md:col-span-4 space-y-3">
          <h4 className="text-[9px] font-bold uppercase tracking-widest text-[#161616]">Fair Use & Telemetry</h4>
          <p className="text-[10px] leading-relaxed text-[#7A8471] uppercase tracking-wide">
            All corporate brand marks, names, and logos compiled within this directory belong strictly to their respective owners. Their display serves descriptive search purposes under Fair Use principles.
          </p>
          <div className="text-[8px] font-mono text-[#7A8471] border-t border-[#E5E1D8]/60 pt-2">
            © {new Date().getFullYear()} G.C.C. INDEX. STATUS: ONLINE
          </div>
        </div>

      </div>
    </footer>
  );
}
