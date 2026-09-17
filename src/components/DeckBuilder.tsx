import { ConfirmModal } from "./ConfirmModal";
import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Sparkles, 
  RefreshCw, 
  Play, 
  Share2, 
  Trash2, 
  Plus, 
  Minus, 
  X, 
  Check, 
  Copy, 
  Download, 
  Upload, 
  AlertTriangle, 
  Layers, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Pencil,
  Crown,
  LayoutGrid, Columns3,
  List,
  Swords,
  Zap,
  Shield,
  Mountain,
  Bookmark,
  HelpCircle
} from 'lucide-react';
import { Deck, DeckCard, MTGFormat, DeckCategory, ScryfallCard } from '../types/mtg';
import { calculateDeckStats, exportDeckToText, parseTextDecklist } from '../utils/deckUtils';
import { StorageService } from '../services/storage';
import { ManaCostBadge } from './ManaCostBadge';
import { ManaCurveChart } from './ManaCurveChart';
import { SampleHandSimulator } from './SampleHandSimulator';
import { DeckExportModal } from './DeckExportModal';
import { searchCards } from '../services/scryfall';

interface DeckBuilderProps {
  deck: Deck;
  onBack: () => void;
  onUpdateDeck: (deck: Deck) => void;
  onDeleteDeck: (deckId: string) => void;
  onOpenSearch: () => void;
  onSelectCard: (card: ScryfallCard) => void;
  onCreateNewDeck?: (currentDeckToSave: Deck) => Promise<void> | void;
  onImportAsNewDeck?: (newDeck: Deck, shouldSaveCurrentDeck: boolean) => Promise<void>;
}

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  deck,
  onBack,
  onUpdateDeck,
  onDeleteDeck,
  onOpenSearch,
  onSelectCard,
  onCreateNewDeck,
  onImportAsNewDeck: onImportAsNewDeckProp,
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
  const [exportModalInitialTab, setExportModalInitialTab] = useState<'export' | 'import'>('export');
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState<DeckCategory>('main');
  const [viewMode, setViewMode] = useState<'tabbed' | 'category-grid' | 'grid'>('tabbed');
  const [sortCardsBy, setSortCardsBy] = useState<'name' | 'cmc' | 'color'>('name');
  const [isSavingNewDeck, setIsSavingNewDeck] = useState(false);
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  // Keep internal state in sync with deck updates
  React.useEffect(() => {
    setTitle(deck.name);
    setDescription(deck.description || '');
    setFormat(deck.format);
  }, [deck.id, deck.name, deck.description, deck.format]);

  const handleSaveAndCreateNewDeck = async () => {
    if (isSavingNewDeck) return;
    setIsSavingNewDeck(true);
    try {
      const currentDeckToSave: Deck = {
        ...deck,
        name: title.trim() || deck.name,
        description: description.trim(),
        format: format,
        updatedAt: Date.now(),
      };
      if (onCreateNewDeck) {
        await onCreateNewDeck(currentDeckToSave);
      }
    } finally {
      setIsSavingNewDeck(false);
    }
  };

  const stats = calculateDeckStats(deck);

  // Commander calculations
  const commanderCards = deck.cards.filter((c) => c.category === 'commander');
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
  };

  const handleUpdateCardQuantity = (cardId: string, delta: number) => {
    const existingCards = [...deck.cards];
    const idx = existingCards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;

    const newQty = existingCards[idx].quantity + delta;
    if (newQty <= 0) {
      existingCards.splice(idx, 1);
    } else {
      existingCards[idx] = { ...existingCards[idx], quantity: newQty };
    }

    onUpdateDeck({
      ...deck,
      cards: existingCards,
      updatedAt: Date.now(),
    });
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
  };

  const handleChangeCardCategory = (cardId: string, newCategory: DeckCategory) => {
    const existingCards = [...deck.cards];
    const idx = existingCards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;

    existingCards[idx] = {
      ...existingCards[idx],
      category: newCategory,
    };

    // If moved to commander category, update commander metadata
    let newCommanderName = deck.commanderName;
    let newCommanderArt = deck.commanderArtUrl;
    let newCover = deck.coverCardUrl;
    let newCommanderId = deck.commanderId;
    let newCommanderColorIdentity = deck.commanderColorIdentity;

    if (newCategory === 'commander') {
      newCommanderName = existingCards[idx].name;
      newCommanderArt = existingCards[idx].imageUrl;
      newCover = existingCards[idx].imageUrl;
      newCommanderId = existingCards[idx].scryfallId;
      newCommanderColorIdentity = existingCards[idx].color_identity || [];
    }

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
  };

  const handleRemoveCard = (cardId: string) => {
    const filtered = deck.cards.filter((c) => c.id !== cardId);
    onUpdateDeck({
      ...deck,
      cards: filtered,
      updatedAt: Date.now(),
    });
  };

  const handleLivePriceRefresh = async () => {
    setIsRefreshingPrices(true);
    setPriceRefreshMessage(null);
    try {
      const updated = await StorageService.refreshDeckPrices(deck);
      onUpdateDeck(updated);
      setPriceRefreshMessage('Prices updated live from Scryfall!');
      setTimeout(() => setPriceRefreshMessage(null), 3000);
    } catch (e: any) {
      setPriceRefreshMessage('Price refresh failed: ' + (e.message || 'Error'));
    } finally {
      setIsRefreshingPrices(false);
    }
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
    setPriceRefreshMessage(`Added ${cardsToAdd.reduce((s, c) => s + c.quantity, 0)} cards to deck`);
    setTimeout(() => setPriceRefreshMessage(null), 3500);
  };

  // Return back to deck list and save current deck state
  const handleBack = async () => {
    const currentDeckToSave: Deck = {
      ...deck,
      name: title.trim() || deck.name,
      description: description.trim(),
      format: format,
      updatedAt: Date.now(),
    };
    await StorageService.saveDeck(currentDeckToSave);
    onUpdateDeck(currentDeckToSave);
    onBack();
  };

  // Group cards for the current view
  const sortCards = (cards: DeckCard[]) => {
    return [...cards].sort((a, b) => {
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

  const mainCards = sortCards(deck.cards.filter((c) => c.category === 'main'));
  const sideCards = sortCards(deck.cards.filter((c) => c.category === 'sideboard'));
  const maybeCards = sortCards(deck.cards.filter((c) => c.category === 'maybeboard'));

  // Subgroup mainboard cards by Type
  const groupCardsByType = (cards: DeckCard[]) => {
    const groups: Record<string, DeckCard[]> = {
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

  const groupedMain = groupCardsByType(mainCards);

  // Available categories for Category Grid view
  const availableCategories = [
    ...(deck.format === 'commander' || commanderCards.length > 0
      ? [{
          id: 'commander',
          title: 'Command Zone',
          icon: <Crown className="w-4 h-4 text-violet-400" />,
          cards: commanderCards,
          totalQty: commanderCards.reduce((s, c) => s + c.quantity, 0),
          totalPrice: commanderCards.reduce((s, c) => s + ((c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0) * c.quantity), 0),
        }]
      : []),
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
              {/* Left: Navigation, Title, Badges, Value */}
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
                
                <select
                  value={deck.format}
                  onChange={(e) => {
                    const newFormat = e.target.value as MTGFormat;
                    setFormat(newFormat);
                    onUpdateDeck({ ...deck, format: newFormat, updatedAt: Date.now() });
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 capitalize font-bold outline-none cursor-pointer focus:border-violet-500/50 hover:bg-slate-800"
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

                {/* Update Deck Name to Commander Button */}
                {deck.format === 'commander' && commanderName && (
                  <button
                    type="button"
                    onClick={handleUpdateDeckNameToCommander}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs shrink-0 ${
                      deck.name.trim().toLowerCase() === commanderName.trim().toLowerCase()
                        ? 'bg-violet-500/10 text-fuchsia-300/80 border border-fuchsia-500/25'
                        : 'bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/45 hover:scale-102'
                    }`}
                    title={`Update deck name to Commander: "${commanderName}"`}
                  >
                    <Crown className="w-3.5 h-3.5 text-violet-400" />
                    <span>
                      {deck.name.trim().toLowerCase() === commanderName.trim().toLowerCase()
                        ? 'Named after Commander'
                        : 'Name to Commander'}
                    </span>
                  </button>
                )}

                <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[11px] font-semibold text-violet-400 capitalize shrink-0">
                  {deck.format}
                </span>

                <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/80 text-[11px] font-mono text-slate-300 shrink-0">
                  {stats.mainboardCount + (deck.format === 'commander' ? commanderCards.length : 0)}
                  {deck.format === 'commander' ? '/100' : ''}
                </span>

                <span className="px-2 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-800/50 text-[11px] font-bold text-emerald-400 shrink-0" title="Total deck market value">
                  ${stats.totalPriceUsd.toFixed(2)}
                </span>

                {/* Top Row Format Notice */}
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
                        <div className="absolute left-0 top-full mt-2 z-[70] w-80 sm:w-96 p-3.5 rounded-xl bg-slate-900 border border-fuchsia-600 shadow-2xl ring-1 ring-fuchsia-500/30 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-150">
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
              </div>

              {/* Right: Condensed Action Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <button
                  onClick={handleLivePriceRefresh}
                  disabled={isRefreshingPrices}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  title="Update live card market prices via Scryfall"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingPrices ? 'animate-spin text-violet-400' : ''}`} />
                  <span className="hidden sm:inline">Prices</span>
                </button>

                <button
                  onClick={() => setShowHandSimulator(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 text-xs font-semibold transition-colors cursor-pointer"
                  title="Simulate opening 7-card hand and mulligans"
                >
                  <Play className="w-3 h-3 text-emerald-400" />
                  <span>Hand</span>
                </button>

                <button
                  onClick={() => {
                    setExportModalInitialTab('export');
                    setShowExportModal(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 text-xs font-semibold transition-colors cursor-pointer"
                  title="Export deck to BBCode, TappedOut, Moxfield, MTGO, Excel, etc."
                >
                  <Share2 className="w-3 h-3 text-violet-400" />
                  <span>Export</span>
                </button>

                <button
                  onClick={() => {
                    setExportModalInitialTab('import');
                    setShowExportModal(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 text-xs font-semibold transition-colors cursor-pointer"
                  title="Import deck from BBCode, TappedOut, Moxfield, MTGO (.dek/text), CSV, Excel, or Text"
                >
                  <Upload className="w-3 h-3 text-sky-400" />
                  <span>Import</span>
                </button>

                {/* New Deck Button: Saves current deck & creates a new one */}
                <button
                  type="button"
                  onClick={handleSaveAndCreateNewDeck}
                  disabled={isSavingNewDeck}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-violet-400 border border-slate-700 hover:border-violet-500/50 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-xs active:scale-98"
                  title="Save existing deck and create a new deck"
                >
                  <Plus className={`w-3.5 h-3.5 text-violet-400 ${isSavingNewDeck ? 'animate-spin' : ''}`} />
                  <span>{isSavingNewDeck ? 'Saving...' : 'New Deck'}</span>
                </button>

                <button
                  onClick={onOpenSearch}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/20 text-xs font-bold transition-all shadow-sm cursor-pointer hover:scale-102"
                  title="Open card database search"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Cards</span>
                </button>
              </div>
            </div>
          )}

          {/* Description line if exists and not editing */}
          {!isEditingTitle && deck.description && (
            <p className="text-[11px] text-slate-400 truncate max-w-3xl pl-1">
              {deck.description}
            </p>
          )}

          {/* Toast feedback */}
          {priceRefreshMessage && (
            <div className="py-1 px-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs text-center font-medium">
              {priceRefreshMessage}
            </div>
          )}
        </div>
      </div>

      {/* Category Navigation & Layout Options Row */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Category Grid View Option */}
          <button
            type="button"
            onClick={() => setViewMode('category-grid')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'category-grid'
                ? 'bg-fuchsia-500 text-slate-950 shadow-md font-extrabold'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
            title="Show each category available in a grid layout"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Category Grid</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              viewMode === 'category-grid' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-violet-400'
            }`}>
              {availableCategories.filter((c) => c.totalQty > 0).length}
            </span>
          </button>

          <span className="text-slate-700">|</span>

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
            Mainboard ({stats.mainboardCount})
          </button>

          {deck.format === 'commander' && (
            <button
              type="button"
              onClick={() => {
                setViewMode('tabbed');
                setActiveCategoryTab('commander');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'tabbed' && activeCategoryTab === 'commander'
                  ? 'bg-slate-800 text-violet-400 border border-fuchsia-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Commander ({commanderCards.length})
            </button>
          )}

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
            onChange={(e) => setSortCardsBy(e.target.value as 'name' | 'cmc' | 'color')}
            className="bg-slate-900 border border-slate-800 rounded-lg text-xs px-2 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="name">A-Z</option>
            <option value="cmc">Mana Value</option>
            <option value="color">Color</option>
          </select>

          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('category-grid')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'category-grid' ? 'bg-slate-800 text-violet-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Category Layout"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Categories</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
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
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'tabbed' ? 'bg-slate-800 text-violet-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Tabbed List View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          <button
            onClick={onOpenSearch}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/20 text-xs font-bold transition-all shadow-md cursor-pointer hover:scale-102 active:scale-98"
            title="Search and add cards to this deck"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Cards</span>
          </button>
        </div>
      </div>

      {/* Category Grid View */}
      {viewMode === 'category-grid' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <LayoutGrid className="w-3.5 h-3.5 text-violet-400" />
              <span>Category Grid View — showing all available deck categories</span>
            </span>
            <span className="font-mono text-slate-400">
              Total: {stats.totalCards} cards (${stats.totalPriceUsd.toFixed(2)})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {availableCategories
              .filter((cat) => cat.totalQty > 0 || (cat.id === 'commander' && deck.format === 'commander'))
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
                        ${cat.totalPrice.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={onOpenSearch}
                        className="p-1 rounded-md bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 hover:text-white transition-colors"
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
              <p className="text-xs font-medium">Your deck is empty. Click "+ Add Cards" to search and add cards from Scryfall.</p>
              <button
                onClick={onOpenSearch}
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
          {/* Commander Tab */}
          {activeCategoryTab === 'commander' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs uppercase font-semibold text-slate-400">Designated Commander</h3>
                {commanderName && (
                  <button
                    type="button"
                    onClick={handleUpdateDeckNameToCommander}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                      deck.name.trim().toLowerCase() === commanderName.trim().toLowerCase()
                        ? 'bg-violet-500/10 text-fuchsia-300/80 border border-fuchsia-500/25'
                        : 'bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/40 hover:scale-102'
                    }`}
                    title={`Update deck name to Commander: "${commanderName}"`}
                  >
                    <Crown className="w-3.5 h-3.5 text-violet-400" />
                    <span>
                      {deck.name.trim().toLowerCase() === commanderName.trim().toLowerCase()
                        ? 'Named after Commander'
                        : `Update Deck Name to "${commanderName}"`}
                    </span>
                  </button>
                )}
              </div>
              {commanderCards.length > 0 ? (
                
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pt-2">
                    {commanderCards.map(c => renderCardGridItem(c))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {commanderCards.map((card) => renderCardRow(card))}
                  </div>
                )

              ) : (
                <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500 text-xs">
                  No commander selected. Search for a legendary creature and assign to Commander slot.
                </div>
              )}
            </div>
          )}

          {/* Mainboard Tab */}
          {activeCategoryTab === 'main' && (
            <div className="space-y-6">
              {/* Commander highlight for EDH decks if on mainboard tab */}
              {deck.format === 'commander' && commanderCards.length > 0 && (
                <div className="p-4 rounded-xl bg-fuchsia-950/20 border border-fuchsia-800/40 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] uppercase font-bold text-violet-400 tracking-wider">
                      Command Zone
                    </span>
                    {commanderName && deck.name.trim().toLowerCase() !== commanderName.trim().toLowerCase() && (
                      <button
                        type="button"
                        onClick={handleUpdateDeckNameToCommander}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                        title={`Update deck name to Commander: "${commanderName}"`}
                      >
                        <Crown className="w-3 h-3 text-violet-400" />
                        <span>Update Deck Name to &quot;{commanderName}&quot;</span>
                      </button>
                    )}
                  </div>
                  
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pt-2">
                      {commanderCards.map(c => renderCardGridItem(c))}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60 bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
                      {commanderCards.map((c) => renderCardRow(c))}
                    </div>
                  )}

                </div>
              )}

              {Object.entries(groupedMain).map(([groupTitle, cardsInGroup]) => {
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
              })}

              {mainCards.length === 0 && (
                <div className="p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400 space-y-3">
                  <Layers className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs font-medium">Your deck is empty. Click "+ Add Cards" to search and add cards from Scryfall.</p>
                  <button
                    onClick={onOpenSearch}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/20 text-xs font-bold transition-colors"
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
                renderCardListOrGrid(sideCards)
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
                renderCardListOrGrid(maybeCards)
              ) : (
                <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500 text-xs">
                  Maybeboard is empty. Save experimental cards and upgrades here.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mana Curve & Stats Accordion (Moved to bottom of the page, collapsed by default) */}
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 text-xs font-medium transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete This Deck</span>
        </button>
      </div>

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
        deck={deck}
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setImportError(null);
        }}
        onImportAsNewDeck={handleImportAsNewDeck}
        onImportAppendToDeck={handleAppendCardsToDeck}
        initialTab={exportModalInitialTab}
      />
    </div>
  );

  // Helper row renderer
  function renderCardRow(card: DeckCard) {
    const unitPrice = card.isFoil && card.priceUsdFoil ? card.priceUsdFoil : card.priceUsd || 0;
    const lineTotal = (unitPrice * card.quantity).toFixed(2);
    const thumbUrl = card.imageUrl || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small` : undefined);

    const isLegendaryCreatureOrPlaneswalker = card.type_line?.includes('Legendary') && (card.type_line?.includes('Creature') || card.type_line?.includes('Planeswalker'));
    const hasCommander = deck.cards.some(c => c.category === 'commander');
    const isThisCommander = card.category === 'commander';
    const showSetCommanderBtn = deck.format === 'commander' && !hasCommander && isLegendaryCreatureOrPlaneswalker && !isThisCommander;

    const toScryCard = (): ScryfallCard => ({
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

    return (
      <div
        key={card.id}
        className="group px-3 py-3 flex flex-col gap-2.5 hover:bg-slate-800/50 transition-colors border-b border-slate-800/40 hover:border-slate-700"
      >
        {/* Top Row: Controls (Quantity, Location, Remove) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quantity stepper */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shrink-0 shadow-sm">
              <button
                onClick={() => handleUpdateCardQuantity(card.id, -1)}
                className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Decrease"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-7 text-center text-xs font-bold text-slate-100">{card.quantity}</span>
              <button
                onClick={() => handleUpdateCardQuantity(card.id, 1)}
                className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Increase"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Category Quick Move Buttons */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden text-[10px] shrink-0 font-medium shadow-sm">
              <button
                onClick={() => handleChangeCardCategory(card.id, 'main')}
                className={`px-2 py-1.5 transition-colors ${card.category === 'main' ? 'bg-fuchsia-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              >
                Main
              </button>
              {isThisCommander && (
                <button
                  onClick={() => handleChangeCardCategory(card.id, 'commander')}
                  className={`px-2 py-1.5 transition-colors border-l border-slate-800 bg-fuchsia-500 text-slate-950 font-bold`}
                >
                  Cmdr
                </button>
              )}
              <button
                onClick={() => handleChangeCardCategory(card.id, 'sideboard')}
                className={`px-2 py-1.5 transition-colors border-l border-slate-800 ${card.category === 'sideboard' ? 'bg-fuchsia-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              >
                Side
              </button>
              <button
                onClick={() => handleChangeCardCategory(card.id, 'maybeboard')}
                className={`px-2 py-1.5 transition-colors border-l border-slate-800 ${card.category === 'maybeboard' ? 'bg-fuchsia-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              >
                Maybe
              </button>
            </div>

            {/* Set as Commander Highlight Button */}
            {showSetCommanderBtn && (
              <button
                onClick={() => handleChangeCardCategory(card.id, 'commander')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/40 text-[10px] font-bold transition-colors shadow-sm"
                title="Set as Commander"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Set Commander</span>
              </button>
            )}
          </div>

          {/* Remove Card */}
          <button
            onClick={() => handleRemoveCard(card.id)}
            className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0"
            title="Remove card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Row: Card Details */}
        <div className="flex items-center gap-3">
          {/* Thumbnail */}
          <div
            onClick={() => onSelectCard(toScryCard())}
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
                    e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small`;
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
                onClick={() => onSelectCard(toScryCard())}
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
            <span className="text-[10px] text-slate-500 block">${unitPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  function renderCardListOrGrid(cards: DeckCard[]) {
    if (viewMode === 'grid') {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pt-2">
          {cards.map((c) => renderCardGridItem(c))}
        </div>
      );
    }
    return (
      <div className="divide-y divide-slate-800/60 bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
        {cards.map((c) => renderCardRow(c))}
      </div>
    );
  };
  function renderCardGridItem(card: DeckCard) {
    const unitPrice = card.isFoil && card.priceUsdFoil ? card.priceUsdFoil : card.priceUsd || 0;
    const lineTotal = (unitPrice * card.quantity).toFixed(2);
    const thumbUrl = card.imageUrl || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=small` : undefined);

    const toScryCard = (): ScryfallCard => ({
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

    return (
      <div
        key={card.id}
        className="group relative bg-slate-900 border border-slate-800 hover:border-fuchsia-500/60 rounded-xl overflow-hidden shadow-lg transition-all duration-200 flex flex-col justify-between"
      >
        <div
          onClick={() => onSelectCard(toScryCard())}
          className="cursor-pointer relative aspect-[5/7] bg-slate-950 overflow-hidden"
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
              onClick={() => onSelectCard(toScryCard())}
              className="text-xs font-semibold text-slate-200 break-words leading-tight hover:text-violet-400 cursor-pointer"
              title={card.name}
            >
              {card.name}
            </h4>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800/60 pt-2">
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
                className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <Plus className="w-2.5 h-2.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleRemoveCard(card.id)}
              className="p-1 rounded-md text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }
};
