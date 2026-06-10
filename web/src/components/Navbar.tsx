'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

  const isActive = (path: string) => pathname === path;

  const triggerPalette = () => {
    window.dispatchEvent(new Event('toggle-command-palette'));
  };

  return (
    <header className="w-full border-b border-[#E5E1D8] py-5 flex items-center justify-between">
      {/* Brand Logo */}
      <div className="flex items-center gap-2">
        <Link href="/" className="flex flex-col text-left group">
          <span className="font-editorial-serif text-lg sm:text-2xl font-black tracking-tighter text-[#161616] leading-none uppercase">
            G.C.C. Index
          </span>
          <span className="text-[7.5px] font-bold tracking-widest text-[#7A8471] uppercase mt-0.5">
            Verified Global Talent Telemetry
          </span>
        </Link>
      </div>

      {/* Nav Links */}
      <nav className="hidden md:flex items-center space-x-6 text-[9px] font-bold tracking-widest uppercase text-[#7A8471]">
        <Link 
          href="/" 
          className={`transition-colors duration-200 hover:text-[#161616] ${
            isActive('/') ? 'text-[#161616] border-b border-[#161616] pb-1' : 'pb-1'
          }`}
        >
          Intelligence
        </Link>
        <Link 
          href="/jobs" 
          className={`transition-colors duration-200 hover:text-[#161616] ${
            isActive('/jobs') ? 'text-[#161616] border-b border-[#161616] pb-1' : 'pb-1'
          }`}
        >
          Classifieds
        </Link>
        <Link 
          href="/companies" 
          className={`transition-colors duration-200 hover:text-[#161616] ${
            isActive('/companies') ? 'text-[#161616] border-b border-[#161616] pb-1' : 'pb-1'
          }`}
        >
          Corporation Index
        </Link>
      </nav>

      {/* Controls */}
      <div className="flex items-center gap-4 text-[9px] font-bold tracking-widest uppercase">
        {/* Monochromatic Status tag */}
        <div className="hidden sm:inline-flex items-center gap-1.5 text-[#7A8471]">
          <span className="h-1 w-1 bg-[#D16A4A] rounded-full"></span>
          <span>INDEX ACTIVE</span>
        </div>

        {/* Command palette query button */}
        <button 
          onClick={triggerPalette}
          className="inline-flex items-center gap-1 text-[#7A8471] hover:text-[#161616] transition-colors"
        >
          <Search className="h-3 w-3" />
          <span>Search (⌘K)</span>
        </button>

        {isAdmin && (
          <Link 
            href="/admin/dashboard" 
            className="text-[#D16A4A] hover:text-[#161616] transition-colors"
          >
            Admin
          </Link>
        )}

        {user ? (
          <div className="flex items-center gap-3 border-l border-[#E5E1D8] pl-3">
            <span className="text-[#7A8471] normal-case font-medium">{user.email?.split('@')[0]}</span>
            <button
              onClick={() => logout()}
              className="text-[#D16A4A] hover:underline transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            href="/admin"
            className="text-[#7A8471] hover:text-[#161616] transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
