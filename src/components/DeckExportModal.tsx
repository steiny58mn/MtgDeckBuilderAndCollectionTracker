import { useEscapeKey } from '../hooks/useEscapeKey';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
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
  FileCode,
  RefreshCw,
  AlertTriangle,
  ListChecks,
  Loader2,
  Printer,
  ExternalLink,
  Zap,
  CheckSquare,
  Square,
  CheckCheck,
  Search,
  Database,
  TreePine,
  SlidersHorizontal
} from 'lucide-react';
import { Deck, DeckCard, MTGFormat, CollectionCard } from '../types/mtg';
import { hasBasicSupertype } from '../utils/deckUtils';

// Helper to determine whether a card is a Basic Land (or has the Basic supertype)
export const isBasicLand = (card: { name?: string; type_line?: string }): boolean => {
  return hasBasicSupertype(card);
};
import { 
  ExportFormatKey, 
  EXPORT_FORMATS, 
  generateExportContent, 
  generateMTGODekXml,
  generateExcelTSV,
  generateCSV,
  triggerFileDownload,
  createDeckListApi,
  createDeckPickListApi,
  getExportFilenameBase,
  resolveMtgNexusEditUrl,
} from '../utils/deckExport';
import { 
  IMPORT_FORMATS, 
  parseDeckImport, 
  ParsedDeckImport 
} from '../utils/deckImport';
import { fetchBatchCardsCollection } from '../services/scryfall';
import { DeckService } from '../services/deckService';

export interface UploadedBatchDeckItem {
  id: string;
  fileName: string;
  fileSize: number;
  content: string;
  detectedFormat: ExportFormatKey | 'text';
  parsedDeck: ParsedDeckImport;
  deckName: string;
  deckFormat: MTGFormat;
  action: 'new' | 'overwrite';
  targetDeckId: string;
}

interface DeckExportModalProps {
  deck?: Deck | null;
  isHistorical?: boolean;
  existingDecks?: Deck[];
  isOpen: boolean;
  onClose: () => void;
  onImportAsNewDeck: (newDeck: Deck, shouldSaveCurrentDeck: boolean) => Promise<void>;
  onImportAppendToDeck?: (cardsToAdd: DeckCard[]) => Promise<void>;
  onImportOverwriteDeck?: (overwrittenDeck: Deck, originalDeck: Deck) => Promise<void>;
  onBatchImportCompleted?: (count: number) => void;
  onUpdateNexusUrl?: (url: string) => void;
  initialTab?: 'export' | 'import' | 'proxy' | 'nexus';
}

