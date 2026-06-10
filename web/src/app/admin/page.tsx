'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Shield, Lock, Mail, RefreshCw, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to dashboard if already logged in as admin
  useEffect(() => {
    if (!loading && user && isAdmin) {
      router.push('/admin/dashboard');
    }
  }, [user, isAdmin, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginLoading(true);

    try {
      // Sign in the user via Firebase Auth
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
      setLoginLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-[#D16A4A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16 animate-slide-up text-left">
      <div className="w-full max-w-md border border-[#E5E1D8] bg-[#FCFAF7] p-8 space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 border border-[#E5E1D8] bg-[#F7F4EE] text-[#D16A4A] flex items-center justify-center">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-editorial-serif font-black text-[#161616] uppercase tracking-tight">Administrator Index Login</h2>
          <p className="text-[9px] font-bold text-[#7A8471] uppercase tracking-wider">Access secure crawler telemetry controls</p>
        </div>

        {/* Errors */}
        {error && (
          <div className="p-3.5 border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold uppercase tracking-wider text-[9px]">Authorization Blocked</span>
              <p className="leading-relaxed font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1.5">Email Address</label>
            <div className="border border-[#E5E1D8] bg-[#F7F4EE] flex items-center px-3.5 py-2.5">
              <Mail className="h-4 w-4 text-[#7A8471] mr-2.5 shrink-0" />
              <input
                type="email"
                required
                className="bg-transparent border-0 outline-none text-[#161616] placeholder-[#7A8471] text-xs w-full focus:ring-0"
                placeholder="admin@gcchunt.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-[8.5px] font-bold text-[#7A8471] uppercase tracking-widest block mb-1.5">Password</label>
            <div className="border border-[#E5E1D8] bg-[#F7F4EE] flex items-center px-3.5 py-2.5">
              <Lock className="h-4 w-4 text-[#7A8471] mr-2.5 shrink-0" />
              <input
                type="password"
                required
                className="bg-transparent border-0 outline-none text-[#161616] placeholder-[#7A8471] text-xs w-full focus:ring-0"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full inline-flex justify-center items-center gap-1.5 bg-[#161616] py-3 text-[10px] font-bold text-[#F7F4EE] hover:bg-[#D16A4A] transition disabled:opacity-50 uppercase tracking-widest"
          >
            {loginLoading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Validating Credentials...
              </>
            ) : (
              '[ Authenticate Portal ]'
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-[#E5E1D8] text-center">
          <Link href="/" className="text-[9px] font-bold text-[#D16A4A] hover:text-[#161616] uppercase tracking-widest underline underline-offset-2">
            Return to Public Catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
