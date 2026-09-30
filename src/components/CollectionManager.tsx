import { useImageHoverPreview, ImageHoverPopup } from './ImageHoverPopup';
import { useCardDualClickPeek, DualClickCardModal } from './DualClickCardPopup';
import { ConfirmModal } from "./ConfirmModal";
import React, { useState, useEffect, useMemo, useRef, useDeferredValue, useTransition, useCallback } from 'react';
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
  Columns3,
  Upload,
  ArrowUp,
  ArrowDown,
  BarChart3,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { CollectionCard, Deck, CardCondition, ScryfallCard, Binder } from '../types/mtg';
import { DeckService } from '../services/deckService';
import { getKnownMedianPrice, toHighResImageUrl } from '../services/scryfall';
import { scrollToTop } from '../utils/scrollUtils';
import { getCardColorCategoryRank } from '../utils/deckUtils';
import { ManaCostBadge } from './ManaCostBadge';
import { BinderImportModal } from './BinderImportModal';

export function getCardMarketPrice(card: CollectionCard): { price: number; isMedian: boolean } {
  if (card.currentPriceUsd && card.currentPriceUsd > 0) {
    return {
      price: card.currentPriceUsd,
      isMedian: Boolean(card.isPriceEstimated || card.medianPriceUsd),
    };
  }
  if (card.medianPriceUsd && card.medianPriceUsd > 0) {
    return { price: card.medianPriceUsd, isMedian: true };
  }
  const known = getKnownMedianPrice(card.name);
  if (known && known > 0) {
    return { price: known, isMedian: true };
  }
  return { price: 0, isMedian: false };
}

export function cardToScryfallCard(card: CollectionCard): ScryfallCard {
  return {
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
  } as any;
}

export function getCardDisplayImageUrl(card: CollectionCard): string {
  return toHighResImageUrl(card.imageUrl, card.scryfallId);
}

