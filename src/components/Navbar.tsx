import React from 'react';
import { 
  Layers, 
  Bookmark, 
  Search, 
  Cloud, 
  Sparkles, 
  Check, 
  Database,
  Key
} from 'lucide-react';
import { Deck, CollectionCard, Binder } from '../types/mtg';
import { SyncStatus, getCurrentVaultId } from '../services/storage';

interface NavbarProps {
  activeTab: 'decks' | 'collection' | 'search';
  onTabChange: (tab: 'decks' | 'collection' | 'search') => void;
  decks: Deck[];
  collection: CollectionCard[];
  binders?: Binder[];
  activeDeck: Deck | null;
  onSelectActiveDeck: (deck: Deck) => void;
  syncStatus: SyncStatus;
  onOpenSyncModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  decks,
  collection,
  binders = [],
  activeDeck,
  onSelectActiveDeck,
  syncStatus,
  onOpenSyncModal,
}) => {
  const currentVaultId = getCurrentVaultId();

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-indigo-500/20 shadow-lg shadow-indigo-500/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                  ScrySync
                </span>
                <span className="text-[10px] uppercase tracking-widest text-violet-400/90 font-bold block -mt-0.5">
                  MTG Creative Studio
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 ml-6">
              <button
                onClick={() => onTabChange('decks')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'search'
                    ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Scryfall DB</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Turso Cloud Vault Sync Button */}
            <button
              onClick={onOpenSyncModal}
              className="flex items-center gap-2 bg-slate-900 border border-slate-700 hover:border-fuchsia-500/50 hover:bg-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              title="Manage Turso Cloud Vault Sync"
            >
              {syncStatus === 'syncing' ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-fuchsia-500 rounded-full animate-spin" />
              ) : syncStatus === 'error' ? (
                <Cloud className="w-3.5 h-3.5 text-rose-500" />
              ) : syncStatus === 'synced' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Database className="w-3.5 h-3.5 text-fuchsia-400" />
              )}
              
              <span className="hidden sm:inline-block">
                {currentVaultId ? (
                  <span className="text-slate-300">Vault: <span className="text-fuchsia-400 font-mono">{currentVaultId}</span></span>
                ) : (
                  <span className="text-slate-400">Turso Local</span>
                )}
              </span>
              
              {currentVaultId && syncStatus === 'synced' && (
                <Sparkles className="w-3 h-3 text-emerald-400 ml-0.5 hidden sm:inline-block" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/80">
          <button
            onClick={() => onTabChange('decks')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
              activeTab === 'decks' ? 'text-fuchsia-400' : 'text-slate-400'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Decks</span>
          </button>

          <button
            onClick={() => onTabChange('collection')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
              activeTab === 'collection' ? 'text-fuchsia-400' : 'text-slate-400'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Binders ({binders.length})</span>
          </button>

          <button
            onClick={() => onTabChange('search')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
              activeTab === 'search' ? 'text-fuchsia-400' : 'text-slate-400'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
          </button>
        </div>
      </div>
    </header>
  );
};
