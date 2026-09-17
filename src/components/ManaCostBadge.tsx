import React from 'react';

interface ManaCostBadgeProps {
  manaCost?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ManaCostBadge: React.FC<ManaCostBadgeProps> = ({ manaCost, size = 'md' }) => {
  if (!manaCost) return null;

  // Split "{2}{U}{U}" into ["2", "U", "U"]
  const symbols = manaCost.match(/\{([A-Za-z0-9/]+)\}/g) || [];
  if (symbols.length === 0) return null;

  const sizeClasses = {
    sm: 'w-4 h-4 text-[10px]',
    md: 'w-5 h-5 text-xs',
    lg: 'w-6 h-6 text-sm',
  }[size];

  return (
    <span className="inline-flex items-center gap-0.5 flex-wrap">
      {symbols.map((rawSym, idx) => {
        const sym = rawSym.replace(/[{}]/g, '').toUpperCase();
        let bgClass = 'bg-slate-700 text-slate-200 border-slate-600';
        let text = sym;

        switch (sym) {
          case 'W':
            bgClass = 'bg-amber-100 text-fuchsia-900 border-fuchsia-300 font-bold';
            break;
          case 'U':
            bgClass = 'bg-sky-600 text-white border-sky-400 font-bold';
            break;
          case 'B':
            bgClass = 'bg-neutral-800 text-slate-200 border-neutral-600 font-bold';
            break;
          case 'R':
            bgClass = 'bg-rose-600 text-white border-rose-400 font-bold';
            break;
          case 'G':
            bgClass = 'bg-emerald-600 text-white border-emerald-400 font-bold';
            break;
          case 'C':
            bgClass = 'bg-zinc-400 text-zinc-900 border-zinc-300 font-bold';
            break;
          default:
            // Generic mana number or hybrid
            if (/^\d+$/.test(sym) || sym === 'X') {
              bgClass = 'bg-slate-600 text-slate-100 border-slate-500 font-semibold';
            }
            break;
        }

        return (
          <span
            key={idx}
            className={`inline-flex items-center justify-center rounded-full border shadow-xs select-none ${sizeClasses} ${bgClass}`}
            title={`Mana: ${sym}`}
          >
            {text}
          </span>
        );
      })}
    </span>
  );
};
