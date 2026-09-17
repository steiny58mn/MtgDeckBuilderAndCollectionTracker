import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Code, 
  Globe, 
  Upload,
  Info,
  AlertCircle,
  Save,
  Layers,
  Sparkles,
  Crown,
  FileCode
} from 'lucide-react';
import { Deck, DeckCard, MTGFormat, DeckCategory } from '../types/mtg';
import { 
  ExportFormatKey, 
  EXPORT_FORMATS, 
  generateExportContent, 
  generateMTGODekXml,
  generateExcelTSV,
  generateCSV,
  triggerFileDownload 
} from '../utils/deckExport';
import { 
  IMPORT_FORMATS, 
  parseDeckImport, 
  autoDetectFormat, 
  ParsedDeckImport 
} from '../utils/deckImport';
import { fetchBatchCardsCollection } from '../services/scryfall';

interface DeckExportModalProps {
  deck?: Deck | null;
  isOpen: boolean;
  onClose: () => void;
  onImportAsNewDeck: (newDeck: Deck, shouldSaveCurrentDeck: boolean) => Promise<void>;
  onImportAppendToDeck?: (cardsToAdd: DeckCard[]) => Promise<void>;
  initialTab?: 'export' | 'import';
}

export const DeckExportModal: React.FC<DeckExportModalProps> = ({
  deck,
  isOpen,
  onClose,
  onImportAsNewDeck,
  onImportAppendToDeck,
  initialTab = 'export',
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);
  
  // Export State
  const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormatKey>('bbcode');
  const [copied, setCopied] = useState(false);

  // Import State
  const [selectedImportFormat, setSelectedImportFormat] = useState<ExportFormatKey | 'auto'>('auto');
  const [importText, setImportText] = useState('');
  const [customDeckName, setCustomDeckName] = useState('');
  const [customDeckFormat, setCustomDeckFormat] = useState<MTGFormat>('commander');
  const [isResolvingCards, setIsResolvingCards] = useState(false);
  const [resolveProgress, setResolveProgress] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);

  // Confirmation Modal State (Save current deck before importing as new deck)
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset tab and states when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(deck ? initialTab : 'import');
      setImportError(null);
      setShowSaveConfirmModal(false);
    }
  }, [isOpen, initialTab, deck]);

  // Real-time live parse of input
  const parsedPreview = useMemo<ParsedDeckImport | null>(() => {
    if (!importText.trim()) return null;
    try {
      return parseDeckImport(importText, selectedImportFormat);
    } catch (e) {
      return null;
    }
  }, [importText, selectedImportFormat]);

  // Update default name and format when parsed preview changes
  useEffect(() => {
    if (parsedPreview && parsedPreview.cards.length > 0) {
      if (!customDeckName) {
        if (parsedPreview.deckName) {
          setCustomDeckName(parsedPreview.deckName);
        } else {
          const cmdrCard = parsedPreview.cards.find((c) => c.category === 'commander');
          if (cmdrCard) {
            setCustomDeckName(cmdrCard.name);
          } else {
            setCustomDeckName('Imported Deck');
          }
        }
      }
      if (parsedPreview.format) {
        setCustomDeckFormat(parsedPreview.format);
      }
    }
  }, [parsedPreview]);

  if (!isOpen) return null;

  // Export handlers
  const currentExportOption = EXPORT_FORMATS.find((f) => f.key === selectedExportFormat) || EXPORT_FORMATS[0];
  const exportedContent = deck ? generateExportContent(selectedExportFormat, deck) : '';

  const handleCopyExport = (textToCopy?: string) => {
    if (!deck) return;
    const text = textToCopy || (selectedExportFormat === 'excel' ? generateExcelTSV(deck) : exportedContent);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleDownloadExport = () => {
    if (!deck) return;
    const safeTitle = (deck.name || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (selectedExportFormat === 'excel') {
      triggerFileDownload(
        exportedContent,
        `${safeTitle}_collection.xls`,
        currentExportOption.mimeType
      );
    } else {
      triggerFileDownload(
        exportedContent,
        `${safeTitle}_${selectedExportFormat}.${currentExportOption.fileExtension}`,
        currentExportOption.mimeType
      );
    }
  };

  const handleDownloadMTGODek = () => {
    if (!deck) return;
    const safeTitle = (deck.name || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const dekXml = generateMTGODekXml(deck);
    triggerFileDownload(dekXml, `${safeTitle}.dek`, 'application/xml;charset=utf-8');
  };

  const handleDownloadExcelCSV = () => {
    if (!deck) return;
    const safeTitle = (deck.name || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const csvData = generateCSV(deck);
    triggerFileDownload(csvData, `${safeTitle}_excel.csv`, 'text/csv;charset=utf-8');
  };

  // File Upload handler for Import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setImportText(content);
        // If file has name, suggest as deck name
        const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
        if (!customDeckName) {
          setCustomDeckName(cleanFileName);
        }
        // Auto select format if obvious extension
        if (file.name.endsWith('.dek') || file.name.endsWith('.xml')) {
          setSelectedImportFormat('mtgo');
        } else if (file.name.endsWith('.csv')) {
          setSelectedImportFormat('csv');
        } else if (file.name.endsWith('.tsv')) {
          setSelectedImportFormat('excel');
        }
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  // Drag and drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setImportText(content);
        const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
        if (!customDeckName) {
          setCustomDeckName(cleanFileName);
        }
        if (file.name.endsWith('.dek') || file.name.endsWith('.xml')) {
          setSelectedImportFormat('mtgo');
        } else if (file.name.endsWith('.csv')) {
          setSelectedImportFormat('csv');
        } else if (file.name.endsWith('.tsv')) {
          setSelectedImportFormat('excel');
        }
      }
    };
    reader.readAsText(file);
  };

  // Execute Import Core
  const executeNewDeckImport = async (shouldSaveCurrentDeck: boolean) => {
    if (!parsedPreview || parsedPreview.cards.length === 0) {
      setImportError('No recognized card entries to import. Please check format or paste decklist text.');
      return;
    }

    setIsResolvingCards(true);
    setImportError(null);
    setResolveProgress('Resolving cards with Scryfall database...');

    try {
      // 1. Batch fetch card metadata via Scryfall Collection
      const cardsToFetch = parsedPreview.cards.map((c) => ({ name: c.name, set: c.set }));
      const scryfallMap = await fetchBatchCardsCollection(cardsToFetch);

      setResolveProgress('Assembling deck and categories...');

      // 2. Build full DeckCard instances
      const resolvedCards: DeckCard[] = parsedPreview.cards.map((item, idx) => {
        const exactLower = item.name.toLowerCase().trim();
        const frontLower = exactLower.split(' // ')[0].trim();
        const matchedScry = scryfallMap.get(exactLower) || scryfallMap.get(frontLower);

        return {
          id: `card-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          scryfallId: matchedScry?.id || `custom-${Date.now()}-${idx}`,
          name: matchedScry?.name || item.name,
          set: matchedScry?.set || item.set,
          set_name: matchedScry?.set_name,
          collector_number: matchedScry?.collector_number || item.collector_number,
          category: item.category,
          quantity: item.quantity,
          mana_cost: matchedScry?.mana_cost,
          cmc: matchedScry?.cmc,
          type_line: matchedScry?.type_line,
          colors: matchedScry?.colors,
          color_identity: matchedScry?.color_identity,
          rarity: matchedScry?.rarity,
          imageUrl: matchedScry?.image_uris?.normal || matchedScry?.card_faces?.[0]?.image_uris?.normal,
          priceUsd: matchedScry?.prices?.usd ? parseFloat(matchedScry.prices.usd) : undefined,
          priceUsdFoil: matchedScry?.prices?.usd_foil ? parseFloat(matchedScry.prices.usd_foil) : undefined,
          isFoil: item.isFoil,
        };
      });

      // 3. Extract commander details
      const cmdrCards = resolvedCards.filter((c) => c.category === 'commander');
      const commanderName = cmdrCards.length > 1
        ? cmdrCards.map((c) => c.name).join(' // ')
        : cmdrCards[0]?.name;
      const commanderArtUrl = cmdrCards[0]?.imageUrl;

      const finalDeckName = customDeckName.trim() || 
        parsedPreview.deckName || 
        commanderName || 
        'Imported Deck';

      const newDeck: Deck = {
        id: `deck-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: finalDeckName,
        format: customDeckFormat || (cmdrCards.length > 0 ? 'commander' : 'casual'),
        description: `Imported via ${parsedPreview.detectedFormat.toUpperCase()} format with ${resolvedCards.reduce((s, c) => s + c.quantity, 0)} cards.`,
        cards: resolvedCards,
        commanderName,
        commanderArtUrl,
        coverCardUrl: commanderArtUrl || resolvedCards[0]?.imageUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await onImportAsNewDeck(newDeck, shouldSaveCurrentDeck);
      setShowSaveConfirmModal(false);
      onClose();
    } catch (err: any) {
      console.error('Import execution error:', err);
      setImportError('Import failed: ' + (err.message || 'Unknown error resolving cards'));
    } finally {
      setIsResolvingCards(false);
      setResolveProgress('');
    }
  };

  // Append to current deck
  const handleAppendToCurrentDeck = async () => {
    if (!parsedPreview || parsedPreview.cards.length === 0 || !onImportAppendToDeck) return;
    setIsResolvingCards(true);
    setImportError(null);
    setResolveProgress('Resolving cards with Scryfall database...');

    try {
      const cardsToFetch = parsedPreview.cards.map((c) => ({ name: c.name, set: c.set }));
      const scryfallMap = await fetchBatchCardsCollection(cardsToFetch);

      const resolvedCards: DeckCard[] = parsedPreview.cards.map((item, idx) => {
        const exactLower = item.name.toLowerCase().trim();
        const frontLower = exactLower.split(' // ')[0].trim();
        const matchedScry = scryfallMap.get(exactLower) || scryfallMap.get(frontLower);

        return {
          id: `card-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          scryfallId: matchedScry?.id || `custom-${Date.now()}-${idx}`,
          name: matchedScry?.name || item.name,
          set: matchedScry?.set || item.set,
          set_name: matchedScry?.set_name,
          collector_number: matchedScry?.collector_number || item.collector_number,
          category: item.category,
          quantity: item.quantity,
          mana_cost: matchedScry?.mana_cost,
          cmc: matchedScry?.cmc,
          type_line: matchedScry?.type_line,
          colors: matchedScry?.colors,
          color_identity: matchedScry?.color_identity,
          rarity: matchedScry?.rarity,
          imageUrl: matchedScry?.image_uris?.normal || matchedScry?.card_faces?.[0]?.image_uris?.normal,
          priceUsd: matchedScry?.prices?.usd ? parseFloat(matchedScry.prices.usd) : undefined,
          priceUsdFoil: matchedScry?.prices?.usd_foil ? parseFloat(matchedScry.prices.usd_foil) : undefined,
          isFoil: item.isFoil,
        };
      });

      await onImportAppendToDeck(resolvedCards);
      onClose();
    } catch (err: any) {
      setImportError('Error adding cards to current deck: ' + err.message);
    } finally {
      setIsResolvingCards(false);
      setResolveProgress('');
    }
  };

  const getFormatIcon = (key: ExportFormatKey | 'auto') => {
    switch (key) {
      case 'bbcode':
        return <Code className="w-4 h-4 text-fuchsia-400" />;
      case 'tappedout':
      case 'moxfield':
      case 'archidekt':
        return <Globe className="w-4 h-4 text-sky-400" />;
      case 'csv':
      case 'excel':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
      case 'auto':
        return <Sparkles className="w-4 h-4 text-fuchsia-400" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  // Stats for parsed preview
  const totalParsedCards = parsedPreview?.cards.reduce((s, c) => s + c.quantity, 0) || 0;
  const cmdrParsedCount = parsedPreview?.cards.filter((c) => c.category === 'commander').reduce((s, c) => s + c.quantity, 0) || 0;
  const mainParsedCount = parsedPreview?.cards.filter((c) => c.category === 'main').reduce((s, c) => s + c.quantity, 0) || 0;
  const sideParsedCount = parsedPreview?.cards.filter((c) => c.category === 'sideboard').reduce((s, c) => s + c.quantity, 0) || 0;
  const maybeParsedCount = parsedPreview?.cards.filter((c) => c.category === 'maybeboard').reduce((s, c) => s + c.quantity, 0) || 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div 
        className="relative z-10 w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 font-bold shrink-0">
              {activeTab === 'export' ? <Download className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{activeTab === 'export' ? 'Export Deck' : 'Import Deck'}</span>
                {deck && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-fuchsia-400 border border-slate-700 font-normal truncate max-w-[200px]">
                    {deck.name}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {activeTab === 'export'
                  ? 'Export in 8 community formats including MTGNexus BBCode, MTGO, TappedOut, and Excel.'
                  : 'Import from all 8 community formats: BBCode, TappedOut, Moxfield, MTGO (.dek/text), Archidekt, CSV, and Excel.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle: Export vs Import */}
        <div className="px-5 pt-2.5 pb-2 border-b border-slate-800 flex items-center gap-2 bg-slate-900">
          {deck && (
            <button
              onClick={() => setActiveTab('export')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-fuchsia-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Deck ({EXPORT_FORMATS.length} Formats)</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'import'
                ? 'bg-fuchsia-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Deck ({IMPORT_FORMATS.length} Formats)</span>
          </button>
        </div>

        {/* Modal Body */}
        {activeTab === 'export' && deck ? (
          /* =================== EXPORT TAB =================== */
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Format Selector Column */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/40 p-3 overflow-y-auto space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
                Select Format
              </div>
              {EXPORT_FORMATS.map((fmt) => {
                const isSelected = selectedExportFormat === fmt.key;
                return (
                  <button
                    key={fmt.key}
                    onClick={() => {
                      setSelectedExportFormat(fmt.key);
                      setCopied(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 text-fuchsia-300 font-bold border border-fuchsia-500/40 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getFormatIcon(fmt.key)}
                      <span className="truncate">{fmt.label}</span>
                    </div>
                    {fmt.badge && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono shrink-0 ${
                        isSelected 
                          ? 'bg-fuchsia-400/20 text-fuchsia-300 border border-fuchsia-400/30' 
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {fmt.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Preview & Action Column */}
            <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 bg-slate-900 overflow-y-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      {currentExportOption.label}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      .{currentExportOption.fileExtension}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {currentExportOption.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleCopyExport()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>{selectedExportFormat === 'excel' ? 'Copy TSV for Excel' : 'Copy'}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadExport}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .{currentExportOption.fileExtension}</span>
                  </button>
                </div>
              </div>

              {selectedExportFormat === 'mtgo' && (
                <div className="my-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Info className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Need the official Magic Online client file format?</span>
                  </div>
                  <button
                    onClick={handleDownloadMTGODek}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-950 border border-sky-700 text-sky-300 hover:bg-sky-900 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download .dek (XML)</span>
                  </button>
                </div>
              )}

              {selectedExportFormat === 'excel' && (
                <div className="my-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Multiple spreadsheet export options:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyExport(generateExcelTSV(deck))}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      Copy TSV Table
                    </button>
                    <button
                      onClick={handleDownloadExcelCSV}
                      className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-700 text-emerald-300 hover:bg-emerald-900 text-xs font-semibold cursor-pointer"
                    >
                      Download .CSV
                    </button>
                    <button
                      onClick={handleDownloadExport}
                      className="px-2.5 py-1 rounded-lg bg-fuchsia-500 text-slate-950 hover:bg-fuchsia-400 text-xs font-bold cursor-pointer"
                    >
                      Download .XLS
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 flex-1 min-h-[220px] flex flex-col">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Output Preview</span>
                  <span>{deck.cards.reduce((s, c) => s + c.quantity, 0)} total cards</span>
                </div>
                <textarea
                  readOnly
                  value={selectedExportFormat === 'excel' ? generateExcelTSV(deck) : exportedContent}
                  className="flex-1 w-full min-h-[220px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 focus:outline-none select-all resize-none"
                />
              </div>
            </div>
          </div>
        ) : (
          /* =================== IMPORT TAB =================== */
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Format Selector Column */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/40 p-3 overflow-y-auto space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
                Import Format
              </div>

              {/* Auto-detect option */}
              <button
                onClick={() => setSelectedImportFormat('auto')}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  selectedImportFormat === 'auto'
                    ? 'bg-slate-800 text-fuchsia-300 font-bold border border-fuchsia-500/40 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className="w-4 h-4 text-fuchsia-400" />
                  <span className="truncate">Auto-Detect</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-fuchsia-400/20 text-fuchsia-300 border border-fuchsia-400/30 shrink-0">
                  Smart
                </span>
              </button>

              <div className="pt-2 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2">
                Specific Formats
              </div>

              {IMPORT_FORMATS.map((fmt) => {
                const isSelected = selectedImportFormat === fmt.key;
                return (
                  <button
                    key={fmt.key}
                    onClick={() => setSelectedImportFormat(fmt.key)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 text-fuchsia-300 font-bold border border-fuchsia-500/40 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getFormatIcon(fmt.key)}
                      <span className="truncate">{fmt.label}</span>
                    </div>
                    {fmt.badge && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-slate-400 shrink-0">
                        {fmt.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Input & Parse Panel */}
            <div 
              className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 bg-slate-900 overflow-y-auto space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {/* Header Info & File Upload trigger */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Import Decklist
                    {selectedImportFormat !== 'auto' ? (
                      <span className="text-xs font-normal text-fuchsia-400">
                        ({IMPORT_FORMATS.find((f) => f.key === selectedImportFormat)?.label})
                      </span>
                    ) : (
                      parsedPreview?.detectedFormat && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                          Detected: {parsedPreview.detectedFormat.toUpperCase()}
                        </span>
                      )
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Paste text below or drag & drop / upload a file (.txt, .dek, .xml, .csv, .tsv, .xls).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".txt,.dek,.xml,.csv,.tsv,.xls,.xlsx"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    <span>Upload File</span>
                  </button>
                </div>
              </div>

              {/* Textarea Input */}
              <div className="flex-1 flex flex-col min-h-[180px]">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`Paste ${
                    selectedImportFormat === 'auto'
                      ? 'decklist in any format (BBCode, TappedOut, Moxfield, MTGO, Archidekt, CSV, Plain Text, Excel)...'
                      : IMPORT_FORMATS.find((f) => f.key === selectedImportFormat)?.sampleSyntax || 'decklist here...'
                  }`}
                  className="flex-1 w-full min-h-[180px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-fuchsia-500 resize-none"
                />
              </div>

              {/* Live Parsing Summary Banner */}
              {parsedPreview && parsedPreview.cards.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-bold text-white">
                        {totalParsedCards} Cards Parsed
                      </span>
                      <span className="text-[11px] text-slate-400">
                        ({cmdrParsedCount > 0 ? `${cmdrParsedCount} Cmdr, ` : ''}
                        {mainParsedCount} Main, {sideParsedCount} Side
                        {maybeParsedCount > 0 ? `, ${maybeParsedCount} Maybe` : ''})
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-fuchsia-400">
                      Format detected: {parsedPreview.detectedFormat.toUpperCase()}
                    </div>
                  </div>

                  {/* Deck Configuration Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400 block">
                        New Deck Name:
                      </label>
                      <input
                        type="text"
                        value={customDeckName}
                        onChange={(e) => setCustomDeckName(e.target.value)}
                        placeholder="Deck Title"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-fuchsia-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400 block">
                        Target Format:
                      </label>
                      <select
                        value={customDeckFormat}
                        onChange={(e) => setCustomDeckFormat(e.target.value as MTGFormat)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 capitalize"
                      >
                        <option value="commander">Commander / EDH</option>
                        <option value="standard">Standard</option>
                        <option value="modern">Modern</option>
                        <option value="pioneer">Pioneer</option>
                        <option value="legacy">Legacy</option>
                        <option value="vintage">Vintage</option>
                        <option value="pauper">Pauper</option>
                        <option value="casual">Casual</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {importError && (
                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Resolving Progress */}
              {isResolvingCards && (
                <div className="p-3 rounded-xl bg-fuchsia-950/40 border border-amber-700/60 text-xs text-fuchsia-300 flex items-center gap-2.5 animate-pulse">
                  <div className="w-4 h-4 border-2 border-fuchsia-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>{resolveProgress || 'Processing import...'}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    setImportText('');
                    setCustomDeckName('');
                    setImportError(null);
                  }}
                  disabled={isResolvingCards || !importText}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Clear
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Append to current deck button if active deck exists */}
                  {deck && onImportAppendToDeck && (
                    <button
                      onClick={handleAppendToCurrentDeck}
                      disabled={isResolvingCards || !parsedPreview || parsedPreview.cards.length === 0}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer disabled:opacity-50"
                      title="Add these cards into your currently opened deck"
                    >
                      Add to Current Deck
                    </button>
                  )}

                  {/* Primary: Import as New Deck */}
                  <button
                    onClick={() => {
                      if (!parsedPreview || parsedPreview.cards.length === 0) {
                        setImportError('Please enter cards to import first.');
                        return;
                      }
                      if (deck) {
                        // User has a current deck open: confirm whether to save before importing as new deck
                        setShowSaveConfirmModal(true);
                      } else {
                        // No active deck: proceed directly
                        executeNewDeckImport(false);
                      }
                    }}
                    disabled={isResolvingCards || !parsedPreview || parsedPreview.cards.length === 0}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Import as New Deck</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= Confirmation Modal: Save Current Deck Before Importing ================= */}
      {showSaveConfirmModal && deck && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div 
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
                <Save className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Save Current Deck Before Importing?
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  You are about to import <strong className="text-fuchsia-300">&quot;{customDeckName.trim() || 'New Imported Deck'}&quot;</strong> ({totalParsedCards} cards) as a new deck.
                </p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Would you like to save your current deck <strong className="text-slate-200">&quot;{deck.name}&quot;</strong> before switching?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Current Deck:</span>
                <span className="font-semibold text-slate-200">{deck.name}</span>
              </div>
              <div className="flex justify-between">
                <span>New Deck to Import:</span>
                <span className="font-semibold text-fuchsia-300">
                  {customDeckName.trim() || 'Imported Deck'} ({totalParsedCards} cards)
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => executeNewDeckImport(true)}
                disabled={isResolvingCards}
                className="w-full py-2.5 px-4 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Save Current Deck &amp; Import New Deck</span>
              </button>

              <button
                onClick={() => executeNewDeckImport(false)}
                disabled={isResolvingCards}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Import as New Deck (Keep Current As-Is)
              </button>

              <button
                onClick={() => setShowSaveConfirmModal(false)}
                disabled={isResolvingCards}
                className="w-full py-1.5 px-4 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