export const DeckExportModal: React.FC<DeckExportModalProps> = ({
  deck,
  isHistorical = false,
  existingDecks = [],
  isOpen,
  onClose,
  onImportAsNewDeck,
  onImportAppendToDeck,
  onImportOverwriteDeck,
  onBatchImportCompleted,
  onUpdateNexusUrl,
  initialTab = 'export',
}) => {
  const sortedExistingDecks = useMemo(() => {
    return [...existingDecks].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    );
  }, [existingDecks]);

  const [showOverwriteConfirmModal, setShowOverwriteConfirmModal] = useState(false);
  const [targetDeckToOverwrite, setTargetDeckToOverwrite] = useState<Deck | null>(deck || (existingDecks.length > 0 ? existingDecks[0] : null));
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'proxy' | 'nexus'>(initialTab);
  
  // Proxy Printing State
  const [proxyScope, setProxyScope] = useState<'main' | 'all'>('main');
  const [onlyNotInCollection, setOnlyNotInCollection] = useState<boolean>(false);
  const [includeBasicLands, setIncludeBasicLands] = useState<boolean>(false); // Defaulted to off as requested
  const [proxySearchTerm, setProxySearchTerm] = useState<string>('');
  const [selectedCardKeys, setSelectedCardKeys] = useState<Set<string>>(new Set());
  const [collection, setCollection] = useState<CollectionCard[]>(() => DeckService.getLocalCollection());

  // Subscribe to live collection
  useEffect(() => {
    const unsub = DeckService.subscribeCollection((cards) => {
      setCollection(cards);
    });
    return () => unsub();
  }, []);

  // Map of lowercased card name -> total owned quantity in collection
  const collectionCardMap = useMemo(() => {
    const map = new Map<string, number>();
    collection.forEach((c) => {
      if (c.name) {
        const lower = c.name.trim().toLowerCase();
        map.set(lower, (map.get(lower) || 0) + (c.quantity || 1));
      }
    });
    return map;
  }, [collection]);

  const getCardUniqueKey = (c: DeckCard, idx: number): string => {
    return c.id || `${c.name}__${c.category}__${c.set_name || ''}__${idx}`;
  };

  // Automatically sync selected cards when deck, board scope, collection filter, or basic lands filter changes
  useEffect(() => {
    if (!deck?.cards) {
      setSelectedCardKeys(new Set());
      return;
    }
    const newSelected = new Set<string>();
    deck.cards.forEach((c, idx) => {
      const key = getCardUniqueKey(c, idx);
      const inScope = proxyScope === 'all' || (c.category === 'main' || c.category === 'commander');
      if (!inScope) return;

      // Basic land filter (defaulted to off)
      if (!includeBasicLands && isBasicLand(c)) return;

      // Collection filter
      const lowerName = c.name.trim().toLowerCase();
      const inCol = collectionCardMap.has(lowerName);
      if (onlyNotInCollection && inCol) return;

      newSelected.add(key);
    });
    setSelectedCardKeys(newSelected);
  }, [deck?.id, deck?.cards, proxyScope, onlyNotInCollection, includeBasicLands, collectionCardMap]);

  const toggleCardSelection = (key: string) => {
    setSelectedCardKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAllVisible = (cardsToSelect: DeckCard[]) => {
    setSelectedCardKeys((prev) => {
      const next = new Set(prev);
      cardsToSelect.forEach((c, idx) => {
        next.add(getCardUniqueKey(c, idx));
      });
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedCardKeys(new Set());
  };

  const handleSelectOnlyMissing = () => {
    if (!deck?.cards) return;
    const next = new Set<string>();
    deck.cards.forEach((c, idx) => {
      const inScope = proxyScope === 'all' || (c.category === 'main' || c.category === 'commander');
      if (!inScope) return;
      if (!includeBasicLands && isBasicLand(c)) return;
      const lowerName = c.name.trim().toLowerCase();
      if (!collectionCardMap.has(lowerName)) {
        next.add(getCardUniqueKey(c, idx));
      }
    });
    setSelectedCardKeys(next);
  };

  const eligibleDeckCards = useMemo(() => {
    if (!deck?.cards) return [];
    return deck.cards.filter((c) => proxyScope === 'all' || (c.category === 'main' || c.category === 'commander'));
  }, [deck?.cards, proxyScope]);

  const cardsToPrintList = useMemo(() => {
    if (!deck?.cards) return [];
    const list: DeckCard[] = [];
    deck.cards.forEach((c, idx) => {
      const key = getCardUniqueKey(c, idx);
      if (selectedCardKeys.has(key)) {
        for (let i = 0; i < (c.quantity || 1); i++) {
          list.push(c);
        }
      }
    });
    return list;
  }, [deck?.cards, selectedCardKeys]);

  const totalSheetsCount = Math.ceil(cardsToPrintList.length / 9);
  
  // Export State
  const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormatKey>('bbcode');
  const [nexusThreadUrl, setNexusThreadUrl] = useState<string>(() => {
    return deck?.mtgNexusEditThreadUrl || (deck ? localStorage.getItem(`mtgnexus_url_${deck.id}`) || '' : '');
  });

  // Keep nexusThreadUrl in sync if deck prop updates
  useEffect(() => {
    if (deck?.mtgNexusEditThreadUrl !== undefined) {
      setNexusThreadUrl(deck.mtgNexusEditThreadUrl || '');
    }
  }, [deck?.id, deck?.mtgNexusEditThreadUrl]);
  const [copiedUserscriptToast, setCopiedUserscriptToast] = useState(false);
  const [showUserscriptHelp, setShowUserscriptHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportedContent, setExportedContent] = useState<string>('');
  const [isApiLoading, setIsApiLoading] = useState<boolean>(false);
  const [apiExportError, setApiExportError] = useState<string | null>(null);
  const [retryApiTrigger, setRetryApiTrigger] = useState(0);

  // Import State: Single / Paste
  const [selectedImportFormat, setSelectedImportFormat] = useState<ExportFormatKey | 'auto'>('auto');
  const [importText, setImportText] = useState('');
  const [customDeckName, setCustomDeckName] = useState('');
  const [customDeckFormat, setCustomDeckFormat] = useState<MTGFormat>('commander');
  const [isResolvingCards, setIsResolvingCards] = useState(false);
  const [resolveProgress, setResolveProgress] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);

  // Multi-File Upload Batch Queue State
  const [uploadedBatch, setUploadedBatch] = useState<UploadedBatchDeckItem[]>([]);

  // Confirmation Modal State (Save current deck before importing as new deck)
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset tab and states when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(deck ? initialTab : 'import');
      setImportError(null);
      setShowSaveConfirmModal(false);
      if (isHistorical && (selectedExportFormat === 'bbcode' || selectedExportFormat === 'picklist')) {
        setSelectedExportFormat('text');
      }
    }
  }, [isOpen, initialTab, deck, isHistorical]);

  // Real-time live parse of manual text input
  const parsedPreview = useMemo<ParsedDeckImport | null>(() => {
    if (!importText.trim()) return null;
    try {
      return parseDeckImport(importText, selectedImportFormat);
    } catch {
      return null;
    }
  }, [importText, selectedImportFormat]);

  // Keep targetDeckToOverwrite in sync with opened deck
  useEffect(() => {
    if (deck) {
      setTargetDeckToOverwrite(deck);
    } else if (existingDecks.length > 0) {
      setTargetDeckToOverwrite((prev) => prev || existingDecks[0]);
    }
  }, [deck, existingDecks]);

  // Update default name and format when parsed preview changes
  useEffect(() => {
    if (parsedPreview && parsedPreview.cards.length > 0) {
      if (!customDeckName) {
        if (parsedPreview.deckName) {
          setCustomDeckName(parsedPreview.deckName);
        } else {
          const cmdrCards = parsedPreview.cards.filter((c) => c.category === 'commander');
          if (cmdrCards.length > 0) {
            setCustomDeckName(cmdrCards.map((c) => c.name).join(' // '));
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

  // Fetch or generate export layout ONLY when the modal is open and deck/format is active
  useEffect(() => {
    if (!isOpen || !deck) {
      setExportedContent('');
      setIsApiLoading(false);
      setApiExportError(null);
      return;
    }

    // Do NOT load API-generated BBCode / Picklist for historical decks
    if (isHistorical) {
      setIsApiLoading(false);
      setApiExportError(null);
      if (selectedExportFormat === 'bbcode' || selectedExportFormat === 'picklist') {
        setExportedContent('');
      } else {
        setExportedContent(generateExportContent(selectedExportFormat, deck));
      }
      return;
    }

    if (selectedExportFormat === 'bbcode' || selectedExportFormat === 'picklist') {
      let isMounted = true;
      setIsApiLoading(true);
      setApiExportError(null);
      setExportedContent('');

      const endpointPromise =
        selectedExportFormat === 'bbcode'
          ? DeckService.createDeckList(deck, retryApiTrigger > 0)
          : DeckService.createDeckPickList(deck, retryApiTrigger > 0);

      endpointPromise
        .then((apiLayout) => {
          if (isMounted) {
            setExportedContent(apiLayout);
            setApiExportError(null);
          }
        })
        .catch((err: any) => {
          if (isMounted) {
            const formatName = selectedExportFormat === 'bbcode' ? 'BBCode (/mtgtools/createdecklist)' : 'Picklist (/mtgtools/createdeckpicklist)';
            console.error(`[DeckExportModal] Failed to load ${formatName} from API:`, err);
            setApiExportError(`Unable to connect to API for ${formatName}. ${err?.message || 'Connection error'}`);
            setExportedContent('');
          }
        })
        .finally(() => {
          if (isMounted) setIsApiLoading(false);
        });

      return () => {
        isMounted = false;
      };
    } else {
      setIsApiLoading(false);
      setApiExportError(null);
      setExportedContent(generateExportContent(selectedExportFormat, deck));
    }
  }, [isOpen, deck, selectedExportFormat, isHistorical, retryApiTrigger]);

  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  // Export handlers
  const currentExportOption = EXPORT_FORMATS.find((f) => f.key === selectedExportFormat) || EXPORT_FORMATS[0];

  const handlePrintProxies = () => {
    if (!deck) return;
    const cardsToPrint: DeckCard[] = [];
    deck.cards.forEach((c, idx) => {
      const key = getCardUniqueKey(c, idx);
      if (selectedCardKeys.has(key)) {
        for (let i = 0; i < (c.quantity || 1); i++) {
          cardsToPrint.push(c);
        }
      }
    });

    if (cardsToPrint.length === 0) {
      alert('Please select at least one card to print proxies.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to open the printable proxy sheet.');
      return;
    }

    const totalPages = Math.ceil(cardsToPrint.length / 9);
    const pagesHtml: string[] = [];

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageCards = cardsToPrint.slice(pageIdx * 9, (pageIdx + 1) * 9);
      const isLastPage = pageIdx === totalPages - 1;
      
      const slotsHtml: string[] = [];
      for (let slotIdx = 0; slotIdx < 9; slotIdx++) {
        if (slotIdx < pageCards.length) {
          const c = pageCards[slotIdx];
          const img = c.imageUrl || (c.scryfallId ? `https://api.scryfall.com/cards/${c.scryfallId}?format=image&version=large` : null);
          if (img) {
            slotsHtml.push(
              `<div class="card-slot">` +
                `<img src="${img}" alt="${c.name.replace(/"/g, '&quot;')}" crossorigin="anonymous" loading="eager" />` +
              `</div>`
            );
          } else {
            slotsHtml.push(
              `<div class="card-slot">` +
                `<div class="card-placeholder">` +
                  `<div class="ph-name">${c.name}</div>` +
                  `<div class="ph-type">${c.type_line || ''}</div>` +
                  `<div class="ph-mana">${c.mana_cost || ''}</div>` +
                `</div>` +
              `</div>`
            );
          }
        } else {
          slotsHtml.push(`<div class="card-slot empty-slot"></div>`);
        }
      }

      pagesHtml.push(
        `<div class="sheet ${isLastPage ? 'last-sheet' : 'page-break'}">` +
          `<div class="grid">` +
            slotsHtml.join('') +
          `</div>` +
        `</div>`
      );
    }

    const docContent = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <title></title>',
      '  <style>',
      '    @page {',
      '      size: letter portrait;',
      '      margin: 0 !important;',
      '    }',
      '    @page :left {',
      '      margin: 0 !important;',
      '    }',
      '    @page :right {',
      '      margin: 0 !important;',
      '    }',
      '    @page :first {',
      '      margin: 0 !important;',
      '    }',
      '    *, *:before, *:after {',
      '      box-sizing: border-box;',
      '      -webkit-print-color-adjust: exact !important;',
      '      print-color-adjust: exact !important;',
      '    }',
      '    html, body {',
      '      margin: 0 !important;',
      '      padding: 0 !important;',
      '      background: #0f172a;',
      '      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '      -webkit-font-smoothing: antialiased;',
      '    }',
      '    .floating-print-bar {',
      '      position: fixed;',
      '      top: 16px;',
      '      right: 16px;',
      '      z-index: 9999;',
      '      display: flex;',
      '      align-items: center;',
      '      gap: 12px;',
      '      background: rgba(15, 23, 42, 0.95);',
      '      backdrop-filter: blur(8px);',
      '      border: 1px solid #334155;',
      '      padding: 8px 16px;',
      '      border-radius: 12px;',
      '      box-shadow: 0 10px 25px rgba(0,0,0,0.5);',
      '      color: white;',
      '    }',
      '    .print-btn {',
      '      background: #7c3aed;',
      '      color: white;',
      '      border: none;',
      '      padding: 8px 18px;',
      '      border-radius: 8px;',
      '      font-weight: 700;',
      '      font-size: 13px;',
      '      cursor: pointer;',
      '      display: inline-flex;',
      '      align-items: center;',
      '      gap: 6px;',
      '      transition: background 0.15s;',
      '    }',
      '    .print-btn:hover { background: #6d28d9; }',
      '    .print-hint { font-size: 11px; color: #94a3b8; }',
      '    .sheets-container {',
      '      padding: 24px 0;',
      '      display: flex;',
      '      flex-direction: column;',
      '      align-items: center;',
      '      gap: 24px;',
      '    }',
      '    .sheet {',
      '      width: 8.5in;',
      '      height: 11.0in;',
      '      background: white;',
      '      box-sizing: border-box;',
      '      display: flex;',
      '      align-items: center;',
      '      justify-content: center;',
      '      box-shadow: 0 8px 30px rgba(0,0,0,0.4);',
      '      position: relative;',
      '      page-break-inside: avoid;',
      '      break-inside: avoid;',
      '    }',
      '    .grid {',
      '      display: grid;',
      '      grid-template-columns: repeat(3, 63mm);',
      '      grid-template-rows: repeat(3, 87.5mm);',
      '      width: 189mm;',
      '      height: 262.5mm;',
      '      gap: 0;',
      '      margin: auto;',
      '      border: 0.2mm solid #cbd5e1;',
      '      background: white;',
      '    }',
      '    .card-slot {',
      '      width: 63mm;',
      '      height: 87.5mm;',
      '      box-sizing: border-box;',
      '      border: 0.2mm dashed #cbd5e1;',
      '      overflow: hidden;',
      '      display: flex;',
      '      align-items: center;',
      '      justify-content: center;',
      '      background: white;',
      '      position: relative;',
      '    }',
      '    .card-slot img {',
      '      width: 100%;',
      '      height: 100%;',
      '      object-fit: fill;',
      '      display: block;',
      '    }',
      '    .empty-slot { background: #ffffff; border: 0.2mm dashed #e2e8f0; }',
      '    .card-placeholder {',
      '      padding: 10px;',
      '      text-align: center;',
      '      display: flex;',
      '      flex-direction: column;',
      '      align-items: center;',
      '      justify-content: center;',
      '      width: 100%;',
      '      height: 100%;',
      '      background: #f8fafc;',
      '      gap: 4px;',
      '    }',
      '    .ph-name { font-weight: 700; font-size: 12px; color: #0f172a; line-height: 1.2; }',
      '    .ph-type { font-size: 10px; color: #64748b; }',
      '    .ph-mana { font-size: 10px; font-family: monospace; color: #7c3aed; font-weight: 700; }',
      '    @media print {',
      '      @page {',
      '        size: letter portrait;',
      '        margin: 0 !important;',
      '      }',
      '      html, body {',
      '        width: 100% !important;',
      '        height: 100% !important;',
      '        background: white !important;',
      '        margin: 0 !important;',
      '        padding: 0 !important;',
      '      }',
      '      .floating-print-bar { display: none !important; }',
      '      .sheets-container { padding: 0 !important; gap: 0 !important; }',
      '      .sheet {',
      '        width: 100vw !important;',
      '        height: 100vh !important;',
      '        min-height: 100vh !important;',
      '        max-height: 100vh !important;',
      '        box-shadow: none !important;',
      '        margin: 0 !important;',
      '        padding: 0 !important;',
      '        page-break-before: always !important;',
      '        break-before: page !important;',
      '        page-break-after: always !important;',
      '        break-after: page !important;',
      '        page-break-inside: avoid !important;',
      '        break-inside: avoid !important;',
      '        display: flex !important;',
      '        align-items: center !important;',
      '        justify-content: center !important;',
      '      }',
      '      .sheet:first-child {',
      '        page-break-before: auto !important;',
      '        break-before: auto !important;',
      '      }',
      '      .sheet.last-sheet {',
      '        page-break-after: auto !important;',
      '        break-after: auto !important;',
      '      }',
      '      .grid { margin: auto !important; }',
      '    }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="floating-print-bar">',
      '    <div class="print-hint"><b>' + cardsToPrint.length + ' cards</b> (' + totalPages + ' sheet' + (totalPages === 1 ? '' : 's') + ') • Set <i>Margins: None</i> and uncheck <i>Headers and footers</i> in print dialog</div>',
      '    <button class="print-btn" onclick="window.print();">🖨️ Print Now</button>',
      '  </div>',
      '  <div class="sheets-container">',
      pagesHtml.join('\n'),
      '  </div>',
      '  <script>',
      '    window.onload = function() { setTimeout(function() { window.print(); }, 500); };',
      '  </script>',
      '</body>',
      '</html>'
    ].join('\n');

    printWindow.document.open();
    printWindow.document.write(docContent);
    printWindow.document.close();
  };

  const handleCopyExport = (textToCopy?: string) => {
    if (!deck) return;
    const text = textToCopy || (selectedExportFormat === 'excel' ? generateExcelTSV(deck) : exportedContent);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleSaveNexusUrl = (url: string) => {
    setNexusThreadUrl(url);
    if (deck) {
      if (url.trim()) {
        localStorage.setItem(`mtgnexus_url_${deck.id}`, url.trim());
      } else {
        localStorage.removeItem(`mtgnexus_url_${deck.id}`);
      }
    }
    if (onUpdateNexusUrl) {
      onUpdateNexusUrl(url);
    }
  };

  const handleCopyAndOpenNexus = async () => {
    let textToCopy = selectedExportFormat === 'bbcode' ? exportedContent : '';
    if (!textToCopy && deck) {
      try {
        textToCopy = await DeckService.createDeckList(deck);
      } catch {
        textToCopy = generateExportContent('bbcode', deck);
      }
    }
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);

      const targetUrl = resolveMtgNexusEditUrl(nexusThreadUrl);
      window.open(targetUrl, '_blank', 'noopener');
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  };

  const handleCopyUserscript = async () => {
    try {
      const res = await fetch('/scripts/mtgnexus-deck-sync.user.js');
      let scriptCode = '';
      if (res.ok) {
        scriptCode = await res.text();
      } else {
        scriptCode = '// Install Tampermonkey and visit: ' + window.location.origin + '/scripts/mtgnexus-deck-sync.user.js';
      }
      await navigator.clipboard.writeText(scriptCode);
      setCopiedUserscriptToast(true);
      setTimeout(() => setCopiedUserscriptToast(false), 2500);
    } catch (err) {
      window.open('/scripts/mtgnexus-deck-sync.user.js', '_blank');
    }
  };

  const handleDownloadExport = () => {
    if (!deck) return;
    const filenameBase = getExportFilenameBase(deck);
    if (selectedExportFormat === 'excel') {
      triggerFileDownload(
        exportedContent,
        `${filenameBase}.xls`,
        currentExportOption.mimeType
      );
    } else {
      triggerFileDownload(
        exportedContent,
        `${filenameBase}.${currentExportOption.fileExtension}`,
        currentExportOption.mimeType
      );
    }
  };

  const handleDownloadMTGODek = () => {
    if (!deck) return;
    const filenameBase = getExportFilenameBase(deck);
    const dekXml = generateMTGODekXml(deck);
    triggerFileDownload(dekXml, `${filenameBase}.dek`, 'application/xml;charset=utf-8');
  };

  const handleDownloadExcelCSV = () => {
    if (!deck) return;
    const filenameBase = getExportFilenameBase(deck);
    const csvData = generateCSV(deck);
    triggerFileDownload(csvData, `${filenameBase}.csv`, 'text/csv;charset=utf-8');
  };

  // Helper to parse multiple files into the uploadedBatch queue
  const processUploadedFiles = async (files: File[]) => {
    const newItems: UploadedBatchDeckItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const content = await file.text();
        if (!content.trim()) continue;

        let formatKey: ExportFormatKey | 'auto' = 'auto';
        if (file.name.endsWith('.dek') || file.name.endsWith('.xml')) formatKey = 'mtgo';
        else if (file.name.endsWith('.csv')) formatKey = 'csv';
        else if (file.name.endsWith('.tsv')) formatKey = 'excel';

        const parsed = parseDeckImport(content, formatKey);
        if (parsed.cards.length === 0) continue;

        const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
        const cmdrCards = parsed.cards.filter((c) => c.category === 'commander');
        const suggestedName = parsed.deckName || (cmdrCards.length > 0 ? cmdrCards.map((c) => c.name).join(' // ') : cleanFileName);
        const suggestedFormat: MTGFormat = parsed.format || (cmdrCards.length > 0 ? 'commander' : 'casual');

        // Check if an existing deck already matches this name
        const matchedDeck = existingDecks.find(
          (d) => d.name.trim().toLowerCase() === suggestedName.trim().toLowerCase()
        );

        newItems.push({
          id: `batch-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
          fileName: file.name,
          fileSize: file.size,
          content,
          detectedFormat: parsed.detectedFormat,
          parsedDeck: parsed,
          deckName: suggestedName,
          deckFormat: suggestedFormat,
          action: matchedDeck ? 'overwrite' : 'new',
          targetDeckId: matchedDeck ? matchedDeck.id : (existingDecks[0]?.id || ''),
        });
      } catch (err) {
        console.error(`Error reading file ${file.name}:`, err);
      }
    }

    if (newItems.length > 0) {
      setUploadedBatch((prev) => [...prev, ...newItems]);
      setImportError(null);
    } else {
      setImportError('No valid deck cards found in the selected file(s).');
    }
  };

  // File Upload handler for Import (supports multiple files)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processUploadedFiles(Array.from(files));
    e.target.value = '';
  };

  // Drag and drop handler (supports multiple files)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    processUploadedFiles(Array.from(files));
  };

  // Update item in batch queue
  const updateBatchItem = (id: string, updates: Partial<UploadedBatchDeckItem>) => {
    setUploadedBatch((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  // Remove item from batch queue
  const removeBatchItem = (id: string) => {
    setUploadedBatch((prev) => prev.filter((item) => item.id !== id));
  };

  // Add currently pasted text to the batch queue
  const handleAddPastedToBatch = () => {
    if (!parsedPreview || parsedPreview.cards.length === 0) {
      setImportError('Please enter cards to import first.');
      return;
    }

    const cmdrCards = parsedPreview.cards.filter((c) => c.category === 'commander');
    const suggestedName = customDeckName.trim() || parsedPreview.deckName || (cmdrCards.length > 0 ? cmdrCards.map((c) => c.name).join(' // ') : 'Pasted Decklist');
    const matchedDeck = existingDecks.find(
      (d) => d.name.trim().toLowerCase() === suggestedName.trim().toLowerCase()
    );

    const newItem: UploadedBatchDeckItem = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      fileName: `${suggestedName}.txt`,
      fileSize: new Blob([importText]).size,
      content: importText,
      detectedFormat: parsedPreview.detectedFormat,
      parsedDeck: parsedPreview,
      deckName: suggestedName,
      deckFormat: customDeckFormat,
      action: matchedDeck ? 'overwrite' : 'new',
      targetDeckId: matchedDeck ? matchedDeck.id : (existingDecks[0]?.id || ''),
    };

    setUploadedBatch((prev) => [...prev, newItem]);
    setImportText('');
    setCustomDeckName('');
    setImportError(null);
  };

  // Execute Batch Import for all items in uploadedBatch queue
  const executeBatchImport = async () => {
    if (uploadedBatch.length === 0) return;
    setIsResolvingCards(true);
    setImportError(null);

    const isMultiple = uploadedBatch.length > 1;

    try {
      for (let i = 0; i < uploadedBatch.length; i++) {
        const item = uploadedBatch[i];
        setResolveProgress(`Resolving cards for "${item.deckName}" (${i + 1} of ${uploadedBatch.length})...`);

        const cardsToFetch = item.parsedDeck.cards.map((c) => ({
          name: c.name,
          set: c.set,
        }));

        const scryfallMap = await fetchBatchCardsCollection(cardsToFetch);

        const resolvedCards: DeckCard[] = item.parsedDeck.cards.map((entry, idx) => {
          const exactLower = entry.name.toLowerCase().trim();
          const frontLower = exactLower.split(' // ')[0].trim();
          const matchedScry = scryfallMap.get(exactLower) || scryfallMap.get(frontLower);

          return {
            id: `card-${Date.now()}-${i}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
            scryfallId: matchedScry?.id || `custom-${Date.now()}-${idx}`,
            name: matchedScry?.name || entry.name,
            set: matchedScry?.set || entry.set,
            set_name: matchedScry?.set_name,
            collector_number: matchedScry?.collector_number || entry.collector_number,
            category: entry.category,
            quantity: entry.quantity,
            mana_cost: matchedScry?.mana_cost,
            cmc: matchedScry?.cmc,
            type_line: matchedScry?.type_line || '',
            oracle_text: matchedScry?.oracle_text || matchedScry?.card_faces?.[0]?.oracle_text,
            keywords: matchedScry?.keywords,
            colors: matchedScry?.colors,
            color_identity: matchedScry?.color_identity,
            rarity: matchedScry?.rarity,
            imageUrl: matchedScry?.image_uris?.normal || matchedScry?.card_faces?.[0]?.image_uris?.normal,
            priceUsd: matchedScry?.prices?.usd ? parseFloat(matchedScry.prices.usd) : undefined,
            priceUsdFoil: matchedScry?.prices?.usd_foil ? parseFloat(matchedScry.prices.usd_foil) : undefined,
            isFoil: entry.isFoil,
            isGamechanger: Boolean(matchedScry?.game_changer),
            game_changer: Boolean(matchedScry?.game_changer),
          };
        });

        // Promote sideboard to commander if Commander format and 1-2 sideboard cards
        if (item.deckFormat === 'commander') {
          const cmdrCards = resolvedCards.filter((c) => c.category === 'commander');
          const sideboardCards = resolvedCards.filter((c) => c.category === 'sideboard');
          const totalSideboardQty = sideboardCards.reduce((s, c) => s + c.quantity, 0);

          if (cmdrCards.length === 0 && sideboardCards.length >= 1 && sideboardCards.length <= 2 && totalSideboardQty === sideboardCards.length) {
            sideboardCards.forEach((sc) => { sc.category = 'commander'; });
          }
        }

        const cmdrCards = resolvedCards.filter((c) => c.category === 'commander');
        const commanderName = cmdrCards.length > 1
          ? cmdrCards.map((c) => c.name).join(' // ')
          : cmdrCards[0]?.name;
        const commanderArtUrl = cmdrCards[0]?.imageUrl;
        const commanderId = cmdrCards[0]?.scryfallId;
        const commanderColorIdentity = cmdrCards.length > 1
          ? Array.from(new Set(cmdrCards.flatMap((c) => c.color_identity || [])))
          : cmdrCards[0]?.color_identity;

        if (item.action === 'overwrite') {
          const target = existingDecks.find((d) => d.id === item.targetDeckId) || existingDecks[0];
          if (target) {
            const overwrittenDeck: Deck = {
              ...target,
              name: item.deckName.trim() || target.name,
              format: item.deckFormat,
              description: `Overwritten from ${item.fileName} on ${new Date().toLocaleDateString()}.`,
              cards: resolvedCards,
              commanderId,
              commanderName,
              commanderArtUrl,
              commanderColorIdentity,
              coverCardUrl: commanderArtUrl || resolvedCards[0]?.imageUrl || target.coverCardUrl,
              updatedAt: Date.now(),
            };
            await DeckService.saveDeck(target);
            await DeckService.saveDeck(overwrittenDeck);
            if (onImportOverwriteDeck && !isMultiple) {
              await onImportOverwriteDeck(overwrittenDeck, target);
            }
          }
        } else {
          // Action: 'new'
          const newDeck: Deck = {
            id: `deck-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`,
            name: item.deckName.trim() || 'Imported Deck',
            format: item.deckFormat,
            description: `Imported from ${item.fileName} with ${resolvedCards.reduce((s, c) => s + c.quantity, 0)} cards.`,
            cards: resolvedCards,
            commanderId,
            commanderName,
            commanderArtUrl,
            commanderColorIdentity,
            coverCardUrl: commanderArtUrl || resolvedCards[0]?.imageUrl,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await DeckService.saveDeck(newDeck);
          if (!isMultiple) {
            await onImportAsNewDeck(newDeck, false);
          }
        }
      }

      const importedCount = uploadedBatch.length;
      setUploadedBatch([]);
      onClose();

      if (isMultiple && onBatchImportCompleted) {
        onBatchImportCompleted(importedCount);
      }
    } catch (err: any) {
      console.error('Batch import execution error:', err);
      setImportError('Batch import failed: ' + (err.message || 'Error resolving cards'));
    } finally {
      setIsResolvingCards(false);
      setResolveProgress('');
    }
  };

  // Execute Import Single Deck Core
  const executeNewDeckImport = async (shouldSaveCurrentDeck: boolean) => {
    if (!parsedPreview || parsedPreview.cards.length === 0) {
      setImportError('No recognized card entries to import. Please check format or paste decklist text.');
      return;
    }

    setIsResolvingCards(true);
    setImportError(null);
    setResolveProgress('Resolving cards with Scryfall database...');

    try {
      const cardsToFetch = parsedPreview.cards.map((c) => ({ name: c.name, set: c.set }));
      const scryfallMap = await fetchBatchCardsCollection(cardsToFetch);

      setResolveProgress('Assembling deck and categories...');

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
          type_line: matchedScry?.type_line || '',
          oracle_text: matchedScry?.oracle_text || matchedScry?.card_faces?.[0]?.oracle_text,
          keywords: matchedScry?.keywords,
          colors: matchedScry?.colors,
          color_identity: matchedScry?.color_identity,
          rarity: matchedScry?.rarity,
          imageUrl: matchedScry?.image_uris?.normal || matchedScry?.card_faces?.[0]?.image_uris?.normal,
          priceUsd: matchedScry?.prices?.usd ? parseFloat(matchedScry.prices.usd) : undefined,
          priceUsdFoil: matchedScry?.prices?.usd_foil ? parseFloat(matchedScry.prices.usd_foil) : undefined,
          isFoil: item.isFoil,
          isGamechanger: Boolean(matchedScry?.game_changer),
          game_changer: Boolean(matchedScry?.game_changer),
        };
      });

      if (customDeckFormat === 'commander') {
        const cmdrCards = resolvedCards.filter((c) => c.category === 'commander');
        const sideboardCards = resolvedCards.filter((c) => c.category === 'sideboard');
        const totalSideboardQty = sideboardCards.reduce((s, c) => s + c.quantity, 0);

        if (cmdrCards.length === 0 && sideboardCards.length >= 1 && sideboardCards.length <= 2 && totalSideboardQty === sideboardCards.length) {
          sideboardCards.forEach((sc) => { sc.category = 'commander'; });
        }
      }

      const cmdrCards = resolvedCards.filter((c) => c.category === 'commander');
      const commanderName = cmdrCards.length > 1
        ? cmdrCards.map((c) => c.name).join(' // ')
        : cmdrCards[0]?.name;
      const commanderArtUrl = cmdrCards[0]?.imageUrl;
      const commanderId = cmdrCards[0]?.scryfallId;
      const commanderColorIdentity = cmdrCards.length > 1
        ? Array.from(new Set(cmdrCards.flatMap((c) => c.color_identity || [])))
        : cmdrCards[0]?.color_identity;

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
        commanderId,
        commanderName,
        commanderArtUrl,
        commanderColorIdentity,
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

  // Execute overwriting target deck with single imported list
  const executeOverwriteDeckImport = async (targetDeck: Deck) => {
    if (!parsedPreview || parsedPreview.cards.length === 0 || !onImportOverwriteDeck) return;
    setIsResolvingCards(true);
    setImportError(null);
    setResolveProgress('Resolving imported cards with Scryfall database...');

    try {
      const cardsToFetch = parsedPreview.cards.map((c) => ({
        name: c.name,
        set: c.set,
      }));

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
          type_line: matchedScry?.type_line || '',
          oracle_text: matchedScry?.oracle_text || matchedScry?.card_faces?.[0]?.oracle_text,
          keywords: matchedScry?.keywords,
          colors: matchedScry?.colors,
          color_identity: matchedScry?.color_identity,
          rarity: matchedScry?.rarity,
          imageUrl: matchedScry?.image_uris?.normal || matchedScry?.card_faces?.[0]?.image_uris?.normal,
          priceUsd: matchedScry?.prices?.usd ? parseFloat(matchedScry.prices.usd) : undefined,
          priceUsdFoil: matchedScry?.prices?.usd_foil ? parseFloat(matchedScry.prices.usd_foil) : undefined,
          isFoil: item.isFoil,
          isGamechanger: Boolean(matchedScry?.game_changer),
          game_changer: Boolean(matchedScry?.game_changer),
        };
      });

      if (customDeckFormat === 'commander') {
        const cmdrCards = resolvedCards.filter((c) => c.category === 'commander');
        const sideboardCards = resolvedCards.filter((c) => c.category === 'sideboard');
        const totalSideboardQty = sideboardCards.reduce((s, c) => s + c.quantity, 0);

        if (cmdrCards.length === 0 && sideboardCards.length >= 1 && sideboardCards.length <= 2 && totalSideboardQty === sideboardCards.length) {
          sideboardCards.forEach((sc) => { sc.category = 'commander'; });
        }
      }

      const cmdrCards = resolvedCards.filter((c) => c.category === 'commander');
      const commanderName = cmdrCards.length > 1
        ? cmdrCards.map((c) => c.name).join(' // ')
        : cmdrCards[0]?.name;
      const commanderArtUrl = cmdrCards[0]?.imageUrl;
      const commanderId = cmdrCards[0]?.scryfallId;
      const commanderColorIdentity = cmdrCards.length > 1
        ? Array.from(new Set(cmdrCards.flatMap((c) => c.color_identity || [])))
        : cmdrCards[0]?.color_identity;

      const finalDeckName = customDeckName.trim() || 
        parsedPreview.deckName || 
        targetDeck.name;

      const overwrittenDeck: Deck = {
        ...targetDeck,
        name: finalDeckName,
        format: customDeckFormat || targetDeck.format,
        description: `Overwritten from ${parsedPreview.detectedFormat.toUpperCase()} import with ${resolvedCards.reduce((s, c) => s + c.quantity, 0)} cards.`,
        cards: resolvedCards,
        commanderId,
        commanderName,
        commanderArtUrl,
        commanderColorIdentity,
        coverCardUrl: commanderArtUrl || resolvedCards[0]?.imageUrl || targetDeck.coverCardUrl,
        updatedAt: Date.now(),
      };

      await onImportOverwriteDeck(overwrittenDeck, targetDeck);
      setShowOverwriteConfirmModal(false);
      onClose();
    } catch (err: any) {
      console.error('Overwrite deck import error:', err);
      setImportError('Overwrite failed: ' + (err.message || 'Unknown error resolving cards'));
    } finally {
      setIsResolvingCards(false);
      setResolveProgress('');
    }
  };

  // Append cards to currently opened deck
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
          type_line: matchedScry?.type_line || '',
          oracle_text: matchedScry?.oracle_text || matchedScry?.card_faces?.[0]?.oracle_text,
          keywords: matchedScry?.keywords,
          colors: matchedScry?.colors,
          color_identity: matchedScry?.color_identity,
          rarity: matchedScry?.rarity,
          imageUrl: matchedScry?.image_uris?.normal || matchedScry?.card_faces?.[0]?.image_uris?.normal,
          priceUsd: matchedScry?.prices?.usd ? parseFloat(matchedScry.prices.usd) : undefined,
          priceUsdFoil: matchedScry?.prices?.usd_foil ? parseFloat(matchedScry.prices.usd_foil) : undefined,
          isFoil: item.isFoil,
          isGamechanger: Boolean(matchedScry?.game_changer),
          game_changer: Boolean(matchedScry?.game_changer),
        };
      });

      if (deck && deck.format === 'commander' && !deck.cards.some((c) => c.category === 'commander')) {
        const cmdrCards = resolvedCards.filter((c) => c.category === 'commander');
        const sideboardCards = resolvedCards.filter((c) => c.category === 'sideboard');
        const totalSideQty = sideboardCards.reduce((s, c) => s + c.quantity, 0);

        if (cmdrCards.length === 0 && sideboardCards.length >= 1 && sideboardCards.length <= 2 && totalSideQty === sideboardCards.length) {
          sideboardCards.forEach((sc) => { sc.category = 'commander'; });
        }
      }

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
      case 'picklist':
        return <ListChecks className="w-4 h-4 text-amber-400" />;
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
              {activeTab === 'export' ? (
                <Download className="w-5 h-5" />
              ) : activeTab === 'proxy' ? (
                <Printer className="w-5 h-5 text-violet-400" />
              ) : activeTab === 'nexus' ? (
                <Zap className="w-5 h-5 text-emerald-400" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>
                  {activeTab === 'export'
                    ? 'Export Deck'
                    : activeTab === 'proxy'
                    ? 'Print Proxies'
                    : activeTab === 'nexus'
                    ? 'MTGNexus Automated Sync'
                    : 'Import Deck'}
                </span>
                {deck && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-fuchsia-400 border border-slate-700 font-normal truncate max-w-[200px]">
                    {deck.name}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {activeTab === 'export'
                  ? 'Export in 9 formats including live MTGNexus BBCode, physical picklist, MTGO, and Excel.'
                  : activeTab === 'proxy'
                  ? 'Generates true-to-scale 63mm × 88mm MTG proxy sheets in a clean 3×3 grid.'
                  : activeTab === 'nexus'
                  ? '1-click automated forum sync. Copies your formatted BBCode decklist and opens your thread or edit form.'
                  : 'Import single or multiple deck files (.txt, .dek, .csv, .tsv) or paste text.'}
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

        {/* Tab Toggle: Export vs Import vs Proxies vs MTGNexus */}
        <div className="px-5 pt-2.5 pb-2 border-b border-slate-800 flex items-center gap-2 bg-slate-900 flex-wrap">
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
              <span>Export Deck</span>
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
            <span>Import Deck</span>
            {uploadedBatch.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-950 text-fuchsia-300 text-[10px] font-mono font-bold">
                {uploadedBatch.length} queued
              </span>
            )}
          </button>

          {deck && (
            <button
              onClick={() => setActiveTab('proxy')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'proxy'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Proxies</span>
            </button>
          )}

          {deck && (
            <button
              onClick={() => setActiveTab('nexus')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'nexus'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>MTGNexus Sync</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        {activeTab === 'proxy' && deck ? (
          <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 bg-slate-900 overflow-y-auto space-y-4">
            {/* Top Control Card */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 bg-slate-950/70 border border-slate-800 rounded-2xl">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Printer className="w-4 h-4 text-violet-400" />
                  <span>Printable Proxy Sheets (3×3 Grid)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generates true-to-scale 63mm × 88mm MTG proxy sheets. Perfectly centered 3 rows per page across all sheets.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={handlePrintProxies}
                  disabled={cardsToPrintList.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-xs shadow-md shadow-violet-900/30 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    Print {cardsToPrintList.length} Prox{cardsToPrintList.length === 1 ? 'y' : 'ies'} ({totalSheetsCount} Sheet{totalSheetsCount === 1 ? '' : 's'})
                  </span>
                </button>
              </div>
            </div>

            {/* Filter & Toggle Controls Toolbar */}
            <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Board Scope */}
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setProxyScope('main')}
                    className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      proxyScope === 'main' ? 'bg-slate-800 text-violet-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Mainboard Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setProxyScope('all')}
                    className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      proxyScope === 'all' ? 'bg-slate-800 text-violet-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Boards
                  </button>
                </div>

                {/* Filter Toggles: Only Missing from Collection & Include Basic Lands */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Toggle: Only Cards NOT in Collection */}
                  <button
                    type="button"
                    onClick={() => setOnlyNotInCollection(!onlyNotInCollection)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      onlyNotInCollection
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-xs'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                    title="Toggle to proxy only cards you don't already have in your collection binders"
                  >
                    <Database className={`w-3.5 h-3.5 ${onlyNotInCollection ? 'text-amber-400' : 'text-slate-500'}`} />
                    <span>Only Missing from Collection</span>
                    <span className={`px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-md ${
                      onlyNotInCollection ? 'bg-amber-950/80 text-amber-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {deck.cards.filter((c) => {
                        const inScope = proxyScope === 'all' || (c.category === 'main' || c.category === 'commander');
                        return inScope && !collectionCardMap.has(c.name.trim().toLowerCase());
                      }).length}
                    </span>
                  </button>

                  {/* Toggle: Include Basic Lands (Defaulted to OFF) */}
                  <button
                    type="button"
                    onClick={() => setIncludeBasicLands(!includeBasicLands)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      includeBasicLands
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-xs'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                    title="Toggle to include or exclude Basic Lands (Plains, Island, Swamp, Mountain, Forest, Wastes)"
                  >
                    <TreePine className={`w-3.5 h-3.5 ${includeBasicLands ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Include Basic Lands</span>
                    <span className={`px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-md ${
                      includeBasicLands ? 'bg-emerald-950/80 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {deck.cards.filter((c) => {
                        const inScope = proxyScope === 'all' || (c.category === 'main' || c.category === 'commander');
                        return inScope && isBasicLand(c);
                      }).length}
                    </span>
                  </button>
                </div>

                {/* Quick Selection Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectAllVisible(eligibleDeckCards)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                    title="Select all cards in scope"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-violet-400" />
                    <span>Select All</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                    title="Clear all selections"
                  >
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    <span>Deselect All</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectOnlyMissing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                    title="Select only cards not currently in collection"
                  >
                    <Database className="w-3.5 h-3.5 text-amber-400" />
                    <span>Only Missing</span>
                  </button>
                </div>
              </div>

              {/* Search & Stats Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={proxySearchTerm}
                    onChange={(e) => setProxySearchTerm(e.target.value)}
                    placeholder="Search cards to toggle..."
                    className="w-full pl-8 pr-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <span>
                    Selected: <b className="text-violet-300">{cardsToPrintList.length}</b> / {eligibleDeckCards.reduce((s, c) => s + (c.quantity || 1), 0)} cards
                  </span>
                  <span>
                    Sheets: <b className="text-white">{totalSheetsCount}</b>
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Cards Grid */}
            <div className="space-y-2">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Click any card or checkbox to include/exclude it from printing:</span>
                <span>Showing {eligibleDeckCards.length} unique card entries</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 p-3 bg-slate-950 rounded-2xl border border-slate-800/80 max-h-[52vh] overflow-y-auto">
                {eligibleDeckCards
                  .filter((c) => !proxySearchTerm.trim() || c.name.toLowerCase().includes(proxySearchTerm.toLowerCase()))
                  .map((c, idx) => {
                    const key = getCardUniqueKey(c, idx);
                    const isSelected = selectedCardKeys.has(key);
                    const isBasic = isBasicLand(c);
                    const ownedCount = collectionCardMap.get(c.name.trim().toLowerCase()) || 0;
                    const inCol = ownedCount > 0;

                    return (
                      <div
                        key={key}
                        onClick={() => toggleCardSelection(key)}
                        className={`group relative rounded-xl border p-2 flex flex-col gap-1.5 transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'bg-slate-900/90 border-violet-500/70 shadow-md shadow-violet-950/50 ring-1 ring-violet-500/40'
                            : 'bg-slate-950/60 border-slate-800/80 opacity-45 hover:opacity-80'
                        }`}
                      >
                        {/* Card Image with Checkbox Indicator */}
                        <div className="aspect-[5/7] rounded-lg overflow-hidden border border-slate-800/80 bg-slate-900 relative">
                          <img
                            src={c.imageUrl || (c.scryfallId ? `https://api.scryfall.com/cards/${c.scryfallId}?format=image&version=small` : '')}
                            alt={c.name}
                            className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 ${
                              isSelected ? '' : 'grayscale'
                            }`}
                            loading="lazy"
                          />

                          {/* Checkbox Overlay */}
                          <div className="absolute top-1.5 left-1.5">
                            <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors shadow-md ${
                              isSelected
                                ? 'bg-violet-600 text-white'
                                : 'bg-slate-900/90 border border-slate-700 text-transparent'
                            }`}>
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          {/* Quantity Badge */}
                          {(c.quantity || 1) > 1 && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/85 text-[10px] font-mono text-white font-bold border border-white/20">
                              {c.quantity}x
                            </span>
                          )}
                        </div>

                        {/* Card Details */}
                        <div className="min-w-0 space-y-1">
                          <div className="font-bold text-xs text-white truncate group-hover:text-violet-300 transition-colors" title={c.name}>
                            {c.name}
                          </div>

                          {/* Collection Status Pill */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {inCol ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-950/80 border border-emerald-800/60 text-emerald-300">
                                <Database className="w-2.5 h-2.5" />
                                <span>Owned ({ownedCount}x)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-950/80 border border-amber-800/60 text-amber-300">
                                <span>Missing</span>
                              </span>
                            )}

                            {isBasic && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                                Basic
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : activeTab === 'export' && deck ? (
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
                  {isApiLoading && (
                    <span className="flex items-center gap-1.5 text-xs text-fuchsia-400 font-medium" title="Calling API...">
                      <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
                    </span>
                  )}

                  <button
                    onClick={() => handleCopyExport()}
                    disabled={isApiLoading || !!apiExportError || !exportedContent || (isHistorical && (selectedExportFormat === 'bbcode' || selectedExportFormat === 'picklist'))}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                    disabled={isApiLoading || !!apiExportError || !exportedContent || (isHistorical && (selectedExportFormat === 'bbcode' || selectedExportFormat === 'picklist'))}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .{currentExportOption.fileExtension}</span>
                  </button>
                </div>
              </div>

              {selectedExportFormat === 'bbcode' && (
                <div className="my-2.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Looking for 1-click automated forum sync with Tampermonkey?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('nexus')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Go to MTGNexus Sync Tab</span>
                  </button>
                </div>
              )}

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
                    <Download className="w-3.5 h-3.5" />
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

              {apiExportError && (
                <div className="my-2.5 p-3 rounded-xl bg-rose-950/80 border border-rose-500/60 flex items-center justify-between gap-3 text-xs text-rose-200 shadow-lg">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-rose-300">API Connection Error</div>
                      <div className="text-[11px] text-rose-400/90 truncate">{apiExportError}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRetryApiTrigger((prev) => prev + 1)}
                    className="px-3 py-1 bg-rose-900 hover:bg-rose-800 text-rose-100 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors border border-rose-700/60"
                  >
                    Retry
                  </button>
                </div>
              )}

              {isHistorical && (selectedExportFormat === 'bbcode' || selectedExportFormat === 'picklist') && (
                <div className="my-2.5 p-3 rounded-xl bg-amber-950/50 border border-amber-500/50 flex items-center justify-between gap-3 text-xs text-amber-200 shadow-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-amber-300">Historical Iteration</div>
                      <div className="text-[11px] text-amber-400/90">
                        BBCode &amp; Picklist generation via API is only available for current decks. Please select another format (e.g. Moxfield, MTGO, Text, CSV, Excel) to export this iteration.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedExportFormat('text')}
                    className="px-3 py-1 bg-amber-900 hover:bg-amber-800 text-amber-100 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors border border-amber-700/60"
                  >
                    Switch to Text
                  </button>
                </div>
              )}

              <div className="mt-3 flex-1 min-h-[220px] flex flex-col relative">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Output Preview</span>
                  <span>{deck.cards.reduce((s, c) => s + c.quantity, 0)} total cards</span>
                </div>
                <div className="flex-1 relative flex flex-col">
                  {isApiLoading && (
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center gap-2 text-slate-300 text-xs z-10 border border-slate-800">
                      <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
                      <span>Requesting layout from API...</span>
                    </div>
                  )}
                  <textarea
                    readOnly
                    value={selectedExportFormat === 'excel' ? generateExcelTSV(deck) : exportedContent}
                    placeholder={
                      isHistorical && (selectedExportFormat === 'bbcode' || selectedExportFormat === 'picklist')
                        ? 'API generation for MTGNexus BBCode and Physical Picklist is only available for the current deck iteration. Switch to another format above to export this historical iteration.'
                        : isApiLoading
                        ? 'Loading output from API...'
                        : apiExportError
                        ? 'Unable to connect to API endpoint. See error above.'
                        : 'No content to display'
                    }
                    className="flex-1 w-full min-h-[220px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 focus:outline-none select-all resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'nexus' && deck ? (
          /* =================== MTGNEXUS SYNC TAB =================== */
          <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 bg-slate-900 overflow-y-auto space-y-4">
            {/* Top Overview & Instructions */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-950/90 to-sky-950/80 border border-emerald-500/40 shadow-lg space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>MTGNexus Automated 1-Click Forum Sync</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                        Userscript Ready
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Sync your formatted decklist directly into MTGNexus forum primers and threads in one click.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href="/scripts/mtgnexus-deck-sync.user.js"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer shrink-0"
                    title="Install directly into Tampermonkey / Violentmonkey"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Install Userscript</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyUserscript}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer transition-colors shrink-0"
                  >
                    {copiedUserscriptToast ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUserscriptToast ? 'Script Copied!' : 'Copy Script Code'}</span>
                  </button>
                </div>
              </div>

              {/* How it works 3-step banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <div className="text-slate-300">
                    <strong className="text-white block font-semibold">Install Userscript</strong>
                    Install the script once in <a href="https://www.tampermonkey.net" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Tampermonkey</a>.
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <div className="text-slate-300">
                    <strong className="text-white block font-semibold">Set Thread URL</strong>
                    Paste your MTGNexus thread or edit URL below.
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <div className="text-slate-300">
                    <strong className="text-white block font-semibold">1-Click Sync</strong>
                    Click Sync: BBCode is copied &amp; auto-updated on page load!
                  </div>
                </div>
              </div>
            </div>

            {/* Target URL & Sync Actions Card */}
            <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>MTGNexus Thread or Direct Edit URL</span>
                </label>
                {nexusThreadUrl && (
                  <span className="text-[11px] font-mono text-emerald-400">
                    Target: {resolveMtgNexusEditUrl(nexusThreadUrl).includes('mode=edit') ? 'Direct Edit Form' : 'Thread Post'}
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="url"
                  value={nexusThreadUrl}
                  onChange={(e) => handleSaveNexusUrl(e.target.value)}
                  placeholder="https://www.mtgnexus.com/viewtopic.php?t=... or posting.php?mode=edit..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-emerald-500 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
                />

                <button
                  type="button"
                  onClick={handleCopyAndOpenNexus}
                  disabled={!nexusThreadUrl.trim() || isApiLoading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 text-xs font-extrabold transition-all shadow-md cursor-pointer shrink-0"
                >
                  <Zap className="w-4 h-4" />
                  <span>
                    {copied
                      ? 'BBCode Copied & Opening...'
                      : `Copy BBCode & Open ${nexusThreadUrl.includes('posting.php') || nexusThreadUrl.includes('mode=edit') || nexusThreadUrl.includes('p=') ? 'Edit Form' : 'Thread'}`}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>URL is automatically saved and linked to this deck across sessions.</span>
                {nexusThreadUrl && (
                  <a
                    href={resolveMtgNexusEditUrl(nexusThreadUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Test opening target URL</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Live BBCode Output Preview Section */}
            <div className="flex-1 min-h-[220px] flex flex-col space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-fuchsia-400" />
                  <span className="font-semibold text-slate-200">Active MTGNexus BBCode Output</span>
                  <span className="text-slate-500">({deck.cards.reduce((s, c) => s + c.quantity, 0)} cards)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRetryApiTrigger((prev) => prev + 1)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
                    title="Regenerate BBCode from API"
                  >
                    <RefreshCw className="w-3 h-3 text-slate-400" />
                    <span>Refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyExport(exportedContent || generateExportContent('bbcode', deck))}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                    <span>{copied ? 'Copied!' : 'Copy BBCode Only'}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 relative flex flex-col min-h-[180px]">
                {isApiLoading && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center gap-2 text-slate-300 text-xs z-10 border border-slate-800">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    <span>Generating MTGNexus BBCode from API...</span>
                  </div>
                )}
                <textarea
                  readOnly
                  value={exportedContent || generateExportContent('bbcode', deck)}
                  placeholder="Generating MTGNexus BBCode..."
                  className="flex-1 w-full min-h-[180px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 focus:outline-none select-all resize-none"
                />
              </div>
            </div>
          </div>
        ) : (
          /* =================== IMPORT TAB =================== */
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Format Selector Column */}
            <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/40 p-3 overflow-y-auto space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
                Import Format
              </div>

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
              {/* Top Banner with File Upload Trigger */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Import Decklists
                    {uploadedBatch.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                        {uploadedBatch.length} file{uploadedBatch.length > 1 ? 's' : ''} queued
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select or drag & drop multiple files, then set each file to either create a new deck or overwrite an existing deck.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    multiple
                    accept=".txt,.dek,.xml,.csv,.tsv,.xls,.xlsx"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    <span>Upload File(s)</span>
                  </button>
                </div>
              </div>

              {/* ================= MULTI-FILE UPLOAD BATCH QUEUE ================= */}
              {uploadedBatch.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-300 pb-1 border-b border-slate-800/80">
                    <span className="font-bold flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-fuchsia-400" />
                      Uploaded Decks Queue ({uploadedBatch.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setUploadedBatch([])}
                      className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
                    >
                      Clear Queue
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                    {uploadedBatch.map((item) => {
                      const totalQty = item.parsedDeck.cards.reduce((s, c) => s + c.quantity, 0);

                      return (
                        <div
                          key={item.id}
                          className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3 shadow-md"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <FileCode className="w-4 h-4 text-sky-400 shrink-0" />
                              <span className="font-semibold text-white text-xs truncate max-w-[200px] sm:max-w-xs" title={item.fileName}>
                                {item.fileName}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({(item.fileSize / 1024).toFixed(1)} KB)
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-emerald-400 border border-slate-700">
                                {totalQty} cards
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-500/30 uppercase">
                                {item.detectedFormat}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeBatchItem(item.id)}
                              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Remove file from queue"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Deck Name & Format */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="sm:col-span-2 space-y-1">
                              <label className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wide">
                                Deck Name:
                              </label>
                              <input
                                type="text"
                                value={item.deckName}
                                onChange={(e) => updateBatchItem(item.id, { deckName: e.target.value })}
                                placeholder="Deck Title"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-white focus:outline-none focus:border-fuchsia-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wide">
                                Format:
                              </label>
                              <select
                                value={item.deckFormat}
                                onChange={(e) => updateBatchItem(item.id, { deckFormat: e.target.value as MTGFormat })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 capitalize focus:outline-none focus:border-fuchsia-500"
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

                          {/* Individual Action: Create as New vs Overwrite Existing */}
                          <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                            <label className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wide">
                              Destination Action:
                            </label>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => updateBatchItem(item.id, { action: 'new' })}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                  item.action === 'new'
                                    ? 'bg-fuchsia-500 text-slate-950 shadow-sm'
                                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                                }`}
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>Create as New Deck</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => updateBatchItem(item.id, { action: 'overwrite' })}
                                disabled={existingDecks.length === 0}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                                  item.action === 'overwrite'
                                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                                }`}
                                title={existingDecks.length === 0 ? 'No existing decks available to overwrite' : 'Select an existing deck to overwrite'}
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Overwrite Existing Deck</span>
                              </button>
                            </div>

                            {item.action === 'overwrite' && (
                              <div className="mt-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    Select Target Deck to Overwrite:
                                  </span>
                                  <span className="text-[10px] text-amber-400/80">
                                    (All cards will be replaced)
                                  </span>
                                </div>
                                <select
                                  value={item.targetDeckId}
                                  onChange={(e) => updateBatchItem(item.id, { targetDeckId: e.target.value })}
                                  className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                                >
                                  {existingDecks.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name} ({d.cards.reduce((s, c) => s + c.quantity, 0)} cards — {d.format})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Batch Controls Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-sky-400" />
                      <span>+ Add More Files</span>
                    </button>

                    <div className="flex items-center gap-3">
                      <div className="text-[11px] text-slate-400 hidden sm:block">
                        <span className="text-fuchsia-400 font-bold">{uploadedBatch.filter((b) => b.action === 'new').length} New</span>
                        {uploadedBatch.some((b) => b.action === 'overwrite') && (
                          <span> • <span className="text-amber-400 font-bold">{uploadedBatch.filter((b) => b.action === 'overwrite').length} Overwrite</span></span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={executeBatchImport}
                        disabled={isResolvingCards}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                      >
                        {isResolvingCards ? (
                          <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        <span>Import All ({uploadedBatch.length}) Decks</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ================= MANUAL TEXT INPUT / DRAG & DROP ================= */
                <>
                  <div className="flex-1 flex flex-col min-h-[160px]">
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder={`Paste ${
                        selectedImportFormat === 'auto'
                          ? 'decklist in any format (BBCode, TappedOut, Moxfield, MTGO, Archidekt, CSV, Plain Text, Excel)...'
                          : IMPORT_FORMATS.find((f) => f.key === selectedImportFormat)?.sampleSyntax || 'decklist here...'
                      }`}
                      className="flex-1 w-full min-h-[160px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-fuchsia-500 resize-none"
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
                            Deck Name:
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

                  {/* Action Buttons for Manual Paste */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setImportText('');
                          setCustomDeckName('');
                          setImportError(null);
                        }}
                        disabled={isResolvingCards || !importText}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Clear
                      </button>

                      {parsedPreview && parsedPreview.cards.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAddPastedToBatch}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-fuchsia-300 text-xs font-semibold border border-fuchsia-500/30 cursor-pointer"
                        >
                          + Add to Upload Queue
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Overwrite existing deck button */}
                      {onImportOverwriteDeck && (deck || existingDecks.length > 0) && (
                        <button
                          onClick={() => {
                            if (!parsedPreview || parsedPreview.cards.length === 0) {
                              setImportError('Please enter cards to import first.');
                              return;
                            }
                            setShowOverwriteConfirmModal(true);
                          }}
                          disabled={isResolvingCards || !parsedPreview || parsedPreview.cards.length === 0}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                            deck
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold'
                              : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                          }`}
                          title={deck ? `Replace all cards in "${deck.name}" with imported list (saves current deck to history first)` : 'Select an existing deck to overwrite'}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{deck ? 'Overwrite Deck (Saves Current First)' : 'Overwrite Existing Deck...'}</span>
                        </button>
                      )}

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
                            setShowSaveConfirmModal(true);
                          } else {
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
                </>
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
            </div>
          </div>
        )}
      </div>

      {/* ================= Confirmation Modal: Overwrite Existing Deck (Single) ================= */}
      {showOverwriteConfirmModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div 
            className="w-full max-w-md bg-slate-900 border border-amber-500/50 rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Overwrite Deck with Imported Cards?
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  This will <strong>save off the current deck to history first</strong>, then replace all cards in the target deck with the {totalParsedCards} imported cards.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-2">
              {existingDecks && existingDecks.length > 0 && !deck ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Select Target Deck to Overwrite:
                  </label>
                  <select
                    value={targetDeckToOverwrite?.id || ''}
                    onChange={(e) => {
                      const found = existingDecks.find((d) => d.id === e.target.value);
                      if (found) setTargetDeckToOverwrite(found);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    {existingDecks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.cards.reduce((s, c) => s + c.quantity, 0)} cards)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span>Target Deck:</span>
                  <span className="font-semibold text-amber-300">
                    {targetDeckToOverwrite?.name || deck?.name} ({targetDeckToOverwrite?.cards.reduce((s, c) => s + c.quantity, 0) || deck?.cards.reduce((s, c) => s + c.quantity, 0) || 0} cards)
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span>Replacement Cards:</span>
                <span className="font-semibold text-emerald-400">
                  {totalParsedCards} cards ({parsedPreview?.detectedFormat.toUpperCase()} format)
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  const target = targetDeckToOverwrite || deck;
                  if (target) {
                    executeOverwriteDeckImport(target);
                  }
                }}
                disabled={isResolvingCards}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Confirm &amp; Overwrite Deck</span>
              </button>

              <button
                onClick={() => setShowOverwriteConfirmModal(false)}
                disabled={isResolvingCards}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => executeNewDeckImport(true)}
                disabled={isResolvingCards}
                className="w-full py-2.5 px-4 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Save Current Deck &amp; Import New</span>
              </button>

              <button
                onClick={() => executeNewDeckImport(false)}
                disabled={isResolvingCards}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Discard Current Changes &amp; Import
              </button>

              <button
                onClick={() => setShowSaveConfirmModal(false)}
                disabled={isResolvingCards}
                className="w-full py-1.5 px-4 text-slate-400 hover:text-slate-300 text-xs transition-colors cursor-pointer disabled:opacity-50"
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
