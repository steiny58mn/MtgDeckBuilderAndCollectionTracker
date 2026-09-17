import React, { useState, useEffect } from 'react';
import { RefreshCw, Play, RotateCcw, X, Layers } from 'lucide-react';
import { Deck, DeckCard, ScryfallCard } from '../types/mtg';
import { getCardImageUrl } from '../services/scryfall';

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

  // Flatten mainboard cards according to their quantity
  const buildFlatMainboard = (): DeckCard[] => {
    const list: DeckCard[] = [];
    deck.cards.forEach((c) => {
      // In Commander, commander starts in command zone, not library
      if (c.category === 'main') {
        for (let i = 0; i < c.quantity; i++) {
          list.push({ ...c, id: `${c.id}-inst-${i}` });
        }
      }
    });
    return list;
  };

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
    setMulliganCount(0);
  };

  const handleMulligan = () => {
    const flat = buildFlatMainboard();
    const shuffled = shuffleArray(flat);
    const drawn = shuffled.slice(0, 7);
    const rest = shuffled.slice(7);

    setHand(drawn);
    setLibrary(rest);
    setMulliganCount((prev) => prev + 1);
  };

  const handleDrawCard = () => {
    if (library.length === 0) return;
    const drawnCard = library[0];
    setHand((prev) => [...prev, drawnCard]);
    setLibrary((prev) => prev.slice(1));
  };

  useEffect(() => {
    if (isOpen) {
      initHand();
    }
  }, [isOpen, deck.id]);

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
              Opening Hand Simulator
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Testing <span className="text-slate-200 font-semibold">{deck.name}</span> · Library:{' '}
              <strong className="text-fuchsia-400">{library.length}</strong> cards remaining · Hand:{' '}
              <strong className="text-emerald-400">{hand.length}</strong>
              {mulliganCount > 0 && (
                <span className="ml-2 text-rose-400">
                  (Mulligan #{mulliganCount}: Bottom {mulliganCount} cards in London rule)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleMulligan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              title="Shuffle and redraw 7 cards"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Mulligan
            </button>

            <button
              onClick={handleDrawCard}
              disabled={library.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Draw Card
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white ml-2 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hand Cards Canvas */}
        <div className="flex-1 overflow-y-auto py-6">
          {hand.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {hand.map((card, idx) => {
                return (
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
                    <div className="absolute bottom-0 inset-x-0 bg-slate-950/90 p-1 text-[10px] font-semibold text-center text-slate-200 truncate border-t border-slate-800">
                      {card.name}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 text-xs">
              No cards in mainboard. Add cards to your deck to test starting hands!
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Click any card to view full Oracle text & rules</span>
          <button
            onClick={initHand}
            className="hover:text-slate-200 inline-flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset Simulation
          </button>
        </div>
      </div>
    </div>
  );
};