export function getCardLargeImageUrl(card: CollectionCard): string {
  return toHighResImageUrl(card.imageUrl, card.scryfallId);
}

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

  // Always scroll back to top of screen when entering or switching a binder
  useEffect(() => {
    scrollToTop();
  }, [activeBinder?.id]);

  const [isCreatingBinder, setIsCreatingBinder] = useState(false);
  const [newBinderName, setNewBinderName] = useState('');
  const [newBinderDesc, setNewBinderDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<string>('all');
  const [selectedSet, setSelectedSet] = useState<string>('all');
  const [selectedColor, setSelectedColor] = useState<string>('all');
  const [onlyFoil, setOnlyFoil] = useState(false);
  const [sortBy, setSortBy] = useState<'price-desc' | 'price-asc' | 'value' | 'name' | 'name-desc' | 'recent' | 'profit' | 'cmc' | 'color'>('price-desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table' | 'category-grid'>('grid');
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [categoryLimits, setCategoryLimits] = useState<Record<string, number>>({});
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mtg_summary_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSummaryCollapse = useCallback(() => {
    setIsSummaryCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mtg_summary_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const [isPending, startTransition] = useTransition();

  const { peekCard, setPeekCard, wasChordTriggeredRecently, getCardChordProps } = useCardDualClickPeek();
  const {
    activePreview: hoverPreview,
    handleMouseEnter: onImageMouseEnter,
    handleMouseMove: onImageMouseMove,
    handleMouseLeave: onImageMouseLeave,
    clearPreview: onImageClearPreview,
  } = useImageHoverPreview(150);

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
        await DeckService.saveBinder({ ...current, updatedAt: Date.now() });
      }
    }
    setSelectedBinderFilter('all');
    if (onSelectBinder) {
      onSelectBinder(null as any);
    }
  };

  // Progressive display pagination for high performance
  const INITIAL_PAGE_SIZE = 80;
  const [displayLimit, setDisplayLimit] = useState(INITIAL_PAGE_SIZE);
  const priceCheckAttempted = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Filter by selected binder if specified (memoized)
  const binderFilteredCollection = useMemo(() => {
    return selectedBinderFilter === 'all'
      ? collection
      : collection.filter((c) => (c.binderId || 'binder-main') === selectedBinderFilter);
  }, [collection, selectedBinderFilter]);

  // Pre-computed card market prices map for O(1) instant lookup and fast calculations
  const cardPriceMap = useMemo(() => {
    const map = new Map<string, { price: number; isMedian: boolean }>();
    for (const card of binderFilteredCollection) {
      map.set(card.id, getCardMarketPrice(card));
    }
    return map;
  }, [binderFilteredCollection]);

  // Pre-computed card search index to avoid repeated lowercasing and object lookups
  const cardSearchIndexMap = useMemo(() => {
    const map = new Map<string, {
      nameLower: string;
      setLower: string;
      notesLower: string;
      colors: string[];
    }>();
    for (const c of binderFilteredCollection) {
      map.set(c.id, {
        nameLower: c.name.toLowerCase(),
        setLower: (c.setName || c.set || '').toLowerCase(),
        notesLower: (c.notes || '').toLowerCase(),
        colors: c.colors || c.color_identity || [],
      });
    }
    return map;
  }, [binderFilteredCollection]);

  // Pre-computed card sorting metadata (numeric prices, total value, profit, cmc, colorRank, nameLower)
  // This enables blazing-fast typed numeric sort comparisons without hash lookups or string lowercase calls
  const cardSortMetaMap = useMemo(() => {
    const map = new Map<string, {
      price: number;
      value: number;
      profit: number;
      cmc: number;
      colorRank: number;
      nameLower: string;
    }>();
    for (const c of binderFilteredCollection) {
      const pInfo = cardPriceMap.get(c.id) || { price: 0, isMedian: false };
      const price = pInfo.price;
      const acq = c.acquiredPrice !== undefined ? c.acquiredPrice : price;
      map.set(c.id, {
        price,
        value: price * c.quantity,
        profit: (price - acq) * c.quantity,
        cmc: c.cmc || 0,
        colorRank: getCardColorCategoryRank(c),
        nameLower: c.name.toLowerCase(),
      });
    }
    return map;
  }, [binderFilteredCollection, cardPriceMap]);

  // Auto-refresh prices for unpriced cards in the current binder (once per card per session)
  useEffect(() => {
    const unpriced = binderFilteredCollection.filter(
      (c) => !c.currentPriceUsd && c.scryfallId && !priceCheckAttempted.current.has(c.scryfallId)
    );
    if (unpriced.length > 0 && !isRefreshingPrices) {
      unpriced.forEach((c) => priceCheckAttempted.current.add(c.scryfallId));
      DeckService.refreshCollectionPrices(unpriced).catch(() => {});
    }
  }, [selectedBinderFilter, binderFilteredCollection, isRefreshingPrices]);

  // Statistics for currently viewed binder scope (memoized)
  const { totalCardsCount, totalFoilCount, totalMarketValue, totalAcquiredValue, totalGainLoss } = useMemo(() => {
    let count = 0;
    let foil = 0;
    let market = 0;
    let acquired = 0;

    for (const c of binderFilteredCollection) {
      const price = cardPriceMap.get(c.id)?.price || 0;
      count += c.quantity;
      if (c.isFoil) foil += c.quantity;
      market += price * c.quantity;
      acquired += (c.acquiredPrice || price) * c.quantity;
    }

    return {
      totalCardsCount: count,
      totalFoilCount: foil,
      totalMarketValue: market,
      totalAcquiredValue: acquired,
      totalGainLoss: market - acquired,
    };
  }, [binderFilteredCollection, cardPriceMap]);

  // Breakdown of collection cards by rarity (memoized)
  const rarityStats = useMemo(() => {
    let mythic = 0;
    let rare = 0;
    let uncommon = 0;
    let common = 0;
    let other = 0;

    for (const c of binderFilteredCollection) {
      const r = (c.rarity || '').toLowerCase().trim();
      const qty = c.quantity || 1;
      if (r === 'mythic' || r.includes('mythic')) {
        mythic += qty;
      } else if (r === 'rare') {
        rare += qty;
      } else if (r === 'uncommon') {
        uncommon += qty;
      } else if (r === 'common') {
        common += qty;
      } else {
        other += qty;
      }
    }

    const total = mythic + rare + uncommon + common + other;

    const items = [
      {
        key: 'mythic',
        label: 'Mythic Rare',
        shortLabel: 'Mythic',
        count: mythic,
        percentage: total > 0 ? (mythic / total) * 100 : 0,
        color: 'from-orange-500 to-amber-500',
        textColor: 'text-orange-400',
        dotColor: 'bg-orange-500',
      },
      {
        key: 'rare',
        label: 'Rare',
        shortLabel: 'Rare',
        count: rare,
        percentage: total > 0 ? (rare / total) * 100 : 0,
        color: 'from-yellow-400 to-amber-400',
        textColor: 'text-yellow-400',
        dotColor: 'bg-yellow-400',
      },
      {
        key: 'uncommon',
        label: 'Uncommon',
        shortLabel: 'Uncommon',
        count: uncommon,
        percentage: total > 0 ? (uncommon / total) * 100 : 0,
        color: 'from-sky-400 to-cyan-400',
        textColor: 'text-sky-400',
        dotColor: 'bg-sky-400',
      },
      {
        key: 'common',
        label: 'Common',
        shortLabel: 'Common',
        count: common,
        percentage: total > 0 ? (common / total) * 100 : 0,
        color: 'from-slate-400 to-slate-300',
        textColor: 'text-slate-300',
        dotColor: 'bg-slate-400',
      },
    ];

    if (other > 0) {
      items.push({
        key: 'other',
        label: 'Other',
        shortLabel: 'Other',
        count: other,
        percentage: (other / total) * 100,
        color: 'from-purple-400 to-indigo-400',
        textColor: 'text-purple-400',
        dotColor: 'bg-purple-400',
      });
    }

    return { total, items };
  }, [binderFilteredCollection]);

  // Pre-computed available sets (memoized)
  const availableSets = useMemo(() => {
    const setNames = new Set<string>();
    for (const c of binderFilteredCollection) {
      const name = c.setName || c.set;
      if (name) setNames.add(name);
    }
    return Array.from(setNames).sort();
  }, [binderFilteredCollection]);

  // Deferred search query to prevent keyboard lag while typing
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Reset displayLimit whenever filters or sort criteria change
  useEffect(() => {
    setDisplayLimit(INITIAL_PAGE_SIZE);
  }, [selectedBinderFilter, deferredSearchQuery, selectedRarity, selectedCondition, selectedSet, selectedColor, onlyFoil, sortBy, selectedCategoryTab]);

  // Fast filtered cards (memoized using pre-indexed search strings)
  const filteredCards = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();

    return binderFilteredCollection.filter((item) => {
      const idx = cardSearchIndexMap.get(item.id);
      if (q && idx) {
        if (!idx.nameLower.includes(q) && !idx.setLower.includes(q) && !idx.notesLower.includes(q)) {
          return false;
        }
      }

      if (selectedRarity !== 'all' && item.rarity !== selectedRarity) return false;
      if (selectedCondition !== 'all' && item.condition !== selectedCondition) return false;
      if (selectedSet !== 'all' && item.setName !== selectedSet && item.set !== selectedSet) return false;
      if (selectedColor !== 'all' && idx) {
        if (selectedColor === 'colorless') {
          if (idx.colors.length > 0) return false;
        } else if (!idx.colors.includes(selectedColor)) {
          return false;
        }
      }
      if (onlyFoil && !item.isFoil) return false;

      return true;
    });
  }, [binderFilteredCollection, cardSearchIndexMap, deferredSearchQuery, selectedRarity, selectedCondition, selectedSet, selectedColor, onlyFoil]);

  const handleCreateBinderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBinderName.trim() || !onCreateBinder) return;
    await onCreateBinder(newBinderName.trim(), newBinderDesc.trim() || undefined);
    setNewBinderName('');
    setNewBinderDesc('');
    setIsCreatingBinder(false);
  };

  // High-performance sorting using pre-indexed metadata
  const sortedCards = useMemo(() => {
    const list = [...filteredCards];
    if (list.length <= 1) return list;

    list.sort((a, b) => {
      const metaA = cardSortMetaMap.get(a.id);
      const metaB = cardSortMetaMap.get(b.id);
      if (!metaA || !metaB) return 0;

      if (sortBy === 'price-desc') {
        const diff = metaB.price - metaA.price;
        if (diff !== 0) return diff;
        return metaA.nameLower < metaB.nameLower ? -1 : metaA.nameLower > metaB.nameLower ? 1 : 0;
      }
      if (sortBy === 'price-asc') {
        const diff = metaA.price - metaB.price;
        if (diff !== 0) return diff;
        return metaA.nameLower < metaB.nameLower ? -1 : metaA.nameLower > metaB.nameLower ? 1 : 0;
      }
      if (sortBy === 'value') {
        const diff = metaB.value - metaA.value;
        if (diff !== 0) return diff;
        return metaA.nameLower < metaB.nameLower ? -1 : metaA.nameLower > metaB.nameLower ? 1 : 0;
      }
      if (sortBy === 'name') {
        return metaA.nameLower < metaB.nameLower ? -1 : metaA.nameLower > metaB.nameLower ? 1 : 0;
      }
      if (sortBy === 'name-desc') {
        return metaB.nameLower < metaA.nameLower ? -1 : metaB.nameLower > metaA.nameLower ? 1 : 0;
      }
      if (sortBy === 'recent') {
        return (b.addedAt || 0) - (a.addedAt || 0);
      }
      if (sortBy === 'profit') {
        const diff = metaB.profit - metaA.profit;
        if (diff !== 0) return diff;
        return metaA.nameLower < metaB.nameLower ? -1 : metaA.nameLower > metaB.nameLower ? 1 : 0;
      }
      if (sortBy === 'cmc') {
        const diff = metaA.cmc - metaB.cmc;
        if (diff !== 0) return diff;
        return metaA.nameLower < metaB.nameLower ? -1 : metaA.nameLower > metaB.nameLower ? 1 : 0;
      }
      if (sortBy === 'color') {
        const diffRank = metaA.colorRank - metaB.colorRank;
        if (diffRank !== 0) return diffRank;
        const diffCmc = metaA.cmc - metaB.cmc;
        if (diffCmc !== 0) return diffCmc;
        return metaA.nameLower < metaB.nameLower ? -1 : metaA.nameLower > metaB.nameLower ? 1 : 0;
      }
      return 0;
    });

    return list;
  }, [filteredCards, sortBy, cardSortMetaMap]);

  // Group collection cards by MTG card category (memoized)
  const groupedCategories = useMemo(() => {
    const groups: Record<string, CollectionCard[]> = {
      'Creatures': [],
      'Instants & Sorceries': [],
      'Artifacts & Enchantments': [],
      'Planeswalkers': [],
      'Lands': [],
      'Other': [],
    };

    for (const c of sortedCards) {
      const t = c.type_line?.toLowerCase() || '';
      if (t.includes('creature')) groups['Creatures'].push(c);
      else if (t.includes('instant') || t.includes('sorcery')) groups['Instants & Sorceries'].push(c);
      else if (t.includes('artifact') || t.includes('enchantment')) groups['Artifacts & Enchantments'].push(c);
      else if (t.includes('planeswalker')) groups['Planeswalkers'].push(c);
      else if (t.includes('land')) groups['Lands'].push(c);
      else groups['Other'].push(c);
    }

    return groups;
  }, [sortedCards]);

  // Pre-computed category summaries to prevent O(N) calls on every render
  const categoryConfigs = useMemo(() => [
    {
      name: 'Creatures',
      icon: <Swords className="w-4 h-4 text-emerald-400" />,
      cards: groupedCategories['Creatures'],
      totalQty: groupedCategories['Creatures'].reduce((s, c) => s + c.quantity, 0),
      totalValue: groupedCategories['Creatures'].reduce((s, c) => s + ((cardPriceMap.get(c.id)?.price || 0) * c.quantity), 0),
      totalFoils: groupedCategories['Creatures'].filter((c) => c.isFoil).reduce((s, c) => s + c.quantity, 0),
    },
    {
      name: 'Instants & Sorceries',
      icon: <Zap className="w-4 h-4 text-sky-400" />,
      cards: groupedCategories['Instants & Sorceries'],
      totalQty: groupedCategories['Instants & Sorceries'].reduce((s, c) => s + c.quantity, 0),
      totalValue: groupedCategories['Instants & Sorceries'].reduce((s, c) => s + ((cardPriceMap.get(c.id)?.price || 0) * c.quantity), 0),
      totalFoils: groupedCategories['Instants & Sorceries'].filter((c) => c.isFoil).reduce((s, c) => s + c.quantity, 0),
    },
    {
      name: 'Artifacts & Enchantments',
      icon: <Shield className="w-4 h-4 text-violet-400" />,
      cards: groupedCategories['Artifacts & Enchantments'],
      totalQty: groupedCategories['Artifacts & Enchantments'].reduce((s, c) => s + c.quantity, 0),
      totalValue: groupedCategories['Artifacts & Enchantments'].reduce((s, c) => s + ((cardPriceMap.get(c.id)?.price || 0) * c.quantity), 0),
      totalFoils: groupedCategories['Artifacts & Enchantments'].filter((c) => c.isFoil).reduce((s, c) => s + c.quantity, 0),
    },
    {
      name: 'Planeswalkers',
      icon: <Sparkles className="w-4 h-4 text-violet-400" />,
      cards: groupedCategories['Planeswalkers'],
      totalQty: groupedCategories['Planeswalkers'].reduce((s, c) => s + c.quantity, 0),
      totalValue: groupedCategories['Planeswalkers'].reduce((s, c) => s + ((cardPriceMap.get(c.id)?.price || 0) * c.quantity), 0),
      totalFoils: groupedCategories['Planeswalkers'].filter((c) => c.isFoil).reduce((s, c) => s + c.quantity, 0),
    },
    {
      name: 'Lands',
      icon: <Mountain className="w-4 h-4 text-fuchsia-600" />,
      cards: groupedCategories['Lands'],
      totalQty: groupedCategories['Lands'].reduce((s, c) => s + c.quantity, 0),
      totalValue: groupedCategories['Lands'].reduce((s, c) => s + ((cardPriceMap.get(c.id)?.price || 0) * c.quantity), 0),
      totalFoils: groupedCategories['Lands'].filter((c) => c.isFoil).reduce((s, c) => s + c.quantity, 0),
    },
    {
      name: 'Other',
      icon: <BookOpen className="w-4 h-4 text-slate-400" />,
      cards: groupedCategories['Other'],
      totalQty: groupedCategories['Other'].reduce((s, c) => s + c.quantity, 0),
      totalValue: groupedCategories['Other'].reduce((s, c) => s + ((cardPriceMap.get(c.id)?.price || 0) * c.quantity), 0),
      totalFoils: groupedCategories['Other'].filter((c) => c.isFoil).reduce((s, c) => s + c.quantity, 0),
    },
  ], [groupedCategories, cardPriceMap]);

  const displayedCards = useMemo(() => {
    return selectedCategoryTab === 'all'
      ? sortedCards
      : (groupedCategories[selectedCategoryTab] || sortedCards);
  }, [selectedCategoryTab, sortedCards, groupedCategories]);

  // Progressive slicing for instant DOM rendering
  const visibleCards = useMemo(() => {
    if (viewMode === 'category-grid') return displayedCards;
    return displayedCards.slice(0, displayLimit);
  }, [displayedCards, displayLimit, viewMode]);

  // Infinite scroll intersection observer to seamlessly load subsequent chunks
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || viewMode === 'category-grid') return;
    if (visibleCards.length >= displayedCards.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayLimit((prev) => Math.min(displayedCards.length, prev + 80));
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [displayedCards.length, visibleCards.length, viewMode]);

  // Smooth concurrent transition setters
  const updateSortBy = useCallback((val: typeof sortBy) => {
    startTransition(() => {
      setSortBy(val);
    });
  }, [startTransition]);

  const updateRarity = useCallback((val: string) => {
    startTransition(() => {
      setSelectedRarity(val);
    });
  }, [startTransition]);

  const updateCondition = useCallback((val: string) => {
    startTransition(() => {
      setSelectedCondition(val);
    });
  }, [startTransition]);

  const updateSet = useCallback((val: string) => {
    startTransition(() => {
      setSelectedSet(val);
    });
  }, [startTransition]);

  const updateColor = useCallback((val: string) => {
    startTransition(() => {
      setSelectedColor(val);
    });
  }, [startTransition]);

  const updateOnlyFoil = useCallback((val: boolean) => {
    startTransition(() => {
      setOnlyFoil(val);
    });
  }, [startTransition]);

  const updateCategoryTab = useCallback((val: string) => {
    startTransition(() => {
      setSelectedCategoryTab(val);
    });
  }, [startTransition]);

  const handleLivePriceRefresh = async () => {
    setIsRefreshingPrices(true);
    setRefreshToast(null);
    try {
      await DeckService.refreshCollectionPrices(collection);
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
      {/* Summary Dashboard */}
      <div className={`bg-slate-900 border border-slate-800 rounded-2xl shadow-xl transition-all duration-200 ${
        isSummaryCollapsed ? 'p-3 sm:p-4' : 'p-4 sm:p-5 space-y-4'
      }`}>
        {/* Dashboard Top Header & Actions */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isSummaryCollapsed ? '' : 'pb-3.5 border-b border-slate-800/80'
        }`}>
          <div 
            onClick={toggleSummaryCollapse}
            className="flex items-center gap-2.5 cursor-pointer group/header select-none flex-1 min-w-0"
            title={isSummaryCollapsed ? "Click to expand summary dashboard" : "Click to collapse summary dashboard"}
          >
            <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700/80 text-emerald-400 group-hover/header:border-emerald-500/50 group-hover/header:text-emerald-300 transition-colors shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs font-bold text-slate-200 tracking-wider uppercase group-hover/header:text-white transition-colors">
                  Collection Summary Dashboard
                </h2>
                {isSummaryCollapsed && (
                  <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                    (Click to expand)
                  </span>
                )}
              </div>
              {isSummaryCollapsed ? (
                /* Compact summary preview when collapsed */
                <div className="flex items-center gap-2 flex-wrap text-xs font-mono mt-1">
                  <span className="text-emerald-400 font-bold bg-emerald-950/70 border border-emerald-800/50 px-2 py-0.5 rounded-md text-[11px]">
                    ${totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-slate-300 bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded-md text-[11px]">
                    {totalCardsCount.toLocaleString()} cards
                  </span>
                  {totalFoilCount > 0 && (
                    <span className="text-violet-400 bg-violet-950/60 border border-violet-800/40 px-2 py-0.5 rounded-md text-[11px] flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-violet-400" />
                      {totalFoilCount} foils
                    </span>
                  )}
                  {rarityStats.total > 0 && (
                    <span className="text-amber-300 bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded-md text-[11px] hidden md:inline">
                      {rarityStats.items.find(i => i.key === 'mythic')?.count || 0}M · {rarityStats.items.find(i => i.key === 'rare')?.count || 0}R · {rarityStats.items.find(i => i.key === 'uncommon')?.count || 0}U
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Overview of portfolio valuations, card inventory, and rarity distribution
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={handleLivePriceRefresh}
              disabled={isRefreshingPrices}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 text-slate-200 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
              title="Batch query Scryfall API for current market prices"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPrices ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{isRefreshingPrices ? 'Syncing...' : 'Live Prices'}</span>
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 text-emerald-400 hover:text-emerald-300 text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title="Import Collection from CSV"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title="Export Collection as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              type="button"
              onClick={toggleSummaryCollapse}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title={isSummaryCollapsed ? "Expand summary dashboard" : "Collapse summary dashboard"}
            >
              {isSummaryCollapsed ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px]">Expand</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px]">Collapse</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dashboard Metrics & Rarity Bar Chart Grid (Collapsible) */}
        {!isSummaryCollapsed && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-stretch pt-0.5">
            {/* Metric 1: Total Card Count */}
            <div className="lg:col-span-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 flex flex-col justify-between shadow-inner">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Total Card Count
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-100 font-mono tracking-tight">
                    {totalCardsCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">cards</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>{binderFilteredCollection.length} unique titles</span>
                <span className="flex items-center gap-1 text-violet-400 font-medium">
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  {totalFoilCount} foils ({totalCardsCount > 0 ? ((totalFoilCount / totalCardsCount) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            </div>

            {/* Metric 2: Estimated Collection Value */}
            <div className="lg:col-span-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 flex flex-col justify-between shadow-inner">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Estimated Collection Value
                  </span>
                  {totalGainLoss !== 0 && (
                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                      totalGainLoss >= 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                    }`}>
                      {totalGainLoss >= 0 ? '+' : ''}${(Number(totalGainLoss) || 0).toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-emerald-400 font-mono tracking-tight">
                    ${totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">USD</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Basis: ${(Number(totalAcquiredValue) || 0).toFixed(2)}</span>
                <span className="text-slate-500 font-mono text-[10px]">Scryfall Market</span>
              </div>
            </div>

            {/* Metric 3: Rarity Breakdown Simple Bar Chart */}
            <div className="lg:col-span-5 p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-3 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Cards by Rarity
                  </span>
                  {selectedRarity !== 'all' && (
                    <button
                      onClick={() => updateRarity('all')}
                      className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                    >
                      (show all)
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {rarityStats.total} cards · click bar to filter
                </span>
              </div>

              {/* Composite Stacked Ratio Bar */}
              <div className="h-2 rounded-full bg-slate-900 overflow-hidden flex w-full border border-slate-800">
                {rarityStats.items.map((item) => (
                  item.percentage > 0 && (
                    <div
                      key={item.key}
                      style={{ width: `${item.percentage}%` }}
                      className={`h-full bg-gradient-to-r ${item.color} transition-all duration-300`}
                      title={`${item.label}: ${item.count} (${item.percentage.toFixed(1)}%)`}
                    />
                  )
                ))}
              </div>

              {/* Simple Bar Chart Rows */}
              <div className="space-y-1.5 pt-0.5">
                {rarityStats.items.map((item) => {
                  const isSelected = selectedRarity === item.key;
                  return (
                    <div
                      key={item.key}
                      onClick={() => updateRarity(isSelected ? 'all' : item.key)}
                      className={`group flex items-center gap-2 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-slate-800/90 ring-1 ring-emerald-500/60' 
                          : 'hover:bg-slate-900/80'
                      }`}
                      title={`Click to filter cards by ${item.label}`}
                    >
                      {/* Dot & Label */}
                      <div className="w-24 shrink-0 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${item.dotColor} shrink-0`} />
                        <span className={`text-[11px] font-medium truncate ${isSelected ? 'text-white font-bold' : 'text-slate-300 group-hover:text-white'}`}>
                          {item.shortLabel}
                        </span>
                      </div>

                      {/* Simple Bar */}
                      <div className="flex-1 h-2.5 rounded bg-slate-900 border border-slate-800 overflow-hidden relative">
                        <div
                          style={{ width: `${item.percentage.toFixed(1)}%` }}
                          className={`h-full bg-gradient-to-r ${item.color} rounded transition-all duration-500`}
                        />
                      </div>

                      {/* Numeric Count & Percentage */}
                      <div className="w-20 text-right shrink-0 font-mono text-[11px]">
                        <span className={`font-bold ${isSelected ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {item.count}
                        </span>
                        <span className="text-slate-500 text-[10px] ml-1">
                          ({item.percentage.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
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
            updateCategoryTab('all');
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
                updateCategoryTab(cat.name);
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
              onChange={(e) => updateRarity(e.target.value)}
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
              onChange={(e) => updateCondition(e.target.value)}
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
                onChange={(e) => updateOnlyFoil(e.target.checked)}
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
              onChange={(e) => updateSet(e.target.value)}
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
              onChange={(e) => updateColor(e.target.value)}
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateSortBy(sortBy === 'price-desc' ? 'price-asc' : 'price-desc')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  sortBy === 'price-desc' || sortBy === 'price-asc'
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
                title="Sort cards by Market Price (toggles High to Low / Low to High). Uses median price for unpriced vintage cards like Timetwister."
              >
                <span className="text-[11px]">Sort: Price</span>
                {sortBy === 'price-desc' ? (
                  <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                ) : sortBy === 'price-asc' ? (
                  <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>
              <select
                value={sortBy}
                onChange={(e) => updateSortBy(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-emerald-400 font-semibold focus:outline-none"
              >
                <option value="price-desc">Market Price (High to Low)</option>
                <option value="price-asc">Market Price (Low to High)</option>
                <option value="value">Total Value (Qty × Price)</option>
                <option value="name">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="cmc">Mana Value</option>
                <option value="color">Color</option>
                <option value="profit">Highest Profit / Gain</option>
                <option value="recent">Recently Added</option>
              </select>
            </div>

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
                  viewMode === 'table' || viewMode === 'list' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Compact List View with Hover Popups"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">List</span>
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
                  const categoryQty = cat.totalQty;
                  const categoryValue = cat.totalValue;
                  const categoryFoils = cat.totalFoils;
                  const catLimit = categoryLimits[cat.name] || 25;
                  const catVisibleCards = cat.cards.slice(0, catLimit);

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
                            ${(Number(categoryValue) || 0).toFixed(2)}
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
                        {catVisibleCards.map((card) => {
                          const priceInfo = getCardMarketPrice(card);
                          const unitPrice = priceInfo.price;
                          const lineTotal = unitPrice * card.quantity;

                          return (
                            <div
                              key={card.id}
                              className="group px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors"
                            >
                              {/* Left: Thumbnail & Name */}
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div
                                  onClick={() => {
                                    onImageClearPreview();
                                    onSelectCard(cardToScryfallCard(card));
                                  }}
                                  onMouseEnter={(e) =>
                                    onImageMouseEnter(e, {
                                      imageUrl: getCardLargeImageUrl(card),
                                      fallbackUrl: card.imageUrl,
                                      name: card.name,
                                      scryfallId: card.scryfallId,
                                    })
                                  }
                                  onMouseMove={onImageMouseMove}
                                  onMouseLeave={onImageMouseLeave}
                                  className="w-8 h-11 bg-slate-950 rounded overflow-hidden shrink-0 cursor-pointer border border-slate-800 hover:border-emerald-500 transition-colors relative"
                                >
                                  <img
                                    src={getCardDisplayImageUrl(card)}
                                    alt={card.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      if (card.scryfallId && !e.currentTarget.src.includes('format=image')) {
                                        e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=large`;
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
                                    <span className="text-emerald-400 font-mono font-medium">${(Number(lineTotal) || 0).toFixed(2)}</span>
                                    {priceInfo.isMedian && (
                                      <span className="text-[9px] text-amber-300 font-mono">(med)</span>
                                    )}
                                    {card.quantity > 1 && (
                                      <span className="text-slate-400">(${(Number(unitPrice) || 0).toFixed(2)} ea)</span>
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
                        {cat.cards.length > catLimit && (
                          <div className="p-2.5 text-center bg-slate-950/70 border-t border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => setCategoryLimits((prev) => ({ ...prev, [cat.name]: (prev[cat.name] || 25) + 40 }))}
                              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer py-1 px-2.5 rounded-lg hover:bg-slate-800 transition-colors"
                            >
                              Show more in {cat.name} (+40 of {cat.cards.length - catLimit} remaining)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : displayedCards.length > 0 ? (
          viewMode === 'grid' ? (
            /* Grid View */
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-4 sm:gap-5">
                {visibleCards.map((card) => {
                  const priceInfo = getCardMarketPrice(card);
                  const unitPrice = priceInfo.price;
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
                        onClick={() => {
                          if (wasChordTriggeredRecently()) return;
                          onImageClearPreview();
                          onSelectCard(cardToScryfallCard(card));
                        }}
                        {...getCardChordProps({
                          name: card.name,
                          imageUrl: getCardLargeImageUrl(card),
                          backImageUrl: card.backImageUrl,
                          scryfallId: card.scryfallId,
                          price: unitPrice,
                        })}
                        className="cursor-pointer relative aspect-[5/7] bg-slate-950 overflow-hidden"
                        title="Click to inspect, or Right+Left click together to pop up larger image"
                      >
                        <img
                          src={getCardDisplayImageUrl(card)}
                          alt={card.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            if (card.scryfallId && !e.currentTarget.src.includes('format=image')) {
                              e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=large`;
                            }
                          }}
                        />

                        {card.isFoil && (
                          <div className="absolute top-1.5 right-1.5 bg-fuchsia-950/90 border border-amber-700/80 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-300 flex items-center gap-0.5 shadow-md">
                            <Sparkles className="w-2.5 h-2.5" /> Foil
                          </div>
                        )}

                        <div className="absolute bottom-1.5 left-1.5 bg-slate-950/90 backdrop-blur-xs border border-slate-800 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                          <span>${(Number(lineTotal) || 0).toFixed(2)}</span>
                          {priceInfo.isMedian && (
                            <span className="text-[9px] font-normal text-amber-300" title="Median price used">(med)</span>
                          )}
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
                                {gain > 0 ? '+' : ''}${(Number(gain) || 0).toFixed(2)}
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
                              className="px-1 py-0.5 hover:bg-slate-800 text-slate-400 cursor-pointer"
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </button>
                            <span className="w-5 text-center font-bold text-slate-200 text-[11px]">
                              {card.quantity}
                            </span>
                            <button
                              onClick={() => onUpdateCollectionCard({ ...card, quantity: card.quantity + 1 })}
                              className="px-1 py-0.5 hover:bg-slate-800 text-slate-400 cursor-pointer"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            {activeDeck && (
                              <button
                                onClick={() => onAddCardToDeck(card)}
                                className="p-1 rounded bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/25 border-0 text-slate-300 transition-colors cursor-pointer"
                                title={`Add 1 to deck "${activeDeck.name}"`}
                              >
                                <Layers className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => onDeleteCollectionCard(card.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
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

              {visibleCards.length < displayedCards.length && (
                <div
                  ref={sentinelRef}
                  className="py-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-slate-400 border-t border-slate-800/80 mt-4"
                >
                  <span className="font-mono text-slate-500">
                    Showing {visibleCards.length} of {displayedCards.length} cards
                  </span>
                  <button
                    type="button"
                    onClick={() => setDisplayLimit((prev) => Math.min(displayedCards.length, prev + 80))}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 hover:border-emerald-500/50 font-semibold transition-all cursor-pointer shadow-sm"
                  >
                    Load More Cards (+80)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(displayedCards.length)}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 text-[11px] transition-colors cursor-pointer"
                  >
                    Show All ({displayedCards.length})
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Compact List View - No images for maximum density, with full hover popups */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-2.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 px-4">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
                  <List className="w-3.5 h-3.5 text-emerald-400" />
                  <span>List View — high-density layout. Hover over any card row to pop up its artwork.</span>
                </span>
                <span className="font-mono text-emerald-400 font-bold">{displayedCards.length} cards</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th 
                        className="py-2.5 px-4 cursor-pointer select-none hover:text-slate-200 transition-colors"
                        onClick={() => updateSortBy(sortBy === 'name' ? 'name-desc' : 'name')}
                        title="Click to sort by Card Name"
                      >
                        <div className="inline-flex items-center gap-1">
                          <span>Card Name</span>
                          {sortBy === 'name' && <ArrowDown className="w-3 h-3 text-emerald-400" />}
                          {sortBy === 'name-desc' && <ArrowUp className="w-3 h-3 text-emerald-400" />}
                        </div>
                      </th>
                      <th className="py-2.5 px-3">Set</th>
                      <th className="py-2.5 px-3">Finish</th>
                      <th className="py-2.5 px-3">Condition</th>
                      <th className="py-2.5 px-3">Qty</th>
                      <th 
                        className="py-2.5 px-3 text-right cursor-pointer select-none hover:text-emerald-300 transition-colors"
                        onClick={() => updateSortBy(sortBy === 'price-desc' ? 'price-asc' : 'price-desc')}
                        title="Click to sort by Market Price (toggles High to Low / Low to High)"
                      >
                        <div className="inline-flex items-center gap-1 justify-end">
                          <span>Market Price</span>
                          {sortBy === 'price-desc' && <ArrowDown className="w-3 h-3 text-emerald-400" />}
                          {sortBy === 'price-asc' && <ArrowUp className="w-3 h-3 text-emerald-400" />}
                        </div>
                      </th>
                      <th 
                        className="py-2.5 px-3 text-right cursor-pointer select-none hover:text-emerald-300 transition-colors"
                        onClick={() => updateSortBy(sortBy === 'value' ? 'price-desc' : 'value')}
                        title="Click to sort by Total Value"
                      >
                        <div className="inline-flex items-center gap-1 justify-end">
                          <span>Total Value</span>
                          {sortBy === 'value' && <ArrowDown className="w-3 h-3 text-emerald-400" />}
                        </div>
                      </th>
                      <th className="py-2.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {visibleCards.map((card) => {
                      const priceInfo = getCardMarketPrice(card);
                      const unitPrice = priceInfo.price;
                      const lineTotal = unitPrice * card.quantity;

                      return (
                        <tr 
                          key={card.id} 
                          className="hover:bg-slate-800/60 transition-colors group/row cursor-pointer"
                          onMouseEnter={(e) =>
                            onImageMouseEnter(e, {
                              imageUrl: getCardLargeImageUrl(card),
                              fallbackUrl: card.imageUrl,
                              name: card.name,
                              scryfallId: card.scryfallId,
                            })
                          }
                          onMouseMove={onImageMouseMove}
                          onMouseLeave={onImageMouseLeave}
                          onClick={() => {
                            onImageClearPreview();
                            onSelectCard(cardToScryfallCard(card));
                          }}
                        >
                          <td className="py-2 px-4">
                            <div className="inline-flex items-center gap-2 max-w-full">
                              <span className="font-bold text-slate-200 group-hover/row:text-emerald-400 transition-colors truncate">
                                {card.name}
                              </span>
                              {card.type_line && (
                                <span className="text-[11px] text-slate-500 hidden md:inline truncate">
                                  · {card.type_line.split('—')[0].trim()}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-mono uppercase text-slate-300 font-semibold">{card.set}</span>
                            <span className="text-slate-500 block text-[10px] truncate max-w-[120px]">{card.setName}</span>
                          </td>
                          <td className="py-2 px-3">
                            {card.isFoil ? (
                              <span className="text-fuchsia-300 font-bold text-[11px] flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> Foil
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">Regular</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-300 font-semibold text-xs">{card.condition}</td>
                          <td className="py-2 px-3 font-bold text-slate-100 font-mono text-xs">{card.quantity}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-medium text-slate-200">
                                ${(Number(unitPrice) || 0).toFixed(2)}
                              </span>
                              {priceInfo.isMedian && (
                                <span 
                                  className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider"
                                  title="Median market price across printings used because direct market price is not published"
                                >
                                  median
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-400 font-mono text-xs">
                            ${(Number(lineTotal) || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              {activeDeck && (
                                <button
                                  type="button"
                                  onClick={() => onAddCardToDeck(card)}
                                  className="p-1 rounded text-slate-400 hover:text-emerald-400 cursor-pointer transition-colors"
                                  title={`Add to Deck "${activeDeck.name}"`}
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onDeleteCollectionCard(card.id)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 cursor-pointer transition-colors"
                                title="Remove from binder"
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

              {visibleCards.length < displayedCards.length && (
                <div
                  ref={sentinelRef}
                  className="py-3.5 px-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400"
                >
                  <span className="font-mono text-slate-500">
                    Showing {visibleCards.length} of {displayedCards.length} cards
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDisplayLimit((prev) => Math.min(displayedCards.length, prev + 80))}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-semibold transition-colors cursor-pointer"
                    >
                      Load More (+80)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayLimit(displayedCards.length)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 text-[11px] transition-colors cursor-pointer"
                    >
                      Show All ({displayedCards.length})
                    </button>
                  </div>
                </div>
              )}
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
        onConfirm={() => {
          confirmState.onConfirm();
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        confirmText="Delete"
      />
      <ImageHoverPopup preview={hoverPreview} />
      <DualClickCardModal card={peekCard} onClose={() => setPeekCard(null)} />

      <BinderImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        existingBinders={binders}
        onImportComplete={(importedBinder) => {
          if (onSelectBinder) {
            onSelectBinder(importedBinder);
          }
        }}
      />
    </div>
  );
};
