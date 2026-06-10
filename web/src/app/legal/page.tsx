import React from 'react';
import Link from 'next/link';
import { ShieldAlert, Info, Globe, Building2, Terminal } from 'lucide-react';

export default function LegalPage() {
  return (
    <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 text-left">
      
      {/* Title Header */}
      <div className="border-b border-[#E5E1D8] pb-8 mb-8 animate-slide-up">
        <span className="inline-flex items-center gap-1.5 border border-[#D16A4A]/20 bg-[#F7F4EE] px-3.5 py-1 text-[9px] font-bold tracking-widest uppercase text-[#D16A4A]">
          <ShieldAlert className="h-3 w-3" />
          Regulatory & Liability Disclosures
        </span>
        <h1 className="mt-4 font-editorial-serif text-3xl font-black tracking-tight text-[#161616] uppercase sm:text-4xl">
          Legal Disclaimer & Terms
        </h1>
        <p className="mt-2 text-[9.5px] text-[#7A8471] uppercase tracking-wider font-bold">
          Last updated: June 9, 2026
        </p>
      </div>

      {/* Content Grid */}
      <div className="space-y-8 text-xs text-[#7A8471] leading-relaxed font-medium animate-slide-up">
        
        {/* Section 1 */}
        <section className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
          <h2 className="text-sm font-editorial-serif font-black text-[#161616] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Info className="h-4 w-4 text-[#D16A4A] shrink-0" />
            1. Information Aggregation & Accuracy Disclaimer
          </h2>
          <p className="mb-3 text-[#161616]">
            GCC Hunt is an automated job board search index utility. All postings, lists, and job descriptions displayed on this portal are dynamically aggregated from publicly accessible careers pages (including Workday, Greenhouse, and Lever portals) of various Global Capability Centers (GCCs) operating in India.
          </p>
          <p className="text-[#161616]">
            While we strive to keep the index updated, job details and links are subject to immediate changes without notice by their hosting employers. GCC Hunt does not guarantee the active status, accuracy, details, or validity of any indexed job role, requirements, or terms.
          </p>
        </section>

        {/* Section 2 */}
        <section className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
          <h2 className="text-sm font-editorial-serif font-black text-[#161616] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#D16A4A] shrink-0" />
            2. Intellectual Property & Trademark Notice
          </h2>
          <p className="mb-3 text-[#161616]">
            All company names, corporate identities, brand labels, products, services, marks, and logos displayed in listings belong entirely to their respective entities. GCC Hunt asserts no ownership, partnership, license, or endorsement rights over any third-party brands listed.
          </p>
          <p className="text-[#161616]">
            The use of brand names and corporate emblems on this site is purely for search indexing, reference, and informational utility (Fair Use). GCC Hunt is an independent search compiler and is not affiliated with, sponsored by, or partner to any corporate employer in the database.
          </p>
        </section>

        {/* Section 3 */}
        <section className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
          <h2 className="text-sm font-editorial-serif font-black text-[#161616] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#D16A4A] shrink-0" />
            3. Application Routing Disclaimer
          </h2>
          <p className="mb-3 text-[#161616]">
            GCC Hunt does not collect, receive, screen, or store job applications. Clicking the &quot;Apply&quot; or &quot;Direct Apply&quot; options redirects users directly to the respective organization&apos;s external workday/career tracking systems.
          </p>
          <p className="text-[#161616]">
            Candidates submit their credentials, resume files, and responses entirely within the employer&apos;s secure context. GCC Hunt holds no liability or access regarding the application screening, interview schedules, recruitment results, or subsequent hiring policies.
          </p>
        </section>

        {/* Section 4 */}
        <section className="border border-[#E5E1D8] bg-[#FCFAF7] p-5">
          <h2 className="text-sm font-editorial-serif font-black text-[#161616] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-[#D16A4A] shrink-0" />
            4. Limitation of Liability
          </h2>
          <p className="mb-3 text-[#161616]">
            Under no circumstances shall GCC Hunt, its creators, or administrators be liable for any direct, indirect, consequential, or incidental losses arising out of the use of, or inability to use, this directory services portal.
          </p>
          <p className="text-[#161616]">
            Users are advised to cross-reference and verify all information with the official corporate careers board before submitting any files or applying to any roles.
          </p>
        </section>

      </div>

      {/* Return Links */}
      <div className="mt-8 pt-6 border-t border-[#E5E1D8] flex items-center justify-between text-[9px] font-bold uppercase tracking-widest">
        <Link href="/" className="text-[#D16A4A] hover:text-[#161616] transition-colors">
          [ Back to Homepage ]
        </Link>
        <Link href="/jobs" className="text-[#D16A4A] hover:text-[#161616] transition-colors">
          [ Explore Openings ]
        </Link>
      </div>

    </div>
  );
}
