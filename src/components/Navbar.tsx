import React, { useState, useRef, useEffect } from 'react';
import { 
  Layers, 
  Bookmark, 
  Search,
  User as UserIcon,
  LogIn,
  LogOut,
  KeyRound,
  ChevronDown
} from 'lucide-react';
import { Deck, CollectionCard, Binder } from '../types/mtg';
import { UserDto } from '../services/authService';
import { AuthMode } from './AuthModal';

interface NavbarProps {
  activeTab: 'decks' | 'collection' | 'search' | 'login';
  onTabChange: (tab: 'decks' | 'collection' | 'search' | 'login') => void;
  decks: Deck[];
  collection: CollectionCard[];
  binders?: Binder[];
  activeDeck: Deck | null;
  onSelectActiveDeck: (deck: Deck) => void;
  user?: UserDto | null;
  onOpenAuth: (mode?: AuthMode) => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  decks,
  collection: _collection,
  binders = [],
  activeDeck: _activeDeck,
  onSelectActiveDeck: _onSelectActiveDeck,
  user,
  onOpenAuth,
  onLogout,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-indigo-500/20 shadow-lg shadow-indigo-500/5">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & App Title */}
          <div className="flex items-center gap-3">
            <div 
              onClick={() => onTabChange('decks')}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-fuchsia-400 p-0.5 shadow-lg shadow-fuchsia-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <span className="font-serif font-black text-fuchsia-400 text-lg leading-none">M</span>
                </div>
              </div>
              <div>
                <span className="font-serif font-black tracking-wide text-white text-base block group-hover:text-fuchsia-400 transition-colors">
                  MTG Studio
                </span>
                <span className="text-[10px] uppercase tracking-widest text-violet-400/90 font-bold block -mt-0.5">
                  Deck & Collection
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 ml-6">
              <button
                onClick={() => onTabChange('decks')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'decks'
                    ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Decks ({decks.length})</span>
              </button>
              
              <button
                onClick={() => onTabChange('collection')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'collection'
                    ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Binders ({binders.length})</span>
              </button>

              <button
                onClick={() => onTabChange('search')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'search'
                    ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Card Database</span>
              </button>
            </nav>
          </div>

          {/* Right Section: Authentication State */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-indigo-500/20 text-xs font-medium text-slate-200 transition-all cursor-pointer shadow-sm"
                >
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center text-[11px] font-bold text-white uppercase shadow-sm">
                    {user.username.charAt(0)}
                  </div>
                  <span className="font-semibold text-white max-w-[120px] truncate">
                    {user.username}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl shadow-slate-950/80 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                        Signed In As
                      </div>
                      <div className="text-xs font-bold text-white truncate mt-0.5">
                        {user.username}
                      </div>
                      {user.email && (
                        <div className="text-[11px] text-slate-400 truncate">
                          {user.email}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenAuth('change-password');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-left"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-violet-400" />
                      <span>Change Password</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenAuth('login')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-bold shadow-md shadow-fuchsia-500/20 transition-all cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/80">
          <button
            onClick={() => onTabChange('decks')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold ${
              activeTab === 'decks' ? 'text-fuchsia-400' : 'text-slate-400'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Decks</span>
          </button>

          <button
            onClick={() => onTabChange('collection')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold ${
              activeTab === 'collection' ? 'text-fuchsia-400' : 'text-slate-400'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Binders ({binders.length})</span>
          </button>

          <button
            onClick={() => onTabChange('search')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold ${
              activeTab === 'search' ? 'text-fuchsia-400' : 'text-slate-400'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
          </button>

          {user ? (
            <button
              onClick={() => onOpenAuth('change-password')}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold text-violet-400"
            >
              <UserIcon className="w-4 h-4" />
              <span className="truncate max-w-[50px]">{user.username}</span>
            </button>
          ) : (
            <button
              onClick={() => onOpenAuth('login')}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold text-fuchsia-400"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
