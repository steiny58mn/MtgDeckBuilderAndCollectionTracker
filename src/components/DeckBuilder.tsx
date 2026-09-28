import { useImageHoverPreview, ImageHoverPopup } from './ImageHoverPopup';
import { useCardDualClickPeek, DualClickCardModal } from './DualClickCardPopup';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft,
  GitCompare,
  Save,
  RotateCcw,
  Clock,
  Loader2, 
  Sparkles, 
  RefreshCw, 
  Play, 
  Share2, 
  Trash2, 
  Plus, 
  Minus, 
  X, 
  AlertTriangle, 
  Layers, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Pencil,
  Crown,
  LayoutGrid, 
  Columns3,
  List,
  Swords,
  Zap,
  Shield,
  Mountain,
  Bookmark,
  HelpCircle,
  FileText
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { Deck, DeckCard, MTGFormat, DeckCategory, ScryfallCard, DeckHistoryItem } from '../types/mtg';
import { calculateDeckStats, getCardPartnerInfo, canCardsPartnerTogether, canBePrimaryCommander, getCardCategorySortOrder } from '../utils/deckUtils';
import { DeckService, parseTimestamp } from '../services/deckService';
import { ManaCostBadge } from './ManaCostBadge';
import { ManaCurveChart } from './ManaCurveChart';
import { SampleHandSimulator } from './SampleHandSimulator';
import { DeckExportModal } from './DeckExportModal';
import { DeckCompareModal } from './DeckCompareModal';
import { GameSummaryModal } from './GameSummaryModal';

// Helper to safely get numeric card unit price
export const getCardUnitPrice = (card: DeckCard): number => {
  const rawPrice = card.isFoil && card.priceUsdFoil ? card.priceUsdFoil : card.priceUsd || 0;
  return typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice)) || 0);
};

