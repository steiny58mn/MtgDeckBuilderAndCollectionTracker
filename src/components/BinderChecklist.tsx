import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  CheckSquare, 
  Square, 
  Boxes, 
  Search, 
  CheckCircle2, 
  Layers, 
  Copy, 
  Check, 
  RotateCcw, 
  Sparkles, 
  Plus, 
  Minus, 
  X,
  FileSpreadsheet,
  AlertTriangle,
  FolderOpen,
  ArrowUpDown,
  Printer,
  ExternalLink
} from 'lucide-react';
import { CollectionCard, Deck, Binder } from '../types/mtg';
import { buildCrossDeckUsageMap } from '../utils/deckUtils';
import { DeckService } from '../services/deckService';
import { toHighResImageUrl } from '../services/api';
import { useImageHoverPreview, ImageHoverPopup } from './ImageHoverPopup';
import { printChecklist, ChecklistPrintItem, ChecklistPrintDeckUsage } from '../utils/checklistPrint';

export interface BinderChecklistProps {
  cards: CollectionCard[];
  binders?: Binder[];
  selectedBinderId: string;
  onSelectBinderId?: (binderId: string) => void;
  onUpdateCollectionCard?: (card: CollectionCard) => void;
  onAddCardToDeck?: (card: CollectionCard) => void;
  activeDeck?: Deck | null;
  onClose?: () => void;
  isModal?: boolean;
}

