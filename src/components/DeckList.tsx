import { ConfirmModal } from "./ConfirmModal";
import React, { useState } from 'react';
import { 
  Plus, 
  Layers, 
  Copy, 
  Trash2, 
  ExternalLink, 
  Search, 
  Sparkles, 
  FolderPlus,
  Play,
  Check,
  Upload
} from 'lucide-react';
import { Deck, MTGFormat } from '../types/mtg';
import { calculateDeckStats } from '../utils/deckUtils';
import { DeckExportModal } from './DeckExportModal';

interface DeckListProps {
  decks: Deck[];
  onSelectDeck: (deck: Deck) => void;
  onCreateDeck: (newDeck: Partial<Deck>) => void;
  onDuplicateDeck: (deck: Deck) => void;
  onDeleteDeck: (deckId: string) => void;
  onImportDeck?: (newDeck: Deck, shouldSaveCurrentDeck: boolean) => Promise<void>;
}

export const DeckList: React.FC<DeckListProps> = ({
  decks,
  onSelectDeck,
  onCreateDeck,
  onDuplicateDeck,
  onDeleteDeck,
  onImportDeck,
}) => {
  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // New deck form state
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<MTGFormat>('commander');
  const [newDeckDesc, setNewDeckDesc] = useState('');

  const filteredDecks = decks.filter((d) => {
    const matchFormat = filterFormat === 'all' || d.format === filterFormat;
    const matchSearch = 
      !searchQuery.trim() || 
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      d.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.commanderName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFormat && matchSearch;
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;

    onCreateDeck({
      name: newDeckName.trim(),
      format: newDeckFormat,
      description: newDeckDesc.trim(),
      cards: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    setNewDeckName('');
    setNewDeckDesc('');
    setShowCreateModal(false);
  };

  const formats: { id: string; label: string }[] = [
    { id: 'all', label: 'All Formats' },
    { id: 'commander', label: 'Commander / EDH' },
    { id: 'modern', label: 'Modern' },
    { id: 'standard', label: 'Standard' },
    { id: 'pioneer', label: 'Pioneer' },
    { id: 'legacy', label: 'Legacy' },
    { id: 'pauper', label: 'Pauper' },
    { id: 'casual', label: 'Casual' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Controls: Filter tabs & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decks by name, commander, or tag..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-fuchsia-500"
          />
        </div>

        {/* Action Buttons: Import & New Deck */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors shrink-0 cursor-pointer"
            title="Import decklist from BBCode, TappedOut, Moxfield, MTGO, Excel, CSV, or text"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Import Deck</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors shadow-lg shadow-fuchsia-500/10 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Deck</span>
          </button>
        </div>
      </div>

      {/* Format Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {formats.map((fmt) => (
          <button
            key={fmt.id}
            onClick={() => setFilterFormat(fmt.id)}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              filterFormat === fmt.id
                ? 'bg-slate-800 text-fuchsia-400 border border-fuchsia-500/30'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80'
            }`}
          >
            {fmt.label}
          </button>
        ))}
      </div>

      {/* Decks Grid */}
      {filteredDecks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDecks.map((deck) => {
            const stats = calculateDeckStats(deck);
            const coverArt = deck.commanderArtUrl || deck.coverCardUrl || (deck.cards[0]?.imageUrl);

            return (
              <div
                key={deck.id}
                className="group relative bg-slate-900 border border-slate-800 hover:border-fuchsia-500/60 rounded-2xl overflow-hidden shadow-xl transition-all duration-200 hover:-translate-y-1 flex flex-col justify-between"
              >
                {/* Deck Card Banner */}
                <div
                  onClick={() => onSelectDeck(deck)}
                  className="cursor-pointer relative h-36 bg-slate-950 overflow-hidden"
                >
                  {coverArt ? (
                    <img
                      src={coverArt}
                      alt={deck.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        if (deck.cards[0]?.scryfallId && !e.currentTarget.src.includes('format=image')) {
                          e.currentTarget.src = `https://api.scryfall.com/cards/${deck.cards[0].scryfallId}?format=image&version=art_crop`;
                        } else {
                          e.currentTarget.style.display = 'none';
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
                      <Layers className="w-10 h-10 text-slate-700" />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

                  {/* Format Pill & Value */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-xs border border-slate-700/80 text-[10px] uppercase font-bold text-fuchsia-400">
                      {deck.format}
                    </span>
                    {deck.commanderName && (
                      <span className="px-2 py-0.5 rounded-md bg-fuchsia-950/80 backdrop-blur-xs border border-amber-700/80 text-[10px] font-semibold text-fuchsia-300 truncate max-w-[140px]">
                        {deck.commanderName}
                      </span>
                    )}
                  </div>

                  <div className="absolute bottom-2.5 right-2.5 bg-slate-950/90 backdrop-blur-xs px-2 py-0.5 rounded-md border border-slate-800 text-xs font-bold text-emerald-400">
                    ${stats.totalPriceUsd.toFixed(2)}
                  </div>
                </div>

                {/* Deck Info Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div onClick={() => onSelectDeck(deck)} className="cursor-pointer">
                    <h3 className="text-base font-bold text-white group-hover:text-fuchsia-400 transition-colors line-clamp-1">
                      {deck.name}
                    </h3>
                    {deck.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {deck.description}
                      </p>
                    )}
                  </div>

                  {/* Stats snippet */}
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <span>
                        <strong className="text-slate-200 font-mono">{stats.mainboardCount}</strong>{' '}
                        {deck.format === 'commander' ? '/ 100 cards' : 'cards'}
                      </span>
                      {stats.sideboardCount > 0 && (
                        <span>
                          <strong className="text-slate-300 font-mono">{stats.sideboardCount}</strong> SB
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateDeck(deck);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Duplicate deck"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
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
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete deck"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 px-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-400 space-y-3">
          <Layers className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-base font-semibold text-slate-200">No decks found</h3>
          <p className="text-xs max-w-sm mx-auto text-slate-500">
            {searchQuery ? 'No decks match your filter criteria.' : 'Create your first custom Magic: The Gathering deck to start building.'}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors mt-2"
          >
            <Plus className="w-4 h-4" />
            Create New Deck
          </button>
        </div>
      )}

      {/* Create Deck Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-fuchsia-400" />
              Create New MTG Deck
            </h3>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Deck Name</label>
                <input
                  type="text"
                  required
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="e.g. Urza, Lord High Artificer // Artifact Combo"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-fuchsia-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Format</label>
                <select
                  value={newDeckFormat}
                  onChange={(e) => setNewDeckFormat(e.target.value as MTGFormat)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 capitalize focus:outline-none focus:border-fuchsia-500"
                >
                  <option value="commander">Commander / EDH (100 Cards Singleton)</option>
                  <option value="standard">Standard (60 Cards Min)</option>
                  <option value="modern">Modern (60 Cards Min)</option>
                  <option value="pioneer">Pioneer (60 Cards Min)</option>
                  <option value="legacy">Legacy (60 Cards Min)</option>
                  <option value="vintage">Vintage (60 Cards Min)</option>
                  <option value="pauper">Pauper (Commons Only)</option>
                  <option value="casual">Casual / Kitchen Table</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Strategy / Description (Optional)</label>
                <textarea
                  value={newDeckDesc}
                  onChange={(e) => setNewDeckDesc(e.target.value)}
                  placeholder="Win conditions, key synergy combos, notes..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-fuchsia-500 h-20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors"
                >
                  Create Deck
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <DeckExportModal
          deck={null}
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportAsNewDeck={async (newDeck, shouldSave) => {
            if (onImportDeck) {
              await onImportDeck(newDeck, shouldSave);
            }
            setShowImportModal(false);
          }}
          initialTab="import"
        />
      )}
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
