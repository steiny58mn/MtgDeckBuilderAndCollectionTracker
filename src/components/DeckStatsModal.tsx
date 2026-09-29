import React, { useMemo, useState } from 'react';
import { 
  X, 
  SlidersHorizontal, 
  BarChart2, 
  DollarSign, 
  AlertCircle, 
  Sparkles,
  Flame,
  ShieldAlert,
  Wand2,
  Check,
  Zap,
  Info
} from 'lucide-react';
import { Deck, DeckStats } from '../types/mtg';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { ManaCurveChart } from './ManaCurveChart';
import { calculateBasicLandBalance, calculateCommanderSaltAndPower } from '../utils/deckUtils';

interface DeckStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: Deck;
  stats: DeckStats;
  scope: 'main' | 'all';
  onScopeChange: (scope: 'main' | 'all') => void;
  selectedCmc?: string | number | null;
  onSelectCmc?: (cmc: string | number | null) => void;
  onApplyBasicBalance?: (recommended: Record<string, number>) => void;
}

export const DeckStatsModal: React.FC<DeckStatsModalProps> = ({
  isOpen,
  onClose,
  deck,
  stats,
  scope,
  onScopeChange,
  selectedCmc,
  onSelectCmc,
  onApplyBasicBalance,
}) => {
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  const [activeTab, setActiveTab] = useState<'mana' | 'salt' | 'basics'>('mana');
  const [balanceApplied, setBalanceApplied] = useState(false);

  const saltAndPower = useMemo(() => calculateCommanderSaltAndPower(deck), [deck]);
  const basicBalance = useMemo(() => calculateBasicLandBalance(deck), [deck]);

  if (!isOpen) return null;

  const totalPips = (Object.values(stats.colorPips) as number[]).reduce((a, b) => a + b, 0);
  const sources = stats.manaSources || { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, totalLands: 0, totalSources: 0 };
  const totalSources = sources.W + sources.U + sources.B + sources.R + sources.G + sources.C;

  const colorConfig: Record<string, { bg: string; border: string; label: string; text: string }> = {
    W: { bg: 'bg-amber-100', border: 'border-amber-300', label: 'White', text: 'text-amber-200' },
    U: { bg: 'bg-sky-500', border: 'border-sky-400', label: 'Blue', text: 'text-sky-400' },
    B: { bg: 'bg-zinc-800', border: 'border-zinc-600', label: 'Black', text: 'text-zinc-300' },
    R: { bg: 'bg-rose-500', border: 'border-rose-400', label: 'Red', text: 'text-rose-400' },
    G: { bg: 'bg-emerald-500', border: 'border-emerald-400', label: 'Green', text: 'text-emerald-400' },
    C: { bg: 'bg-zinc-500', border: 'border-zinc-400', label: 'Colorless', text: 'text-zinc-300' },
  };

  const colors = ['W', 'U', 'B', 'R', 'G', 'C'] as const;

  const handleApplyBasics = () => {
    if (onApplyBasicBalance) {
      onApplyBasicBalance(basicBalance.recommendedCounts);
      setBalanceApplied(true);
      setTimeout(() => setBalanceApplied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Deck Analytics &amp; Mana Analysis</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-normal">
                  {deck.name}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Interactive curve, land ratios, power brackets, and salt ratings
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-2 pb-2 bg-slate-950/50 border-b border-slate-800 flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('mana')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'mana'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Mana Curve &amp; Land Balance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('salt')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'salt'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Power Level &amp; Salt Score</span>
            {saltAndPower.saltScore > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono">
                {saltAndPower.saltScore}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('basics')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'basics'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto-Balance Basics ({basicBalance.totalBasics})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'mana' && (
            <>
              {/* Mana Curve Histogram */}
              <ManaCurveChart
                stats={stats}
                scope={scope}
                onScopeChange={onScopeChange}
                selectedCmc={selectedCmc}
                onSelectCmc={onSelectCmc}
              />

              {/* Mana Base & Land Balance Visualizer (Pips vs Sources) */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-violet-400" />
                      <span>Mana Base &amp; Land Balance (Pips vs. Sources)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Compares colored mana symbols required by spells against mana produced by lands and rocks.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                      {sources.totalLands} Lands
                    </span>
                    <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                      {totalSources} Total Sources
                    </span>
                  </div>
                </div>

                {totalPips === 0 && totalSources === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">No colored spells or mana sources detected.</p>
                ) : (
                  <div className="space-y-3 pt-2">
                    {colors.map((col) => {
                      const pips = stats.colorPips[col] || 0;
                      const src = sources[col] || 0;
                      if (pips === 0 && src === 0) return null;

                      const pipPct = totalPips > 0 ? Math.round((pips / totalPips) * 100) : 0;
                      const srcPct = totalSources > 0 ? Math.round((src / totalSources) * 100) : 0;
                      const delta = srcPct - pipPct;
                      const isUnderSupported = pips > 0 && delta < -10;

                      return (
                        <div key={col} className="bg-slate-900/80 border border-slate-800/60 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`w-3.5 h-3.5 rounded-full ${colorConfig[col]?.bg} inline-block`} />
                              <span className="font-bold text-slate-200">{colorConfig[col]?.label}</span>
                              {isUnderSupported && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-950/60 border border-amber-600/40 px-1.5 py-0.2 rounded">
                                  <AlertCircle className="w-2.5 h-2.5" /> Under-supported ({Math.abs(delta)}% deficit)
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs font-mono">
                              <span className="text-slate-300">
                                Pips: <strong className="text-white">{pips}</strong> ({pipPct}%)
                              </span>
                              <span className="text-slate-500">•</span>
                              <span className="text-slate-300">
                                Sources: <strong className="text-violet-300">{src}</strong> ({srcPct}%)
                              </span>
                            </div>
                          </div>

                          {/* Progress Bars */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-slate-400 w-12 text-right">Pips</span>
                              <div className="flex-1 bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                                <div
                                  style={{ width: `${Math.min(100, pipPct)}%` }}
                                  className={`h-full ${colorConfig[col]?.bg} transition-all duration-300`}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-slate-400 w-12 text-right">Sources</span>
                              <div className="flex-1 bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                                <div
                                  style={{ width: `${Math.min(100, srcPct)}%` }}
                                  className="h-full bg-violet-500 transition-all duration-300"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top 5 Heavy Hitters */}
              {stats.topExpensiveCards && stats.topExpensiveCards.length > 0 && (
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span>Top 5 Most Valuable Cards</span>
                    </h3>
                    <span className="text-xs text-slate-400">
                      Total Market: <strong className="text-emerald-400 font-mono">${stats.totalPriceUsd.toFixed(2)}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                    {stats.topExpensiveCards.map((c, i) => {
                      const p = (c.isFoil && c.priceUsdFoil) ? c.priceUsdFoil : (c.priceUsd || 0);
                      const pct = stats.totalPriceUsd > 0 ? ((p * (c.quantity || 1) / stats.totalPriceUsd) * 100).toFixed(1) : '0';
                      const thumb = c.imageUrl || (c.scryfallId ? `https://api.scryfall.com/cards/${c.scryfallId}?format=image&version=small` : undefined);

                      return (
                        <div
                          key={c.id || i}
                          className="flex sm:flex-col items-center sm:items-start gap-3 bg-slate-900/80 border border-slate-800/70 rounded-xl p-2.5 text-xs hover:border-violet-500/40 transition-colors"
                        >
                          {thumb && (
                            <img
                              src={thumb}
                              alt={c.name}
                              className="w-10 sm:w-full h-14 sm:h-28 object-cover rounded-md border border-slate-800 shrink-0"
                              loading="lazy"
                            />
                          )}
                          <div className="min-w-0 flex-1 w-full">
                            <div className="font-semibold text-slate-200 truncate" title={c.name}>
                              {c.name}
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[11px]">
                              <span className="font-mono font-bold text-emerald-400">
                                ${p.toFixed(2)}
                              </span>
                              <span className="text-slate-500 font-mono">
                                {pct}% of deck
                              </span>
                            </div>
                            {c.isFoil && (
                              <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold mt-0.5">
                                <Sparkles className="w-2.5 h-2.5" /> Foil
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'salt' && (
            <div className="space-y-5">
              {/* Power Level Bracket Banner */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Estimated Commander Power Bracket</h3>
                      <p className="text-xs text-slate-400">Based on fast mana, tutor density, average curve, and combo lines</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${saltAndPower.powerBracket.badgeColor}`}>
                    {saltAndPower.powerBracket.name}
                  </span>
                </div>
                <p className="text-xs text-slate-300 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                  {saltAndPower.powerBracket.description}
                </p>
              </div>

              {/* Salt Score Gauge */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Flame className="w-5 h-5 text-rose-500" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Deck Salt Index</h3>
                      <p className="text-xs text-slate-400">Evaluates cards that frequently cause salt in casual pods</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-white font-mono">
                      {saltAndPower.saltScore} / 100
                    </div>
                    <div className="text-[11px] font-semibold text-amber-400">
                      {saltAndPower.saltRating} Salt
                    </div>
                  </div>
                </div>

                <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                  <div
                    style={{ width: `${saltAndPower.saltScore}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-600 transition-all duration-500"
                  />
                </div>
              </div>

              {/* Salty Cards List */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Detected High-Salt Cards ({saltAndPower.saltyCards.length})</span>
                </h4>

                {saltAndPower.saltyCards.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-3">No notorious high-salt cards detected in this deck.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {saltAndPower.saltyCards.map((sc, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
                        <div>
                          <div className="font-bold text-slate-200">{sc.name}</div>
                          <div className="text-[11px] text-slate-400">{sc.reason}</div>
                        </div>
                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-400">
                          +{sc.weight}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'basics' && (
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <Wand2 className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Auto-Balance Basic Lands</h3>
                    <p className="text-xs text-slate-400">
                      Calculates proportional basic land distribution to match your colored spell requirements
                    </p>
                  </div>
                </div>

                {onApplyBasicBalance && (
                  <button
                    type="button"
                    onClick={handleApplyBasics}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                  >
                    {balanceApplied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Basics Balanced!</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        <span>Apply Balanced Basics</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Current Basics */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Current Basics ({basicBalance.totalBasics} total)
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {Object.entries(basicBalance.currentCounts).map(([land, count]) => (
                      <div key={land} className="flex items-center justify-between text-slate-300">
                        <span>{land}</span>
                        <span className="font-mono font-bold text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Basics */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-violet-500/40 space-y-2">
                  <span className="text-xs font-bold text-violet-300 uppercase tracking-wider block">
                    Recommended Proportional ({basicBalance.totalBasics} total)
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {Object.entries(basicBalance.recommendedCounts).map(([land, count]) => {
                      const current = basicBalance.currentCounts[land] || 0;
                      const diff = Number(count) - Number(current);
                      return (
                        <div key={land} className="flex items-center justify-between text-slate-300">
                          <span>{land}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-violet-300">{count}</span>
                            {diff !== 0 && (
                              <span className={`text-[10px] font-mono font-bold ${diff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ({diff > 0 ? `+${diff}` : diff})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {scope === 'all' ? 'All Boards Analyzed' : 'Mainboard Only Analyzed'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