export const BinderChecklist: React.FC<BinderChecklistProps> = ({
  cards,
  binders = [],
  selectedBinderId,
  onSelectBinderId,
  onUpdateCollectionCard,
  onAddCardToDeck,
  activeDeck,
  onClose,
  isModal = false,
}) => {
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unverified' | 'verified' | 'in-decks' | 'this-deck' | 'binder-only'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'name-desc' | 'price-desc' | 'set'>('name');
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  // Subscribe to all decks for live cross-deck usage calculation
  const [allDecks, setAllDecks] = useState<Deck[]>(() => DeckService.getLocalDecks());
  useEffect(() => {
    return DeckService.subscribeDecks((decks) => setAllDecks(decks));
  }, []);

  const crossDeckUsageMap = useMemo(() => {
    return buildCrossDeckUsageMap(allDecks);
  }, [allDecks]);

  // Persistent checklist verification state in localStorage
  const storageKey = `binder_checklist_${selectedBinderId || 'all'}`;
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {}
    return new Set<string>();
  });

  // Reload verification state when binder changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setCheckedIds(new Set(JSON.parse(saved)));
      } else {
        setCheckedIds(new Set());
      }
    } catch {
      setCheckedIds(new Set());
    }
  }, [storageKey]);

  const toggleCheck = useCallback((cardId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, [storageKey]);

  const checkAll = useCallback((cardIds: string[]) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      cardIds.forEach((id) => next.add(id));
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, [storageKey]);

  const uncheckAll = useCallback(() => {
    setCheckedIds(new Set());
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  // Set of card names in active deck for "this-deck" filtering
  const activeDeckCardNames = useMemo(() => {
    if (!activeDeck?.cards) return new Set<string>();
    const names = new Set<string>();
    activeDeck.cards.forEach((c) => {
      const clean = (c.name || '').split(' // ')[0].replace(/\s*[([].*?[)\]]/g, '').trim().toLowerCase();
      if (clean) names.add(clean);
    });
    return names;
  }, [activeDeck]);

  // Filter cards by current binder selection
  const binderCards = useMemo(() => {
    if (!selectedBinderId || selectedBinderId === 'all') {
      return cards;
    }
    return cards.filter((c) => (c.binderId || 'binder-main') === selectedBinderId);
  }, [cards, selectedBinderId]);

  // Card list filtered by search and checklist verification tab, sorted alphabetically by default
  const displayedCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = binderCards.filter((c) => {
      // 1. Search Query
      if (q) {
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const setMatch = (c.set || '').toLowerCase().includes(q) || (c.setName || '').toLowerCase().includes(q);
        const typeMatch = (c.type_line || c.typeLine || '').toLowerCase().includes(q);
        if (!nameMatch && !setMatch && !typeMatch) return false;
      }

      const isChecked = checkedIds.has(c.id);
      const cleanName = (c.name || '').split(' // ')[0].replace(/\s*[([].*?[)\]]/g, '').trim().toLowerCase();
      const cross = crossDeckUsageMap.get(cleanName);
      const isInDeck = Boolean(cross && cross.totalUsed > 0);

      // 2. Filter mode
      if (filterMode === 'unverified') return !isChecked;
      if (filterMode === 'verified') return isChecked;
      if (filterMode === 'in-decks') return isInDeck;
      if (filterMode === 'this-deck') return activeDeckCardNames.has(cleanName);
      if (filterMode === 'binder-only') return !isInDeck;

      return true;
    });

    // Default sort in binder: Alphabetical (A-Z)
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        const diff = (a.name || '').localeCompare(b.name || '');
        if (diff !== 0) return diff;
        return (a.collectorNumber || '').localeCompare(b.collectorNumber || '', undefined, { numeric: true });
      }
      if (sortBy === 'name-desc') {
        const diff = (b.name || '').localeCompare(a.name || '');
        if (diff !== 0) return diff;
        return (a.collectorNumber || '').localeCompare(b.collectorNumber || '', undefined, { numeric: true });
      }
      if (sortBy === 'price-desc') {
        const priceA = Number(a.currentPriceUsd || a.medianPriceUsd || 0);
        const priceB = Number(b.currentPriceUsd || b.medianPriceUsd || 0);
        if (priceB !== priceA) return priceB - priceA;
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'set') {
        const setA = (a.set || '').toLowerCase();
        const setB = (b.set || '').toLowerCase();
        if (setA !== setB) return setA.localeCompare(setB);
        return (a.collectorNumber || '').localeCompare(b.collectorNumber || '', undefined, { numeric: true });
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [binderCards, searchQuery, filterMode, sortBy, checkedIds, crossDeckUsageMap, activeDeckCardNames]);

  // Audit Metrics
  const totalCardsInBinder = binderCards.length;
  const totalVerifiedCount = useMemo(() => {
    return binderCards.filter((c) => checkedIds.has(c.id)).length;
  }, [binderCards, checkedIds]);

  const percentVerified = totalCardsInBinder > 0 
    ? Math.round((totalVerifiedCount / totalCardsInBinder) * 100) 
    : 0;

  const cardsInDecksCount = useMemo(() => {
    return binderCards.filter((c) => {
      const cleanName = (c.name || '').split(' // ')[0].replace(/\s*[([].*?[)\]]/g, '').trim().toLowerCase();
      const cross = crossDeckUsageMap.get(cleanName);
      return Boolean(cross && cross.totalUsed > 0);
    }).length;
  }, [binderCards, crossDeckUsageMap]);

  const thisDeckCardsCount = useMemo(() => {
    if (!activeDeckCardNames.size) return 0;
    return binderCards.filter((c) => {
      const cleanName = (c.name || '').split(' // ')[0].replace(/\s*[([].*?[)\]]/g, '').trim().toLowerCase();
      return activeDeckCardNames.has(cleanName);
    }).length;
  }, [binderCards, activeDeckCardNames]);

  // Hover image preview
  const {
    activePreview: hoverPreview,
    handleMouseEnter: onImageMouseEnter,
    handleMouseMove: onImageMouseMove,
    handleMouseLeave: onImageMouseLeave,
    clearPreview: onImageClearPreview,
  } = useImageHoverPreview(150);

  // Copy checklist as text with deck mentions
  const handleCopyTextChecklist = () => {
    const lines = displayedCards.map((c) => {
      const isChecked = checkedIds.has(c.id);
      const checkMark = isChecked ? '[X]' : '[ ]';
      const cleanName = (c.name || '').split(' // ')[0].replace(/\s*[([].*?[)\]]/g, '').trim().toLowerCase();
      const cross = crossDeckUsageMap.get(cleanName);
      
      let deckInfo = '';
      if (cross && cross.decks.length > 0) {
        const deckNames = cross.decks.map((d) => `${d.quantity}x in "${d.deckName}"`).join(', ');
        deckInfo = ` -> IN DECKS: ${deckNames}`;
      } else {
        deckInfo = ' -> In Binder Only';
      }

      const foilStr = c.isFoil ? ' *Foil*' : '';
      return `${checkMark} ${c.quantity}x ${c.name} (${c.set.toUpperCase()} #${c.collectorNumber})${foilStr}${deckInfo}`;
    });

    const activeBinderName = selectedBinderId === 'all' 
      ? 'All Binders' 
      : (binders.find((b) => b.id === selectedBinderId)?.name || 'Binder');

    const header = `=== Binder Physical Checklist: ${activeBinderName} (${totalVerifiedCount}/${totalCardsInBinder} verified - ${percentVerified}%) ===\n\n`;
    navigator.clipboard.writeText(header + lines.join('\n'));
    setCopiedToast(`Copied ${displayedCards.length} checklist items to clipboard!`);
    setTimeout(() => setCopiedToast(null), 3000);
  };

  // Print physical checklist formatted for paper / PDF
  const [printColumns, setPrintColumns] = useState<1 | 2 | 3>(() => {
    try {
      const saved = localStorage.getItem('mtg_checklist_print_cols');
      if (saved === '1' || saved === '2' || saved === '3') {
        return Number(saved) as 1 | 2 | 3;
      }
    } catch (_) {}
    return 2; // Default to 2 columns to save paper
  });

  const handlePrintChecklist = (colsOverride?: 1 | 2 | 3) => {
    const effectiveCols = colsOverride || printColumns || 2;
    const activeBinderName = selectedBinderId === 'all'
      ? 'All Binders (Collection)'
      : (binders.find((b) => b.id === selectedBinderId)?.name || 'Selected Binder');

    const filterLabels: Record<string, string> = {
      all: 'All Cards',
      unverified: 'Unverified Cards',
      verified: 'Verified Cards',
      indecks: 'Cards in Decks',
      available: 'Available in Binder',
      missing: 'Missing from Binder',
    };

    const items: ChecklistPrintItem[] = displayedCards.map((c) => {
      const isChecked = checkedIds.has(c.id);
      const cleanName = (c.name || '').split(' // ')[0].replace(/\s*[(\[].*?[\)\]]/g, '').trim().toLowerCase();
      const cross = crossDeckUsageMap.get(cleanName);

      const totalOwned = c.quantity || 1;
      const totalInDecks = cross ? cross.totalUsed : 0;
      const decksList: ChecklistPrintDeckUsage[] = cross && cross.decks ? cross.decks.map((d) => ({
        deckId: d.deckId,
        deckName: d.deckName,
        quantity: d.quantity,
        
      })) : [];

      let deckUsageText = '';
      if (cross && cross.decks.length > 0) {
        deckUsageText = cross.decks.map((d) => `${d.quantity}x in "${d.deckName}"`).join(', ');
      }

      return {
        id: c.id,
        name: c.name,
        quantity: totalOwned,
        totalOwned: totalOwned,
        totalInDecks: totalInDecks,
        decksList: decksList,
        set: c.set,
        collectorNumber: c.collectorNumber,
        typeLine: c.type_line || c.typeLine,
        isFoil: Boolean(c.isFoil),
        condition: c.condition,
        price: c.currentPriceUsd || c.medianPriceUsd || 0,
        isChecked,
        deckUsageText,
      };
    });

    const title = `Binder Checklist: ${activeBinderName}`;

    printChecklist({
      title,
      subtitle: 'MTG Physical Card Gathering & Verification Checklist',
      binderName: activeBinderName,
      // Omit deckName for pure binder checklist
      // Omit deckFormat for pure binder checklist
      verifiedCount: totalVerifiedCount,
      totalCards: totalCardsInBinder,
      percentVerified,
      filterLabel: `${filterLabels[filterMode] || filterMode}${searchQuery ? ` (Search: "${searchQuery}")` : ''}`,
      columns: effectiveCols,
      items,
    });
  };

  const currentBinderName = selectedBinderId === 'all'
    ? 'All Binders'
    : (binders.find((b) => b.id === selectedBinderId)?.name || 'Selected Binder');

  return (
    <div className={`flex flex-col bg-slate-950 text-slate-100 ${isModal ? 'h-full max-h-[90vh]' : 'rounded-2xl border border-slate-800 shadow-2xl p-4 sm:p-6 my-4'}`}>
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 shrink-0">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white tracking-tight">
                Binder Physical Checklist & Cross-Reference
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold">
                {percentVerified}% Verified
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Audit your physical binders against your collection and see which cards are currently in decks so you don't have to check all your deckboxes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Binder Selector Dropdown */}
          {binders.length > 0 && onSelectBinderId && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <FolderOpen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline">
                Binder:
              </span>
              <select
                value={selectedBinderId}
                onChange={(e) => onSelectBinderId(e.target.value)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
                title="Select binder to verify"
              >
                <option value="all" className="bg-slate-900 text-white">🌐 All Binders</option>
                {binders.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                    📁 {b.name} ({b.cards?.length || 0} cards)
                  </option>
                ))}
              </select>

              {/* Open Binder in New Tab */}
              <a
                href={
                  selectedBinderId && selectedBinderId !== 'all'
                    ? `?binder=${encodeURIComponent(selectedBinderId)}`
                    : '?tab=collection'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors inline-flex items-center justify-center cursor-pointer"
                title={
                  selectedBinderId && selectedBinderId !== 'all'
                    ? `Open "${binders.find((b) => b.id === selectedBinderId)?.name || 'Binder'}" in a new tab`
                    : 'Open Collection Binders in a new tab'
                }
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyTextChecklist}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer shadow-xs"
            title="Copy checklist with deck locations to clipboard"
          >
            {copiedToast ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
            <span>{copiedToast ? 'Copied!' : 'Copy List'}</span>
          </button>

          <div className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-800 p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => handlePrintChecklist(printColumns)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-slate-200 text-xs font-semibold hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              title={`Print physical checklist (${printColumns} column${printColumns > 1 ? 's to save paper' : ''})`}
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              <span>Print ({printColumns}C)</span>
            </button>
            <div className="h-3.5 w-px bg-slate-700 mx-0.5" />
            {([1, 2, 3] as const).map((cols) => (
              <button
                key={cols}
                type="button"
                onClick={() => {
                  setPrintColumns(cols);
                  try { localStorage.setItem('mtg_checklist_print_cols', String(cols)); } catch (_) {}
                }}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                  printColumns === cols
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
                title={`Print in ${cols} column${cols > 1 ? 's (saves paper)' : ''}`}
              >
                {`${cols}C`}
              </button>
            ))}
          </div>

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close checklist"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress & Verification Stats Banner */}
      <div className="py-3 px-4 my-3 rounded-xl bg-slate-900/90 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                Verified <strong className="text-white font-mono">{totalVerifiedCount}</strong> of <strong className="text-white font-mono">{totalCardsInBinder}</strong> cards in <span className="text-emerald-300 font-bold">{currentBinderName}</span>
              </span>
            </span>
            <span className="font-mono text-emerald-400 font-bold">{percentVerified}%</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div 
              className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${percentVerified}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="px-2.5 py-1 rounded-lg bg-violet-950/60 border border-violet-600/40 text-violet-300 font-mono text-[11px] flex items-center gap-1.5" title="Cards from this binder currently in use across your decks">
            <Boxes className="w-3.5 h-3.5 text-violet-400" />
            <span>{cardsInDecksCount} In Decks</span>
          </div>

          <button
            type="button"
            onClick={() => checkAll(displayedCards.map((c) => c.id))}
            className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-500/50 text-emerald-300 font-semibold text-[11px] transition-colors cursor-pointer"
            title="Mark all currently displayed cards as verified"
          >
            Check All Filtered
          </button>

          {checkedIds.size > 0 && (
            <button
              type="button"
              onClick={uncheckAll}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 text-[11px] transition-colors cursor-pointer flex items-center gap-1"
              title="Clear all checked cards for this binder"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Checks</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter, Sort, and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cards in this binder by name or set..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Tab Filters & Sort dropdown */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {/* Sort Selector */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 shrink-0">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-emerald-400 font-semibold text-xs focus:outline-none cursor-pointer"
              title="Sort cards in checklist"
            >
              <option value="name" className="bg-slate-900 text-white">Sort: A-Z (Alphabetical)</option>
              <option value="name-desc" className="bg-slate-900 text-white">Sort: Z-A</option>
              <option value="price-desc" className="bg-slate-900 text-white">Sort: Highest Price</option>
              <option value="set" className="bg-slate-900 text-white">Sort: Set & Collector #</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
              filterMode === 'all'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All ({binderCards.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('unverified')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
              filterMode === 'unverified'
                ? 'bg-amber-600 text-white font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Unverified ({binderCards.length - totalVerifiedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('verified')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
              filterMode === 'verified'
                ? 'bg-emerald-700 text-white font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Verified ({totalVerifiedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('in-decks')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
              filterMode === 'in-decks'
                ? 'bg-violet-600 text-white font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Only show cards that are currently in one or more decks"
          >
            <Boxes className="w-3 h-3" />
            <span>In Decks ({cardsInDecksCount})</span>
          </button>
          {activeDeck && (
            <button
              type="button"
              onClick={() => setFilterMode('this-deck')}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'this-deck'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
              title={`Only show cards from this binder in deck "${activeDeck.name}"`}
            >
              <Layers className="w-3 h-3" />
              <span>In "{activeDeck.name}" ({thisDeckCardsCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilterMode('binder-only')}
            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
              filterMode === 'binder-only'
                ? 'bg-slate-700 text-white font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Binder Only ({binderCards.length - cardsInDecksCount})
          </button>
        </div>
      </div>

      {/* Main Checklist Card List */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/70">
        {displayedCards.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-medium">No cards found matching current filter.</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-emerald-400 hover:underline cursor-pointer"
              >
                Clear search query
              </button>
            )}
          </div>
        ) : (
          displayedCards.map((card, index) => {
            const isChecked = checkedIds.has(card.id);
            const cleanName = (card.name || '').split(' // ')[0].replace(/\s*[([].*?[)\]]/g, '').trim().toLowerCase();
            const cross = crossDeckUsageMap.get(cleanName);
            const isInDeck = Boolean(cross && cross.totalUsed > 0);
            const isOvercommitted = Boolean(cross && cross.totalUsed > card.quantity);

            // Safe price conversion
            const priceNum = Number(card.currentPriceUsd || card.medianPriceUsd || 0);

            return (
              <div
                key={card.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 transition-colors ${
                  isChecked
                    ? 'bg-emerald-950/20 text-slate-400 hover:bg-emerald-950/30'
                    : 'hover:bg-slate-800/50 text-slate-200'
                }`}
              >
                {/* Left side: Checkbox + Card Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Interactive Verification Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleCheck(card.id)}
                    className={`p-1 rounded-lg transition-transform active:scale-90 cursor-pointer shrink-0 ${
                      isChecked
                        ? 'text-emerald-400 hover:text-emerald-300'
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                    title={isChecked ? 'Mark as unverified' : 'Mark as physically verified in binder'}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-5 h-5 fill-emerald-950" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-slate-500">#{index + 1}</span>
                      
                      {/* Card Name with Hover Preview */}
                      <span
                        className={`font-semibold text-xs transition-colors cursor-pointer ${
                          isChecked
                            ? 'line-through text-slate-400'
                            : 'text-white hover:text-emerald-300'
                        }`}
                        onMouseEnter={(e) =>
                          onImageMouseEnter(e, {
                            imageUrl: toHighResImageUrl(card.imageUrl, card.scryfallId),
                            fallbackUrl: card.imageUrl,
                            name: card.name,
                          })
                        }
                        onMouseMove={onImageMouseMove}
                        onMouseLeave={onImageMouseLeave}
                      >
                        {card.name}
                      </span>

                      {/* Quantity Pill */}
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/80 font-mono text-[10px] font-bold text-slate-200">
                        {card.quantity}x
                      </span>

                      {/* Foil Badge */}
                      {card.isFoil && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-fuchsia-950/80 border border-fuchsia-500/50 text-fuchsia-300 text-[10px] font-semibold">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Foil</span>
                        </span>
                      )}

                      {/* Set and Collector Number */}
                      <span className="text-[10px] font-mono text-slate-400 uppercase">
                        {card.set} #{card.collectorNumber}
                      </span>

                      {/* Condition */}
                      {card.condition && (
                        <span className="text-[10px] text-slate-400 bg-slate-950 px-1 py-0.2 rounded border border-slate-800">
                          {card.condition}
                        </span>
                      )}
                    </div>

                    {/* Price and Type Line */}
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                      <span>{card.type_line || card.typeLine}</span>
                      {!isNaN(priceNum) && priceNum > 0 && (
                        <span className="font-mono text-emerald-400 font-semibold">
                          ${priceNum.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Deck Mentions & Physical Location */}
                <div className="flex items-center gap-3 justify-between sm:justify-end shrink-0 pl-8 sm:pl-0">
                  {/* Deck Mentions Badge */}
                  {isInDeck && cross ? (
                    <div className="flex flex-col items-start sm:items-end gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-950/80 border border-violet-500/60 text-violet-200 text-[11px] font-semibold shadow-xs">
                          <Boxes className="w-3 h-3 text-violet-400" />
                          <span>In {cross.decks.length} {cross.decks.length === 1 ? 'deck' : 'decks'} ({cross.totalUsed}x used)</span>
                        </span>
                        {isOvercommitted && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-500/70 text-amber-300 text-[10px] font-bold" title="More copies are used in decks than exist in this binder!">
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                            <span>Deficit ({cross.totalUsed - card.quantity}x)</span>
                          </span>
                        )}
                      </div>
                      
                      {/* Individual Decks List */}
                      <div className="flex items-center gap-1 flex-wrap text-[10px]">
                        {cross.decks.map((deckEntry) => (
                          <span
                            key={deckEntry.deckId}
                            className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 text-slate-300 hover:text-white"
                            title={`Card is physically in deck "${deckEntry.deckName}" (${deckEntry.quantity} copy)`}
                          >
                            <span className="font-mono font-bold text-violet-400 mr-1">{deckEntry.quantity}x</span>
                            <span>{deckEntry.deckName}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800/80">
                      📁 In Binder only (0 decks)
                    </span>
                  )}

                  {/* Quantity quick controls */}
                  {onUpdateCollectionCard && (
                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          if (card.quantity > 1) {
                            onUpdateCollectionCard({ ...card, quantity: card.quantity - 1 });
                          }
                        }}
                        disabled={card.quantity <= 1}
                        className="px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40 cursor-pointer"
                        title="Decrease binder quantity"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="px-2 font-mono text-xs font-bold text-white">
                        {card.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateCollectionCard({ ...card, quantity: card.quantity + 1 })}
                        className="px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                        title="Increase binder quantity"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}

                  {/* Quick add to active deck if open */}
                  {activeDeck && onAddCardToDeck && (
                    <button
                      type="button"
                      onClick={() => onAddCardToDeck(card)}
                      className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-xs"
                      title={`Add 1 copy of "${card.name}" to deck "${activeDeck.name}"`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Hover Image Popup */}
      <ImageHoverPopup preview={hoverPreview} onDismiss={onImageClearPreview} />
    </div>
  );
};
