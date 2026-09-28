import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Loader2,
  FileText,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Deck } from '../types/mtg';
import { getExportFilenameBase } from '../utils/deckExport';
import { DeckService } from '../services/deckService';
import { MTG_COLOR_NAMES, getDeckColorName } from '../utils/deckUtils';

interface GameSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: Deck;
}

export const GameSummaryModal: React.FC<GameSummaryModalProps> = ({
  isOpen,
  onClose,
  deck,
}) => {
  const defaultColor = getDeckColorName(deck);
  const [selectedColor, setSelectedColor] = useState<string>(defaultColor);
  const [bbCode, setBbCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchSummary = async (colorToFetch: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Calls /mtgtools/getbbcode?color={color}&bbCodeType=3
      const result = await DeckService.getBBCode(colorToFetch, 3);
      setBbCode(result);
    } catch (err: any) {
      console.error('Failed to load Game Summary BBCode:', err);
      setError(err.message || 'Failed to fetch Game Summary BBCode from API');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const initialCol = getDeckColorName(deck);
      setSelectedColor(initialCol);
      fetchSummary(initialCol);
    }
  }, [isOpen, deck.id]);

  const handleColorChange = (newColor: string) => {
    setSelectedColor(newColor);
    fetchSummary(newColor);
  };

  const handleCopy = async () => {
    if (!bbCode) return;
    try {
      await navigator.clipboard.writeText(bbCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleDownload = () => {
    if (!bbCode) return;
    const blob = new Blob([bbCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filenameBase = getExportFilenameBase(deck);
    link.download = `${filenameBase} Game Summary.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Game Summary BBCode</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-700/50">
                  BBCodeType 3
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Generated via <code className="text-indigo-300 font-mono text-[11px]">/mtgtools/getbbcode</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar / Options */}
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Color Style:</span>
            </label>
            <select
              value={selectedColor}
              onChange={(e) => handleColorChange(e.target.value)}
              disabled={isLoading}
              className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer"
            >
              {[...MTG_COLOR_NAMES].sort((a, b) => a.localeCompare(b)).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchSummary(selectedColor)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              title="Regenerate BBCode"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={isLoading || !bbCode}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy BBCode'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={isLoading || !bbCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              title="Download BBCode as .txt"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-sm">Fetching Game Summary BBCode from API...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex flex-col gap-2">
              <p className="font-semibold">Failed to generate Game Summary</p>
              <p className="text-xs text-red-400/90">{error}</p>
              <button
                type="button"
                onClick={() => fetchSummary(selectedColor)}
                className="self-start mt-2 px-3 py-1 bg-red-900/60 hover:bg-red-800/60 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="relative">
              <textarea
                value={bbCode}
                onChange={(e) => setBbCode(e.target.value)}
                rows={10}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-300/90 leading-relaxed focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-y"
                placeholder="Game Summary BBCode will appear here..."
                spellCheck={false}
              />
              <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Direct output from C# API (MTGNexus BBCode format)</span>
                <span>{bbCode.length} characters</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
