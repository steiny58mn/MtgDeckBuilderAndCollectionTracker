import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Eye, 
  ShieldAlert,
  Info
} from 'lucide-react';
import { Deck, DeckCard, ScryfallCard } from '../types/mtg';
import { detectGamechangers, GamechangerCardInfo } from '../utils/deckUtils';
import { GamechangerService } from '../services/gamechangerService';
import { ManaCostBadge } from './ManaCostBadge';

interface GamechangersPanelProps {
  deck: Deck;
  onSelectCard?: (card: ScryfallCard) => void;
}

export const GamechangersPanel: React.FC<GamechangersPanelProps> = ({
  deck,
  onSelectCard,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('deck_builder_gamechangers_collapsed');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [updateTick, setUpdateTick] = useState(0);

  // Subscribe to background gamechanger updates
  useEffect(() => {
    return GamechangerService.subscribe(() => {
      setUpdateTick((t) => t + 1);
    });
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('deck_builder_gamechangers_collapsed', JSON.stringify(next));
      } catch (err) {
        console.error(err);
      }
      return next;
    });
  };

  const gamechangers = React.useMemo(() => detectGamechangers(deck), [deck, updateTick]);
  const totalCards = gamechangers.reduce((sum, g) => sum + (g.card.quantity || 1), 0);

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900/90 to-fuchsia-950/40 shadow-xl overflow-hidden transition-all duration-200">
      {/* Collapsible Header */}
      <div
        onClick={toggleCollapse}
        className="w-full flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 cursor-pointer select-none hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20">
            <Zap className="w-4 h-4 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black tracking-wide text-white flex items-center gap-1.5">
                <span>Gamechangers</span>
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                gamechangers.length > 0 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {totalCards} {totalCards === 1 ? 'Card' : 'Cards'} ({gamechangers.length} Unique)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
              High-impact format staples and Gamechanger cards
            </p>
          </div>
        </div>

        {/* Expand / Collapse Chevron */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700/60"
            title={isCollapsed ? 'Expand Gamechangers' : 'Collapse Gamechangers'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content Area */}
      {!isCollapsed && (
        <div className="p-3.5 sm:p-4 pt-0 border-t border-slate-800/70 bg-slate-950/50 space-y-3">
          {gamechangers.length === 0 ? (
            <div className="p-5 text-center bg-slate-900/60 rounded-xl border border-slate-800/80 text-slate-400 space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-300">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>No Notorious Gamechangers Detected</span>
              </div>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                This deck contains no designated Gamechangers, making it well-suited for relaxed Commander pods.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {gamechangers.map((gc) => {
                const { card } = gc;
                const unitPrice = card.isFoil && card.priceUsdFoil ? card.priceUsdFoil : card.priceUsd || 0;

                return (
                  <div
                    key={card.id || card.name}
                    className="group relative flex items-start gap-3 p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/40 transition-all duration-150 shadow-sm"
                  >
                    {/* Card art thumbnail with hover pop */}
                    <div
                      onClick={() => onSelectCard?.(card as unknown as ScryfallCard)}
                      className="relative w-12 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 cursor-pointer shadow-inner"
                    >
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-amber-400 text-xs">
                          <Zap className="w-4 h-4" />
                        </div>
                      )}
                      {card.quantity > 1 && (
                        <span className="absolute bottom-0 right-0 px-1 py-0.2 rounded-tl bg-slate-950/90 text-[10px] font-black font-mono text-white">
                          ×{card.quantity}
                        </span>
                      )}
                    </div>

                    {/* Card details & Gamechanger tag */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectCard?.(card as unknown as ScryfallCard)}
                          className="text-left font-bold text-xs text-slate-100 hover:text-amber-300 transition-colors truncate cursor-pointer"
                          title={card.name}
                        >
                          {card.name}
                        </button>
                        {card.mana_cost && (
                          <div className="shrink-0 scale-90 origin-right">
                            <ManaCostBadge manaCost={card.mana_cost} />
                          </div>
                        )}
                      </div>

                      {/* Unified Gamechanger Badge & Price */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 bg-amber-950/80 border-amber-500/50 text-amber-300">
                          <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span>Gamechanger</span>
                        </span>
                        {unitPrice > 0 && (
                          <span className="text-[10px] font-mono text-emerald-400 font-semibold ml-auto">
                            ${unitPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick view button */}
                    {onSelectCard && (
                      <button
                        type="button"
                        onClick={() => onSelectCard(card as unknown as ScryfallCard)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-400 transition-all cursor-pointer absolute top-2 right-2 shadow-sm"
                        title="Inspect full card details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

