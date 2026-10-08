import React, { useState, useMemo } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Copy, Check, Download, AlertTriangle, X, Code, FileText, Search } from 'lucide-react';

export interface JsonErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  errorMessage?: string;
  rawJson: string;
}

export const JsonErrorModal: React.FC<JsonErrorModalProps> = ({
  isOpen,
  onClose,
  title = 'JSON Parsing Error Inspector',
  errorMessage,
  rawJson,
}) => {
  useEscapeKey(onClose, isOpen);
  useBodyScrollLock(isOpen);

  const [hasCopied, setHasCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'raw' | 'formatted'>('raw');
  const [searchFilter, setSearchFilter] = useState('');

  // Attempt to parse & format JSON if valid
  const { formattedJson, isValidJson, parseError } = useMemo(() => {
    if (!rawJson) return { formattedJson: '', isValidJson: false, parseError: 'Empty input' };
    try {
      const parsed = JSON.parse(rawJson);
      return {
        formattedJson: JSON.stringify(parsed, null, 2),
        isValidJson: true,
        parseError: null,
      };
    } catch (err: any) {
      // Try cleaning markdown code fences or trailing commas for preview
      try {
        const cleaned = rawJson
          .replace(/```(?:json)?/gi, '')
          .replace(/,\s*([\}\]])/g, '$1')
          .trim();
        const parsedCleaned = JSON.parse(cleaned);
        return {
          formattedJson: JSON.stringify(parsedCleaned, null, 2),
          isValidJson: true,
          parseError: 'Parsed with minor cleanup (stripped markdown/trailing commas)',
        };
      } catch (_subErr) {
        return {
          formattedJson: rawJson,
          isValidJson: false,
          parseError: err?.message || 'Invalid JSON syntax',
        };
      }
    }
  }, [rawJson]);

  const activeText = viewMode === 'formatted' && isValidJson ? formattedJson : rawJson;

  const lines = useMemo(() => {
    if (!activeText) return [];
    return activeText.split('\n');
  }, [activeText]);

  const filteredLines = useMemo(() => {
    if (!searchFilter.trim()) return lines.map((text, idx) => ({ lineNum: idx + 1, text }));
    const query = searchFilter.toLowerCase();
    return lines
      .map((text, idx) => ({ lineNum: idx + 1, text }))
      .filter((item) => item.text.toLowerCase().includes(query));
  }, [lines, searchFilter]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeText);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([activeText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `json-error-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-amber-500/30">
        
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
              <Code className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">
                {title}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Full raw JSON text &amp; diagnostic output inspector
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close JSON Inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner Detail */}
        {(errorMessage || parseError) && (
          <div className="px-5 py-3 bg-amber-950/40 border-b border-amber-800/40 flex items-start gap-3 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200 font-mono leading-relaxed min-w-0 flex-1 break-words">
              {errorMessage && <div className="font-bold text-amber-300">{errorMessage}</div>}
              {parseError && <div className="text-amber-400/90 text-[11px] mt-0.5">Parse status: {parseError}</div>}
            </div>
          </div>
        )}

        {/* Toolbar Controls */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-3 flex-wrap shrink-0">
          {/* Format View Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'raw'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Raw JSON ({lines.length} lines)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('formatted')}
              disabled={!isValidJson}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                !isValidJson
                  ? 'text-slate-600 cursor-not-allowed'
                  : viewMode === 'formatted'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs cursor-pointer'
                  : 'text-slate-400 hover:text-white cursor-pointer'
              }`}
              title={isValidJson ? 'Pretty-print formatted JSON' : 'Syntax error prevents pretty-printing'}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Pretty-Print</span>
            </button>
          </div>

          {/* Quick Filter Search */}
          <div className="relative flex-1 max-w-xs min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search in JSON..."
              className="w-full pl-8 pr-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          {/* Actions: Copy & Download */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95"
              title="Copy entire JSON to clipboard"
            >
              {hasCopied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Entire JSON</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              title="Download JSON as .json file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download File</span>
            </button>
          </div>
        </div>

        {/* Scrollable Code Viewer */}
        <div className="p-4 flex-1 overflow-auto bg-slate-950/90 font-mono text-xs text-slate-200 leading-relaxed select-text">
          {filteredLines.length === 0 ? (
            <div className="text-center py-12 text-slate-500 italic">
              No matching text lines found for &quot;{searchFilter}&quot;
            </div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {filteredLines.map(({ lineNum, text }) => (
                  <tr key={lineNum} className="hover:bg-amber-500/10 transition-colors group">
                    <td className="w-12 pr-4 text-right select-none text-slate-600 group-hover:text-amber-400/80 text-[11px] border-r border-slate-800/80 sticky left-0 bg-slate-950">
                      {lineNum}
                    </td>
                    <td className="pl-4 whitespace-pre-wrap break-all text-amber-100/90 font-mono">
                      {text || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>
            {lines.length} lines · {new Blob([activeText]).size} bytes
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
