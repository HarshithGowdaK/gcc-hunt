import React from 'react';
import Link from 'next/link';
import { Briefcase } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/5 bg-[#030014] py-8 text-sm text-gray-500">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          
          {/* Left Brand */}
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-tr from-indigo-500 to-cyan-400 text-white shadow-md">
              <Briefcase className="h-3.5 w-3.5" />
            </div>
            <span className="font-bold text-white tracking-tight text-sm">
              GCC<span className="text-indigo-400">Hunt</span>
            </span>
            <span className="text-gray-600">|</span>
            <p className="text-xs text-gray-500">
              © {new Date().getFullYear()} GCC Hunt. India-based Job Portal.
            </p>
          </div>

          {/* Right Links */}
          <div className="flex gap-6 text-xs text-gray-400">
            <Link href="/" className="hover:text-white transition">Home</Link>
            <Link href="/jobs" className="hover:text-white transition">Explore Jobs</Link>
            <Link href="/admin" className="hover:text-white transition">Admin Portal</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
