import { ConfirmModal } from "./ConfirmModal";
import React, { useState, useEffect } from 'react';
import { 
  Bookmark, 
  Search, 
  RefreshCw, 
  Plus, 
  Minus, 
  Trash2, 
  Download, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Filter, 
  Layers, 
  LayoutGrid, 
  List,
  Check,
  FolderPlus,
  X,
  ArrowLeft,
  Swords,
  Zap,
  Shield,
  Mountain,
  Crown,
  BookOpen,
  Columns3
} from 'lucide-react';
import { CollectionCard, Deck, CardCondition, ScryfallCard, Binder } from '../types/mtg';
import { StorageService } from '../services/storage';
import { ManaCostBadge } from './ManaCostBadge';

interface CollectionManagerProps {
  collection: CollectionCard[];
  binders?: Binder[];
  activeBinder?: Binder | null;
  onSelectBinder?: (binder: Binder) => void;
  onCreateBinder?: (name: string, description?: string) => Promise<void> | void;
  onDeleteBinder?: (binderId: string) => Promise<void> | void;
  activeDeck: Deck | null;
  onUpdateCollectionCard: (card: CollectionCard) => void;
  onDeleteCollectionCard: (cardId: string) => void;
  onAddCardToDeck: (card: CollectionCard) => void;
  onOpenSearch: () => void;
  onSelectCard: (card: ScryfallCard) => void;
  onBackToDashboard?: () => void;
}

