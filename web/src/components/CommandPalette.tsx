'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, MapPin, X, HelpCircle, ArrowRight } from 'lucide-react';
import { fetchCompanies } from '@/lib/api';

export default function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Key listener for triggering the command palette (CMD/CTRL + K) and custom events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleToggle = () => setIsOpen((prev) => !prev);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('toggle-command-palette', handleToggle);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('toggle-command-palette', handleToggle);
    };
  }, []);

  // Fetch companies to search against
  useEffect(() => {
    if (isOpen) {
      async function loadCompanies() {
        try {
          const data = await fetchCompanies();
          setCompanies(data);
        } catch (e) {
          console.error(e);
        }
      }
      loadCompanies();
      setActiveIndex(0);
      setSearch('');
      // Auto focus input
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const hotspots = [
    { name: 'Bangalore', type: 'city' },
    { name: 'Hyderabad', type: 'city' },
    { name: 'Pune', type: 'city' },
    { name: 'Chennai', type: 'city' }
  ];

  // Filter lists based on search string
  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5);

  const filteredHotspots = hotspots.filter(h =>
    h.name.toLowerCase().includes(search.toLowerCase())
  );

  const results = [
    ...filteredHotspots.map(h => ({ name: h.name, type: 'city', value: h.name })),
    ...filteredCompanies.map(c => ({ name: c.name, type: 'company', value: c.id }))
  ];

  const handleSelect = (item: { name: string; type: string; value: string }) => {
    setIsOpen(false);
    if (item.type === 'company') {
      router.push(`/jobs?company=${item.value}`);
    } else if (item.type === 'city') {
      router.push(`/jobs?city=${item.value.toLowerCase()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) {
        handleSelect(results[activeIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) setIsOpen(false);
      }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#161616]/40 backdrop-blur-xs pt-[15vh] px-4"
    >
      <div className="w-full max-w-xl border border-[#E5E1D8] bg-[#F7F4EE] shadow-2xl rounded-none overflow-hidden animate-slide-up text-left">
        
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-[#E5E1D8] px-4 py-3">
          <Search className="h-4.5 w-4.5 text-[#7A8471] mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent border-0 outline-none text-xs text-[#161616] placeholder-[#7A8471] focus:ring-0 font-bold uppercase tracking-wider"
            placeholder="Type a company name or city..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1 text-[#7A8471] hover:text-[#161616] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-80 overflow-y-auto custom-scrollbar p-2">
          {results.length === 0 ? (
            <div className="text-center py-8 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
              No matching shortcuts found
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-[8.5px] font-black text-[#D16A4A] uppercase tracking-widest px-3 py-1">
                Shortcut Index Suggestions
              </div>
              
              {results.map((item, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-none cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-[#E5E1D8]/55 border-l-2 border-[#D16A4A] text-[#161616]' 
                        : 'text-gray-500 hover:text-[#161616] hover:bg-[#E5E1D8]/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.type === 'company' ? (
                        <Building2 className="h-4 w-4 text-[#D16A4A] shrink-0" />
                      ) : (
                        <MapPin className="h-4 w-4 text-[#D16A4A] shrink-0" />
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-widest">{item.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-bold uppercase tracking-widest text-[#7A8471] px-1.5 py-0.5 border border-[#E5E1D8]">
                        {item.type}
                      </span>
                      {isSelected && (
                        <ArrowRight className="h-3 w-3 text-[#D16A4A]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Guide Footer */}
        <div className="border-t border-[#E5E1D8] bg-[#FCFAF7] px-4 py-2.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-[#7A8471]">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="mr-1">↑↓</kbd> Jump
            </span>
            <span>
              <kbd className="mr-1">Enter</kbd> Select
            </span>
            <span>
              <kbd className="mr-1">Esc</kbd> Exit
            </span>
          </div>
          <div className="flex items-center gap-1">
            <HelpCircle className="h-3 w-3 text-[#7A8471]" />
            <span className="font-semibold uppercase tracking-wider text-[8.5px]">Index Shortcuts</span>
          </div>
        </div>

      </div>
    </div>
  );
}
