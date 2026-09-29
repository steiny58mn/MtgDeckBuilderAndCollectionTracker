import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, 
  Play, 
  RotateCcw, 
  X, 
  Layers, 
  FastForward, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Deck, DeckCard, ScryfallCard } from '../types/mtg';

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const effectiveK = Math.min(k, n - k);
  let c = 1;
  for (let i = 1; i <= effectiveK; i++) {
    c = (c * (n - (effectiveK - i))) / i;
  }
  return c;
}

function hypergeometric(population: number, successes: number, sampleSize: number, observed: number): number {
  if (observed > successes || observed > sampleSize || sampleSize - observed > population - successes || population <= 0 || sampleSize <= 0) {
    return 0;
  }
  const totalWays = combinations(population, sampleSize);
  if (totalWays === 0) return 0;
  return (combinations(successes, observed) * combinations(population - successes, sampleSize - observed)) / totalWays;
}

interface SampleHandSimulatorProps {
  deck: Deck;
  isOpen: boolean;
  onClose: () => void;
  onSelectCard: (card: ScryfallCard) => void;
}

export const SampleHandSimulator: React.FC<SampleHandSimulatorProps> = ({
  deck,
  isOpen,
  onClose,
  onSelectCard,
}) => {
  const [library, setLibrary] = useState<DeckCard[]>([]);
  const [hand, setHand] = useState<DeckCard[]>([]);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [battlefield, setBattlefield] = useState<{ card: DeckCard; tapped: boolean }[]>([]);
  const [turn, setTurn] = useState(1);
  const [landPlayedThisTurn, setLandPlayedThisTurn] = useState(false);

  // Flatten mainboard cards according to their quantity
  const buildFlatMainboard = (): DeckCard[] => {
    const list: DeckCard[] = [];
    deck.cards.forEach((c) => {
      if (c.category === 'main') {
        for (let i = 0; i < c.quantity; i++) {
          list.push({ ...c, id: `${c.id}-inst-${i}` });
        }
      }
    });
    return list;
  };

  // Hypergeometric probabilities for opening 7 cards
  const allMainCards = buildFlatMainboard();
  const totalDeckSize = allMainCards.length;
  const totalLandsCount = allMainCards.filter((c) =>
    (c.type_line || (c as any).typeLine || '').toLowerCase().includes('land')
  ).length;
  const earlyPlaysCount = allMainCards.filter((c) => {
    const isLand = (c.type_line || (c as any).typeLine || '').toLowerCase().includes('land');
    return !isLand && (c.cmc || 0) <= 2;
  }).length;

  const probIdealLands = totalDeckSize >= 7
    ? (
        hypergeometric(totalDeckSize, totalLandsCount, 7, 2) +
        hypergeometric(totalDeckSize, totalLandsCount, 7, 3) +
        hypergeometric(totalDeckSize, totalLandsCount, 7, 4)
      ) * 100
    : 0;

  const probManaScrew = totalDeckSize >= 7
    ? (
        hypergeometric(totalDeckSize, totalLandsCount, 7, 0) +
        hypergeometric(totalDeckSize, totalLandsCount, 7, 1)
      ) * 100
    : 0;

  const probEarlyPlay = totalDeckSize >= 7
    ? (1 - hypergeometric(totalDeckSize, earlyPlaysCount, 7, 0)) * 100
    : 0;

  const shuffleArray = (arr: DeckCard[]): DeckCard[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const initHand = () => {
    const flat = buildFlatMainboard();
    const shuffled = shuffleArray(flat);
    const drawn = shuffled.slice(0, 7);
    const rest = shuffled.slice(7);

    setHand(drawn);
    setLibrary(rest);
    setBattlefield([]);
    setTurn(1);
    setLandPlayedThisTurn(false);
    setMulliganCount(0);
  };

  const handleMulligan = () => {
    const flat = buildFlatMainboard();
    const shuffled = shuffleArray(flat);
    const drawn = shuffled.slice(0, 7);
    const rest = shuffled.slice(7);

    setHand(drawn);
    setLibrary(rest);
    setBattlefield([]);
    setTurn(1);
    setLandPlayedThisTurn(false);
    setMulliganCount((prev) => prev + 1);
  };

  const handleDrawCard = () => {
    if (library.length === 0) return;
    const drawnCard = library[0];
    setHand((prev) => [...prev, drawnCard]);
    setLibrary((prev) => prev.slice(1));
  };

  const handlePlayToBattlefield = (card: DeckCard, e: React.MouseEvent) => {
    e.stopPropagation();
    const typeLine = (card.type_line || (card as any).typeLine || '').toLowerCase();
    const isLand = typeLine.includes('land');
    if (isLand) {
      setLandPlayedThisTurn(true);
    }
    setHand((prev) => prev.filter((c) => c.id !== card.id));
    setBattlefield((prev) => [...prev, { card, tapped: false }]);
  };

  const handleToggleTapPermanent = (index: number) => {
    setBattlefield((prev) =>
      prev.map((perm, i) => (i === index ? { ...perm, tapped: !perm.tapped } : perm))
    );
  };

  const handleReturnToHand = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = battlefield[index];
    setBattlefield((prev) => prev.filter((_, i) => i !== index));
    setHand((prev) => [...prev, item.card]);
  };

  const handleNextTurn = () => {
    setTurn((prev) => prev + 1);
    setLandPlayedThisTurn(false);
    setBattlefield((prev) => prev.map((perm) => ({ ...perm, tapped: false })));
    if (library.length > 0) {
      const drawnCard = library[0];
      setHand((prev) => [...prev, drawnCard]);
      setLibrary((prev) => prev.slice(1));
    }
  };

  // Heuristic opening hand advice
  const handAdvice = useMemo(() => {
    if (hand.length === 0) return null;
    const lands = hand.filter((c) =>
      (c.type_line || (c as any).typeLine || '').toLowerCase().includes('land')
    );
    const earlyPlays = hand.filter((c) => {
      const isLand = (c.type_line || (c as any).typeLine || '').toLowerCase().includes('land');
      return !isLand && (c.cmc || 0) <= 2;
    });

    if (lands.length >= 3 && lands.length <= 4 && earlyPlays.length >= 1) {
      return {
        verdict: 'Great Keep',
        badge: 'bg-emerald-950 text-emerald-300 border-emerald-500/50',
        detail: `${lands.length} lands with ${earlyPlays.length} early play(s) (CMC ≤ 2). Ideal opening velocity.`,
      };
    } else if (lands.length === 2 && earlyPlays.length >= 2) {
      return {
        verdict: 'Playable / Strong',
        badge: 'bg-sky-950 text-sky-300 border-sky-500/50',
        detail: `2 lands with ${earlyPlays.length} low-cost plays. Strong keep if curve allows drawing 3rd land.`,
      };
    } else if (lands.length >= 2 && lands.length <= 4) {
      return {
        verdict: 'Keepable',
        badge: 'bg-slate-800 text-slate-200 border-slate-700',
        detail: `${lands.length} lands. Ensure you have the colors required for your early game.`,
      };
    } else if (lands.length <= 1) {
      return {
        verdict: 'Mulligan Recommended',
        badge: 'bg-rose-950 text-rose-300 border-rose-500/50',
        detail: `Only ${lands.length} land(s). High risk of severe mana screw.`,
      };
    } else {
      return {
        verdict: 'Greedy / High Risk',
        badge: 'bg-amber-950 text-amber-300 border-amber-500/50',
        detail: `${lands.length} lands. Prone to mana flood unless you have explosive draw spells.`,
      };
    }
  }, [hand]);

  useEffect(() => {
    if (isOpen) {
      initHand();
    }
  }, [isOpen, deck.id]);

  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div 
        className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 flex flex-col max-h-[95vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-fuchsia-400" />
              Opening Hand &amp; Goldfish Playtester
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Testing <span className="text-slate-200 font-semibold">{deck.name}</span> · Library:{' '}
              <strong className="text-fuchsia-400">{library.length}</strong> cards remaining · Hand:{' '}
              <strong className="text-emerald-400">{hand.length}</strong>
              {mulliganCount > 0 && (
                <span className="ml-2 text-rose-400 font-semibold">
                  (Mulligan #{mulliganCount}: London Rule)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleMulligan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              title="Shuffle and redraw 7 cards"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Mulligan
            </button>

            <button
              onClick={handleDrawCard}
              disabled={library.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Draw
            </button>

            <button
              onClick={handleNextTurn}
              disabled={library.length === 0 && hand.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-md cursor-pointer"
              title="Untap all battlefield cards, draw 1 card, and increment turn"
            >
              <FastForward className="w-3.5 h-3.5 fill-current" />
              <span>Next Turn ({turn + 1})</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors ml-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Probabilities Banner */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs my-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">Opening 7 Probabilities:</span>
            <span className="text-slate-500 font-mono">({totalLandsCount} lands in {totalDeckSize} cards)</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-5 flex-wrap font-mono text-[11px]">
            <div className="flex items-center gap-1.5" title="Chance of drawing 2, 3, or 4 lands in your opening 7">
              <span className="text-slate-400">2–4 Lands:</span>
              <span className="font-bold text-emerald-400">{probIdealLands.toFixed(1)}%</span>
            </div>

            <div className="flex items-center gap-1.5" title="Chance of drawing 0 or 1 land in opening 7">
              <span className="text-slate-400">Screw (≤1 Land):</span>
              <span className={`font-bold ${probManaScrew > 20 ? 'text-amber-400' : 'text-slate-300'}`}>
                {probManaScrew.toFixed(1)}%
              </span>
            </div>

            <div className="flex items-center gap-1.5" title="Chance of drawing at least one card with Mana Value ≤ 2 in opening 7">
              <span className="text-slate-400">Turn 1–2 Play:</span>
              <span className="font-bold text-violet-400">{probEarlyPlay.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Mulligan Advisor */}
        {handAdvice && (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs mb-2">
            <div className="flex items-center gap-2.5">
              <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${handAdvice.badge}`}>
                {handAdvice.verdict}
              </span>
              <span className="text-slate-300">{handAdvice.detail}</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              Turn {turn} · Land played: {landPlayedThisTurn ? 'Yes' : 'No'}
            </div>
          </div>
        )}

        {/* Battlefield Area */}
        {battlefield.length > 0 && (
          <div className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-3 space-y-2 mb-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Battlefield (Turn {turn}) · {battlefield.filter(b => !b.tapped).length}/{battlefield.length} Untapped</span>
              </span>
              <span className="text-[11px] text-slate-400">Click a permanent to tap/untap · Hover to return</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1 max-h-36 overflow-y-auto">
              {battlefield.map((perm, idx) => (
                <div
                  key={idx}
                  onClick={() => handleToggleTapPermanent(idx)}
                  className={`relative group cursor-pointer transition-all duration-200 rounded-lg overflow-hidden border ${
                    perm.tapped
                      ? 'rotate-12 opacity-60 border-slate-700 bg-slate-950 scale-95'
                      : 'border-emerald-500/50 bg-slate-900 shadow-md hover:-translate-y-1'
                  }`}
                  style={{ width: '64px', height: '90px' }}
                  title={`${perm.card.name} (${perm.tapped ? 'Tapped' : 'Untapped'}) - Click to toggle`}
                >
                  <img
                    src={perm.card.imageUrl || 'https://cards.scryfall.io/back.jpg'}
                    alt={perm.card.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {perm.tapped && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center font-bold text-[10px] text-amber-300">
                      TAPPED
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleReturnToHand(idx, e)}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded bg-slate-950/90 text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-900"
                    title="Return to hand"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hand Area */}
        <div className="flex-1 overflow-y-auto py-2">
          {hand.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {hand.map((card, idx) => (
                <div
                  key={card.id || idx}
                  onClick={() => {
                    onSelectCard({
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
                      prices: { usd: card.priceUsd ? card.priceUsd.toString() : null },
                      image_uris: { normal: card.imageUrl },
                      set_name: card.set_name || '',
                    });
                  }}
                  className="group relative cursor-pointer aspect-[5/7] rounded-xl overflow-hidden shadow-lg border border-slate-800 hover:border-fuchsia-400 transition-all duration-200 hover:-translate-y-2 hover:shadow-2xl"
                >
                  <img
                    src={card.imageUrl || 'https://cards.scryfall.io/back.jpg'}
                    alt={card.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute top-1 inset-x-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handlePlayToBattlefield(card, e)}
                      className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-md cursor-pointer"
                      title="Play to battlefield"
                    >
                      Play
                    </button>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-slate-950/90 p-1 text-[10px] font-semibold text-center text-slate-200 truncate border-t border-slate-800">
                    {card.name}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 text-xs">
              No cards in hand. Draw a card or restart simulation!
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Click card to view details · Hover to Play to Battlefield</span>
          <button
            onClick={initHand}
            className="hover:text-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset Simulation
          </button>
        </div>
      </div>
    </div>
  );
};
