import { useEscapeKey } from '../hooks/useEscapeKey';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  Plus, 
  Bookmark, 
  ExternalLink, 
  Check, 
  Sparkles, 
  Layers, 
  Loader2,
  Crown
} from 'lucide-react';
import { ScryfallCard, Deck, CardCondition, DeckCategory, Binder } from '../types/mtg';
import { getCardImageUrl, getCardBackImageUrl, getCardById, fetchCardPrints } from '../services/api';
import { ManaCostBadge } from './ManaCostBadge';
import { canHaveAnyNumberOfCopies, getDeckCommander, isCardLegalInCommander } from '../utils/deckUtils';

interface CardDetailModalProps {
  card: ScryfallCard | null;
  isOpen: boolean;
  onClose: () => void;
  searchContext?: 'deck' | 'binder';
  activeDeck?: Deck | null;
  binders?: Binder[];
  activeBinder?: Binder | null;
  onSelectBinder?: (binder: Binder) => void;
  onAddCardToDeck?: (card: ScryfallCard, category: DeckCategory, quantity: number, isFoil: boolean) => void;
  onAddCardToCollection?: (card: ScryfallCard, quantity: number, isFoil: boolean, condition: CardCondition, acquiredPrice?: number) => void;
  onUpdateCardPrinting?: (targetCard: ScryfallCard, newPrinting: ScryfallCard) => void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  isOpen,
  onClose,
  searchContext,
  activeDeck,
  binders = [],
  activeBinder,
  onSelectBinder,
  onAddCardToDeck,
  onAddCardToCollection,
  onUpdateCardPrinting,
}) => {
  const [displayCard, setDisplayCard] = useState<ScryfallCard | null>(card);
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const [showBackFace, setShowBackFace] = useState(false);
  const [deckCategory, setDeckCategory] = useState<DeckCategory>('main');
  const [deckQuantity, setDeckQuantity] = useState(1);
  const [deckIsFoil, setDeckIsFoil] = useState(false);
  const [deckAddedToast, setDeckAddedToast] = useState(false);
  const [deckAddedCategory, setDeckAddedCategory] = useState<DeckCategory>('main');

  // Collection add state
  const [colQuantity, setColQuantity] = useState(1);
  const [colIsFoil, setColIsFoil] = useState(false);
  const [colCondition, setColCondition] = useState<CardCondition>('NM');
  const [colPrice, setColPrice] = useState<string>('');
  const [colAddedToast, setColAddedToast] = useState(false);
  const [showPrintings, setShowPrintings] = useState(false);
  const [printingsList, setPrintingsList] = useState<ScryfallCard[]>([]);
  const [isLoadingPrintings, setIsLoadingPrintings] = useState(false);
  const [printingToast, setPrintingToast] = useState<string | null>(null);

  const handleLoadPrintings = async () => {
    if (!displayCard) return;
    if (showPrintings) {
      setShowPrintings(false);
      return;
    }
    setShowPrintings(true);
    if (printingsList.length > 0) return;

    try {
      setIsLoadingPrintings(true);
      const cleanName = displayCard.name.split(' // ')[0].trim();
      const prints = await fetchCardPrints(cleanName);
      if (Array.isArray(prints) && prints.length > 0) {
        setPrintingsList(prints);
      }
    } catch (err) {
      console.error('Error fetching printings:', err);
    } finally {
      setIsLoadingPrintings(false);
    }
  };

  const handleSelectPrinting = (newPrinting: ScryfallCard) => {
    const preserveDeckCardId = (displayCard as any)?.deckCardId;
    const updatedWithDeckCardId: ScryfallCard = {
      ...newPrinting,
      deckCardId: preserveDeckCardId,
    } as any;
    setDisplayCard(updatedWithDeckCardId);
    setShowBackFace(false);
    if (onUpdateCardPrinting && displayCard) {
      onUpdateCardPrinting(displayCard, newPrinting);
    }
    const label = `${(newPrinting.set || '').toUpperCase()} #${newPrinting.collector_number || ''}`;
    setPrintingToast(`Selected art: ${newPrinting.set_name || label}`);
    setTimeout(() => setPrintingToast(null), 3000);
  };

  // Whenever `card` changes or modal opens, initialize displayCard and fetch complete card record if needed
  useEffect(() => {
    if (!card) {
      setDisplayCard(null);
      setPrintingsList([]);
      setShowPrintings(false);
      setPrintingToast(null);
      return;
    }
    setDisplayCard(card);
    setShowBackFace(false);
    setPrintingsList([]);
    setShowPrintings(false);
    setPrintingToast(null);

    const cardId = card.id || (card as any).scryfallId;
    if (cardId && (!card.oracle_text || !card.image_uris?.large)) {
      setIsLoadingFull(true);
      getCardById(cardId)
        .then((fullData) => {
          if (fullData) {
            setDisplayCard((prev) => (prev ? { ...prev, ...fullData } : fullData));
          }
        })
        .finally(() => setIsLoadingFull(false));
    }
  }, [card?.id, (card as any)?.scryfallId, isOpen]);

  useBodyScrollLock(isOpen && !!displayCard);
  useEscapeKey(isOpen && !!displayCard, onClose);

  if (!isOpen || !displayCard) return null;

  const frontImageUrl = getCardImageUrl(displayCard, 'large') || getCardImageUrl(displayCard, 'normal');
  const backImageUrl = getCardBackImageUrl(displayCard);
  const currentImageUrl = showBackFace && backImageUrl ? backImageUrl : frontImageUrl;

  const activeFace = (showBackFace && displayCard.card_faces && displayCard.card_faces[1]) 
    ? displayCard.card_faces[1] 
    : (displayCard.card_faces && displayCard.card_faces.length > 0 ? displayCard.card_faces[0] : displayCard);

  const priceUsd = displayCard.prices?.usd ? parseFloat(displayCard.prices.usd) : null;
  const priceFoil = displayCard.prices?.usd_foil ? parseFloat(displayCard.prices.usd_foil) : null;
  const priceEur = displayCard.prices?.eur ? parseFloat(displayCard.prices.eur) : null;

  const isCommanderFormat = (activeDeck?.format || '').toLowerCase() === 'commander';
  const commanderInfo = isCommanderFormat ? getDeckCommander(activeDeck) : null;
  const cmdrColors = commanderInfo?.colorIdentity?.length
    ? commanderInfo.colorIdentity
    : (activeDeck?.commanderColorIdentity || []);
  const hasCommander = Boolean(commanderInfo?.hasCommander || cmdrColors.length > 0 || activeDeck?.commanderName);

  // Check legality if activeDeck is commander format and card is NOT being assigned to commander slot
  const commanderLegality = (isCommanderFormat && hasCommander && deckCategory !== 'commander' && displayCard)
    ? isCardLegalInCommander(displayCard, cmdrColors)
    : { isLegal: true };

  const handleDeckAdd = (targetCategory: DeckCategory) => {
    if (isCommanderFormat && hasCommander && targetCategory !== 'commander' && displayCard) {
      const legality = isCardLegalInCommander(displayCard, cmdrColors);
      if (!legality.isLegal) return;
    }
    if (onAddCardToDeck && displayCard) {
      onAddCardToDeck(displayCard, targetCategory, deckQuantity, deckIsFoil);
      setDeckAddedCategory(targetCategory);
      setDeckAddedToast(true);
      setTimeout(() => setDeckAddedToast(false), 2000);
    }
  };

  const handleCollectionAdd = () => {
    if (onAddCardToCollection && displayCard) {
      const parsedPrice = colPrice ? parseFloat(colPrice) : (colIsFoil ? (priceFoil ?? priceUsd ?? 0) : (priceUsd ?? 0));
      onAddCardToCollection(displayCard, colQuantity, colIsFoil, colCondition, parsedPrice);
      setColAddedToast(true);
      setTimeout(() => setColAddedToast(false), 2000);
    }
  };

  const majorFormats = ['commander', 'standard', 'modern', 'pioneer', 'legacy', 'vintage', 'pauper'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div 
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 my-auto flex flex-col md:flex-row max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          title="Close details"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Card Image & Flip */}
        <div className="md:w-5/12 bg-slate-950 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800">
          <div className="relative group max-w-[280px] sm:max-w-[320px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800/80 bg-slate-900">
            <img
              src={currentImageUrl}
              alt={displayCard.name}
              className="w-full h-auto rounded-2xl object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              referrerPolicy="no-referrer"
              onError={(e) => {
                if (displayCard.image_uris?.normal && e.currentTarget.src !== displayCard.image_uris.normal) {
                  e.currentTarget.src = displayCard.image_uris.normal;
                }
              }}
            />
            {deckIsFoil && (
              <div className="absolute inset-0 bg-gradient-to-tr from-fuchsia-400/10 via-purple-400/20 to-cyan-400/15 pointer-events-none mix-blend-color-dodge" />
            )}
            {isLoadingFull && (
              <div className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-950/80 text-fuchsia-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
            )}
          </div>

          {backImageUrl && (
            <button
              onClick={() => setShowBackFace(!showBackFace)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>{showBackFace ? 'Show Front Face' : 'Flip / Transform Card'}</span>
            </button>
          )}

          {/* Printings & Art Picker Toggle */}
          <button
            type="button"
            onClick={handleLoadPrintings}
            className={`w-full max-w-[320px] mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
              showPrintings
                ? 'bg-violet-950/80 border-violet-500/70 text-violet-200'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-violet-400" />
            <span>{showPrintings ? 'Hide Printings (Show Details)' : 'View All Printings & Art'}</span>
            {isLoadingPrintings && <Loader2 className="w-3 h-3 animate-spin text-violet-400 ml-1" />}
          </button>

          {/* Pricing Badges */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[320px] mt-2">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <span className="block text-[10px] uppercase font-semibold text-slate-400">Regular</span>
              <span className="text-sm font-bold text-emerald-400">
                {priceUsd !== null ? `${(Number(priceUsd) || 0).toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-fuchsia-900/40 text-center">
              <span className="block text-[10px] uppercase font-semibold text-fuchsia-400/80 flex items-center justify-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5" /> Foil
              </span>
              <span className="text-sm font-bold text-fuchsia-300">
                {priceFoil !== null ? `${(Number(priceFoil) || 0).toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <span className="block text-[10px] uppercase font-semibold text-slate-400">Europe</span>
              <span className="text-sm font-bold text-sky-400">
                {priceEur !== null ? `€${(Number(priceEur) || 0).toFixed(2)}` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Details, Rules & Add Handlers */}
        <div className="md:w-7/12 p-6 overflow-y-auto flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header info */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  {displayCard.name}
                </h2>
                <ManaCostBadge manaCost={activeFace?.mana_cost || displayCard.mana_cost} size="lg" />
              </div>
              <p className="text-sm font-medium text-slate-400 mt-1">
                {activeFace?.type_line || displayCard.type_line}
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 uppercase font-mono font-bold">
                  {(displayCard.set || '').toUpperCase()} · #{displayCard.collector_number || ''}
                </span>
                <span className="capitalize font-semibold text-fuchsia-400/90">
                  {displayCard.rarity}
                </span>
                {displayCard.set_name && (
                  <>
                    <span>·</span>
                    <span className="truncate max-w-[200px]">{displayCard.set_name}</span>
                  </>
                )}
              </div>
            </div>

            {/* View Switcher Tabs (Card Rules vs All Printings & Art) */}
            <div className="flex items-center justify-between pt-1 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowPrintings(false)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !showPrintings
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Card Details & Rules
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!showPrintings) handleLoadPrintings();
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    showPrintings
                      ? 'bg-violet-900/70 text-violet-200 border border-violet-500/50 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-violet-400" />
                  <span>All Printings & Art</span>
                  {printingsList.length > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.2 bg-violet-950 rounded-full text-violet-300 border border-violet-800/60">
                      {printingsList.length}
                    </span>
                  )}
                </button>
              </div>

              {printingToast && (
                <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold animate-fadeIn">
                  <Check className="w-3.5 h-3.5" />
                  <span>{printingToast}</span>
                </div>
              )}
            </div>

            {showPrintings ? (
              /* Printings & Art Gallery */
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-violet-950/30 border border-violet-800/40 text-xs text-violet-300 flex items-center justify-between gap-2">
                  <span>
                    Select any printing or artwork below to change the card art in your deck.
                  </span>
                  {isLoadingPrintings && (
                    <Loader2 className="w-4 h-4 animate-spin text-violet-400 shrink-0" />
                  )}
                </div>

                {isLoadingPrintings && printingsList.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                    <span className="text-xs">Fetching all available printings and alternate arts...</span>
                  </div>
                ) : printingsList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No alternate printings found for this card.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {printingsList.map((p) => {
                      const pId = p.id || (p as any).scryfallId;
                      const curId = displayCard.id || (displayCard as any).scryfallId;
                      const isCurrent = pId === curId;
                      const pImg = getCardImageUrl(p, 'small') || getCardImageUrl(p, 'normal');
                      const pPriceUsd = p.prices?.usd ? parseFloat(p.prices.usd) : null;
                      const pPriceFoil = p.prices?.usd_foil ? parseFloat(p.prices.usd_foil) : null;

                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectPrinting(p)}
                          className={`p-2 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-violet-950/50 border-violet-500/80 ring-1 ring-violet-500/40 shadow-md shadow-violet-950/40'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                          }`}
                        >
                          <img
                            src={pImg}
                            alt={p.name}
                            className="w-12 h-16 object-cover rounded-lg border border-slate-800 shrink-0"
                            loading="lazy"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-xs text-white truncate" title={p.set_name || p.set.toUpperCase()}>
                                {p.set_name || p.set.toUpperCase()}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase shrink-0">
                                #{p.collector_number}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                              <span className="capitalize">{p.rarity}</span>
                              {pPriceUsd !== null && (
                                <span className="text-emerald-400 font-mono font-bold">${pPriceUsd.toFixed(2)}</span>
                              )}
                              {pPriceFoil !== null && (
                                <span className="text-fuchsia-400 font-mono flex items-center gap-0.5">
                                  <Sparkles className="w-2.5 h-2.5" /> ${pPriceFoil.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5 flex items-center justify-end">
                              {isCurrent ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 rounded">
                                  <Check className="w-3 h-3" />
                                  <span>Current Art</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPrinting(p);
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-300 hover:text-white bg-violet-900/60 hover:bg-violet-600 px-2.5 py-1 rounded-lg border border-violet-500/40 transition-colors cursor-pointer"
                                >
                                  <span>Use This Art</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Oracle Text */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-sm leading-relaxed text-slate-300 whitespace-pre-line font-serif">
                  {activeFace?.oracle_text || displayCard.oracle_text || 'No rules text.'}
                  {activeFace?.power && activeFace?.toughness && (
                    <div className="mt-3 text-right font-sans font-bold text-slate-100 text-base">
                      {activeFace.power} / {activeFace.toughness}
                    </div>
                  )}
                  {activeFace?.loyalty && (
                    <div className="mt-3 text-right font-sans font-bold text-fuchsia-400 text-base">
                      Loyalty: {activeFace.loyalty}
                    </div>
                  )}
                </div>

                {/* Format Legalities */}
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 block mb-2">
                    Format Legalities
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {majorFormats.map((fmt) => {
                      const status = displayCard.legalities?.[fmt];
                      const isLegal = status === 'legal';
                      const isRestricted = status === 'restricted';
                      const isBanned = status === 'banned';

                      let badgeColor = 'bg-slate-800 text-slate-500 border-slate-700';
                      if (isLegal) badgeColor = 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50';
                      if (isRestricted) badgeColor = 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-800/50';
                      if (isBanned) badgeColor = 'bg-rose-950/60 text-rose-400 border-rose-800/50 line-through';

                      return (
                        <span
                          key={fmt}
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-md border capitalize ${badgeColor}`}
                        >
                          {fmt}: {status ? status.replace('_', ' ') : 'not legal'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action Sections */}
          <div className="mt-6 pt-5 border-t border-slate-800 space-y-4">
            {/* Add to Deck - Only shown when in deck context or not restricted to binder */}
            {searchContext !== 'binder' && (
              activeDeck ? (() => {
                const deckCopies = displayCard
                  ? activeDeck.cards
                      .filter((c) => c.name.toLowerCase() === displayCard.name.toLowerCase())
                      .reduce((sum, c) => sum + c.quantity, 0)
                  : 0;

                const isUnlimited = canHaveAnyNumberOfCopies(displayCard);
                const deckLimit = isUnlimited ? Infinity : (isCommanderFormat ? 1 : 4);
                const isAtDeckLimit = deckCopies >= deckLimit;

                return (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-fuchsia-400" />
                        Add to Deck: <strong className="text-white truncate max-w-[140px] sm:max-w-none">{activeDeck.name}</strong>
                      </span>
                      {deckCopies > 0 && (
                        <span className="text-[11px] font-mono text-fuchsia-400 font-bold bg-fuchsia-950/80 px-2 py-0.5 rounded-md border border-fuchsia-800/60">
                          {deckCopies} in deck {isCommanderFormat && !isUnlimited ? '(Limit 1)' : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Quantity Selector */}
                      <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                        <span className="text-xs text-slate-400 mr-1.5 font-medium">Qty:</span>
                        <input
                          type="number"
                          min={1}
                          max={isUnlimited ? 99 : (isCommanderFormat ? 1 : Math.max(1, 4 - deckCopies))}
                          value={deckQuantity}
                          onChange={(e) => setDeckQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-8 bg-transparent text-xs text-white font-bold focus:outline-none text-center"
                        />
                      </div>

                      {/* Foil Toggle */}
                      <button
                        type="button"
                        onClick={() => setDeckIsFoil(!deckIsFoil)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                          deckIsFoil
                            ? 'bg-fuchsia-950 border-fuchsia-500/80 text-fuchsia-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 text-fuchsia-400" />
                        <span>Foil</span>
                      </button>

                      {/* Add Buttons */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                        <button
                          type="button"
                          onClick={() => handleDeckAdd('main')}
                          disabled={!commanderLegality.isLegal || isAtDeckLimit}
                          className={`flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            !commanderLegality.isLegal || isAtDeckLimit
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
                              : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white cursor-pointer shadow-md shadow-indigo-500/20 active:scale-95'
                          }`}
                          title={isAtDeckLimit ? `At limit (${deckCopies}/${deckLimit})` : 'Add to Mainboard'}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Main</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeckAdd('sideboard')}
                          disabled={!commanderLegality.isLegal || isAtDeckLimit}
                          className={`flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            !commanderLegality.isLegal || isAtDeckLimit
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
                              : 'bg-slate-800 hover:bg-fuchsia-600 hover:text-white text-slate-200 border border-slate-700 cursor-pointer shadow-sm active:scale-95'
                          }`}
                          title={isAtDeckLimit ? `At limit (${deckCopies}/${deckLimit})` : 'Add to Sideboard'}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Side</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeckAdd('maybeboard')}
                          disabled={!commanderLegality.isLegal}
                          className={`flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            !commanderLegality.isLegal
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
                              : 'bg-slate-800 hover:bg-fuchsia-600 hover:text-white text-slate-200 border border-slate-700 cursor-pointer shadow-sm active:scale-95'
                          }`}
                          title="Add to Maybeboard"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Maybe</span>
                        </button>

                        {isCommanderFormat && !hasCommander && (
                          <button
                            type="button"
                            onClick={() => handleDeckAdd('commander')}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-fuchsia-500/20 hover:bg-fuchsia-500 hover:text-slate-950 text-fuchsia-300 border border-fuchsia-500/40 cursor-pointer shadow-sm active:scale-95"
                            title="Assign as Commander / Partner"
                          >
                            <Crown className="w-3.5 h-3.5 text-fuchsia-400" />
                            <span>Assign as Commander</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {deckAddedToast && (
                      <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1 font-semibold animate-fadeIn">
                        <Check className="w-3.5 h-3.5" />
                        <span>Added {deckQuantity}x to {deckAddedCategory === 'main' ? 'Mainboard' : deckAddedCategory === 'sideboard' ? 'Sideboard' : deckAddedCategory === 'maybeboard' ? 'Maybeboard' : 'Commander Slot'}!</span>
                      </div>
                    )}
                    {!commanderLegality.isLegal && (
                      <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-800/60 text-[11px] text-red-300 flex items-start gap-1.5">
                        <span className="font-bold">⚠️ Illegal for Commander:</span>
                        <span>{commanderLegality.reason}</span>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                  <span>Create or open a deck to add this card directly to it.</span>
                </div>
              )
            )}

            {/* Add to Collection Binder - Only shown when in binder context or not restricted to deck */}
            {searchContext !== 'deck' && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                      Add to Binder:
                    </span>
                    {binders && binders.length > 0 ? (
                      <select
                        value={activeBinder?.id || binders[0].id}
                        onChange={(e) => {
                          const found = binders.find((b) => b.id === e.target.value);
                          if (found && onSelectBinder) onSelectBinder(found);
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500"
                      >
                        {binders.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setColIsFoil(!colIsFoil)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                      colIsFoil
                        ? 'bg-fuchsia-950 border-fuchsia-500/80 text-fuchsia-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-fuchsia-400" />
                    <span>Foil</span>
                  </button>

                  <select
                    value={colCondition}
                    onChange={(e) => setColCondition(e.target.value as CardCondition)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="NM">Near Mint (NM)</option>
                    <option value="LP">Lightly Played (LP)</option>
                    <option value="MP">Moderately Played (MP)</option>
                    <option value="HP">Heavily Played (HP)</option>
                    <option value="DMG">Damaged (DMG)</option>
                  </select>

                  <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                    <span className="text-xs text-slate-400 mr-1">Qty:</span>
                    <input
                      type="number"
                      min={1}
                      value={colQuantity}
                      onChange={(e) => setColQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-10 bg-transparent text-xs text-white font-bold focus:outline-none text-center"
                    />
                  </div>

                  <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 flex-1 min-w-[110px]">
                    <span className="text-xs text-slate-400 mr-1">$ Paid:</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={priceUsd ? (Number(priceUsd) || 0).toFixed(2) : '0.00'}
                      value={colPrice}
                      onChange={(e) => setColPrice(e.target.value)}
                      className="w-full bg-transparent text-xs text-white focus:outline-none"
                    />
                  </div>

                  <button
                    onClick={handleCollectionAdd}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {colAddedToast ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{colAddedToast ? 'Saved!' : 'Add to Binder'}</span>
                  </button>
                </div>

                {(displayCard.collector_number || (displayCard as any).collectorNumber) && (
                  <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span className="text-slate-500 truncate mr-2">{(displayCard.set || '').toUpperCase()}{displayCard.set_name ? ` · ${displayCard.set_name}` : ''}</span>
                    <span className="font-bold text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                      Card #{displayCard.collector_number || (displayCard as any).collectorNumber}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* External Links */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
              <div className="flex items-center gap-3">
                {displayCard.scryfall_uri && (
                  <a
                    href={displayCard.scryfall_uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-fuchsia-400 transition-colors"
                  >
                    <span>Card Page</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {displayCard.purchase_uris?.tcgplayer && (
                  <a
                    href={displayCard.purchase_uris.tcgplayer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-fuchsia-400 transition-colors"
                  >
                    <span>TCGPlayer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {displayCard.purchase_uris?.cardmarket && (
                  <a
                    href={displayCard.purchase_uris.cardmarket}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-fuchsia-400 transition-colors"
                  >
                    <span>Cardmarket</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <span className="text-[11px] text-slate-500">
                {displayCard.artist ? `Illus. ${displayCard.artist}` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
