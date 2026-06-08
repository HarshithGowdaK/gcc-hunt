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
      // AuthProvider state change listener will trigger and verify admin claim.
      // Redirect handled by useEffect above
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
      setLoginLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 h-96 w-96 rounded-full bg-indigo-500/10 blur-[120px]" />

      <div className="w-full max-w-md glass-card p-8 space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">Administrator Portal</h2>
          <p className="text-xs text-gray-400">Sign in to control crawlers and manage companies</p>
        </div>

        {/* Errors */}
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2 animate-fade-in">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Login Error</span>
              <p className="leading-relaxed opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Email Address</label>
            <div className="glass-card flex items-center px-3.5 py-2.5 bg-white/[0.005]">
              <Mail className="h-4 w-4 text-gray-500 mr-2.5 shrink-0" />
              <input
                type="email"
                required
                className="bg-transparent border-0 outline-none text-white placeholder-gray-500 text-xs w-full focus:ring-0"
                placeholder="admin@gcchunt.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Password</label>
            <div className="glass-card flex items-center px-3.5 py-2.5 bg-white/[0.005]">
              <Lock className="h-4 w-4 text-gray-500 mr-2.5 shrink-0" />
              <input
                type="password"
                required
                className="bg-transparent border-0 outline-none text-white placeholder-gray-500 text-xs w-full focus:ring-0"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full inline-flex justify-center items-center gap-1.5 rounded-lg bg-indigo-600 py-3 text-xs font-bold text-white hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 transition disabled:opacity-50"
          >
            {loginLoading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Signing In...
              </>
            ) : (
              'Sign In as Admin'
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-white/5 text-center">
          <Link href="/" className="text-xs text-indigo-400 hover:text-indigo-300">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
