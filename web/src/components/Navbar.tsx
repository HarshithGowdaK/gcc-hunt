'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, ShieldAlert, LogOut, Search, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#030014]/60 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 text-white shadow-md shadow-indigo-500/20">
                <Briefcase className="h-5 w-5" />
              </div>
              <span className="font-sans text-xl font-bold tracking-tight text-white bg-clip-text">
                GCC<span className="text-indigo-400">Hunt</span>
              </span>
            </Link>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex space-x-8 text-sm font-medium">
            <Link 
              href="/" 
              className={`transition-colors ${isActive('/') ? 'text-white font-semibold' : 'text-gray-400 hover:text-white'}`}
            >
              Home
            </Link>
            <Link 
              href="/jobs" 
              className={`transition-colors ${isActive('/jobs') ? 'text-white font-semibold' : 'text-gray-400 hover:text-white'}`}
            >
              Search Jobs
            </Link>
            {isAdmin && (
              <Link 
                href="/admin/dashboard" 
                className={`flex items-center gap-1.5 transition-colors ${isActive('/admin/dashboard') ? 'text-indigo-400 font-semibold' : 'text-gray-400 hover:text-indigo-400'}`}
              >
                <ShieldAlert className="h-4 w-4" />
                Admin Panel
              </Link>
            )}
          </nav>

          {/* User Controls */}
          <div className="flex items-center gap-4">
            <Link 
              href="/jobs" 
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/10 hover:text-white border border-white/5 transition"
            >
              <Search className="h-3.5 w-3.5" />
              Find Jobs
            </Link>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-semibold text-gray-200">{user.email?.split('@')[0]}</span>
                  <span className="text-[10px] text-gray-400">{isAdmin ? 'Administrator' : 'User'}</span>
                </div>
                <button
                  onClick={() => logout()}
                  title="Logout"
                  className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-rose-400 transition"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <Link
                href="/admin"
                className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white transition"
                title="Admin Sign In"
              >
                <User className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
