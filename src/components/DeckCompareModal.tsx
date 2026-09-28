import React, { useState, useEffect } from 'react';
import { 
  X,
  Trash2, 
  GitCompare, 
  Loader2, 
  Copy, 
  Check, 
  Download, 
  ArrowLeftRight, 
  AlertCircle, 
  PlusCircle, 
  MinusCircle, 
  FileText, 
  Layers,
  Code
} from 'lucide-react';
import { Deck, DeckHistoryItem, DeckComparisonSummaryResult, DeckCard } from '../types/mtg';
import { DeckService, parseTimestamp } from '../services/deckService';

interface DeckCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: Deck;
  historyList: DeckHistoryItem[];
  initialBaseId?: string;
  initialTargetId?: string;
  onDeleteIteration?: (historyId: string) => Promise<void> | void;
}

export const DeckCompareModal: React.FC<DeckCompareModalProps> = ({
  isOpen,
  onClose,
  deck,
  historyList,
  initialBaseId,
  initialTargetId = 'current',
  onDeleteIteration,
}) => {
  // If initialBaseId is provided, use it; otherwise default to the first (most recent) historical snapshot if available, or 'current'
  const defaultBaseId = initialBaseId || (historyList.length > 0 ? (historyList[0].id || historyList[0].historyId) : 'current');
  const [baseId, setBaseId] = useState<string>(defaultBaseId);
  const [targetId, setTargetId] = useState<string>(initialTargetId);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<DeckComparisonSummaryResult | null>(null);
  const [activeTab, setActiveTab] = useState<'diff' | 'visual' | 'summary'>('diff');
  const [copied, setCopied] = useState<boolean>(false);

  // Total cards accounting for individual card quantities (e.g. basic lands or playsets)
  const currentTotalCards = (deck.cards || []).reduce((sum, c) => sum + (c.quantity || 1), 0);

  // Helper to format date label
  const formatIterationLabel = (item: DeckHistoryItem, idx: number): string => {
    const ts = parseTimestamp(item.archivedAt);
    const d = new Date(ts);
    const dateStr = !isNaN(d.getTime())
      ? d.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : `Iteration #${historyList.length - idx}`;
    const cardsSum = Array.isArray(item.cards) && item.cards.length > 0
      ? item.cards.reduce((sum, c) => sum + (c.quantity || 1), 0)
      : undefined;
    const count = item.cardCount ?? cardsSum ?? item.totalCards ?? 0;
    return `${dateStr} (${count} cards)`;
  };

  const getIterationName = (id: string): string => {
    if (id === 'current') {
      return `Current Version (Live Draft - ${currentTotalCards} cards)`;
    }
    const idx = historyList.findIndex((h) => (h.id === id || h.historyId === id));
    if (idx !== -1) {
      return formatIterationLabel(historyList[idx], idx);
    }
    return `Snapshot ${id}`;
  };

  // Helper to resolve full cards for an iteration ID
  const resolveIterationCards = async (id: string): Promise<DeckCard[]> => {
    if (id === 'current') {
      return deck.cards || [];
    }
    const item = historyList.find((h) => (h.id === id || h.historyId === id));
    if (item && item.cards && item.cards.length > 0) {
      return item.cards;
    }
    // Asynchronously fetch snapshot from API
    const snapshot = await DeckService.getDeckHistorySnapshot(deck.id, id);
    if (snapshot && snapshot.cards && snapshot.cards.length > 0) {
      return snapshot.cards;
    }
    return [];
  };

  // Execute comparison via /mtgtools/comparefiles
  const handleRunComparison = async (overrideBaseId?: string, overrideTargetId?: string) => {
    const activeBaseId = overrideBaseId ?? baseId;
    const activeTargetId = overrideTargetId ?? targetId;
    if (!activeBaseId || !activeTargetId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [cardsA, cardsB] = await Promise.all([
        resolveIterationCards(activeBaseId),
        resolveIterationCards(activeTargetId),
      ]);

      const labelA = getIterationName(activeBaseId);
      const labelB = getIterationName(activeTargetId);

      const result = await DeckService.compareDeckIterations(cardsA, cardsB, {
        deckName: deck.name,
        versionAName: labelA,
        versionBName: labelB,
        commander: deck.commanderName,
      });

      setSummaryResult(result);
    } catch (err: any) {
      console.error('[DeckCompareModal] Comparison failed:', err);
      setError(err.message || 'Failed to compare deck iterations via /mtgtools/comparefiles');
    } finally {
      setIsLoading(false);
    }
  };

  // Sync initial selections and run initial comparison when modal opens
  useEffect(() => {
    if (isOpen) {
      const bId = initialBaseId || (historyList.length > 0 ? (historyList[0].id || historyList[0].historyId) : 'current');
      const tId = initialTargetId || 'current';
      setBaseId(bId);
      setTargetId(tId);
      setError(null);
      setCopied(false);
      handleRunComparison(bId, tId);
    }
  }, [isOpen, initialBaseId, initialTargetId]);

  // Swap Base and Target
  const handleSwap = () => {
    const newBase = targetId;
    const newTarget = baseId;
    setBaseId(newBase);
    setTargetId(newTarget);
    handleRunComparison(newBase, newTarget);
  };

  const handleBaseChange = (newBaseId: string) => {
    setBaseId(newBaseId);
    handleRunComparison(newBaseId, targetId);
  };

  const handleTargetChange = (newTargetId: string) => {
    setTargetId(newTargetId);
    handleRunComparison(baseId, newTargetId);
  };

  const handleCopySummary = async () => {
    if (!summaryResult) return;
    try {
      const textToCopy =
        activeTab === 'diff'
          ? (summaryResult.diffText || summaryResult.rawApiOutput)
          : activeTab === 'visual'
          ? (summaryResult.diffText || summaryResult.rawApiOutput)
          : summaryResult.summaryTextBlock;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
    }
  };

  const handleDownloadSummary = () => {
    if (!summaryResult) return;
    const textToDownload =
      activeTab === 'diff'
        ? (summaryResult.diffText || summaryResult.rawApiOutput)
        : summaryResult.summaryTextBlock;
    const safeDeckName = (deck.name || 'Deck').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const filename =
      activeTab === 'diff'
        ? `${safeDeckName}_Diff.txt`
        : `${safeDeckName}_Diff_Summary.txt`;
    const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h2 id="compare-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
                <span>Compare Deck Iterations</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-normal">
                  /mtgtools/comparefiles
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Compare composition between two versions of <span className="text-slate-200 font-semibold">{deck.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close comparison modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {historyList.length === 0 && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-violet-950/30 border border-violet-500/20 text-xs text-violet-300 flex items-center gap-2">
            <span>💡</span>
            <span>No saved iterations exist for this deck yet. Save changes to your deck to create historical snapshots for comparison.</span>
          </div>
        )}

        {/* Iteration Selectors Bar */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-col sm:flex-row items-center gap-3">
                    {/* Base Iteration Dropdown */}
          <div className="flex-1 w-full">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Base / Older Iteration
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={baseId}
                onChange={(e) => handleBaseChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 focus:outline-hidden focus:border-violet-500/50"
              >
                <option value="current">Current Version (Live Draft - {currentTotalCards} cards)</option>
                {historyList.map((item, idx) => {
                  const optKey = item.id || item.historyId || `base-${idx}`;
                  return (
                    <option key={optKey} value={optKey}>
                      {formatIterationLabel(item, idx)}
                    </option>
                  );
                })}
              </select>
              {baseId !== 'current' && onDeleteIteration && (
                <button
                  type="button"
                  onClick={async () => {
                    await onDeleteIteration(baseId);
                    const remaining = historyList.filter((h) => (h.id || h.historyId) !== baseId && h.historyId !== baseId);
                    const nextBase = remaining.length > 0 ? (remaining[0].id || remaining[0].historyId) : 'current';
                    setBaseId(nextBase);
                    handleRunComparison(nextBase, targetId);
                  }}
                  className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-400 hover:text-rose-200 transition-colors cursor-pointer shrink-0"
                  title="Delete this historical iteration"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Swap Button */}
          <div className="shrink-0 pt-4 sm:pt-4">
            <button
              type="button"
              onClick={handleSwap}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer shadow-xs"
              title="Swap Base and Comparison versions"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

                    {/* Target Iteration Dropdown */}
          <div className="flex-1 w-full">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Comparison / Newer Iteration
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={targetId}
                onChange={(e) => handleTargetChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 focus:outline-hidden focus:border-violet-500/50"
              >
                <option value="current">Current Version (Live Draft - {currentTotalCards} cards)</option>
                {historyList.map((item, idx) => {
                  const optKey = item.id || item.historyId || `target-${idx}`;
                  return (
                    <option key={optKey} value={optKey}>
                      {formatIterationLabel(item, idx)}
                    </option>
                  );
                })}
              </select>
              {targetId !== 'current' && onDeleteIteration && (
                <button
                  type="button"
                  onClick={async () => {
                    await onDeleteIteration(targetId);
                    const remaining = historyList.filter((h) => (h.id || h.historyId) !== targetId && h.historyId !== targetId);
                    const nextTarget = remaining.length > 0 ? (remaining[0].id || remaining[0].historyId) : 'current';
                    setTargetId(nextTarget);
                    handleRunComparison(baseId, nextTarget);
                  }}
                  className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-400 hover:text-rose-200 transition-colors cursor-pointer shrink-0"
                  title="Delete this historical iteration"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Re-run button */}
          <div className="shrink-0 pt-4 sm:pt-4 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleRunComparison()}
              disabled={isLoading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Comparing...</span>
                </>
              ) : (
                <>
                  <GitCompare className="w-4 h-4" />
                  <span>Compare</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {/* Loading State */}
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              <p className="text-sm font-medium">Comparing iterations via <code className="text-violet-300 font-mono">/mtgtools/comparefiles</code>...</p>
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 flex items-start gap-3 text-red-200">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">Comparison API Error</h4>
                <p className="text-xs mt-1 text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => handleRunComparison()}
                  className="mt-3 px-3 py-1 bg-red-900/60 hover:bg-red-800/80 border border-red-500/50 rounded-lg text-xs font-semibold text-red-100 transition-colors cursor-pointer"
                >
                  Retry API Request
                </button>
              </div>
            </div>
          )}

          {/* Success Result */}
          {!isLoading && !error && summaryResult && (
            <>
              {/* Metrics Header Summary Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MinusCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-medium text-slate-300">Cards Cut</span>
                  </div>
                  <span className="text-sm font-bold text-red-400">
                    -{summaryResult.cutsCount}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlusCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-medium text-slate-300">Cards Added</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400">
                    +{summaryResult.addsCount}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-medium text-slate-300">Net Card Change</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    summaryResult.netChange > 0 
                      ? 'text-emerald-400' 
                      : summaryResult.netChange < 0 
                      ? 'text-red-400' 
                      : 'text-slate-300'
                  }`}>
                    {summaryResult.netChange > 0 ? `+${summaryResult.netChange}` : summaryResult.netChange} cards
                  </span>
                </div>
              </div>

              {/* View Tabs & Actions Bar */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('diff')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'diff'
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>API Differences ([deck])</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('visual')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'visual'
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Side-by-Side Breakdown</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('summary')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'summary'
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Summary Report</span>
                  </button>
                </div>

                {/* Copy & Download Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
                    title={activeTab === 'diff' ? 'Copy API differences to clipboard' : 'Copy Deck Summary report to clipboard'}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>{activeTab === 'diff' || activeTab === 'visual' ? 'Copy Diff' : 'Copy Summary'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSummary}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
                    title="Download active difference text as .txt"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Tab 1: API Differences Output ([deck] BBCode) */}
              {activeTab === 'diff' && (
                <div className="relative flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-slate-400">
                      Differences returned from remote API (<code className="text-violet-300">/mtgtools/comparefiles</code>):
                    </span>
                    {(summaryResult.diffText || summaryResult.rawApiOutput).includes('[deck') && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-violet-950/80 text-violet-300 border border-violet-500/30 font-mono">
                        BBCode [deck] Format
                      </span>
                    )}
                  </div>
                  <textarea
                    readOnly
                    value={summaryResult.diffText || summaryResult.rawApiOutput}
                    className="w-full h-80 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 leading-relaxed resize-none focus:outline-hidden focus:border-violet-500/50 selection:bg-violet-600/30"
                  />
                </div>
              )}

              {/* Tab 2: Visual Side-by-Side Breakdown */}
              {activeTab === 'visual' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  {/* Cuts Column */}
                  <div className="bg-slate-950/70 border border-red-500/20 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-red-500/20 pb-2">
                      <div className="flex items-center gap-2">
                        <MinusCircle className="w-4 h-4 text-red-400" />
                        <span className="text-xs font-bold text-red-300 uppercase tracking-wider">Cuts</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-950 text-red-400 font-bold border border-red-500/30">
                        {summaryResult.cutsCount} cards
                      </span>
                    </div>

                    <div className="overflow-y-auto max-h-72 space-y-1 pr-1">
                      {summaryResult.cutCards.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-4 text-center">No cards cut between these iterations.</p>
                      ) : (
                        summaryResult.cutCards.map((c, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-red-950/15 border border-red-500/10 text-xs">
                            <span className="text-slate-200 font-medium">{c.name}</span>
                            <span className="px-1.5 py-0.5 rounded-md bg-red-900/40 text-red-300 font-mono font-bold text-[11px]">
                              -{c.quantity}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Adds Column */}
                  <div className="bg-slate-950/70 border border-emerald-500/20 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                      <div className="flex items-center gap-2">
                        <PlusCircle className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Adds</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-500/30">
                        {summaryResult.addsCount} cards
                      </span>
                    </div>

                    <div className="overflow-y-auto max-h-72 space-y-1 pr-1">
                      {summaryResult.addedCards.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-4 text-center">No cards added between these iterations.</p>
                      ) : (
                        summaryResult.addedCards.map((c, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-emerald-950/15 border border-emerald-500/10 text-xs">
                            <span className="text-slate-200 font-medium">{c.name}</span>
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-900/40 text-emerald-300 font-mono font-bold text-[11px]">
                              +{c.quantity}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Detailed Summary Report */}
              {activeTab === 'summary' && (
                <div className="relative flex-1">
                  <textarea
                    readOnly
                    value={summaryResult.summaryTextBlock}
                    className="w-full h-80 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 leading-relaxed resize-none focus:outline-hidden focus:border-violet-500/50"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Powered by Frostpoint API <code className="text-slate-400">/mtgtools/comparefiles</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
