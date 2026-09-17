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
  Loader2
} from 'lucide-react';
import { ScryfallCard, Deck, CardCondition, DeckCategory, Binder } from '../types/mtg';
import { getCardImageUrl, getCardBackImageUrl, getCardById } from '../services/scryfall';
import { ManaCostBadge } from './ManaCostBadge';
import { getDeckCommander, isCardLegalInCommander } from '../utils/deckUtils';

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
}) => {
  const [displayCard, setDisplayCard] = useState<ScryfallCard | null>(card);
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const [showBackFace, setShowBackFace] = useState(false);
  const [deckCategory, setDeckCategory] = useState<DeckCategory>('main');
  const [deckQuantity, setDeckQuantity] = useState(1);
  const [deckIsFoil, setDeckIsFoil] = useState(false);
  const [deckAddedToast, setDeckAddedToast] = useState(false);

  // Collection add state
  const [colQuantity, setColQuantity] = useState(1);
  const [colIsFoil, setColIsFoil] = useState(false);
  const [colCondition, setColCondition] = useState<CardCondition>('NM');
  const [colPrice, setColPrice] = useState<string>('');
  const [colAddedToast, setColAddedToast] = useState(false);

  // Whenever `card` changes or modal opens, initialize displayCard and fetch complete Scryfall record if needed
  useEffect(() => {
    if (!card) {
      setDisplayCard(null);
      return;
    }
    setDisplayCard(card);
    setShowBackFace(false);

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

  const commanderInfo = activeDeck?.format === 'commander' ? getDeckCommander(activeDeck) : null;
  const isCommanderFormat = activeDeck?.format === 'commander';
  const hasCommander = Boolean(commanderInfo?.hasCommander);

  // Check legality if activeDeck is commander format and card is NOT being assigned to commander slot
  const commanderLegality = (isCommanderFormat && hasCommander && deckCategory !== 'commander' && displayCard)
    ? isCardLegalInCommander(displayCard, commanderInfo!.colorIdentity)
    : { isLegal: true };

  const handleDeckAdd = () => {
    if (!commanderLegality.isLegal) {
      return;
    }
    if (onAddCardToDeck && displayCard) {
      onAddCardToDeck(displayCard, deckCategory, deckQuantity, deckIsFoil);
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
                const cId = displayCard.id || (displayCard as any).scryfallId;
                if (cId && !e.currentTarget.src.includes('format=image')) {
                  e.currentTarget.src = `https://api.scryfall.com/cards/${cId}?format=image&version=large`;
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

          {/* Pricing Badges */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[320px] mt-4">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <span className="block text-[10px] uppercase font-semibold text-slate-400">Regular</span>
              <span className="text-sm font-bold text-emerald-400">
                {priceUsd !== null ? `$${priceUsd.toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-fuchsia-900/40 text-center">
              <span className="block text-[10px] uppercase font-semibold text-fuchsia-400/80 flex items-center justify-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5" /> Foil
              </span>
              <span className="text-sm font-bold text-fuchsia-300">
                {priceFoil !== null ? `$${priceFoil.toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <span className="block text-[10px] uppercase font-semibold text-slate-400">Europe</span>
              <span className="text-sm font-bold text-sky-400">
                {priceEur !== null ? `€${priceEur.toFixed(2)}` : '—'}
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

                const isSingleton = ['commander', 'oathbreaker', 'brawl', 'duel', 'gladiator', 'historicbrawl', 'predh'].includes(
                  activeDeck.format.toLowerCase()
                );

                const isBasicOrUnlimited = displayCard
                  ? /Basic Land/i.test(displayCard.type_line || '') ||
                    (displayCard.oracle_text && /A deck can have any number of cards named/i.test(displayCard.oracle_text))
                  : false;

                const deckLimit = isBasicOrUnlimited ? 999 : (isSingleton ? 1 : 4);
                const isAtDeckLimit = deckLimit < 999 && deckCopies >= deckLimit;

                return (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-fuchsia-400" />
                          Add to Deck: <strong className="text-white truncate max-w-[180px]">{activeDeck.name}</strong>
                        </span>
                        <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-400">
                          {deckCopies}/{deckLimit < 999 ? deckLimit : '∞'} in deck
                        </span>
                      </div>
                      <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deckIsFoil}
                          onChange={(e) => setDeckIsFoil(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-800 text-fuchsia-500 focus:ring-0"
                        />
                        <span>Foil</span>
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={deckCategory}
                        onChange={(e) => setDeckCategory(e.target.value as DeckCategory)}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500"
                      >
                        <option value="main">Mainboard</option>
                        <option value="commander">Commander Slot</option>
                        <option value="sideboard">Sideboard</option>
                        <option value="maybeboard">Maybeboard</option>
                      </select>

                      <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                        <span className="text-xs text-slate-400 mr-1.5">Qty:</span>
                        <input
                          type="number"
                          min={1}
                          max={deckLimit < 999 ? Math.max(1, deckLimit - deckCopies) : 99}
                          value={deckQuantity}
                          onChange={(e) => setDeckQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-10 bg-transparent text-xs text-white font-bold focus:outline-none text-center"
                        />
                      </div>

                      <button
                        onClick={handleDeckAdd}
                        disabled={!commanderLegality.isLegal || isAtDeckLimit}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          !commanderLegality.isLegal
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-red-900/50'
                            : isAtDeckLimit
                              ? 'bg-slate-800 text-fuchsia-500/70 border border-fuchsia-800/40 cursor-not-allowed'
                              : 'bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 cursor-pointer'
                        }`}
                      >
                        {deckAddedToast ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : isAtDeckLimit ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {deckAddedToast
                            ? 'Added!'
                            : (!commanderLegality.isLegal
                              ? 'Illegal Identity'
                              : isAtDeckLimit
                                ? `At Limit (${deckCopies}/${deckLimit})`
                                : 'Add to Deck')}
                        </span>
                      </button>
                    </div>

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
                    ) : (
                      <strong className="text-white text-xs">Main Binder</strong>
                    )}
                  </div>
                  <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={colIsFoil}
                      onChange={(e) => setColIsFoil(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-fuchsia-500 focus:ring-0"
                    />
                    <span>Foil</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
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
                      placeholder={priceUsd ? priceUsd.toFixed(2) : '0.00'}
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
                    <span>Scryfall</span>
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
