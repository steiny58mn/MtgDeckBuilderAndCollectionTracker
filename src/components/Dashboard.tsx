import React, { useState } from 'react';
import { ConfirmModal } from './ConfirmModal';
import { Layers, Bookmark, Search, Plus, FolderPlus, Trash2 } from 'lucide-react';
import { Deck, Binder } from '../types/mtg';
import { calculateDeckStats } from '../utils/deckUtils';

interface DashboardProps {
  decks: Deck[];
  binders: Binder[];
  onSelectDeck: (deck: Deck) => void;
  onSelectBinder: (binder: Binder) => void;
  onCreateDeckClick: () => void;
  onCreateBinderClick: () => void;
  onDeleteDeck: (deckId: string) => void;
  onDeleteBinder: (binderId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  decks,
  binders,
  onSelectDeck,
  onSelectBinder,
  onCreateDeckClick,
  onCreateBinderClick,
  onDeleteDeck,
  onDeleteBinder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  const filteredDecks = decks.filter(
    (d) => !searchQuery.trim() || d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredBinders = binders.filter(
    (b) => !searchQuery.trim() || b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header & Global Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Your entire Magic: The Gathering collection & decks</p>
        </div>

        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decks and binders..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 shadow-inner"
          />
        </div>
      </div>

      {/* Decks Grid Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Layers className="w-5 h-5 text-fuchsia-500" />
            Decklists
          </h2>
          <button
            onClick={onCreateDeckClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/25 border-0 text-slate-300 rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Deck
          </button>
        </div>

        {filteredDecks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDecks.map((deck) => {
              const stats = calculateDeckStats(deck);
              const coverArt = deck.commanderArtUrl || deck.coverCardUrl || (deck.cards[0]?.imageUrl);

              return (
                <div
                  key={deck.id}
                  onClick={() => onSelectDeck(deck)}
                  className="group relative bg-slate-900 border border-slate-800 hover:border-fuchsia-500/60 rounded-2xl overflow-hidden shadow-xl transition-all duration-200 hover:-translate-y-1 flex flex-col justify-between cursor-pointer"
                >
                  <div className="relative h-36 bg-slate-950 overflow-hidden">
                    {coverArt ? (
                      <img
                        src={coverArt}
                        alt={deck.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
                        <Layers className="w-10 h-10 text-slate-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                    
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-xs border border-slate-700/80 text-[10px] uppercase font-bold text-fuchsia-400">
                        {deck.format}
                      </span>
                    </div>

                    <div className="absolute bottom-2.5 right-2.5 bg-slate-950/90 backdrop-blur-xs px-2 py-0.5 rounded-md border border-slate-800 text-xs font-bold text-emerald-400">
                      ${stats.totalPriceUsd.toFixed(2)}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-fuchsia-400 transition-colors line-clamp-1">
                          {deck.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                          {deck.commanderName || deck.description || 'Custom MTG Deck'}
                        </p>
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmState({
                            isOpen: true,
                            title: 'Delete Deck',
                            message: `Are you sure you want to delete the deck "${deck.name}"?`,
                            onConfirm: () => onDeleteDeck(deck.id)
                          });
                        }}
                        className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:bg-rose-900/40 hover:text-rose-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                        title="Delete Deck"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                      <strong className="text-slate-200 font-mono">{stats.mainboardCount}</strong> {deck.format === 'commander' ? '/ 100' : ''} cards
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 px-4 rounded-2xl bg-slate-900/40 border border-slate-800 border-dashed text-slate-500 text-sm">
            No decklists found.
          </div>
        )}
      </div>

      {/* Binders Grid Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-emerald-500" />
            Binders
          </h2>
          <button
            onClick={onCreateBinderClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 rounded-lg text-xs font-bold transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            New Binder
          </button>
        </div>

        {filteredBinders.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredBinders.map((binder) => (
              <div
                key={binder.id}
                onClick={() => onSelectBinder(binder)}
                className="group p-5 bg-slate-900 border border-slate-800 hover:border-emerald-500/60 rounded-2xl shadow-xl transition-all duration-200 hover:-translate-y-1 cursor-pointer flex flex-col justify-between relative"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-inner">
                    <Bookmark className="w-6 h-6 text-emerald-500" />
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmState({
                        isOpen: true,
                        title: 'Delete Binder',
                        message: `Are you sure you want to delete the binder "${binder.name}"? Cards within the binder will remain in your collection.`,
                        onConfirm: () => onDeleteBinder(binder.id)
                      });
                    }}
                    className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:bg-rose-900/40 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete Binder"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                    {binder.name}
                  </h3>
                  {binder.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {binder.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 px-4 rounded-2xl bg-slate-900/40 border border-slate-800 border-dashed text-slate-500 text-sm">
            No binders found.
          </div>
        )}
      </div>
      <ConfirmModal 
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        confirmText="Delete"
      />
    </div>
  );
};