export const CollectionManager: React.FC<CollectionManagerProps> = ({
  collection,
  binders = [],
  activeBinder,
  onSelectBinder,
  onCreateBinder,
  onDeleteBinder,
  activeDeck,
  onUpdateCollectionCard,
  onDeleteCollectionCard,
  onAddCardToDeck,
  onOpenSearch,
  onSelectCard,
  onBackToDashboard,
}) => {
  const [selectedBinderFilter, setSelectedBinderFilter] = useState<string>(
    activeBinder ? activeBinder.id : 'all'
  );
  const [isCreatingBinder, setIsCreatingBinder] = useState(false);
  const [newBinderName, setNewBinderName] = useState('');
  const [newBinderDesc, setNewBinderDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<string>('all');
  const [selectedSet, setSelectedSet] = useState<string>('all');
  const [selectedColor, setSelectedColor] = useState<string>('all');
  const [onlyFoil, setOnlyFoil] = useState(false);
  const [sortBy, setSortBy] = useState<'value' | 'name' | 'recent' | 'profit' | 'cmc' | 'color'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table' | 'category-grid'>('grid');
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);

  // Sync when activeBinder prop changes
  useEffect(() => {
    if (activeBinder) {
      setSelectedBinderFilter(activeBinder.id);
    } else {
      setSelectedBinderFilter('all');
    }
  }, [activeBinder]);

  // Return to all binders and save current binder
  const handleBackToAllBinders = async () => {
    if (selectedBinderFilter !== 'all') {
      const current = binders.find((b) => b.id === selectedBinderFilter);
      if (current) {
        await StorageService.saveBinder({ ...current, updatedAt: Date.now() });
      }
    }
    setSelectedBinderFilter('all');
    if (onSelectBinder) {
      onSelectBinder(null as any);
    }
  };

  // Filter by selected binder if specified
  const binderFilteredCollection = selectedBinderFilter === 'all'
    ? collection
    : collection.filter((c) => (c.binderId || 'binder-main') === selectedBinderFilter);

  // Statistics for currently viewed binder scope
  const totalCardsCount = binderFilteredCollection.reduce((acc, c) => acc + c.quantity, 0);
  const totalFoilCount = binderFilteredCollection.filter((c) => c.isFoil).reduce((acc, c) => acc + c.quantity, 0);
  const totalMarketValue = binderFilteredCollection.reduce((acc, c) => acc + ((c.currentPriceUsd || 0) * c.quantity), 0);
  const totalAcquiredValue = binderFilteredCollection.reduce((acc, c) => acc + ((c.acquiredPrice || c.currentPriceUsd || 0) * c.quantity), 0);
  const totalGainLoss = totalMarketValue - totalAcquiredValue;

  // Filter and sort
  
  const availableSets = Array.from(new Set(binderFilteredCollection.map(c => c.setName || c.set))).filter(Boolean).sort();
  
  const filteredCards = binderFilteredCollection.filter((item) => {
    const matchSearch = 
      !searchQuery.trim() || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.setName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.notes?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchRarity = selectedRarity === 'all' || item.rarity === selectedRarity;
    const matchCondition = selectedCondition === 'all' || item.condition === selectedCondition;
    const matchFoil = !onlyFoil || item.isFoil;

    return matchSearch && matchRarity && matchCondition && matchFoil;
  });

  const handleCreateBinderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBinderName.trim() || !onCreateBinder) return;
    await onCreateBinder(newBinderName.trim(), newBinderDesc.trim() || undefined);
    setNewBinderName('');
    setNewBinderDesc('');
    setIsCreatingBinder(false);
  };

  filteredCards.sort((a, b) => {
    if (sortBy === 'value') {
      const valA = (a.currentPriceUsd || 0) * a.quantity;
      const valB = (b.currentPriceUsd || 0) * b.quantity;
      return valB - valA;
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'recent') {
      return (b.addedAt || 0) - (a.addedAt || 0);
    }
    if (sortBy === 'profit') {
      const profitA = ((a.currentPriceUsd || 0) - (a.acquiredPrice || a.currentPriceUsd || 0)) * a.quantity;
      const profitB = ((b.currentPriceUsd || 0) - (b.acquiredPrice || b.currentPriceUsd || 0)) * b.quantity;
      return profitB - profitA;
    }
    if (sortBy === 'cmc') {
      return (a.cmc || 0) - (b.cmc || 0);
    }
    if (sortBy === 'color') {
      const colorA = (a.colors || []).join('');
      const colorB = (b.colors || []).join('');
      return colorA.localeCompare(colorB);
    }
    return 0;
  });

  // Group collection cards by MTG card category
  const groupCardsByCategory = (cards: CollectionCard[]) => {
    const groups: Record<string, CollectionCard[]> = {
      'Creatures': [],
      'Instants & Sorceries': [],
      'Artifacts & Enchantments': [],
      'Planeswalkers': [],
      'Lands': [],
      'Other': [],
    };

    cards.forEach((c) => {
      const t = c.type_line?.toLowerCase() || '';
      if (t.includes('creature')) groups['Creatures'].push(c);
      else if (t.includes('instant') || t.includes('sorcery')) groups['Instants & Sorceries'].push(c);
      else if (t.includes('artifact') || t.includes('enchantment')) groups['Artifacts & Enchantments'].push(c);
      else if (t.includes('planeswalker')) groups['Planeswalkers'].push(c);
      else if (t.includes('land')) groups['Lands'].push(c);
      else groups['Other'].push(c);
    });

    return groups;
  };

  const groupedCategories = groupCardsByCategory(filteredCards);

  const categoryConfigs = [
    {
      name: 'Creatures',
      icon: <Swords className="w-4 h-4 text-emerald-400" />,
      cards: groupedCategories['Creatures'],
    },
    {
      name: 'Instants & Sorceries',
      icon: <Zap className="w-4 h-4 text-sky-400" />,
      cards: groupedCategories['Instants & Sorceries'],
    },
    {
      name: 'Artifacts & Enchantments',
      icon: <Shield className="w-4 h-4 text-violet-400" />,
      cards: groupedCategories['Artifacts & Enchantments'],
    },
    {
      name: 'Planeswalkers',
      icon: <Sparkles className="w-4 h-4 text-violet-400" />,
      cards: groupedCategories['Planeswalkers'],
    },
    {
      name: 'Lands',
      icon: <Mountain className="w-4 h-4 text-fuchsia-600" />,
      cards: groupedCategories['Lands'],
    },
    {
      name: 'Other',
      icon: <BookOpen className="w-4 h-4 text-slate-400" />,
      cards: groupedCategories['Other'],
    },
  ];

  const displayedCards = selectedCategoryTab === 'all'
    ? filteredCards
    : (groupedCategories[selectedCategoryTab] || filteredCards);

  const handleLivePriceRefresh = async () => {
    setIsRefreshingPrices(true);
    setRefreshToast(null);
    try {
      await StorageService.refreshCollectionPrices(collection);
      setRefreshToast('Collection prices synced with live Scryfall market!');
      setTimeout(() => setRefreshToast(null), 3000);
    } catch (err: any) {
      setRefreshToast('Price refresh error: ' + (err.message || 'Error'));
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  const handleExportCsv = () => {
    const headers = ['Name', 'Set Code', 'Set Name', 'Collector Number', 'Quantity', 'Foil', 'Condition', 'Current Price USD', 'Acquired Price USD', 'Notes'];
    const rows = collection.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      c.set,
      `"${(c.setName || '').replace(/"/g, '""')}"`,
      c.collectorNumber,
      c.quantity,
      c.isFoil ? 'Yes' : 'No',
      c.condition,
      c.currentPriceUsd || 0,
      c.acquiredPrice || 0,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `mtg_collection_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cardToScryfallCard = (card: CollectionCard): ScryfallCard => ({
    id: card.scryfallId,
    name: card.name,
    set: card.set,
    collector_number: card.collectorNumber,
    cmc: card.cmc,
    mana_cost: card.mana_cost,
    type_line: card.type_line,
    rarity: card.rarity,
    color_identity: card.colors || [],
    legalities: {},
    prices: { usd: card.currentPriceUsd?.toString() },
    image_uris: {
      small: card.imageUrl,
      normal: card.imageUrl,
      large: card.imageUrl,
      art_crop: card.imageUrl,
    },
    imageUrl: card.imageUrl,
    scryfallId: card.scryfallId,
    set_name: card.setName,
  } as any);

  return (
    <div className="space-y-6">
      {/* Binder Management Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {onBackToDashboard ? (
              <button
                type="button"
                onClick={onBackToDashboard}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer border border-slate-700/80"
                title="Return to Binders"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span>Binders</span>
              </button>
            ) : selectedBinderFilter !== 'all' && (
              <button
                type="button"
                onClick={handleBackToAllBinders}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer border border-slate-700/80"
                title="Return to all binders list and save"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span>Binders</span>
              </button>
            )}
            <Bookmark className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {selectedBinderFilter !== 'all' 
                ? (binders.find((b) => b.id === selectedBinderFilter)?.name || 'Binder')
                : 'Collection Binders'}
            </span>
            <span className="text-xs text-slate-500">
              {selectedBinderFilter !== 'all'
                ? `(${collection.filter((c) => (c.binderId || 'binder-main') === selectedBinderFilter).length} cards)`
                : `(${binders.length} ${binders.length === 1 ? 'binder' : 'binders'})`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreatingBinder(!isCreatingBinder)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ Create Binder</span>
            </button>
            <button
              onClick={onOpenSearch}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Cards to Binder</span>
            </button>
          </div>
        </div>

        {/* Inline Create Binder Form */}
        {isCreatingBinder && (
          <form
            onSubmit={handleCreateBinderSubmit}
            className="p-3.5 rounded-xl bg-slate-950 border border-emerald-800/60 flex flex-col sm:flex-row items-center gap-2.5"
          >
            <input
              type="text"
              required
              placeholder="Binder name (e.g., Trade Binder, Modern Foils, Cube)..."
              value={newBinderName}
              onChange={(e) => setNewBinderName(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              placeholder="Description (optional)..."
              value={newBinderDesc}
              onChange={(e) => setNewBinderDesc(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="submit"
                className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingBinder(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        </div>
      {/* Portfolio Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Total Market Value</span>
          <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">
            ${totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <div className="flex items-center gap-1 text-[11px] mt-1 text-slate-400">
            <span>Basis: ${totalAcquiredValue.toFixed(2)}</span>
            {totalGainLoss !== 0 && (
              <span className={`font-semibold flex items-center ${totalGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ({totalGainLoss >= 0 ? '+' : ''}${totalGainLoss.toFixed(2)})
              </span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Cards Owned</span>
          <span className="text-2xl font-extrabold text-slate-100 mt-1 block">
            {totalCardsCount.toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {collection.length} unique entries
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Foil Finishes</span>
          <span className="text-2xl font-extrabold text-violet-400 mt-1 block flex items-center gap-1">
            <Sparkles className="w-5 h-5 text-violet-400" />
            {totalFoilCount}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {totalCardsCount > 0 ? ((totalFoilCount / totalCardsCount) * 100).toFixed(1) : 0}% of binder
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Actions</span>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleLivePriceRefresh}
              disabled={isRefreshingPrices}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
              title="Batch query Scryfall API for current market prices"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPrices ? 'animate-spin text-violet-400' : ''}`} />
              <span>{isRefreshingPrices ? 'Syncing...' : 'Live Prices'}</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Export Collection as CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {refreshToast && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs text-center font-semibold">
          {refreshToast}
        </div>
      )}

      {/* Category Navigation Bar */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 text-xs">
        {/* Category Grid Navigation Option */}
        <button
          type="button"
          onClick={() => setViewMode('category-grid')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
            viewMode === 'category-grid'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
          }`}
          title="Show each category available in a grid layout"
        >
          <Columns3 className="w-3.5 h-3.5" />
          <span>Category Grid</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
            viewMode === 'category-grid' ? 'bg-slate-950/30 text-white' : 'bg-slate-800 text-emerald-400'
          }`}>
            {categoryConfigs.filter((c) => c.cards.length > 0).length}
          </span>
        </button>

        <span className="text-slate-700">|</span>

        {/* All Cards Tab */}
        <button
          type="button"
          onClick={() => {
            setSelectedCategoryTab('all');
            if (viewMode === 'category-grid') setViewMode('grid');
          }}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
            viewMode !== 'category-grid' && selectedCategoryTab === 'all'
              ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          All Cards ({filteredCards.length})
        </button>

        {categoryConfigs.map((cat) => {
          const count = cat.cards.length;
          if (count === 0 && selectedCategoryTab !== cat.name) return null;
          const isSelected = viewMode !== 'category-grid' && selectedCategoryTab === cat.name;

          return (
            <button
              key={cat.name}
              type="button"
              onClick={() => {
                setSelectedCategoryTab(cat.name);
                if (viewMode === 'category-grid') setViewMode('grid');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.icon}
              <span>{cat.name}</span>
              <span className="text-[10px] opacity-75 font-mono">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your collection binder by card name, set, or notes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-fuchsia-500"
            />
          </div>

          <button
            onClick={onOpenSearch}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-900/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Cards to Binder</span>
          </button>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-800/80 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Rarity */}
            <select
              value={selectedRarity}
              onChange={(e) => setSelectedRarity(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
            >
              <option value="all">All Rarities</option>
              <option value="mythic">Mythic</option>
              <option value="rare">Rare</option>
              <option value="uncommon">Uncommon</option>
              <option value="common">Common</option>
            </select>

            {/* Condition */}
            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
            >
              <option value="all">All Conditions</option>
              <option value="NM">Near Mint (NM)</option>
              <option value="LP">Lightly Played (LP)</option>
              <option value="MP">Moderately Played (MP)</option>
              <option value="HP">Heavily Played (HP)</option>
              <option value="DMG">Damaged (DMG)</option>
            </select>

            {/* Foil Toggle */}
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyFoil}
                onChange={(e) => setOnlyFoil(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-violet-400 focus:ring-0"
              />
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-violet-400" /> Foils Only
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2">
                        {/* Set Filter */}
            <select
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none max-w-[120px] truncate"
            >
              <option value="all">All Sets</option>
              {availableSets.map(set => (
                <option key={set} value={set}>{set}</option>
              ))}
            </select>
            {/* Color Filter */}
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
            >
              <option value="all">All Colors</option>
              <option value="W">White</option>
              <option value="U">Blue</option>
              <option value="B">Black</option>
              <option value="R">Red</option>
              <option value="G">Green</option>
              <option value="colorless">Colorless</option>
            </select>
{/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-violet-400 font-semibold focus:outline-none"
            >
              <option value="value">Highest Value</option>
              <option value="name">Name (A-Z)</option>
              <option value="cmc">Mana Value</option>
              <option value="color">Color</option>
              <option value="profit">Highest Profit / Gain</option>
              <option value="recent">Recently Added</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('category-grid')}
                className={`p-1.5 rounded inline-flex items-center gap-1 cursor-pointer text-xs ${
                  viewMode === 'category-grid' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Category Grid Layout — Show each category in a grid layout"
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Categories</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded inline-flex items-center gap-1 cursor-pointer text-xs ${
                  viewMode === 'grid' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Card Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded inline-flex items-center gap-1 cursor-pointer text-xs ${
                  viewMode === 'table' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Table List View"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Table</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cards Display */}
      {filteredCards.length > 0 ? (
        viewMode === 'category-grid' ? (
          /* Category Grid View - Show each category available in a grid layout */
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Columns3 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Category Grid Layout — showing each available card category in a grid</span>
              </span>
              <span className="font-mono text-slate-400">
                {categoryConfigs.filter((c) => c.cards.length > 0).length} categories with cards
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
              {categoryConfigs
                .filter((cat) => cat.cards.length > 0)
                .map((cat) => {
                  const categoryQty = cat.cards.reduce((sum, c) => sum + c.quantity, 0);
                  const categoryValue = cat.cards.reduce((sum, c) => sum + ((c.currentPriceUsd || 0) * c.quantity), 0);
                  const categoryFoils = cat.cards.filter((c) => c.isFoil).reduce((sum, c) => sum + c.quantity, 0);

                  return (
                    <div
                      key={cat.name}
                      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col"
                    >
                      {/* Category Header */}
                      <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {cat.icon}
                          <h4 className="text-xs font-bold text-slate-200 break-words leading-tight">{cat.name}</h4>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-emerald-400 font-bold shrink-0">
                            {categoryQty}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono text-emerald-400 font-bold">
                            ${categoryValue.toFixed(2)}
                          </span>
                          {categoryFoils > 0 && (
                            <span className="text-[10px] font-mono text-violet-400 flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" />
                              {categoryFoils}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={onOpenSearch}
                            className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title={`Add cards to ${cat.name}`}
                          >
                            <Plus className="w-3 h-3 text-emerald-400" />
                          </button>
                        </div>
                      </div>

                      {/* Cards in Category */}
                      <div className="divide-y divide-slate-800/60 max-h-[480px] overflow-y-auto">
                        {cat.cards.map((card) => {
                          const unitPrice = card.currentPriceUsd || 0;
                          const lineTotal = unitPrice * card.quantity;

                          return (
                            <div
                              key={card.id}
                              className="group px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors"
                            >
                              {/* Left: Thumbnail & Name */}
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div
                                  onClick={() => onSelectCard(cardToScryfallCard(card))}
                                  className="w-8 h-11 bg-slate-950 rounded overflow-hidden shrink-0 cursor-pointer border border-slate-800 hover:border-emerald-500 transition-colors relative"
                                >
                                  <img
                                    src={card.imageUrl || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small` : 'https://cards.scryfall.io/back.jpg')}
                                    alt={card.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      if (card.scryfallId && !e.currentTarget.src.includes('format=image')) {
                                        e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small`;
                                      }
                                    }}
                                  />
                                  {card.isFoil && (
                                    <div className="absolute inset-0 bg-fuchsia-400/10 pointer-events-none" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      onClick={() => onSelectCard(cardToScryfallCard(card))}
                                      className="text-xs font-semibold text-slate-200 hover:text-emerald-400 cursor-pointer break-words leading-tight max-w-[140px] sm:max-w-[180px]"
                                      title={card.name}
                                    >
                                      {card.name}
                                    </span>
                                    {card.isFoil && (
                                      <span className="text-violet-400 text-[10px] flex items-center gap-0.5">
                                        <Sparkles className="w-2.5 h-2.5" />
                                      </span>
                                    )}
                                    <span className="text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-400">
                                      {card.condition}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                    <span className="uppercase font-mono">{card.set} · #{card.collectorNumber}</span>
                                    <span>·</span>
                                    <span className="text-emerald-400 font-mono font-medium">${lineTotal.toFixed(2)}</span>
                                    {card.quantity > 1 && (
                                      <span className="text-slate-400">(${unitPrice.toFixed(2)} ea)</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Quantity controls & Actions */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md overflow-hidden text-xs">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (card.quantity > 1) {
                                        onUpdateCollectionCard({ ...card, quantity: card.quantity - 1 });
                                      } else {
                                        onDeleteCollectionCard(card.id);
                                      }
                                    }}
                                    className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                                    title="Decrease quantity"
                                  >
                                    <Minus className="w-2.5 h-2.5" />
                                  </button>
                                  <span className="w-6 text-center font-bold text-slate-200 text-[11px] font-mono">
                                    {card.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onUpdateCollectionCard({ ...card, quantity: card.quantity + 1 })}
                                    className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                                    title="Increase quantity"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </button>
                                </div>

                                {activeDeck && (
                                  <button
                                    type="button"
                                    onClick={() => onAddCardToDeck(card)}
                                    className="p-1 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/25 border-0 text-slate-300 transition-colors cursor-pointer"
                                    title={`Add 1 to active deck: ${activeDeck.name}`}
                                  >
                                    <Layers className="w-3 h-3" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => onDeleteCollectionCard(card.id)}
                                  className="p-1 rounded-md text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                  title="Remove card"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : displayedCards.length > 0 ? (
          viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {displayedCards.map((card) => {
                const unitPrice = card.currentPriceUsd || 0;
                const lineTotal = unitPrice * card.quantity;
                const acqPrice = card.acquiredPrice || unitPrice;
                const gain = (unitPrice - acqPrice) * card.quantity;

                return (
                  <div
                    key={card.id}
                    className="group relative bg-slate-900 border border-slate-800 hover:border-emerald-500/60 rounded-xl overflow-hidden shadow-lg transition-all duration-200 flex flex-col justify-between"
                  >
                    {/* Card Visual */}
                    <div
                      onClick={() => onSelectCard(cardToScryfallCard(card))}
                      className="cursor-pointer relative aspect-[5/7] bg-slate-950 overflow-hidden"
                    >
                      <img
                        src={card.imageUrl || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small` : 'https://cards.scryfall.io/back.jpg')}
                        alt={card.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          if (card.scryfallId && !e.currentTarget.src.includes('format=image')) {
                            e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small`;
                          }
                        }}
                      />

                      {card.isFoil && (
                        <div className="absolute top-1.5 right-1.5 bg-fuchsia-950/90 border border-amber-700/80 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-300 flex items-center gap-0.5 shadow-md">
                          <Sparkles className="w-2.5 h-2.5" /> Foil
                        </div>
                      )}

                      <div className="absolute bottom-1.5 left-1.5 bg-slate-950/90 backdrop-blur-xs border border-slate-800 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-emerald-400">
                        ${lineTotal.toFixed(2)}
                      </div>

                      <div className="absolute bottom-1.5 right-1.5 bg-slate-900/90 border border-slate-700 rounded-md px-1 py-0.5 text-[9px] font-mono text-slate-300">
                        {card.condition}
                      </div>
                    </div>

                    {/* Body & Controls */}
                    <div className="p-2.5 space-y-2">
                      <div>
                        <h4
                          onClick={() => onSelectCard(cardToScryfallCard(card))}
                          className="text-xs font-semibold text-slate-200 break-words leading-tight hover:text-emerald-400 cursor-pointer"
                          title={card.name}
                        >
                          {card.name}
                        </h4>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                          <span className="uppercase font-mono">{card.set} · #{card.collectorNumber}</span>
                          {gain !== 0 && (
                            <span className={`font-semibold ${gain > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {gain > 0 ? '+' : ''}${gain.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stepper & Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md overflow-hidden text-xs">
                          <button
                            onClick={() => {
                              if (card.quantity > 1) {
                                onUpdateCollectionCard({ ...card, quantity: card.quantity - 1 });
                              } else {
                                onDeleteCollectionCard(card.id);
                              }
                            }}
                            className="px-1 py-0.5 hover:bg-slate-800 text-slate-400"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="w-5 text-center font-bold text-slate-200 text-[11px]">
                            {card.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateCollectionCard({ ...card, quantity: card.quantity + 1 })}
                            className="px-1 py-0.5 hover:bg-slate-800 text-slate-400"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          {activeDeck && (
                            <button
                              onClick={() => onAddCardToDeck(card)}
                              className="p-1 rounded bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/25 border-0 text-slate-300 transition-colors"
                              title={`Add 1 to deck "${activeDeck.name}"`}
                            >
                              <Layers className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteCollectionCard(card.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                            title="Remove from binder"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Card Name</th>
                    <th className="py-3 px-3">Set</th>
                    <th className="py-3 px-3">Finish</th>
                    <th className="py-3 px-3">Condition</th>
                    <th className="py-3 px-3">Qty</th>
                    <th className="py-3 px-3 text-right">Market Price</th>
                    <th className="py-3 px-3 text-right">Total Value</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {displayedCards.map((card) => {
                    const unitPrice = card.currentPriceUsd || 0;
                    const lineTotal = unitPrice * card.quantity;

                    return (
                      <tr key={card.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={card.imageUrl || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small` : 'https://cards.scryfall.io/back.jpg')}
                              alt={card.name}
                              className="w-7 h-10 object-cover rounded border border-slate-800"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                if (card.scryfallId && !e.currentTarget.src.includes('format=image')) {
                                  e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small`;
                                }
                              }}
                            />
                            <div>
                              <span 
                                onClick={() => onSelectCard(cardToScryfallCard(card))}
                                className="font-bold text-slate-200 hover:text-violet-400 cursor-pointer block"
                              >
                                {card.name}
                              </span>
                              <span className="text-[10px] text-slate-500">{card.type_line?.split('—')[0]}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono uppercase text-slate-300">{card.set}</span>
                          <span className="text-slate-500 block text-[10px] truncate max-w-[120px]">{card.setName}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          {card.isFoil ? (
                            <span className="text-fuchsia-300 font-bold text-[11px] flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Foil
                            </span>
                          ) : (
                            <span className="text-slate-400">Regular</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300 font-semibold">{card.condition}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-100">{card.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-300">${unitPrice.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">${lineTotal.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {activeDeck && (
                              <button
                                onClick={() => onAddCardToDeck(card)}
                                className="p-1 rounded text-slate-400 hover:text-violet-400"
                                title="Add to Deck"
                              >
                                <Layers className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => onDeleteCollectionCard(card.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="text-center py-12 px-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 space-y-2">
            <p className="text-sm text-slate-300">No {selectedCategoryTab} found in this binder matching current filter criteria.</p>
            <button
              onClick={() => setSelectedCategoryTab('all')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              Show all cards ({filteredCards.length})
            </button>
          </div>
        )
      ) : (
        <div className="text-center py-16 px-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-400 space-y-3">
          <Bookmark className="w-10 h-10 mx-auto text-slate-600" />
          <h3 className="text-base font-semibold text-slate-200">Your binder is empty</h3>
          <p className="text-xs max-w-sm mx-auto text-slate-500">
            {searchQuery ? 'No cards match your filter criteria.' : 'Search Scryfall and click "Add to Collection" to catalog your physical or digital Magic cards.'}
          </p>
          <button
            onClick={onOpenSearch}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors mt-2"
          >
            <Plus className="w-4 h-4" />
            Search Cards to Catalog
          </button>
        </div>
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
