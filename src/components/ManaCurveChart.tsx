import React from 'react';
import { DeckStats } from '../types/mtg';

interface ManaCurveChartProps {
  stats: DeckStats;
}

export const ManaCurveChart: React.FC<ManaCurveChartProps> = ({ stats }) => {
  const maxCurveCount = Math.max(1, ...stats.manaCurve.map((m) => m.count));
  const totalPips = (Object.values(stats.colorPips) as number[]).reduce((a: number, b: number) => a + b, 0);

  const colorConfig: Record<string, { bg: string; label: string; text: string }> = {
    W: { bg: 'bg-amber-100', label: 'White', text: 'text-amber-200' },
    U: { bg: 'bg-sky-500', label: 'Blue', text: 'text-sky-400' },
    B: { bg: 'bg-neutral-900 border border-slate-600', label: 'Black', text: 'text-slate-300' },
    R: { bg: 'bg-rose-500', label: 'Red', text: 'text-rose-400' },
    G: { bg: 'bg-emerald-500', label: 'Green', text: 'text-emerald-400' },
    C: { bg: 'bg-zinc-400', label: 'Colorless', text: 'text-zinc-300' },
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
      {/* Top summary row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Avg. Mana Value</span>
            <span className="text-base font-bold text-fuchsia-400">{stats.averageCmc}</span>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Cards</span>
            <span className="text-base font-bold text-slate-100">{stats.mainboardCount}</span>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Sideboard</span>
            <span className="text-base font-bold text-slate-300">{stats.sideboardCount}</span>
          </div>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold text-right">Est. Market Value</span>
          <span className="text-base font-bold text-emerald-400 text-right block">
            ${stats.totalPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Mana Curve Histogram */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-medium">
          <span>Mana Curve (Non-lands)</span>
          <span className="text-[11px] text-slate-500">Max peak: {maxCurveCount}</span>
        </div>

        <div className="h-28 flex items-end gap-2 pt-2 px-1">
          {stats.manaCurve.map((item) => {
            const heightPct = Math.round((item.count / maxCurveCount) * 100);

            return (
              <div key={item.cmc} className="flex-1 flex flex-col items-center gap-1 group h-full justify-end">
                <span className="text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.count}
                </span>
                <div className="w-full bg-slate-800/60 rounded-t-md relative flex items-end h-full">
                  <div
                    style={{ height: `${Math.max(item.count > 0 ? 8 : 0, heightPct)}%` }}
                    className="w-full bg-gradient-to-t from-fuchsia-600 to-fuchsia-400 rounded-t-md transition-all duration-300 group-hover:from-fuchsia-500 group-hover:to-fuchsia-300 shadow-sm"
                  />
                </div>
                <span className="text-[11px] font-semibold text-slate-400 select-none">
                  {item.cmc}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Color Pips & Type Composition */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
        {/* Color Distribution */}
        <div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block mb-2">
            Color Pips ({totalPips} total)
          </span>
          {totalPips > 0 ? (
            <div>
              {/* Stacked Bar */}
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner mb-2">
                {(Object.entries(stats.colorPips) as [string, number][]).map(([colorKey, count]) => {
                  if (count === 0) return null;
                  const pct = ((count / totalPips) * 100).toFixed(1);
                  return (
                    <div
                      key={colorKey}
                      style={{ width: `${pct}%` }}
                      className={`${colorConfig[colorKey]?.bg || 'bg-slate-500'}`}
                      title={`${colorConfig[colorKey]?.label}: ${count} (${pct}%)`}
                    />
                  );
                })}
              </div>

              {/* Pip legend */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                {(Object.entries(stats.colorPips) as [string, number][]).map(([colorKey, count]) => {
                  if (count === 0) return null;
                  return (
                    <span key={colorKey} className="flex items-center gap-1 font-medium text-slate-300">
                      <span className={`w-2 h-2 rounded-full ${colorConfig[colorKey]?.bg}`} />
                      <span>{colorKey}: <strong>{count}</strong></span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-500">No color mana symbols in mainboard</span>
          )}
        </div>

        {/* Card Type Breakdown */}
        <div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block mb-2">
            Card Types
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(stats.typeBreakdown) as [string, number][]).map(([typeName, count]) => {
              if (count === 0) return null;
              return (
                <span
                  key={typeName}
                  className="px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-300 text-xs font-medium"
                >
                  {typeName}: <strong className="text-fuchsia-400 ml-0.5">{count}</strong>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
