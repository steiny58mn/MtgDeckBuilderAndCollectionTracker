import React, { useState, useEffect, useCallback } from 'react';
import { Printer } from 'lucide-react';

export interface ChecklistPrintButtonGroupProps {
  onPrint: (columns: 1 | 2 | 3 | 4) => void;
  size?: 'compact' | 'normal';
}

const STORAGE_KEY = 'mtg_checklist_print_cols';
const SYNC_EVENT = 'mtg_checklist_cols_sync';

export const getSavedPrintColumns = (): 1 | 2 | 3 | 4 => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === '1' || saved === '2' || saved === '3' || saved === '4') {
      return Number(saved) as 1 | 2 | 3 | 4;
    }
  } catch (_) {}
  return 2;
};

export const ChecklistPrintButtonGroup: React.FC<ChecklistPrintButtonGroupProps> = React.memo(({
  onPrint,
  size = 'normal',
}) => {
  const [columns, setColumns] = useState<1 | 2 | 3 | 4>(getSavedPrintColumns);

  // Sync across instances (e.g. DeckBuilder toolbar and Checklist modal)
  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<1 | 2 | 3 | 4>;
      if (customEvent.detail && [1, 2, 3, 4].includes(customEvent.detail)) {
        setColumns(customEvent.detail);
      } else {
        setColumns(getSavedPrintColumns());
      }
    };

    window.addEventListener(SYNC_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const handleSelectColumns = useCallback((cols: 1 | 2 | 3 | 4) => {
    setColumns(cols);
    try {
      localStorage.setItem(STORAGE_KEY, String(cols));
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: cols }));
    } catch (_) {}
  }, []);

  const handlePrintClick = useCallback(() => {
    onPrint(columns);
  }, [onPrint, columns]);

  const isCompact = size === 'compact';

  return (
    <div className={`inline-flex items-center rounded-${isCompact ? 'lg' : 'xl'} border ${isCompact ? 'border-slate-800 bg-slate-900/80' : 'border-slate-700 bg-slate-800'} p-0.5 shadow-xs`}>
      <button
        type="button"
        onClick={handlePrintClick}
        className={`inline-flex items-center gap-1.5 ${isCompact ? 'px-2.5 py-1 text-slate-300 hover:text-emerald-300 text-xs font-semibold hover:bg-slate-800 rounded-md' : 'px-2.5 py-1 text-slate-200 text-xs font-semibold hover:bg-slate-700 rounded-lg'} transition-all cursor-pointer`}
        title={`Print Physical Checklist (${columns} column${columns > 1 ? 's to save paper' : ''})`}
      >
        <Printer className={`w-3.5 h-3.5 ${isCompact ? 'text-emerald-400' : 'text-slate-300'} shrink-0`} />
        <span className={isCompact ? 'hidden md:inline' : ''}>Print ({columns}C)</span>
      </button>
      <div className={`h-3.5 w-px ${isCompact ? 'bg-slate-800' : 'bg-slate-700'} mx-0.5`} />
      {([1, 2, 3, 4] as const).map((cols) => (
        <button
          key={cols}
          type="button"
          onClick={() => handleSelectColumns(cols)}
          className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
            columns === cols
              ? 'bg-emerald-600 text-white'
              : isCompact
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          }`}
          title={`Print in ${cols} column${cols > 1 ? 's (saves paper)' : ''}`}
        >
          {`${cols}C`}
        </button>
      ))}
    </div>
  );
});