interface DeckBuilderProps {
  deck: Deck;
  onBack: () => void;
  onUpdateDeck: (deck: Deck) => void;
  onSaveDeck?: (deckToSave: Deck) => Promise<void> | void;
  onDeleteDeck: (deckId: string) => void;
  onOpenSearch: (category?: DeckCategory | 'partner') => void;
  onSelectCard: (card: ScryfallCard) => void;
  onCreateNewDeck?: (currentDeckToSave: Deck) => Promise<void> | void;
  onImportAsNewDeck?: (newDeck: Deck, shouldSaveCurrentDeck: boolean) => Promise<void>;
  onBatchImportCompleted?: (count: number) => void;
}

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  deck,
  onBack,
  onUpdateDeck,
  onSaveDeck,
  onDeleteDeck,
  onOpenSearch,
  onSelectCard,
  onCreateNewDeck,
  onImportAsNewDeck: onImportAsNewDeckProp,
  onBatchImportCompleted,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(deck.name);
  const [description, setDescription] = useState(deck.description || '');
  const [format, setFormat] = useState<MTGFormat>(deck.format);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [priceRefreshMessage, setPriceRefreshMessage] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showFormatNoticeDetails, setShowFormatNoticeDetails] = useState(false);
  const [showHandSimulator, setShowHandSimulator] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showGameSummaryModal, setShowGameSummaryModal] = useState(false);
  const [exportModalInitialTab, setExportModalInitialTab] = useState<'export' | 'import'>('export');
  const [activeCategoryTab, setActiveCategoryTab] = useState<'main' | 'sideboard' | 'maybeboard'>(() => {
    try {
      const saved = localStorage.getItem('deck_builder_category_tab');
      if (saved === 'main' || saved === 'sideboard' || saved === 'maybeboard') return saved;
    } catch {}
    return 'main';
  });
  const [viewMode, setViewMode] = useState<'tabbed' | 'category-grid' | 'grid' | 'piles'>(() => {
    try {
      const saved = localStorage.getItem('deck_builder_view_mode');
      if (saved === 'grid' || saved === 'tabbed' || saved === 'category-grid' || saved === 'piles') return saved;
    } catch {}
    return 'grid'; // Default the display to a grid
  });
  const [sortCardsBy, setSortCardsBy] = useState<'name' | 'cmc' | 'color' | 'category'>(() => {
    try {
      const saved = localStorage.getItem('deck_builder_sort_by');
      if (saved === 'name' || saved === 'cmc' || saved === 'color' || saved === 'category') return saved;
    } catch {}
    return 'name';
  });

  useEffect(() => {
    try {
      localStorage.setItem('deck_builder_view_mode', viewMode);
    } catch {}
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('deck_builder_sort_by', sortCardsBy);
    } catch {}
  }, [sortCardsBy]);

  useEffect(() => {
    try {
      localStorage.setItem('deck_builder_category_tab', activeCategoryTab);
    } catch {}
  }, [activeCategoryTab]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [historyList, setHistoryList] = useState<DeckHistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('current');
  const [isHistoricalLoading, setIsHistoricalLoading] = useState<boolean>(false);
  const [historicalDeck, setHistoricalDeck] = useState<Deck | null>(null);

  const isHistoricalView = selectedHistoryId !== 'current';
  const activeDeck: Deck = (isHistoricalView && historicalDeck) ? historicalDeck : deck;
  const selectedHistoryItem = historyList.find(
    (h) => (h.id || h.historyId) === selectedHistoryId || h.historyId === selectedHistoryId
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { peekCard, setPeekCard, wasChordTriggeredRecently, getCardChordProps } = useCardDualClickPeek();

  // Saved baseline cards tracking (to compute unsaved additions and deletions)
  const [savedCards, setSavedCards] = useState<DeckCard[]>(() => {
    const fromService = DeckService.getLastSavedDeck(deck.id);
    if (fromService && fromService.cards) {
      return JSON.parse(JSON.stringify(fromService.cards));
    }
    DeckService.setLastSavedDeck(deck);
    return JSON.parse(JSON.stringify(deck.cards || []));
  });

  // Keep saved baseline synced when switching to a different deck
  useEffect(() => {
    const fromService = DeckService.getLastSavedDeck(deck.id);
    if (fromService && fromService.cards) {
      setSavedCards(JSON.parse(JSON.stringify(fromService.cards)));
    } else {
      DeckService.setLastSavedDeck(deck);
      setSavedCards(JSON.parse(JSON.stringify(deck.cards || [])));
    }
  }, [deck.id]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      const fromService = DeckService.getLastSavedDeck(deck.id);
      if (fromService && fromService.cards) {
        setSavedCards(JSON.parse(JSON.stringify(fromService.cards)));
      } else {
        setSavedCards(JSON.parse(JSON.stringify(deck.cards || [])));
      }
    }
  }, [hasUnsavedChanges, deck.id]);

  // Compute pending additions and deletions compared to saved baseline
  const pendingChanges = useMemo(() => {
    if (isHistoricalView) return { added: [], deleted: [] };

    const baseline = savedCards || [];
    const current = activeDeck.cards || [];

    const baselineMap = new Map<string, DeckCard>();
    const baselineKeyMap = new Map<string, DeckCard>();
    for (const b of baseline) {
      baselineMap.set(b.id, b);
      const key = `${b.scryfallId || b.name.toLowerCase()}_${b.category}`;
      baselineKeyMap.set(key, b);
    }

    const currentMap = new Map<string, DeckCard>();
    const currentKeyMap = new Map<string, DeckCard>();
    for (const c of current) {
      currentMap.set(c.id, c);
      const key = `${c.scryfallId || c.name.toLowerCase()}_${c.category}`;
      currentKeyMap.set(key, c);
    }

    interface DiffItem {
      card: DeckCard;
      diffQuantity: number;
      category: DeckCategory;
      previousQuantity?: number;
      newQuantity?: number;
    }

    const added: DiffItem[] = [];
    const deleted: DiffItem[] = [];

    // Find cards added or quantities increased
    for (const c of current) {
      const match = baselineMap.get(c.id) || baselineKeyMap.get(`${c.scryfallId || c.name.toLowerCase()}_${c.category}`);
      if (!match) {
        added.push({
          card: c,
          diffQuantity: c.quantity,
          category: c.category,
          newQuantity: c.quantity,
          previousQuantity: 0,
        });
      } else if (c.quantity > match.quantity) {
        added.push({
          card: c,
          diffQuantity: c.quantity - match.quantity,
          category: c.category,
          newQuantity: c.quantity,
          previousQuantity: match.quantity,
        });
      }
    }

    // Find cards deleted or quantities decreased
    for (const b of baseline) {
      const match = currentMap.get(b.id) || currentKeyMap.get(`${b.scryfallId || b.name.toLowerCase()}_${b.category}`);
      if (!match) {
        deleted.push({
          card: b,
          diffQuantity: b.quantity,
          category: b.category,
          newQuantity: 0,
          previousQuantity: b.quantity,
        });
      } else if (b.quantity > match.quantity) {
        deleted.push({
          card: b,
          diffQuantity: b.quantity - match.quantity,
          category: b.category,
          newQuantity: match.quantity,
          previousQuantity: b.quantity,
        });
      }
    }

    return { added, deleted };
  }, [savedCards, activeDeck.cards, isHistoricalView]);

  const handleUndoAddedCard = (item: { card: DeckCard; diffQuantity: number; previousQuantity?: number }) => {
    const existingCards = [...deck.cards];
    if (item.previousQuantity && item.previousQuantity > 0) {
      const idx = existingCards.findIndex((c) => c.id === item.card.id);
      if (idx >= 0) {
        existingCards[idx] = { ...existingCards[idx], quantity: item.previousQuantity };
      }
    } else {
      const idx = existingCards.findIndex((c) => c.id === item.card.id);
      if (idx >= 0) {
        existingCards.splice(idx, 1);
      }
    }
    onUpdateDeck({ ...deck, cards: existingCards, updatedAt: Date.now() });
    setHasUnsavedChanges(true);
    DeckService.setDeckHasUnsavedChanges(deck.id, true);
  };

  const handleRestoreDeletedCard = (item: { card: DeckCard; diffQuantity: number; previousQuantity?: number; category: DeckCategory }) => {
    const existingCards = [...deck.cards];
    const idx = existingCards.findIndex((c) => c.id === item.card.id);
    if (idx >= 0) {
      existingCards[idx] = { ...existingCards[idx], quantity: item.previousQuantity || (existingCards[idx].quantity + item.diffQuantity) };
    } else {
      existingCards.push({
        ...item.card,
        quantity: item.diffQuantity,
      });
    }
    onUpdateDeck({ ...deck, cards: existingCards, updatedAt: Date.now() });
    setHasUnsavedChanges(true);
    DeckService.setDeckHasUnsavedChanges(deck.id, true);
  };
  const {
    activePreview: hoverPreview,
    handleMouseEnter: onImageMouseEnter,
    handleMouseMove: onImageMouseMove,
    handleMouseLeave: onImageMouseLeave,
    clearPreview: onImageClearPreview,
  } = useImageHoverPreview(500);

  const getCardLargeImageUrl = (card: DeckCard): string => {
    if (card.imageUrl) {
      if (card.imageUrl.includes('version=small')) {
        return card.imageUrl.replace('version=small', 'version=large');
      }
      return card.imageUrl;
    }
    if (card.scryfallId) {
      return `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=large`;
    }
    return '';
  };
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Keep internal state in sync with deck updates
  React.useEffect(() => {
    setTitle(deck.name);
    setDescription(deck.description || '');
    setFormat(deck.format);
    setSelectedHistoryId('current');
    setHistoricalDeck(null);
    setHasUnsavedChanges(DeckService.hasUnsavedChanges(deck.id));
  }, [deck.id]);

  // Subscribe to unsaved status changes
  React.useEffect(() => {
    if (!deck?.id) return;
    const unsub = DeckService.subscribeUnsavedChanges((unsavedIds) => {
      setHasUnsavedChanges(unsavedIds.has(deck.id));
    });
    return unsub;
  }, [deck?.id]);

  const handleSave = async (deckOverride?: Deck) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const baseDeck = deckOverride || deck;
      const currentDeckToSave: Deck = {
        ...baseDeck,
        name: title.trim() || baseDeck.name,
        description: description.trim(),
        format: format,
        updatedAt: Date.now(),
      };
      if (onSaveDeck) {
        await onSaveDeck(currentDeckToSave);
      } else {
        await DeckService.saveDeck(currentDeckToSave);
      }
      DeckService.setLastSavedDeck(currentDeckToSave);
      setSavedCards(JSON.parse(JSON.stringify(currentDeckToSave.cards || [])));
      setHasUnsavedChanges(false);
      DeckService.setDeckHasUnsavedChanges(deck.id, false);
      await refreshHistory();
      setPriceRefreshMessage('Deck saved & iteration snapshot created!');
      setTimeout(() => setPriceRefreshMessage(null), 3000);
    } catch (e: any) {
      setPriceRefreshMessage('Failed to save deck: ' + (e.message || 'Error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut: Ctrl+S or Cmd+S
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deck, title, description, format, onSaveDeck, isSaving]);

  // Refresh deck history snapshots
  const refreshHistory = async () => {
    if (deck?.id) {
      try {
        const items = await DeckService.getDeckHistory(deck.id);
        setHistoryList(items || []);
      } catch (err) {
        console.warn('Failed to load history list', err);
      }
    }
  };

  React.useEffect(() => {
    if (deck?.id) {
      refreshHistory();
    }
  }, [deck?.id]);

  // Load snapshot cards when an iteration is selected
  React.useEffect(() => {
    if (selectedHistoryId === 'current') {
      setHistoricalDeck(null);
      return;
    }

    const existing = historyList.find(
      (h) => (h.id || h.historyId) === selectedHistoryId || h.historyId === selectedHistoryId
    );

    if (existing && Array.isArray(existing.cards) && existing.cards.length > 0) {
      setHistoricalDeck({
        ...deck,
        name: existing.name || deck.name,
        description: existing.description ?? deck.description,
        format: (existing.format as MTGFormat) || deck.format,
        commanderId: existing.commanderId ?? deck.commanderId,
        commanderName: existing.commanderName ?? deck.commanderName,
        commanderArtUrl: existing.commanderArtUrl ?? deck.commanderArtUrl,
        commanderColorIdentity: existing.commanderColorIdentity ?? deck.commanderColorIdentity,
        cards: existing.cards,
        updatedAt: existing.archivedAt || deck.updatedAt,
      });
      return;
    }

    let isMounted = true;
    setIsHistoricalLoading(true);
    DeckService.getDeckHistorySnapshot(deck.id, selectedHistoryId)
      .then((snapshot) => {
        if (!isMounted) return;
        if (snapshot) {
          setHistoricalDeck({
            ...deck,
            name: snapshot.name || deck.name,
            description: snapshot.description ?? deck.description,
            format: (snapshot.format as MTGFormat) || deck.format,
            commanderId: snapshot.commanderId ?? deck.commanderId,
            commanderName: snapshot.commanderName ?? deck.commanderName,
            commanderArtUrl: snapshot.commanderArtUrl ?? deck.commanderArtUrl,
            commanderColorIdentity: snapshot.commanderColorIdentity ?? deck.commanderColorIdentity,
            cards: snapshot.cards || [],
            updatedAt: snapshot.archivedAt || deck.updatedAt,
          });
        } else {
          setPriceRefreshMessage('Unable to load historical snapshot.');
          setTimeout(() => setPriceRefreshMessage(null), 3000);
          setSelectedHistoryId('current');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to fetch snapshot:', err);
        setSelectedHistoryId('current');
      })
      .finally(() => {
        if (isMounted) setIsHistoricalLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedHistoryId, deck.id, historyList]);

  const formatIterationLabel = (item: DeckHistoryItem, idx?: number): string => {
    const ts = parseTimestamp(item.archivedAt);
    const d = new Date(ts);
    const dateStr = !isNaN(d.getTime())
      ? d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : `Iteration #${idx !== undefined ? historyList.length - idx : ''}`;
    const cardsSum = Array.isArray(item.cards) && item.cards.length > 0
      ? item.cards.reduce((sum, c) => sum + (c.quantity || 1), 0)
      : undefined;
    const count = item.cardCount ?? cardsSum ?? (item as any).totalCards ?? 0;
    const prefix = idx !== undefined ? `Iteration #${historyList.length - idx} • ` : '';
    return `${prefix}${dateStr} (${count} cards)`;
  };

  const handleRestoreHistoricalIteration = async () => {
    if (!isHistoricalView || selectedHistoryId === 'current') return;
    const selectedItem = historyList.find((h) => (h.id || h.historyId) === selectedHistoryId || h.historyId === selectedHistoryId);
    const label = selectedItem ? formatIterationLabel(selectedItem) : 'this historical iteration';

    setConfirmState({
      isOpen: true,
      title: 'Restore Historical Version',
      message: `Are you sure you want to restore ${label}? This will replace your current deck list with this snapshot and commit it as your active version.`,
      confirmText: 'Restore Version',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          setIsSaving(true);
          const restored = await DeckService.revertToIteration(deck.id, selectedHistoryId);
          if (restored) {
            onUpdateDeck(restored);
            setSelectedHistoryId('current');
            setHistoricalDeck(null);
            setHasUnsavedChanges(false);
            DeckService.setDeckHasUnsavedChanges(deck.id, false);
            await refreshHistory();
            setPriceRefreshMessage('Restored historical version successfully!');
            setTimeout(() => setPriceRefreshMessage(null), 3500);
          }
        } catch (err: any) {
          setPriceRefreshMessage('Failed to restore iteration: ' + (err.message || 'Error'));
          setTimeout(() => setPriceRefreshMessage(null), 4000);
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  const handleDeleteHistoricalIteration = (historyIdToDelete: string) => {
    if (!historyIdToDelete || historyIdToDelete === 'current') return;
    const targetItem = historyList.find((h) => (h.id || h.historyId) === historyIdToDelete || h.historyId === historyIdToDelete);
    const label = targetItem ? formatIterationLabel(targetItem) : 'this historical iteration';

    setConfirmState({
      isOpen: true,
      title: 'Delete Historical Snapshot',
      message: `Are you sure you want to permanently delete ${label}? This snapshot cannot be recovered.`,
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const success = await DeckService.deleteDeckHistory(deck.id, historyIdToDelete);
          if (success) {
            // Keep the same deck open and just display the current live version
            setSelectedHistoryId('current');
            setHistoricalDeck(null);
            setShowCompareModal(false);
            await refreshHistory();
            setPriceRefreshMessage('Historical snapshot deleted. Displaying current live version.');
            setTimeout(() => setPriceRefreshMessage(null), 3000);
          } else {
            setPriceRefreshMessage('Failed to delete historical snapshot.');
            setTimeout(() => setPriceRefreshMessage(null), 3000);
          }
        } catch (err: any) {
          setPriceRefreshMessage('Error deleting snapshot: ' + (err.message || 'Error'));
          setTimeout(() => setPriceRefreshMessage(null), 3000);
        }
      },
    });
  };

  const stats = calculateDeckStats(activeDeck);

  // Commander calculations
  const commanderCards = activeDeck.cards.filter((c) => c.category === 'commander');
  const firstCmdrPartnerInfo = commanderCards.length === 1 ? getCardPartnerInfo(commanderCards[0]) : null;
  const commanderName = commanderCards.length > 1
    ? commanderCards.map((c) => c.name).join(' // ')
    : commanderCards[0]?.name || deck.commanderName;

  const handleUpdateDeckNameToCommander = () => {
    if (!commanderName) return;
    setTitle(commanderName);
    onUpdateDeck({
      ...deck,
      name: commanderName,
      updatedAt: Date.now(),
    });
    setHasUnsavedChanges(true);
    DeckService.setDeckHasUnsavedChanges(deck.id, true);
    setPriceRefreshMessage(`Deck name updated to "${commanderName}"`);
    setTimeout(() => setPriceRefreshMessage(null), 3000);
  };

  const handleSaveInfo = () => {
    const updated: Deck = {
      ...deck,
      name: title.trim() || 'Untitled Deck',
      description: description.trim(),
      format,
    };
    onUpdateDeck(updated);
    setIsEditingTitle(false);
    setHasUnsavedChanges(true);
    DeckService.setDeckHasUnsavedChanges(deck.id, true);
  };

  const handleUpdateCardQuantity = (cardId: string, delta: number) => {
    const existingCards = [...deck.cards];
    const idx = existingCards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;

    const newQty = existingCards[idx].quantity + delta;

    // Commanders in singleton formats like Commander cannot exceed quantity 1
    if (existingCards[idx].category === 'commander' && delta > 0 && newQty > 1) {
      setPriceRefreshMessage('Commander cards cannot have a quantity greater than 1.');
      setTimeout(() => setPriceRefreshMessage(null), 3000);
      return;
    }

    if (newQty <= 0) {
      existingCards.splice(idx, 1);
    } else {
      existingCards[idx] = { ...existingCards[idx], quantity: newQty };
    }

    // Recompute commander metadata if a commander was removed
    const remainingCmdrs = existingCards.filter((c) => c.category === 'commander');
    const newCommanderName = remainingCmdrs.length > 1
      ? remainingCmdrs.map((c) => c.name).join(' // ')
      : remainingCmdrs[0]?.name;
    const newCommanderArt = remainingCmdrs[0]?.imageUrl;
    const newCover = remainingCmdrs[0]?.imageUrl || existingCards[0]?.imageUrl;
    const newCommanderId = remainingCmdrs[0]?.scryfallId;
    const newCommanderColorIdentity = remainingCmdrs.length > 1
      ? Array.from(new Set(remainingCmdrs.flatMap((c) => c.color_identity || [])))
      : remainingCmdrs[0]?.color_identity || [];

    onUpdateDeck({
      ...deck,
      cards: existingCards,
      commanderName: newCommanderName,
      commanderArtUrl: newCommanderArt,
      commanderId: newCommanderId,
      commanderColorIdentity: newCommanderColorIdentity,
      coverCardUrl: newCover,
      updatedAt: Date.now(),
    });
    setHasUnsavedChanges(true);
    DeckService.setDeckHasUnsavedChanges(deck.id, true);
  };

  const handleToggleCardFoil = (cardId: string) => {
    const existingCards = [...deck.cards];
    const idx = existingCards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;

    existingCards[idx] = {
      ...existingCards[idx],
      isFoil: !existingCards[idx].isFoil,
    };

    onUpdateDeck({
      ...deck,
      cards: existingCards,
      updatedAt: Date.now(),
    });
    setHasUnsavedChanges(true);
  };

  const handleChangeCardCategory = (cardId: string, newCategory: DeckCategory) => {
    const existingCards = [...deck.cards];
    const idx = existingCards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;

    if (newCategory === 'commander') {
      const currentCmdrs = existingCards.filter((c) => c.category === 'commander' && c.id !== cardId);
      if (currentCmdrs.length >= 2) {
        setPriceRefreshMessage('Commander decks can have at most 2 commanders (Partner/Background).');
        setTimeout(() => setPriceRefreshMessage(null), 3500);
        return;
      }

      if (currentCmdrs.length === 1) {
        const partnerCheck = canCardsPartnerTogether(currentCmdrs[0], existingCards[idx]);
        if (!partnerCheck.canPartner) {
          setPriceRefreshMessage(partnerCheck.reason || 'These cards cannot partner together.');
          setTimeout(() => setPriceRefreshMessage(null), 4000);
          return;
        }
      } else if (currentCmdrs.length === 0) {
        if (!canBePrimaryCommander(existingCards[idx])) {
          const pInfo = getCardPartnerInfo(existingCards[idx]);
          if (pInfo.partnerType === 'background') {
            setPriceRefreshMessage('A Background enchantment cannot be your primary commander without a commander that has "Choose a Background".');
          } else {
            setPriceRefreshMessage('Card must be a Legendary Creature or a card that says "can be your commander".');
          }
          setTimeout(() => setPriceRefreshMessage(null), 4000);
          return;
        }
      }

      // If moving to commander, cap quantity at 1
      if (existingCards[idx].quantity > 1) {
        existingCards[idx].quantity = 1;
      }
    }

    existingCards[idx] = {
      ...existingCards[idx],
      category: newCategory,
    };

    // Update commander metadata
    const updatedCmdrs = existingCards.filter((c) => c.category === 'commander');
    const newCommanderName = updatedCmdrs.length > 1
      ? updatedCmdrs.map((c) => c.name).join(' // ')
      : updatedCmdrs[0]?.name;
    const newCommanderArt = updatedCmdrs[0]?.imageUrl || deck.commanderArtUrl;
    const newCover = updatedCmdrs[0]?.imageUrl || deck.coverCardUrl;
    const newCommanderId = updatedCmdrs[0]?.scryfallId;
    const newCommanderColorIdentity = updatedCmdrs.length > 1
      ? Array.from(new Set(updatedCmdrs.flatMap((c) => c.color_identity || [])))
      : updatedCmdrs[0]?.color_identity || [];

    onUpdateDeck({
      ...deck,
      cards: existingCards,
      commanderName: newCommanderName,
      commanderArtUrl: newCommanderArt,
      commanderId: newCommanderId,
      commanderColorIdentity: newCommanderColorIdentity,
      coverCardUrl: newCover,
      updatedAt: Date.now(),
    });
    setHasUnsavedChanges(true);
  };

  const handleRemoveCard = (cardId: string) => {
    const filtered = deck.cards.filter((c) => c.id !== cardId);
    const updatedCmdrs = filtered.filter((c) => c.category === 'commander');
    const newCommanderName = updatedCmdrs.length > 1
      ? updatedCmdrs.map((c) => c.name).join(' // ')
      : updatedCmdrs[0]?.name;
    const newCommanderArt = updatedCmdrs[0]?.imageUrl;
    const newCover = updatedCmdrs[0]?.imageUrl || filtered[0]?.imageUrl;
    const newCommanderId = updatedCmdrs[0]?.scryfallId;
    const newCommanderColorIdentity = updatedCmdrs.length > 1
      ? Array.from(new Set(updatedCmdrs.flatMap((c) => c.color_identity || [])))
      : updatedCmdrs[0]?.color_identity || [];

    onUpdateDeck({
      ...deck,
      cards: filtered,
      commanderName: newCommanderName,
      commanderArtUrl: newCommanderArt,
      commanderId: newCommanderId,
      commanderColorIdentity: newCommanderColorIdentity,
      coverCardUrl: newCover,
      updatedAt: Date.now(),
    });
    setHasUnsavedChanges(true);
  };

  const handleLivePriceRefresh = async () => {
    setIsRefreshingPrices(true);
    setPriceRefreshMessage(null);
    try {
      const updated = await DeckService.refreshDeckPrices(deck);
      onUpdateDeck(updated);
      setPriceRefreshMessage('Prices updated live from Scryfall!');
      setTimeout(() => setPriceRefreshMessage(null), 3000);
    } catch (e: any) {
      setPriceRefreshMessage('Price refresh failed: ' + (e.message || 'Error'));
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  const handleOverwriteDeck = async (overwrittenDeck: Deck, originalTargetDeck?: Deck) => {
    // 1. Gather the current state of the existing deck before overwriting
    const existingDeckToArchive: Deck = originalTargetDeck || {
      ...deck,
      name: title,
      description: description,
      format: format,
      updatedAt: Date.now(),
    };

    // 2. Call the save function on the existing deck so it gets committed and preserved in history
    if (onSaveDeck) {
      await onSaveDeck(existingDeckToArchive);
    } else {
      await DeckService.saveDeck(existingDeckToArchive);
    }

    // 3. Now save the newly imported overwritten deck, which replaces the current deck in DB
    // and triggers the backend to snapshot the existing deck in history
    if (onSaveDeck) {
      await onSaveDeck(overwrittenDeck);
    } else {
      await DeckService.saveDeck(overwrittenDeck);
    }

    // 4. Update the editor state to reflect the newly imported deck
    onUpdateDeck(overwrittenDeck);
    setTitle(overwrittenDeck.name);
    setFormat(overwrittenDeck.format);
    setDescription(overwrittenDeck.description || '');
    setHasUnsavedChanges(false);
    DeckService.setDeckHasUnsavedChanges(overwrittenDeck.id, false);

    // 5. Refresh history list so that comparison and rollback immediately reflect the archived iteration
    try {
      const updatedHistory = await DeckService.getDeckHistory(overwrittenDeck.id);
      setHistoryList(updatedHistory || []);
    } catch (e) {
      console.warn('Failed to refresh deck history after overwrite:', e);
    }

    setPriceRefreshMessage(`Deck "${overwrittenDeck.name}" overwritten with ${overwrittenDeck.cards.reduce((s, c) => s + c.quantity, 0)} cards! Existing deck saved to history.`);
    setTimeout(() => setPriceRefreshMessage(null), 3500);
  };

  // Import handlers
  const handleImportAsNewDeck = async (newDeck: Deck, shouldSaveCurrentDeck: boolean) => {
    if (shouldSaveCurrentDeck) {
      onUpdateDeck({ ...deck, updatedAt: Date.now() });
    }
    if (onImportAsNewDeckProp) {
      await onImportAsNewDeckProp(newDeck, shouldSaveCurrentDeck);
    }
  };

  const handleAppendCardsToDeck = async (cardsToAdd: DeckCard[]) => {
    const currentCards = [...deck.cards];
    for (const card of cardsToAdd) {
      const existingIdx = currentCards.findIndex(
        (c) => c.name.toLowerCase() === card.name.toLowerCase() && c.category === card.category
      );
      if (existingIdx >= 0) {
        currentCards[existingIdx].quantity += card.quantity;
      } else {
        currentCards.push(card);
      }
    }
    onUpdateDeck({
      ...deck,
      cards: currentCards,
      updatedAt: Date.now(),
    });
    setHasUnsavedChanges(true);
    setPriceRefreshMessage(`Added ${cardsToAdd.reduce((s, c) => s + c.quantity, 0)} cards to deck`);
    setTimeout(() => setPriceRefreshMessage(null), 3500);
  };

  // Return back to deck list
  const handleBack = () => {
    if (hasUnsavedChanges) {
      setConfirmState({
        isOpen: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes in this deck session. Would you like to save them before leaving?',
        confirmText: 'Save & Exit',
        cancelText: 'Discard & Exit',
        onConfirm: async () => {
          await handleSave();
          onBack();
        },
        onCancel: () => {
          setHasUnsavedChanges(false);
          DeckService.revertDeck(deck.id);
          onBack();
        },
      });
      return;
    }
    onBack();
  };

  // Group cards for the current view
  const sortCards = (cards: DeckCard[]) => {
    return [...cards].sort((a, b) => {
      if (sortCardsBy === 'category') {
        const catA = getCardCategorySortOrder(a);
        const catB = getCardCategorySortOrder(b);
        if (catA !== catB) return catA - catB;
        const cmcA = a.cmc || 0;
        const cmcB = b.cmc || 0;
        if (cmcA !== cmcB) return cmcA - cmcB;
        return a.name.localeCompare(b.name);
      }
      if (sortCardsBy === 'cmc') {
        const cmcA = a.cmc || 0;
        const cmcB = b.cmc || 0;
        if (cmcA !== cmcB) return cmcA - cmcB;
        // Secondary sort by color
        const colorA = (a.colors || []).join('');
        const colorB = (b.colors || []).join('');
        if (colorA !== colorB) return colorA.localeCompare(colorB);
        // Tertiary sort by name
        return a.name.localeCompare(b.name);
      }
      if (sortCardsBy === 'color') {
        const colorA = (a.colors || []).join('');
        const colorB = (b.colors || []).join('');
        if (colorA !== colorB) return colorA.localeCompare(colorB);
        // Secondary sort by name
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  };

  // Main cards include all mainboard cards; commanders are kept separate in their own panel at the top
  const mainCards = sortCards(activeDeck.cards.filter((c) => c.category === 'main'));
  const sideCards = sortCards(activeDeck.cards.filter((c) => c.category === 'sideboard'));
  const maybeCards = sortCards(activeDeck.cards.filter((c) => c.category === 'maybeboard'));

  // Subgroup mainboard cards by Type
  const groupCardsByType = (cards: DeckCard[]) => {
    const groups: Record<string, DeckCard[]> = {
      'Creatures': [],
      'Planeswalkers': [],
      'Instants & Sorceries': [],
      'Artifacts & Enchantments': [],
      'Other': [],
      'Lands': [],
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

  const groupedMain = groupCardsByType(mainCards);

  // Available categories for Category Grid view (no separate Command Zone section needed since displayed in header & under type)
  const availableCategories = [
    {
      id: 'creatures',
      title: 'Creatures',
      icon: <Swords className="w-4 h-4 text-emerald-400" />,
      cards: groupedMain['Creatures'],
      totalQty: groupedMain['Creatures'].reduce((s, c) => s + c.quantity, 0),
      totalPrice: groupedMain['Creatures'].reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
    },
    {
      id: 'spells',
      title: 'Instants & Sorceries',
      icon: <Zap className="w-4 h-4 text-sky-400" />,
      cards: groupedMain['Instants & Sorceries'],
      totalQty: groupedMain['Instants & Sorceries'].reduce((s, c) => s + c.quantity, 0),
      totalPrice: groupedMain['Instants & Sorceries'].reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
    },
    {
      id: 'permanents',
      title: 'Artifacts & Enchantments',
      icon: <Shield className="w-4 h-4 text-violet-400" />,
      cards: groupedMain['Artifacts & Enchantments'],
      totalQty: groupedMain['Artifacts & Enchantments'].reduce((s, c) => s + c.quantity, 0),
      totalPrice: groupedMain['Artifacts & Enchantments'].reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
    },
    {
      id: 'planeswalkers',
      title: 'Planeswalkers',
      icon: <Sparkles className="w-4 h-4 text-violet-400" />,
      cards: groupedMain['Planeswalkers'],
      totalQty: groupedMain['Planeswalkers'].reduce((s, c) => s + c.quantity, 0),
      totalPrice: groupedMain['Planeswalkers'].reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
    },
    {
      id: 'lands',
      title: 'Lands',
      icon: <Mountain className="w-4 h-4 text-fuchsia-600" />,
      cards: groupedMain['Lands'],
      totalQty: groupedMain['Lands'].reduce((s, c) => s + c.quantity, 0),
      totalPrice: groupedMain['Lands'].reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
    },
    ...(groupedMain['Other'].length > 0
      ? [{
          id: 'other',
          title: 'Other Cards',
          icon: <Layers className="w-4 h-4 text-slate-400" />,
          cards: groupedMain['Other'],
          totalQty: groupedMain['Other'].reduce((s, c) => s + c.quantity, 0),
          totalPrice: groupedMain['Other'].reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
        }]
      : []),
    {
      id: 'sideboard',
      title: 'Sideboard',
      icon: <Bookmark className="w-4 h-4 text-rose-400" />,
      cards: sideCards,
      totalQty: sideCards.reduce((s, c) => s + c.quantity, 0),
      totalPrice: sideCards.reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
    },
    ...(maybeCards.length > 0 || deck.format !== 'commander'
      ? [{
          id: 'maybeboard',
          title: 'Maybeboard',
          icon: <HelpCircle className="w-4 h-4 text-slate-400" />,
          cards: maybeCards,
          totalQty: maybeCards.reduce((s, c) => s + c.quantity, 0),
          totalPrice: maybeCards.reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
        }]
      : []),
  ];

  const toScryfallCard = (card: DeckCard): ScryfallCard => ({
    id: card.scryfallId,
    name: card.name,
    set: card.set,
    collector_number: card.collector_number || '',
    cmc: card.cmc,
    mana_cost: card.mana_cost,
    type_line: card.type_line,
    rarity: card.rarity || 'common',
    color_identity: card.color_identity || [],
    legalities: {},
    prices: { usd: card.priceUsd?.toString(), usd_foil: card.priceUsdFoil?.toString() },
    image_uris: {
      small: card.imageUrl,
      normal: card.imageUrl,
      large: card.imageUrl,
      art_crop: card.imageUrl,
    },
    imageUrl: card.imageUrl,
    scryfallId: card.scryfallId,
    set_name: card.set_name || '',
  } as any);

  const renderCommanderPanel = () => {
    if (deck.format !== 'commander' && commanderCards.length === 0) return null;

    const totalCommanderPrice = commanderCards.reduce(
      (s, c) => s + (getCardUnitPrice(c) * c.quantity),
      0
    );

    const canShowAddPartner = commanderCards.length === 0 || (commanderCards.length === 1 && Boolean(firstCmdrPartnerInfo?.canHavePartner));

    return (
      <div className="bg-slate-900 border border-fuchsia-500/40 rounded-2xl overflow-hidden shadow-xl shadow-fuchsia-500/5 mb-4">
        <div className="p-3.5 bg-gradient-to-r from-fuchsia-950/70 via-slate-950/80 to-slate-950/80 border-b border-fuchsia-500/30 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30 shrink-0">
              <Crown className="w-4 h-4 text-fuchsia-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-fuchsia-200 tracking-wide uppercase">
                  {commanderCards.length > 1 ? 'Commanders (Partner / Background)' : 'Commander'}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-fuchsia-950 text-[10px] font-mono text-fuchsia-300 border border-fuchsia-500/40 font-bold">
                  {commanderCards.reduce((s, c) => s + c.quantity, 0)} {commanderCards.length === 2 ? '/ 2' : '/ 1'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {commanderCards.length === 2
                  ? '2 commanders designated. Remaining mainboard is limited to 98 cards.'
                  : commanderCards.length === 1
                  ? firstCmdrPartnerInfo?.canHavePartner
                    ? `1 commander designated (${firstCmdrPartnerInfo.description}). Remaining mainboard is limited to 99 cards.`
                    : '1 commander designated (does not support Partner/Background). Remaining mainboard is limited to 99 cards.'
                  : 'Designate your legendary creature or planeswalker as Commander.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {commanderName && deck.name.trim().toLowerCase() !== commanderName.trim().toLowerCase() && (
              <button
                type="button"
                onClick={handleUpdateDeckNameToCommander}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                title={`Update deck name to Commander: "${commanderName}"`}
              >
                <Crown className="w-3 h-3 text-fuchsia-400" />
                <span className="hidden sm:inline">Name deck after Commander</span>
              </button>
            )}

            {commanderCards.length > 0 && (
              <span className="text-xs font-mono text-emerald-400 font-bold">
                ${(Number(totalCommanderPrice) || 0).toFixed(2)}
              </span>
            )}

            {canShowAddPartner && (
              <button
                type="button"
                onClick={() => onOpenSearch(commanderCards.length === 1 ? 'partner' : activeCategoryTab)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/40 text-xs font-bold transition-all cursor-pointer"
                title={commanderCards.length === 0 ? 'Search and add Commander' : `Search and add Partner (${firstCmdrPartnerInfo?.description})`}
              >
                <Plus className="w-3 h-3" />
                <span>{commanderCards.length === 0 ? 'Add Commander' : '+ Partner'}</span>
              </button>
            )}
          </div>
        </div>

        {commanderCards.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {commanderCards.map((card) => renderCardGridItem(card))}
            </div>
          ) : (
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {commanderCards.map((card) => renderCardRow(card))}
            </div>
          )
        ) : (
          <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
            <Crown className="w-6 h-6 text-slate-600 animate-pulse" />
            <p>No commander assigned yet. Click <strong>&quot;+ Add Commander&quot;</strong> or assign any legendary card from your deck.</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Deck Banner & Controls */}
      <div className="relative rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
        {/* Cover Art Backdrop */}
        {deck.coverCardUrl && (
          <div className="absolute inset-0 opacity-15 overflow-hidden rounded-2xl pointer-events-none">
            <img
              src={deck.coverCardUrl}
              alt="Deck Cover Art"
              className="w-full h-full object-cover blur-xs scale-110"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/85 to-transparent" />
          </div>
        )}

        <div className="relative p-3 sm:p-4 space-y-2.5">
          {isEditingTitle ? (
            <div className="space-y-2.5 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Deck Name"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-fuchsia-500"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional deck strategy or notes..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-slate-300 focus:outline-none focus:border-fuchsia-500"
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {deck.format === 'commander' && commanderName && (
                  <button
                    type="button"
                    onClick={() => setTitle(commanderName)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 hover:bg-fuchsia-500/30 text-[11px] font-semibold border border-fuchsia-500/40 cursor-pointer"
                    title={`Set title to Commander: "${commanderName}"`}
                  >
                    <Crown className="w-3 h-3 text-violet-400" />
                    <span>Use Commander: {commanderName}</span>
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => setIsEditingTitle(false)}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveInfo}
                    className="px-3.5 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/20 text-xs font-bold cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              {/* Left: Navigation & Title */}
              <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap min-w-0">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors shrink-0 cursor-pointer border border-slate-800 hover:border-slate-700"
                  title="Return to Decks"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-violet-400" />
                  <span>Decks</span>
                </button>
                <div 
                  onClick={() => setIsEditingTitle(true)}
                  className="group flex items-center gap-1.5 cursor-pointer min-w-0"
                  title="Click to edit name & description"
                >
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-violet-400 transition-colors truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                    {deck.name}
                  </h1>
                  <Pencil className="w-3 h-3 text-slate-500 group-hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>


              </div>

              {/* Middle: Commander Strip (Top Row between Deck Title and Save button) */}
              {deck.format === 'commander' && (
                <div className="flex items-center gap-2 flex-wrap text-xs min-w-0">
                  <span className="text-[11px] uppercase font-bold text-fuchsia-400 tracking-wider flex items-center gap-1.5 shrink-0">
                    <Crown className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>{commanderCards.length === 2 ? 'Commanders:' : 'Commander:'}</span>
                  </span>

                  {commanderCards.length > 0 ? (
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {commanderCards.map((cmdr, cIdx) => (
                        <div
                          key={cmdr.id}
                          className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-fuchsia-500/30 text-xs shadow-xs"
                        >
                          <span className="text-[10px] font-semibold text-fuchsia-400">
                            {cIdx === 0 ? '👑 Commander' : '👑 Partner'}
                          </span>
                          <span
                            onClick={() => onSelectCard(toScryfallCard(cmdr))}
                            className="font-bold text-white hover:text-fuchsia-300 cursor-pointer truncate max-w-[180px] sm:max-w-[220px]"
                            title={cmdr.name}
                          >
                            {cmdr.name}
                          </span>
                          {cmdr.mana_cost && (
                            <div className="shrink-0 scale-90">
                              <ManaCostBadge manaCost={cmdr.mana_cost} size="sm" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleChangeCardCategory(cmdr.id, 'main')}
                            className="p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Demote to regular deck card"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}


                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">
                      No commander assigned yet. Click &quot;Set Commander&quot; on any legendary creature in your deck.
                    </span>
                  )}
                </div>
              )}

              {/* Top Right: Save Deck Button or Restore Version Button */}
              <div className="flex items-center gap-2 shrink-0 sm:ml-auto lg:ml-0">
                {isHistoricalView ? (
                  <button
                    type="button"
                    onClick={handleRestoreHistoricalIteration}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                    title="Restore this historical version as your active deck"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <RotateCcw className="w-4 h-4 text-white" />
                    )}
                    <span>{isSaving ? 'Restoring...' : 'Restore Version'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSave()}
                    disabled={isSaving}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-md active:scale-98 ${
                      hasUnsavedChanges
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white ring-2 ring-violet-400/80 shadow-indigo-500/30 animate-pulse-subtle'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-slate-600'
                    }`}
                    title={hasUnsavedChanges ? 'Save changes to API (Ctrl+S)' : 'Deck saved (Ctrl+S)'}
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Save className={`w-4 h-4 ${hasUnsavedChanges ? 'text-amber-300' : 'text-slate-400'}`} />
                    )}
                    <span>{isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save *' : 'Save'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bottom Row: Actions (Prices, Hand, Compare, Export), Badges (Card count, Price), and Format Dropdown on Far Right below Save */}
          {!isEditingTitle && (
            <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80 flex-wrap">
              {/* Left Side: Buttons + Badges */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Left: Prices, Hand, Compare, Export */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleLivePriceRefresh}
                    disabled={isRefreshingPrices}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    title="Update live card market prices via Scryfall"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPrices ? 'animate-spin text-violet-400' : ''}`} />
                    <span>Prices</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHandSimulator(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 text-xs font-semibold transition-colors cursor-pointer"
                    title="Simulate opening 7-card hand and mulligans"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Hand</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCompareModal(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-200 text-xs font-semibold transition-colors cursor-pointer"
                    title="Compare deck iterations via /mtgtools/comparefiles"
                  >
                    <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isHistoricalView ? 'Compare with Live' : 'Compare'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setExportModalInitialTab('export');
                      setShowExportModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 text-xs font-semibold transition-colors cursor-pointer"
                    title="Export deck to BBCode, TappedOut, Moxfield, MTGO, Excel, etc."
                  >
                    <Share2 className="w-3.5 h-3.5 text-violet-400" />
                    <span>Export</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowGameSummaryModal(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-200 text-xs font-semibold transition-colors cursor-pointer"
                    title="Generate Game Summary BBCode (BBCodeType 3 via /mtgtools/getbbcode)"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Game Summary</span>
                  </button>
                </div>

                {/* Badges to the right of the buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Mainboard Card Count: stats.mainboardCount already includes commander cards */}
                  <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/80 text-[11px] font-mono text-slate-300 shrink-0">
                    {stats.mainboardCount}
                    {deck.format === 'commander' ? '/100' : ''}
                  </span>

                  <span className="px-2 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-800/50 text-[11px] font-bold text-emerald-400 shrink-0" title="Total deck market value">
                    ${(Number(stats.totalPriceUsd) || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Far Right below the Save button: Notice, Historical Dropdown, & Format dropdown */}
              <div className="flex items-center gap-2 shrink-0 ml-auto flex-wrap">
                {/* Historical Version Dropdown */}
                <div
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs shadow-xs transition-colors border ${
                    isHistoricalView
                      ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Clock className={`w-3.5 h-3.5 shrink-0 ${isHistoricalView ? 'text-amber-400' : 'text-slate-400'}`} />
                  <select
                    value={selectedHistoryId}
                    onChange={(e) => setSelectedHistoryId(e.target.value)}
                    className="bg-transparent text-xs font-semibold outline-none cursor-pointer capitalize pr-1 text-inherit max-w-[200px] sm:max-w-xs truncate"
                    title="Select historical iteration to view"
                  >
                    <option value="current" className="bg-slate-900 text-slate-200">
                      Current Version {historyList.length === 0 ? '(No History)' : '(Live Draft)'}
                    </option>
                    {historyList.map((item, idx) => {
                      const hId = item.id || item.historyId;
                      return (
                        <option key={hId || idx} value={hId} className="bg-slate-900 text-slate-200">
                          {formatIterationLabel(item, idx)}
                        </option>
                      );
                    })}
                  </select>

                  {isHistoricalView && (
                    <button
                      type="button"
                      onClick={() => handleDeleteHistoricalIteration(selectedHistoryId)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0 ml-0.5"
                      title="Delete this historical iteration"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    </button>
                  )}
                </div>
                {/* Format Notice Dropdown */}
                {stats.illegalCards.length > 0 && (
                  <div className="relative shrink-0 z-50">
                    <button
                      type="button"
                      onClick={() => setShowFormatNoticeDetails(!showFormatNoticeDetails)}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-fuchsia-950/90 border border-fuchsia-600/70 text-[11px] font-bold text-fuchsia-300 hover:bg-fuchsia-900/80 transition-colors cursor-pointer"
                      title="Click to view format legality notices"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span>Notice ({stats.illegalCards.length})</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${showFormatNoticeDetails ? 'rotate-180' : ''}`} />
                    </button>

                    {showFormatNoticeDetails && (
                      <>
                        {/* Transparent click-away backdrop */}
                        <div
                          className="fixed inset-0 z-[60] bg-transparent cursor-default"
                          onClick={() => setShowFormatNoticeDetails(false)}
                        />
                        <div className="absolute right-0 top-full mt-2 z-[70] w-80 sm:w-96 p-3.5 rounded-xl bg-slate-900 border border-fuchsia-600 shadow-2xl ring-1 ring-fuchsia-500/30 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-150">
                          <div className="font-semibold text-fuchsia-300 flex items-center justify-between text-xs pb-1.5 border-b border-slate-800">
                            <span className="flex items-center gap-1.5 font-bold">
                              <AlertTriangle className="w-4 h-4 text-violet-400 shrink-0" />
                              Format Notice ({deck.format.toUpperCase()}):
                            </span>
                            <button 
                              type="button"
                              onClick={() => setShowFormatNoticeDetails(false)}
                              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Close notice"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <ul className="list-disc list-inside space-y-1.5 text-slate-200 text-xs max-h-56 overflow-y-auto pr-1">
                            {stats.illegalCards.map((msg, i) => (
                              <li key={i} className="leading-relaxed">{msg}</li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <select
                  value={deck.format}
                  onChange={(e) => {
                    const newFormat = e.target.value as MTGFormat;
                    setFormat(newFormat);
                    onUpdateDeck({ ...deck, format: newFormat, updatedAt: Date.now() });
                    setHasUnsavedChanges(true);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 capitalize font-bold outline-none cursor-pointer focus:border-violet-500/50 hover:bg-slate-800 shadow-xs"
                >
                  <option value="commander">Commander / EDH</option>
                  <option value="standard">Standard</option>
                  <option value="modern">Modern</option>
                  <option value="pioneer">Pioneer</option>
                  <option value="legacy">Legacy</option>
                  <option value="vintage">Vintage</option>
                  <option value="pauper">Pauper</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
            </div>
          )}

          {/* Toast feedback */}
          {priceRefreshMessage && (
            <div className="py-1 px-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs text-center font-medium">
              {priceRefreshMessage}
            </div>
          )}
        </div>
      </div>

      {/* Historical Loading Indicator */}
      {isHistoricalLoading && (
        <div className="mb-4 p-4 rounded-2xl bg-slate-900/90 border border-amber-500/40 flex items-center justify-center gap-2 text-xs text-amber-300 shadow-md">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span>Loading historical iteration snapshot...</span>
        </div>
      )}

      {/* Historical Version Active Banner */}
      {isHistoricalView && !isHistoricalLoading && (
        <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border border-amber-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-amber-200 text-sm">
                  Historical Snapshot: {selectedHistoryItem ? formatIterationLabel(selectedHistoryItem) : 'Archived Iteration'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                  Read-Only
                </span>
              </div>
              <p className="text-amber-300/70 text-[11px] mt-0.5">
                You are viewing an archived snapshot of this deck. Restore this version to make it your current active deck, or delete it from history.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md shadow-violet-600/25 active:scale-98 transition-all cursor-pointer"
              title="Compare this historical snapshot against the current live version"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Compare with Live Version</span>
            </button>
            <button
              type="button"
              onClick={handleRestoreHistoricalIteration}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/25 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              title="Restore this version as your current working deck"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Version</span>
            </button>

            <button
              type="button"
              onClick={() => handleDeleteHistoricalIteration(selectedHistoryId)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-300 font-semibold text-xs transition-colors cursor-pointer"
              title="Permanently delete this snapshot from history"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete Snapshot</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedHistoryId('current');
                setHistoricalDeck(null);
              }}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition-colors cursor-pointer"
              title="Return to the live current version of this deck"
            >
              <span>Live Version &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* Pending Unsaved Changes Section (Added and Deleted Cards) */}
      {!isHistoricalView && (pendingChanges.added.length > 0 || pendingChanges.deleted.length > 0) && (
        <div className="mb-5 rounded-2xl bg-slate-900/95 border border-amber-500/40 shadow-xl overflow-hidden backdrop-blur-md animate-in fade-in duration-200">
          <div className="p-3 sm:p-3.5 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                Pending Changes
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                {pendingChanges.added.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold font-mono">
                    +{pendingChanges.added.reduce((sum, i) => sum + i.diffQuantity, 0)} Added
                  </span>
                )}
                {pendingChanges.deleted.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold font-mono">
                    -{pendingChanges.deleted.reduce((sum, i) => sum + i.diffQuantity, 0)} Deleted
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 hidden lg:inline">
                These cards will be saved when you save your deck.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/25 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                title="Save changes to persist to backend and create snapshot"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Deck'}</span>
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* New Cards Added Section */}
            <div className="rounded-xl bg-slate-950/60 border border-emerald-500/30 p-3 flex flex-col">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-500/20">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Cards Added</span>
                  <span className="text-[11px] font-mono text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded">
                    {pendingChanges.added.reduce((sum, i) => sum + i.diffQuantity, 0)}
                  </span>
                </div>
              </div>

              {pendingChanges.added.length === 0 ? (
                <div className="py-4 text-center text-slate-500 text-xs italic">
                  No cards have been added.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {pendingChanges.added.map((item) => (
                    <div
                      key={`added-${item.card.id}-${item.category}`}
                      className="group flex items-center justify-between gap-2 p-1.5 rounded-lg bg-emerald-950/20 hover:bg-emerald-950/40 border border-emerald-900/40 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold font-mono text-[11px] shrink-0">
                          +{item.diffQuantity}
                        </span>
                        <div
                          onClick={() => onSelectCard(toScryfallCard(item.card))}
                          onMouseEnter={(e) =>
                            onImageMouseEnter(e, {
                              imageUrl: getCardLargeImageUrl(item.card),
                              fallbackUrl: item.card.imageUrl,
                              name: item.card.name,
                              backImageUrl: item.card.backImageUrl,
                              scryfallId: item.card.scryfallId,
                            })
                          }
                          onMouseMove={onImageMouseMove}
                          onMouseLeave={onImageMouseLeave}
                          className="w-7 h-9 bg-slate-900 rounded overflow-hidden shrink-0 cursor-pointer border border-emerald-700/50"
                        >
                          <img
                            src={item.card.imageUrl || (item.card.scryfallId ? `https://api.scryfall.com/cards/${item.card.scryfallId}?format=image&version=small` : 'https://cards.scryfall.io/back.jpg')}
                            alt={item.card.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            onClick={() => onSelectCard(toScryfallCard(item.card))}
                            className="font-medium text-slate-200 truncate hover:text-emerald-300 cursor-pointer"
                            title={item.card.name}
                          >
                            {item.card.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span className="capitalize text-slate-500">{item.category}</span>
                            {item.card.manaCost && (
                              <ManaCostBadge manaCost={item.card.manaCost} size="xs" />
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUndoAddedCard(item)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors shrink-0"
                        title="Undo addition (remove from deck)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cards Deleted Section */}
            <div className="rounded-xl bg-slate-950/60 border border-rose-500/30 p-3 flex flex-col">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-rose-500/20">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 uppercase tracking-wider">
                  <Minus className="w-3.5 h-3.5" />
                  <span>Cards Deleted</span>
                  <span className="text-[11px] font-mono text-rose-300 bg-rose-950/80 px-1.5 py-0.5 rounded">
                    {pendingChanges.deleted.reduce((sum, i) => sum + i.diffQuantity, 0)}
                  </span>
                </div>
              </div>

              {pendingChanges.deleted.length === 0 ? (
                <div className="py-4 text-center text-slate-500 text-xs italic">
                  No cards have been deleted.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {pendingChanges.deleted.map((item) => (
                    <div
                      key={`deleted-${item.card.id}-${item.category}`}
                      className="group flex items-center justify-between gap-2 p-1.5 rounded-lg bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold font-mono text-[11px] shrink-0">
                          -{item.diffQuantity}
                        </span>
                        <div
                          onClick={() => onSelectCard(toScryfallCard(item.card))}
                          onMouseEnter={(e) =>
                            onImageMouseEnter(e, {
                              imageUrl: getCardLargeImageUrl(item.card),
                              fallbackUrl: item.card.imageUrl,
                              name: item.card.name,
                              backImageUrl: item.card.backImageUrl,
                              scryfallId: item.card.scryfallId,
                            })
                          }
                          onMouseMove={onImageMouseMove}
                          onMouseLeave={onImageMouseLeave}
                          className="w-7 h-9 bg-slate-900 rounded overflow-hidden shrink-0 cursor-pointer border border-rose-700/50 opacity-80"
                        >
                          <img
                            src={item.card.imageUrl || (item.card.scryfallId ? `https://api.scryfall.com/cards/${item.card.scryfallId}?format=image&version=small` : 'https://cards.scryfall.io/back.jpg')}
                            alt={item.card.name}
                            className="w-full h-full object-cover grayscale-30"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            onClick={() => onSelectCard(toScryfallCard(item.card))}
                            className="font-medium text-slate-300 truncate hover:text-rose-300 cursor-pointer line-through text-slate-400"
                            title={item.card.name}
                          >
                            {item.card.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span className="capitalize text-slate-500">{item.category}</span>
                            {item.card.manaCost && (
                              <ManaCostBadge manaCost={item.card.manaCost} size="xs" />
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestoreDeletedCard(item)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px] shrink-0 cursor-pointer"
                        title="Restore card back to deck"
                      >
                        <RotateCcw className="w-3 h-3 text-rose-300" />
                        <span>Restore</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category Navigation & Layout Options Row */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Individual Category Tab Navigation Options */}
          <button
            type="button"
            onClick={() => {
              setViewMode('tabbed');
              setActiveCategoryTab('main');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              viewMode === 'tabbed' && activeCategoryTab === 'main'
                ? 'bg-slate-800 text-violet-400 border border-fuchsia-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mainboard ({deck.format === 'commander' ? mainCards.reduce((s, c) => s + c.quantity, 0) : stats.mainboardCount})
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('tabbed');
              setActiveCategoryTab('sideboard');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              viewMode === 'tabbed' && activeCategoryTab === 'sideboard'
                ? 'bg-slate-800 text-violet-400 border border-fuchsia-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sideboard ({stats.sideboardCount})
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('tabbed');
              setActiveCategoryTab('maybeboard');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              viewMode === 'tabbed' && activeCategoryTab === 'maybeboard'
                ? 'bg-slate-800 text-violet-400 border border-fuchsia-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Maybeboard ({stats.maybeboardCount})
          </button>
        </div>

        {/* View Mode Switcher and Add Cards Button */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Sort By */}
          <select
            value={sortCardsBy}
            onChange={(e) => setSortCardsBy(e.target.value as 'name' | 'cmc' | 'color' | 'category')}
            className="bg-slate-900 border border-slate-800 rounded-lg text-xs px-2 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="name">A-Z</option>
            <option value="category">Category (Lands at bottom)</option>
            <option value="cmc">Mana Value</option>
            <option value="color">Color</option>
          </select>

          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-800 text-violet-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tabbed')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'tabbed' ? 'bg-slate-800 text-violet-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Tabbed List View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('piles')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'piles' ? 'bg-slate-800 text-violet-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Visual Piles / Stacks View"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Piles</span>
            </button>
          </div>

          <button
            onClick={() => {
              if (isHistoricalView) {
                setPriceRefreshMessage('Cannot add cards to a historical iteration. Restore this version first.');
                setTimeout(() => setPriceRefreshMessage(null), 3000);
                return;
              }
              onOpenSearch(activeCategoryTab);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer ${
              isHistoricalView
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-500/20 hover:scale-102 active:scale-98'
            }`}
            title={isHistoricalView ? 'Historical snapshot is read-only' : 'Search and add cards to this deck'}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Cards</span>
          </button>
        </div>
      </div>

      {/* Category Grid View */}
      {viewMode === 'category-grid' ? (
        <div className="space-y-4">
          {renderCommanderPanel()}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <LayoutGrid className="w-3.5 h-3.5 text-violet-400" />
              <span>Category Grid View — showing all available deck categories</span>
            </span>
            <span className="font-mono text-slate-400">
              Total: {stats.totalCards} cards (${(Number(stats.totalPriceUsd) || 0).toFixed(2)})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {availableCategories
              .filter((cat) => cat.totalQty > 0)
              .map((cat) => (
                <div
                  key={cat.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col"
                >
                  <div className="p-3.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {cat.icon}
                      <h4 className="text-xs font-bold text-slate-200 truncate">{cat.title}</h4>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-violet-400 font-bold shrink-0">
                        {cat.totalQty}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-slate-400">
                        ${(Number(cat.totalPrice) || 0).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenSearch(activeCategoryTab)}
                        className="p-1 rounded-md bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 hover:text-white transition-colors cursor-pointer"
                        title={`Add cards to ${cat.title}`}
                      >
                        <Plus className="w-3 h-3 text-violet-400" />
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
                    {cat.cards.length > 0 ? (
                      cat.cards.map((card) => renderCardRow(card))
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No cards in {cat.title.toLowerCase()}.
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>

          {deck.cards.length === 0 && (
            <div className="p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400 space-y-3">
              <Layers className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs font-medium">Your deck is empty. Click &quot;+ Add Cards&quot; to search and add cards from Scryfall.</p>
              <button
                onClick={() => onOpenSearch(activeCategoryTab)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/20 text-xs font-bold transition-colors cursor-pointer"
              >
                Search Cards Now
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Tabbed Content */
        <div className="space-y-6">
          {/* Mainboard Tab */}
          {activeCategoryTab === 'main' && (
            <div className="space-y-6">
              {renderCommanderPanel()}
              {viewMode === 'piles' ? (
                renderPilesView(mainCards)
              ) : (
                Object.entries(groupedMain).map(([groupTitle, cardsInGroup]) => {
                  if (cardsInGroup.length === 0) return null;
                  const groupTotalQty = cardsInGroup.reduce((a, b) => a + b.quantity, 0);

                  return (
                    <div key={groupTitle} className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-1">
                        <span>{groupTitle}</span>
                        <span className="text-violet-400 font-mono">({groupTotalQty})</span>
                      </div>

                      {renderCardListOrGrid(cardsInGroup)}
                    </div>
                  );
                })
              )}

              {mainCards.length === 0 && (
                <div className="p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400 space-y-3">
                  <Layers className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs font-medium">
                    {commanderCards.length > 0
                      ? `Commander is set. Add ${deck.format === 'commander' ? (commanderCards.length === 2 ? 98 : 99) : ''} cards to complete your deck.`
                      : 'Your deck is empty. Click "+ Add Cards" to search and add cards from Scryfall.'}
                  </p>
                  <button
                    onClick={() => onOpenSearch(activeCategoryTab)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/20 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Search Cards Now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Sideboard Tab */}
          {activeCategoryTab === 'sideboard' && (
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-semibold text-slate-400">Sideboard ({stats.sideboardCount})</h3>
              {sideCards.length > 0 ? (
                viewMode === 'piles' ? renderPilesView(sideCards) : renderCardListOrGrid(sideCards)
              ) : (
                <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500 text-xs">
                  Sideboard is empty. Move cards here to swap between matches.
                </div>
              )}
            </div>
          )}

          {/* Maybeboard Tab */}
          {activeCategoryTab === 'maybeboard' && (
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-semibold text-slate-400">Maybeboard / Tech ({stats.maybeboardCount})</h3>
              {maybeCards.length > 0 ? (
                viewMode === 'piles' ? renderPilesView(maybeCards) : renderCardListOrGrid(maybeCards)
              ) : (
                <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500 text-xs">
                  Maybeboard is empty. Save experimental cards and upgrades here.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mana Curve & Stats Accordion (collapsed by default) */}
      <div className="pt-2">
        <button
          onClick={() => setShowStats(!showStats)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-violet-400" />
            Deck Statistics &amp; Mana Curve Analysis
          </span>
          {showStats ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showStats && (
          <div className="mt-3">
            <ManaCurveChart stats={stats} />
          </div>
        )}
      </div>

      {/* Delete Deck Footer Action */}
      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          onClick={() => {
            setConfirmState({
              isOpen: true,
              title: 'Delete Deck',
              message: `Are you sure you want to delete the deck "${deck.name}"?`,
              onConfirm: () => onDeleteDeck(deck.id)
            });
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 text-xs font-medium transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete This Deck</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText || 'Confirm'}
        cancelText={confirmState.cancelText || 'Cancel'}
        onConfirm={() => {
          confirmState.onConfirm();
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => {
          if (confirmState.onCancel) {
            confirmState.onCancel();
          }
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }}
      />

      {/* Card Detail / Oracle Inspector */}
      {showHandSimulator && (
        <SampleHandSimulator
          deck={deck}
          isOpen={showHandSimulator}
          onClose={() => setShowHandSimulator(false)}
          onSelectCard={onSelectCard}
        />
      )}

      {/* Export / Import Multi-format Modal */}
      <DeckExportModal
        deck={{
          ...activeDeck,
          name: isHistoricalView ? activeDeck.name : title,
          description: isHistoricalView ? activeDeck.description : description,
          format: activeDeck.format,
        }}
        isHistorical={isHistoricalView}
        existingDecks={DeckService.getLocalDecks()}
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
        }}
        onImportAsNewDeck={handleImportAsNewDeck}
        onImportAppendToDeck={handleAppendCardsToDeck}
        onImportOverwriteDeck={handleOverwriteDeck}
        onBatchImportCompleted={(count) => {
          setShowExportModal(false);
          if (onBatchImportCompleted) {
            onBatchImportCompleted(count);
          } else {
            onBack();
          }
        }}
        initialTab={exportModalInitialTab}
      />

      {/* Deck Comparison Modal */}
      <DeckCompareModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        deck={deck}
        historyList={historyList}
        initialBaseId={isHistoricalView ? selectedHistoryId : undefined}
        onDeleteIteration={handleDeleteHistoricalIteration}
      />

      {/* Game Summary Modal */}
      {showGameSummaryModal && (
        <GameSummaryModal
          isOpen={showGameSummaryModal}
          onClose={() => setShowGameSummaryModal(false)}
          deck={activeDeck}
        />
      )}

      {/* 1-Second Delayed Image Hover Popup */}
      <ImageHoverPopup preview={hoverPreview} />
    </div>
  );


  interface PileGroup {
    id: string;
    title: string;
    cards: DeckCard[];
    totalQuantity: number;
    totalPrice: number;
  }

  function groupCardsIntoPiles(cards: DeckCard[], sortBy: 'category' | 'cmc' | 'color' | 'name'): PileGroup[] {
    if (cards.length === 0) return [];

    if (sortBy === 'cmc') {
      const cmcMap = new Map<string, DeckCard[]>();
      const cmcKeys = ['0', '1', '2', '3', '4', '5', '6', '7+'];
      cmcKeys.forEach((k) => cmcMap.set(k, []));

      cards.forEach((c) => {
        const cmc = Math.floor(c.cmc || 0);
        const key = cmc >= 7 ? '7+' : String(Math.max(0, cmc));
        if (!cmcMap.has(key)) cmcMap.set(key, []);
        cmcMap.get(key)!.push(c);
      });

      const piles: PileGroup[] = [];
      cmcKeys.forEach((key) => {
        const pileCards = cmcMap.get(key) || [];
        if (pileCards.length > 0) {
          pileCards.sort((a, b) => a.name.localeCompare(b.name));
          piles.push({
            id: `cmc-${key}`,
            title: `${key} MV`,
            cards: pileCards,
            totalQuantity: pileCards.reduce((s, c) => s + (c.quantity || 1), 0),
            totalPrice: pileCards.reduce((s, c) => s + (Number(getCardUnitPrice(c)) || 0) * (c.quantity || 1), 0),
          });
        }
      });
      return piles;
    }

    if (sortBy === 'color') {
      const colorOrder = [
        { key: 'W', title: 'White' },
        { key: 'U', title: 'Blue' },
        { key: 'B', title: 'Black' },
        { key: 'R', title: 'Red' },
        { key: 'G', title: 'Green' },
        { key: 'multi', title: 'Multicolor' },
        { key: 'colorless', title: 'Colorless' },
        { key: 'land', title: 'Lands' },
      ];

      const colorMap = new Map<string, DeckCard[]>();
      colorOrder.forEach((o) => colorMap.set(o.key, []));

      cards.forEach((c) => {
        const type = c.type_line?.toLowerCase() || '';
        if (type.includes('land')) {
          colorMap.get('land')!.push(c);
          return;
        }
        const colors = c.colors || [];
        if (colors.length === 0) {
          colorMap.get('colorless')!.push(c);
        } else if (colors.length === 1) {
          const col = colors[0];
          if (colorMap.has(col)) {
            colorMap.get(col)!.push(c);
          } else {
            colorMap.get('colorless')!.push(c);
          }
        } else {
          colorMap.get('multi')!.push(c);
        }
      });

      const piles: PileGroup[] = [];
      colorOrder.forEach((o) => {
        const pileCards = colorMap.get(o.key) || [];
        if (pileCards.length > 0) {
          pileCards.sort((a, b) => (a.cmc || 0) - (b.cmc || 0) || a.name.localeCompare(b.name));
          piles.push({
            id: `color-${o.key}`,
            title: o.title,
            cards: pileCards,
            totalQuantity: pileCards.reduce((s, c) => s + (c.quantity || 1), 0),
            totalPrice: pileCards.reduce((s, c) => s + (Number(getCardUnitPrice(c)) || 0) * (c.quantity || 1), 0),
          });
        }
      });
      return piles;
    }

    if (sortBy === 'category') {
      const catOrder = [
        'Creatures',
        'Planeswalkers',
        'Instants',
        'Sorceries',
        'Artifacts',
        'Enchantments',
        'Battles',
        'Lands',
        'Other',
      ];

      const catMap = new Map<string, DeckCard[]>();
      catOrder.forEach((k) => catMap.set(k, []));

      cards.forEach((c) => {
        const t = c.type_line?.toLowerCase() || '';
        if (t.includes('creature')) catMap.get('Creatures')!.push(c);
        else if (t.includes('planeswalker')) catMap.get('Planeswalkers')!.push(c);
        else if (t.includes('instant')) catMap.get('Instants')!.push(c);
        else if (t.includes('sorcery')) catMap.get('Sorceries')!.push(c);
        else if (t.includes('artifact')) catMap.get('Artifacts')!.push(c);
        else if (t.includes('enchantment')) catMap.get('Enchantments')!.push(c);
        else if (t.includes('battle')) catMap.get('Battles')!.push(c);
        else if (t.includes('land')) catMap.get('Lands')!.push(c);
        else catMap.get('Other')!.push(c);
      });

      const piles: PileGroup[] = [];
      catOrder.forEach((title) => {
        const pileCards = catMap.get(title) || [];
        if (pileCards.length > 0) {
          pileCards.sort((a, b) => (a.cmc || 0) - (b.cmc || 0) || a.name.localeCompare(b.name));
          piles.push({
            id: `cat-${title}`,
            title,
            cards: pileCards,
            totalQuantity: pileCards.reduce((s, c) => s + (c.quantity || 1), 0),
            totalPrice: pileCards.reduce((s, c) => s + (Number(getCardUnitPrice(c)) || 0) * (c.quantity || 1), 0),
          });
        }
      });
      return piles;
    }

    // Name sort: group into alphabetical buckets (A-C, D-F, G-I, J-L, M-O, P-R, S-U, V-Z)
    const alphaBuckets = [
      { key: 'A-C', regex: /^[A-C]/i },
      { key: 'D-F', regex: /^[D-F]/i },
      { key: 'G-I', regex: /^[G-I]/i },
      { key: 'J-L', regex: /^[J-L]/i },
      { key: 'M-O', regex: /^[M-O]/i },
      { key: 'P-R', regex: /^[P-R]/i },
      { key: 'S-U', regex: /^[S-U]/i },
      { key: 'V-Z', regex: /^[V-Z]/i },
      { key: 'Other', regex: /^[^A-Z]/i },
    ];

    const alphaMap = new Map<string, DeckCard[]>();
    alphaBuckets.forEach((b) => alphaMap.set(b.key, []));

    cards.forEach((c) => {
      const bucket = alphaBuckets.find((b) => b.regex.test(c.name.trim())) || alphaBuckets[alphaBuckets.length - 1];
      alphaMap.get(bucket.key)!.push(c);
    });

    const piles: PileGroup[] = [];
    alphaBuckets.forEach((b) => {
      const pileCards = alphaMap.get(b.key) || [];
      if (pileCards.length > 0) {
        pileCards.sort((a, b) => a.name.localeCompare(b.name));
        piles.push({
          id: `alpha-${b.key}`,
          title: b.key,
          cards: pileCards,
          totalQuantity: pileCards.reduce((s, c) => s + (c.quantity || 1), 0),
          totalPrice: pileCards.reduce((s, c) => s + (Number(getCardUnitPrice(c)) || 0) * (c.quantity || 1), 0),
        });
      }
    });
    return piles;
  }

  function renderPilesView(cards: DeckCard[]) {
    if (cards.length === 0) return null;
    const piles = groupCardsIntoPiles(cards, sortCardsBy);

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 sm:gap-5 items-start pt-2 pb-16">
        {piles.map((pile) => (
          <div key={pile.id} className="flex flex-col min-w-0">
            {/* Pile Header */}
            <div className="flex items-center justify-between gap-1.5 pb-2 mb-2 border-b border-slate-800 text-xs">
              <span className="font-bold text-slate-200 truncate">{pile.title}</span>
              <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono">
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-violet-300 font-bold">
                  {pile.totalQuantity}
                </span>
                <span className="text-slate-400">
                  ${pile.totalPrice.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Cascading Cards Stack */}
            <div className="flex flex-col relative w-full pt-1">
              {pile.cards.map((card, idx) => renderCardPileItem(card, idx, pile.cards.length))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderCardPileItem(card: DeckCard, index: number, totalInPile: number) {
    const unitPrice = getCardUnitPrice(card);
    const thumbUrl = (card.imageUrl ? card.imageUrl.replace('version=small', 'version=normal') : undefined) || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=normal` : undefined);
    const isThisCommander = card.category === 'commander';

    return (
      <div
        key={card.id}
        style={{ marginTop: index > 0 ? '-68%' : '0' }}
        className={`group relative rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:z-40 hover:-translate-y-4 hover:shadow-2xl aspect-[5/7] bg-slate-950 border ${
          isThisCommander ? 'border-fuchsia-500/80 shadow-fuchsia-500/20' : 'border-slate-800 hover:border-violet-400'
        }`}
      >
        {/* Main Card Image with Dual-Click & Inspection Click */}
        <div
          onClick={() => {
            if (wasChordTriggeredRecently()) return;
            onImageClearPreview();
            onSelectCard(toScryfallCard(card));
          }}
          {...getCardChordProps({
            name: card.name,
            imageUrl: getCardLargeImageUrl(card),
            backImageUrl: card.backImageUrl,
            scryfallId: card.scryfallId,
            manaCost: card.manaCost,
            typeLine: card.type_line,
            price: unitPrice,
            isFoil: card.isFoil,
          })}
          className="cursor-pointer relative aspect-[5/7] bg-slate-950 overflow-hidden w-full h-full"
          title="Click to inspect, or Right+Left click together to pop up larger image"
        >
          <img
            src={thumbUrl || 'https://cards.scryfall.io/back.jpg'}
            alt={card.name}
            loading="lazy"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              if (card.scryfallId && !e.currentTarget.src.includes('format=image')) {
                e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=normal`;
              }
            }}
          />

          {/* Badges on Top */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
            {card.quantity > 1 && (
              <span className="px-1.5 py-0.5 rounded bg-slate-950/90 text-violet-300 font-mono font-bold text-[11px] border border-violet-500/40 shadow-sm backdrop-blur-xs">
                {card.quantity}x
              </span>
            )}
            {isThisCommander && (
              <span className="px-1.5 py-0.5 rounded bg-fuchsia-950/90 text-fuchsia-300 font-bold text-[10px] border border-fuchsia-500/40 shadow-sm flex items-center gap-0.5">
                <Crown className="w-2.5 h-2.5 text-fuchsia-400" /> Cmdr
              </span>
            )}
          </div>

          {card.isFoil && (
            <div className="absolute top-1.5 right-1.5 z-10 bg-amber-950/90 border border-amber-600/60 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-300 flex items-center gap-0.5 shadow-sm">
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
            </div>
          )}

          {/* Dual-click hint pill on hover */}
          <div className="absolute inset-x-2 top-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex justify-center z-20">
            <span className="px-2 py-0.5 rounded-full bg-slate-950/90 text-[10px] text-slate-300 border border-slate-700 shadow-md font-medium">
              Dual-click to peek
            </span>
          </div>
        </div>

        {/* Hover Action Bar at Bottom of Card */}
        <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent opacity-0 group-hover:opacity-100 transition-all flex items-center justify-between gap-1 z-30">
          <div className="flex items-center gap-1 bg-slate-900/90 rounded-md p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateCardQuantity(card.id, -1);
              }}
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Decrease quantity"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[11px] font-mono font-bold text-slate-200 px-1">
              {card.quantity}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateCardQuantity(card.id, 1);
              }}
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Increase quantity"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveCard(card.id);
            }}
            className="p-1.5 rounded-md bg-rose-950/90 hover:bg-rose-900 border border-rose-700/60 text-rose-300 transition-colors cursor-pointer shadow-sm"
            title="Remove from deck"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  function renderCardListOrGrid(cards: DeckCard[]) {
    if (viewMode === 'grid') {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-4 sm:gap-5 pt-2">
          {cards.map((c) => renderCardGridItem(c))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map((c) => renderCardRow(c))}
      </div>
    );
  }

  // Helper row renderer
  function renderCardRow(card: DeckCard) {
    const unitPrice = getCardUnitPrice(card);
    const lineTotal = ((Number(unitPrice) || 0) * card.quantity).toFixed(2);
    const thumbUrl = (card.imageUrl ? card.imageUrl.replace('version=small', 'version=normal') : undefined) || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=normal` : undefined);

    const isThisCommander = card.category === 'commander';
    const canAddAsCommander =
      deck.format === 'commander' &&
      !isThisCommander &&
      (commanderCards.length === 0
        ? canBePrimaryCommander(card)
        : commanderCards.length === 1
        ? canCardsPartnerTogether(commanderCards[0], card).canPartner
        : false);

    return (
      <div
        key={card.id}
        className={`group p-3 rounded-xl flex flex-col justify-between gap-2.5 transition-all border shadow-sm ${
          isThisCommander
            ? 'bg-fuchsia-950/25 border-fuchsia-500/50 shadow-fuchsia-500/5 hover:border-fuchsia-500'
            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
        }`}
      >
        {/* Top Row: Card Details */}
        <div className="flex items-center gap-3">
          {/* Thumbnail */}
          <div
            onClick={() => {
              if (wasChordTriggeredRecently()) return;
              onImageClearPreview();
              onSelectCard(toScryfallCard(card));
            }}
            {...getCardChordProps({
              name: card.name,
              imageUrl: getCardLargeImageUrl(card),
              backImageUrl: card.backImageUrl,
              scryfallId: card.scryfallId,
              manaCost: card.manaCost,
              typeLine: card.type_line,
              price: unitPrice,
              isFoil: card.isFoil,
            })}
            onMouseEnter={(e) =>
              onImageMouseEnter(e, {
                imageUrl: getCardLargeImageUrl(card),
                fallbackUrl: thumbUrl,
                name: card.name,
                backImageUrl: card.backImageUrl,
                scryfallId: card.scryfallId,
              })
            }
            onMouseMove={onImageMouseMove}
            onMouseLeave={onImageMouseLeave}
            className="w-12 h-16 rounded bg-slate-950 overflow-hidden shrink-0 border border-slate-800 cursor-pointer hover:border-fuchsia-400 transition-colors shadow-sm"
          >
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={card.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (card.scryfallId && !e.currentTarget.src.includes('format=image')) {
                    e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=normal`;
                  }
                }}
              />
            ) : (
              <div className="w-full h-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-bold">MTG</div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-2">
              <span
                onClick={() => onSelectCard(toScryfallCard(card))}
                className="text-sm font-bold text-slate-200 hover:text-violet-400 cursor-pointer break-words leading-tight"
              >
                {card.name}
              </span>
              <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                <ManaCostBadge manaCost={card.mana_cost} size="sm" />
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1.5">
              <span className="uppercase font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 shadow-inner">
                {card.set}
              </span>
              <span className="truncate">{card.type_line}</span>
            </div>
          </div>

          {/* Price */}
          <div className="text-right shrink-0 min-w-[3.5rem]">
            <span className="text-xs font-bold text-emerald-400 block">${lineTotal}</span>
            <span className="text-[10px] text-slate-500 block">${(Number(unitPrice) || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Bottom Row: Controls (Quantity, Location, Commander status, Remove) */}
        <div className="flex items-center justify-between gap-2">
          {isHistoricalView ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 shadow-sm">
                {card.quantity}x
              </span>
              {isThisCommander && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 text-[10px] font-bold">
                  <Crown className="w-3 h-3 text-fuchsia-400" />
                  <span>{commanderCards.length > 1 && commanderCards[1]?.id === card.id ? 'Partner' : 'Commander'}</span>
                </span>
              )}
              {card.isFoil && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-bold">
                  <Sparkles className="w-2.5 h-2.5" /> Foil
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Quantity stepper */}
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shrink-0 shadow-sm">
                  <button
                    onClick={() => handleUpdateCardQuantity(card.id, -1)}
                    className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Decrease"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-7 text-center text-xs font-bold text-slate-100">{card.quantity}</span>
                  <button
                    onClick={() => handleUpdateCardQuantity(card.id, 1)}
                    disabled={isThisCommander && card.quantity >= 1}
                    className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title={isThisCommander ? 'Commanders are limited to 1 copy' : 'Increase'}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Category Quick Move Buttons */}
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden text-[10px] shrink-0 font-medium shadow-sm">
                  <button
                    onClick={() => handleChangeCardCategory(card.id, 'main')}
                    className={`px-2 py-1.5 transition-colors cursor-pointer ${
                      card.category === 'main' ? 'bg-fuchsia-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    Main
                  </button>
                  {isThisCommander ? (
                    <button
                      onClick={() => handleChangeCardCategory(card.id, 'main')}
                      className="px-2 py-1.5 transition-colors border-l border-slate-800 bg-fuchsia-500 text-slate-950 font-bold cursor-pointer"
                      title="Click to remove Commander status"
                    >
                      👑 Cmdr
                    </button>
                  ) : canAddAsCommander ? (
                    <button
                      onClick={() => handleChangeCardCategory(card.id, 'commander')}
                      className="px-2 py-1.5 transition-colors border-l border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-fuchsia-300 cursor-pointer"
                      title={commanderCards.length === 1 ? 'Designate as Partner Commander' : 'Designate as Commander'}
                    >
                      {commanderCards.length === 1 ? '+ Partner' : 'Cmdr'}
                    </button>
                  ) : null}
                  <button
                    onClick={() => handleChangeCardCategory(card.id, 'sideboard')}
                    className={`px-2 py-1.5 transition-colors border-l border-slate-800 cursor-pointer ${
                      card.category === 'sideboard' ? 'bg-fuchsia-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    Side
                  </button>
                  <button
                    onClick={() => handleChangeCardCategory(card.id, 'maybeboard')}
                    className={`px-2 py-1.5 transition-colors border-l border-slate-800 cursor-pointer ${
                      card.category === 'maybeboard' ? 'bg-fuchsia-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    Maybe
                  </button>
                </div>

                {/* Commander Badge if active commander */}
                {isThisCommander && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 text-[10px] font-bold">
                    <Crown className="w-3 h-3 text-fuchsia-400" />
                    <span>{commanderCards.length > 1 && commanderCards[1]?.id === card.id ? 'Partner' : 'Commander'}</span>
                  </span>
                )}

                {/* Set as Commander / Partner Button */}
                {canAddAsCommander && (
                  <button
                    onClick={() => handleChangeCardCategory(card.id, 'commander')}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/40 text-[10px] font-bold transition-colors shadow-sm cursor-pointer"
                    title={commanderCards.length === 1 ? 'Set as Partner Commander' : 'Set as Commander'}
                  >
                    <Crown className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>{commanderCards.length === 1 ? '+ Partner' : 'Set Commander'}</span>
                  </button>
                )}
              </div>

              {/* Remove Card */}
              <button
                onClick={() => handleRemoveCard(card.id)}
                className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                title="Remove card"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderCardGridItem(card: DeckCard) {
    const unitPrice = getCardUnitPrice(card);
    const lineTotal = ((Number(unitPrice) || 0) * card.quantity).toFixed(2);
    const thumbUrl = card.imageUrl || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small` : undefined);
    const isThisCommander = card.category === 'commander';
    const canAddAsCommander =
      deck.format === 'commander' &&
      !isThisCommander &&
      (commanderCards.length === 0
        ? canBePrimaryCommander(card)
        : commanderCards.length === 1
        ? canCardsPartnerTogether(commanderCards[0], card).canPartner
        : false);

    return (
      <div
        key={card.id}
        className={`group relative bg-slate-900 border rounded-xl overflow-hidden shadow-lg transition-all duration-200 flex flex-col justify-between ${
          isThisCommander ? 'border-fuchsia-500/70 shadow-fuchsia-500/10' : 'border-slate-800 hover:border-fuchsia-500/60'
        }`}
      >
        <div
          onClick={() => {
            if (wasChordTriggeredRecently()) return;
            onImageClearPreview();
            onSelectCard(toScryfallCard(card));
          }}
          {...getCardChordProps({
            name: card.name,
            imageUrl: getCardLargeImageUrl(card),
            backImageUrl: card.backImageUrl,
            scryfallId: card.scryfallId,
            manaCost: card.manaCost,
            typeLine: card.type_line,
            price: unitPrice,
            isFoil: card.isFoil,
          })}
          className="cursor-pointer relative aspect-[5/7] bg-slate-950 overflow-hidden"
          title="Click to inspect, or Right+Left click together to pop up larger image"
        >
          <img
            src={thumbUrl || 'https://cards.scryfall.io/back.jpg'}
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
          {isThisCommander && (
            <div className="absolute top-1.5 left-1.5 bg-fuchsia-950/95 border border-fuchsia-500/60 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-300 flex items-center gap-1 shadow-md">
              <Crown className="w-2.5 h-2.5 text-fuchsia-400" />
              {commanderCards.length > 1 && commanderCards[1]?.id === card.id ? 'Partner' : 'Commander'}
            </div>
          )}
          {card.isFoil && (
            <div className="absolute top-1.5 right-1.5 bg-fuchsia-950/90 border border-amber-700/80 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-300 flex items-center gap-0.5 shadow-md">
              <Sparkles className="w-2.5 h-2.5" /> Foil
            </div>
          )}
          <div className="absolute bottom-1.5 left-1.5 bg-slate-950/90 backdrop-blur-xs border border-slate-800 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-emerald-400">
            ${lineTotal}
          </div>
        </div>

        <div className="p-2.5 flex flex-col justify-between gap-2">
          <div>
            <h4
              onClick={() => onSelectCard(toScryfallCard(card))}
              className="text-xs font-semibold text-slate-200 break-words leading-tight hover:text-violet-400 cursor-pointer"
              title={card.name}
            >
              {card.name}
            </h4>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800/60 pt-2">
            {isHistoricalView ? (
              <div className="flex items-center justify-between w-full text-xs text-slate-400 font-mono">
                <span className="font-bold text-slate-200">{card.quantity}x</span>
                <span className="text-[10px] uppercase font-semibold text-amber-400/80">Archived</span>
              </div>
            ) : (
              <>
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => handleUpdateCardQuantity(card.id, -1)}
                    className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <Minus className="w-2.5 h-2.5" />
                  </button>
                  <span className="w-6 text-center font-bold text-slate-200 text-[11px] font-mono">
                    {card.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateCardQuantity(card.id, 1)}
                    disabled={isThisCommander && card.quantity >= 1}
                    className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title={isThisCommander ? 'Commanders are limited to 1 copy' : 'Increase'}
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveCard(card.id)}
                  className="p-1 rounded-md text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Remove from deck"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>

          {/* Quick Category Relocation Buttons (Main, Side, Maybe, and Commander/Partner if eligible) */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden text-[10px] font-medium shadow-xs mt-1 w-full">
            <button
              type="button"
              onClick={() => handleChangeCardCategory(card.id, 'main')}
              className={`flex-1 py-1 text-center transition-colors cursor-pointer ${
                card.category === 'main'
                  ? 'bg-fuchsia-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="Move to Mainboard"
            >
              Main
            </button>

            {isThisCommander ? (
              <button
                type="button"
                onClick={() => handleChangeCardCategory(card.id, 'main')}
                className="px-1.5 py-1 transition-colors border-l border-slate-800 bg-fuchsia-500 text-slate-950 font-bold cursor-pointer"
                title="Click to remove Commander status"
              >
                Cmdr
              </button>
            ) : canAddAsCommander ? (
              <button
                type="button"
                onClick={() => handleChangeCardCategory(card.id, 'commander')}
                className="px-1.5 py-1 transition-colors border-l border-slate-800 text-fuchsia-400 hover:bg-slate-800 hover:text-fuchsia-300 font-bold cursor-pointer"
                title={commanderCards.length === 1 ? 'Designate as Partner Commander' : 'Designate as Commander'}
              >
                {commanderCards.length === 1 ? '+P' : 'Cmdr'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => handleChangeCardCategory(card.id, 'sideboard')}
              className={`flex-1 py-1 text-center transition-colors border-l border-slate-800 cursor-pointer ${
                card.category === 'sideboard'
                  ? 'bg-fuchsia-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="Move to Sideboard"
            >
              Side
            </button>

            <button
              type="button"
              onClick={() => handleChangeCardCategory(card.id, 'maybeboard')}
              className={`flex-1 py-1 text-center transition-colors border-l border-slate-800 cursor-pointer ${
                card.category === 'maybeboard'
                  ? 'bg-fuchsia-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="Move to Maybeboard"
            >
              Maybe
            </button>
          </div>
        </div>
      </div>
    );
  }
};
