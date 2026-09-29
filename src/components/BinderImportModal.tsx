import React, { useState } from 'react';
import { Upload, FileText, Check, AlertCircle, Loader2, X, Bookmark, Sparkles } from 'lucide-react';
import { Binder } from '../types/mtg';
import { DeckService } from '../services/deckService';
import { parseCollectionCsv, convertParsedCardsToCollectionCards } from '../utils/csvCollectionParser';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface BinderImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingBinders: Binder[];
  onImportComplete: (binder: Binder) => void;
}

export const BinderImportModal: React.FC<BinderImportModalProps> = ({
  isOpen,
  onClose,
  existingBinders,
  onImportComplete,
}) => {
  useBodyScrollLock(isOpen);
  const [csvText, setCsvText] = useState('');
  const [binderMode, setBinderMode] = useState<'new' | 'existing'>('new');
  const [newBinderName, setNewBinderName] = useState('Imported Collection Binder');
  const [selectedBinderId, setSelectedBinderId] = useState<string>(
    existingBinders[0]?.id || ''
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<{ regular: number; foil: number; totalRows: number } | null>(null);

  if (!isOpen) return null;

  const handleTextChange = (text: string) => {
    setCsvText(text);
    if (!text.trim()) {
      setPreviewCount(null);
      return;
    }
    try {
      const parsed = parseCollectionCsv(text);
      let regular = 0;
      let foil = 0;
      parsed.forEach((p) => {
        regular += p.quantityRegular;
        foil += p.quantityFoil;
      });
      setPreviewCount({ regular, foil, totalRows: parsed.length });
    } catch {
      setPreviewCount(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        handleTextChange(content);
        if (binderMode === 'new' && file.name) {
          const suggested = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          if (suggested) {
            setNewBinderName(suggested.charAt(0).toUpperCase() + suggested.slice(1));
          }
        }
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) return;

    setIsProcessing(true);
    setStatusMessage('Parsing CSV and calculating card quantities...');

    try {
      const parsed = parseCollectionCsv(csvText);
      if (parsed.length === 0) {
        throw new Error('No valid cards found in the CSV. Please ensure the CSV contains card names and quantities.');
      }

      let targetBinderId = selectedBinderId;
      let targetBinder: Binder | undefined;

      if (binderMode === 'new' || !targetBinderId) {
        setStatusMessage('Creating binder...');
        targetBinder = await DeckService.createBinder(
          newBinderName.trim() || 'Imported Binder',
          `Imported from CSV collection (${parsed.length} entries)`
        );
        targetBinderId = targetBinder.id;
      } else {
        targetBinder = existingBinders.find((b) => b.id === targetBinderId);
      }

      if (!targetBinder) {
        targetBinder = await DeckService.createBinder('Imported Binder');
        targetBinderId = targetBinder.id;
      }

      setStatusMessage(`Adding ${parsed.length} card entries to binder...`);
      const newCollectionCards = convertParsedCardsToCollectionCards(parsed, targetBinderId);

      const existingCards = targetBinder.cards || [];
      const updatedBinder: Binder = {
        ...targetBinder,
        cards: [...existingCards, ...newCollectionCards],
        updatedAt: Date.now(),
      };

      await DeckService.saveBinder(updatedBinder);

      // Background price & card detail refresh
      setStatusMessage('Enriching cards with Scryfall card data in background...');
      DeckService.refreshCollectionPrices(newCollectionCards).catch(() => {});

      onImportComplete(updatedBinder);
      onClose();
    } catch (err: any) {
      console.error('[BinderImportModal] Import error:', err);
      setStatusMessage(`Error: ${err?.message || 'Failed to import collection'}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-950/80 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Import Collection into Binder</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  CSV Support
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Upload or paste your CSV collection with card names, quantities, and Scryfall IDs.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Binder Selector */}
        <div className="space-y-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
          <div className="flex items-center gap-4 text-xs font-bold">
            <label className="flex items-center gap-2 cursor-pointer text-slate-200">
              <input
                type="radio"
                name="binderMode"
                checked={binderMode === 'new'}
                onChange={() => setBinderMode('new')}
                className="text-emerald-500 focus:ring-emerald-500"
              />
              <span>Create New Binder</span>
            </label>
            {existingBinders.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                <input
                  type="radio"
                  name="binderMode"
                  checked={binderMode === 'existing'}
                  onChange={() => setBinderMode('existing')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span>Add to Existing Binder</span>
              </label>
            )}
          </div>

          {binderMode === 'new' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                New Binder Name
              </label>
              <input
                type="text"
                value={newBinderName}
                onChange={(e) => setNewBinderName(e.target.value)}
                placeholder="e.g. My Vintage Collection, Foil Binder"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Select Existing Binder
              </label>
              <select
                value={selectedBinderId}
                onChange={(e) => setSelectedBinderId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {existingBinders.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.cards?.length || 0} cards)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* File Upload or Textarea */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV File / Content</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/sample-collection.csv');
                    if (res.ok) {
                      const txt = await res.text();
                      handleTextChange(txt);
                      setNewBinderName('Vintage Collection & Staples');
                    }
                  } catch (err) {
                    console.error('Failed to load sample CSV:', err);
                  }
                }}
                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                title="Load sample collection containing Timetwister, Taiga, and foils"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Sample CSV</span>
              </button>
              <label className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload .csv File</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={7}
            placeholder={`"Oracle Name","ID: Scryfall","ID: Gatherer","Haves: Paper","Haves: Foil","Haves: Etched"\n"Red Elemental Blast","4fafd3f9-f7de-4d6e-8824-6b60866fc50f",512,1,0,0\n"Taiga","01006833-6007-4c16-9ebb-20d31c60a57a",883,1,1,0`}
            className="w-full p-3 font-mono text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-300 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Supports columns: <strong>Oracle Name</strong>, <strong>ID: Scryfall</strong>, <strong>Haves: Paper</strong>, <strong>Haves: Foil</strong>, and <strong>Haves: Etched</strong>.
            </span>
            <span className="text-emerald-400 font-medium">
              Etched is treated as Foil
            </span>
          </div>
        </div>

        {/* Preview Summary */}
        {previewCount && (
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Found <strong>{previewCount.totalRows}</strong> unique cards: <strong>{previewCount.regular}</strong> Regular, <strong>{previewCount.foil}</strong> Foil (including Etched).
              </span>
            </div>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              Total {previewCount.regular + previewCount.foil} cards
            </span>
          </div>
        )}

        {statusMessage && (
          <div className="text-xs text-amber-300 flex items-center gap-2 bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/30">
            {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isProcessing || !csvText.trim() || !previewCount}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Create & Import Binder</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
