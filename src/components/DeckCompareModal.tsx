import { useEscapeKey } from '../hooks/useEscapeKey';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
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
  Code,
  Plus
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
  onAddCard?: (cardName: string, cardData?: DeckCard) => void;
  onRemoveCard?: (cardName: string) => void;
}

export const DeckCompareModal: React.FC<DeckCompareModalProps> = ({
  isOpen,
  onClose,
  deck,
  historyList,
  initialBaseId,
  initialTargetId = 'current',
  onDeleteIteration,
  onAddCard,
  onRemoveCard,
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
  const [cardMap, setCardMap] = useState<Map<string, DeckCard>>(new Map());
  const [hoveredCard, setHoveredCard] = useState<{ name: string; imageUrl: string } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [actionFeedback, setActionFeedback] = useState<{ [cardName: string]: string }>({});
  const [cutsToggled, setCutsToggled] = useState<{ [cardName: string]: boolean }>({});
  const [addsToggled, setAddsToggled] = useState<{ [cardName: string]: boolean }>({});
  const [copiedCuts, setCopiedCuts] = useState<boolean>(false);
  const [copiedAdds, setCopiedAdds] = useState<boolean>(false);

  const handleCopyCuts = async () => {
    if (!summaryResult?.cutCards?.length) return;
    const text = summaryResult.cutCards.map((c) => `${c.quantity} ${c.name}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCuts(true);
      setTimeout(() => setCopiedCuts(false), 2000);
    } catch (err) {
      console.error('Failed to copy cuts:', err);
    }
  };

  const handleCopyAdds = async () => {
    if (!summaryResult?.addedCards?.length) return;
    const text = summaryResult.addedCards.map((c) => `${c.quantity} ${c.name}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAdds(true);
      setTimeout(() => setCopiedAdds(false), 2000);
    } catch (err) {
      console.error('Failed to copy adds:', err);
    }
  };

  const getCardImage = (name: string): string => {
    const c = cardMap.get(name.toLowerCase());
    if (c?.imageUrl) {
      return c.imageUrl.replace('version=small', 'version=normal');
    }
    if (c?.scryfallId) {
      return `https://api.scryfall.com/cards/${c.scryfallId}?format=image&version=normal`;
    }
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
  };

  const updateHoverPos = (clientX: number, clientY: number) => {
    const cardWidth = 240;
    const cardHeight = 336;
    const margin = 20;

    let x = clientX + margin;
    if (x + cardWidth > window.innerWidth - margin) {
      x = clientX - cardWidth - margin;
    }

    let y = clientY - cardHeight / 2;
    if (y < margin) y = margin;
    if (y + cardHeight > window.innerHeight - margin) {
      y = window.innerHeight - cardHeight - margin;
    }

    setHoverPos({ x, y });
  };

  const handleMouseEnterCard = (name: string, e: React.MouseEvent) => {
    const imageUrl = getCardImage(name);
    setHoveredCard({ name, imageUrl });
    updateHoverPos(e.clientX, e.clientY);
  };

  const handleMouseMoveCard = (e: React.MouseEvent) => {
    updateHoverPos(e.clientX, e.clientY);
  };

  const handleMouseLeaveCard = () => {
    setHoveredCard(null);
  };

  const handleAddToDeck = (cardName: string) => {
    const cardData = cardMap.get(cardName.toLowerCase());
    onAddCard?.(cardName, cardData);
    setActionFeedback((prev) => ({ ...prev, [cardName]: 'Added' }));
    setTimeout(() => {
      setActionFeedback((prev) => {
        const next = { ...prev };
        delete next[cardName];
        return next;
      });
    }, 2000);
  };

  const handleRemoveFromDeck = (cardName: string) => {
    onRemoveCard?.(cardName);
    setActionFeedback((prev) => ({ ...prev, [cardName]: 'Removed' }));
    setTimeout(() => {
      setActionFeedback((prev) => {
        const next = { ...prev };
        delete next[cardName];
        return next;
      });
    }, 2000);
  };

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

      const map = new Map<string, DeckCard>();
      (deck.cards || []).forEach((c) => map.set(c.name.toLowerCase(), c));
      cardsA.forEach((c) => map.set(c.name.toLowerCase(), c));
      cardsB.forEach((c) => map.set(c.name.toLowerCase(), c));
      setCardMap(map);

      const labelA = getIterationName(activeBaseId);
      const labelB = getIterationName(activeTargetId);

      const result = await DeckService.compareDeckIterations(cardsA, cardsB, {
        deckName: deck.name,
        versionAName: labelA,
        versionBName: labelB,
        commander: deck.commanderName,
      });

      setSummaryResult(result);
      setCutsToggled({});
      setAddsToggled({});
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

  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

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
                    <span>BBCode</span>
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
                    title={activeTab === 'diff' ? 'Copy BBCode differences to clipboard' : 'Copy Deck Summary report to clipboard'}
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

              {/* Tab 1: BBCode Output */}
              {activeTab === 'diff' && (
                <div className="relative flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-slate-400">
                      BBCode differences:
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
                <div className="flex flex-col gap-3 flex-1">
                  {/* Live Deck Target Indicator */}
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 relative shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-slate-300 font-medium">
                        Target Deck: <span className="text-emerald-300 font-semibold">{deck.name} (Live Current Deck)</span>
                      </span>
                      <span className="text-slate-500 hidden sm:inline">• Add & Delete buttons only modify your live current deck</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80">
                      {deck.cards?.reduce((s, c) => s + c.quantity, 0) || 0} cards in live deck
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  {/* Cuts Column */}
                  <div className="bg-slate-950/70 border border-red-500/20 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-red-500/20 pb-2">
                      <div className="flex items-center gap-2">
                        <MinusCircle className="w-4 h-4 text-red-400" />
                        <span className="text-xs font-bold text-red-300 uppercase tracking-wider">Cuts</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {summaryResult.cutCards.length > 0 && (
                          <button
                            type="button"
                            onClick={handleCopyCuts}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-500/30 transition-colors cursor-pointer"
                            title="Copy list of cut cards to clipboard"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedCuts ? 'Copied!' : 'Copy'}</span>
                          </button>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-950 text-red-400 font-bold border border-red-500/30">
                          {summaryResult.cutsCount} cards
                        </span>
                      </div>
                    </div>

                    <div className="overflow-y-auto max-h-72 space-y-1 pr-1">
                      {summaryResult.cutCards.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-4 text-center">No cards cut between these iterations.</p>
                      ) : (
                        summaryResult.cutCards.map((c, i) => {
                          const isAdded = cutsToggled[c.name] ?? false;
                          return (
                            <div
                              key={i}
                              onMouseEnter={(e) => handleMouseEnterCard(c.name, e)}
                              onMouseMove={handleMouseMoveCard}
                              onMouseLeave={handleMouseLeaveCard}
                              className="group flex items-center justify-between p-2 rounded-lg bg-red-950/20 hover:bg-red-950/40 border border-red-500/15 hover:border-red-500/30 text-xs transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                <span className="text-slate-200 font-medium truncate group-hover:text-red-200">{c.name}</span>
                                <span className="px-1.5 py-0.5 rounded-md bg-red-900/40 text-red-300 font-mono font-bold text-[10px] shrink-0">
                                  -{c.quantity}
                                </span>
                              </div>

                              <div
                                onMouseEnter={(e) => {
                                  e.stopPropagation();
                                  setHoveredCard(null);
                                }}
                                onMouseMove={(e) => {
                                  e.stopPropagation();
                                  setHoveredCard(null);
                                }}
                                onMouseLeave={(e) => {
                                  handleMouseEnterCard(c.name, e);
                                }}
                                className="flex items-center gap-1.5 shrink-0"
                              >
                                {isAdded ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveFromDeck(c.name);
                                      setCutsToggled((prev) => ({ ...prev, [c.name]: false }));
                                    }}
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      setHoveredCard(null);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-950/80 hover:bg-red-800 border border-red-700/50 text-red-200 hover:text-white text-[11px] font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
                                    title={`Delete ${c.name} from live current deck`}
                                  >
                                    <Trash2 className="w-3 h-3 text-red-400" />
                                    <span>Delete</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddToDeck(c.name);
                                      setCutsToggled((prev) => ({ ...prev, [c.name]: true }));
                                    }}
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      setHoveredCard(null);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-800 border border-emerald-700/50 text-emerald-200 hover:text-white text-[11px] font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
                                    title={`Add ${c.name} back to live current deck`}
                                  >
                                    <Plus className="w-3 h-3 text-emerald-400" />
                                    <span>Add</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
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
                      <div className="flex items-center gap-2">
                        {summaryResult.addedCards.length > 0 && (
                          <button
                            type="button"
                            onClick={handleCopyAdds}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                            title="Copy list of added cards to clipboard"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedAdds ? 'Copied!' : 'Copy'}</span>
                          </button>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-500/30">
                          {summaryResult.addsCount} cards
                        </span>
                      </div>
                    </div>

                    <div className="overflow-y-auto max-h-72 space-y-1 pr-1">
                      {summaryResult.addedCards.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-4 text-center">No cards added between these iterations.</p>
                      ) : (
                        summaryResult.addedCards.map((c, i) => {
                          const isDeleted = addsToggled[c.name] ?? false;
                          return (
                            <div
                              key={i}
                              onMouseEnter={(e) => handleMouseEnterCard(c.name, e)}
                              onMouseMove={handleMouseMoveCard}
                              onMouseLeave={handleMouseLeaveCard}
                              className="group flex items-center justify-between p-2 rounded-lg bg-emerald-950/20 hover:bg-emerald-950/40 border border-emerald-500/15 hover:border-emerald-500/30 text-xs transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                <span className="text-slate-200 font-medium truncate group-hover:text-emerald-200">{c.name}</span>
                                <span className="px-1.5 py-0.5 rounded-md bg-emerald-900/40 text-emerald-300 font-mono font-bold text-[10px] shrink-0">
                                  +{c.quantity}
                                </span>
                              </div>

                              <div
                                onMouseEnter={(e) => {
                                  e.stopPropagation();
                                  setHoveredCard(null);
                                }}
                                onMouseMove={(e) => {
                                  e.stopPropagation();
                                  setHoveredCard(null);
                                }}
                                onMouseLeave={(e) => {
                                  handleMouseEnterCard(c.name, e);
                                }}
                                className="flex items-center gap-1.5 shrink-0"
                              >
                                {isDeleted ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddToDeck(c.name);
                                      setAddsToggled((prev) => ({ ...prev, [c.name]: false }));
                                    }}
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      setHoveredCard(null);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-800 border border-emerald-700/50 text-emerald-200 hover:text-white text-[11px] font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
                                    title={`Add ${c.name} back to live current deck`}
                                  >
                                    <Plus className="w-3 h-3 text-emerald-400" />
                                    <span>Add</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveFromDeck(c.name);
                                      setAddsToggled((prev) => ({ ...prev, [c.name]: true }));
                                    }}
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      setHoveredCard(null);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-950/80 hover:bg-red-800 border border-red-700/50 text-red-200 hover:text-white text-[11px] font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
                                    title={`Delete ${c.name} from live current deck`}
                                  >
                                    <Trash2 className="w-3 h-3 text-red-400" />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
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

        {/* Floating Card Image Preview on Hover */}
        {hoveredCard && (
          <div
            className="fixed pointer-events-none z-[100] transition-transform duration-75 ease-out drop-shadow-2xl"
            style={{
              left: `${hoverPos.x}px`,
              top: `${hoverPos.y}px`,
            }}
          >
            <div className="w-60 aspect-[5/7] rounded-2xl overflow-hidden border-2 border-violet-500/70 shadow-2xl shadow-black/90 bg-slate-950">
              <img
                src={hoveredCard.imageUrl}
                alt={hoveredCard.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (!e.currentTarget.src.includes('format=image')) {
                    e.currentTarget.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(hoveredCard.name)}&format=image&version=normal`;
                  }
                }}
              />
            </div>
          </div>
        )}

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
