import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Camera, 
  Sparkles, 
  Upload, 
  RotateCw, 
  Zap, 
  ZapOff, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Search, 
  Key, 
  BookOpen, 
  Plus, 
  Minus,
  RefreshCw,
  ExternalLink,
  Volume2,
  Layers,
  ChevronUp,
  ChevronDown,
  Check
} from 'lucide-react';
import { ScryfallCard, Binder } from '../types/mtg';
import { 
  optimizeCardImage, 
  identifyCardFromImage, 
  getStoredGeminiApiKey, 
  setStoredGeminiApiKey,
  lookupExactScryfallCard,
  CardScanResult
} from '../services/cardScannerService';
import { playScanSuccessSound, playScanErrorSound, unlockAudio } from '../utils/soundUtils';
import { getCardImageUrl, getAutocomplete, fetchCardPrints } from '../services/api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export interface BatchScannedCard {
  id: string;
  card: ScryfallCard;
  quantity: number;
  isFoil: boolean;
  timestamp: number;
}

interface CardScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  binders: Binder[];
  activeBinder?: Binder | null;
  onAddCardToBinder: (
    card: ScryfallCard, 
    quantity: number, 
    isFoil: boolean, 
    targetBinderId?: string
  ) => Promise<void> | void;
}

export const CardScannerModal: React.FC<CardScannerModalProps> = ({
  isOpen,
  onClose,
  binders,
  activeBinder,
  onAddCardToBinder,
}) => {
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  // Video and Stream state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Scanner stream state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Target Binder selection
  const [selectedBinderId, setSelectedBinderId] = useState<string>(() => {
    return activeBinder?.id || (binders.length > 0 ? binders[0].id : 'binder-main');
  });

  useEffect(() => {
    if (activeBinder?.id) {
      setSelectedBinderId(activeBinder.id);
    } else if (binders.length > 0 && !selectedBinderId) {
      setSelectedBinderId(binders[0].id);
    }
  }, [activeBinder?.id, binders]);

  // Card Options
  const [cardQuantity, setCardQuantity] = useState<number>(1);
  const [overrideFoil, setOverrideFoil] = useState<boolean | null>(null); // null = auto-detect

  // Batch Session state (accumulates all cards scanned while camera stays open)
  const [scannedBatchCards, setScannedBatchCards] = useState<BatchScannedCard[]>([]);
  const [recentToast, setRecentToast] = useState<{
    card: ScryfallCard;
    quantity: number;
    isFoil: boolean;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showBatchDrawer, setShowBatchDrawer] = useState(false);

  // API Key Settings Modal
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getStoredGeminiApiKey());
  const [apiKeySavedSuccess, setApiKeySavedSuccess] = useState(false);

  // Manual fallback search
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualSuggestions, setManualSuggestions] = useState<string[]>([]);
  const [isSearchingManual, setIsSearchingManual] = useState(false);

  // Auto-dismiss success toast after 4 seconds
  useEffect(() => {
    if (!recentToast) return;
    const timer = setTimeout(() => {
      setRecentToast(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [recentToast]);

  // Auto-dismiss scan error after 4 seconds
  useEffect(() => {
    if (!scanError) return;
    const timer = setTimeout(() => {
      setScanError(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [scanError]);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser. Please use the photo upload button.');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : {};
        setHasTorch(Boolean(capabilities?.torch));
      }
    } catch (err: any) {
      console.warn('[CardScanner] Camera start error:', err);
      setCameraActive(false);
      let msg = 'Could not access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser or upload photos.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera device found. Please upload photos instead.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is in use by another application.';
      }
      setCameraError(msg);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  }, []);

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setScannedBatchCards([]);
      setRecentToast(null);
      setScanError(null);
      setIsProcessing(false);
      setShowBatchDrawer(false);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Torch constraint error:', e);
      }
    }
  };

  // Flip camera between front and back
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Process and analyze image in continuous batch mode
  const handleProcessImage = async (imageSource: Blob | File | HTMLVideoElement) => {
    unlockAudio();
    setIsProcessing(true);
    setScanError(null);
    setStatusMessage('Optimizing photo...');

    try {
      const { base64Only } = await optimizeCardImage(imageSource);

      const apiKey = getStoredGeminiApiKey();
      if (!apiKey) {
        setStatusMessage('');
        setIsProcessing(false);
        playScanErrorSound();
        setShowApiKeyModal(true);
        setScanError('Please enter your free Gemini API key to enable card recognition.');
        return;
      }

      setStatusMessage('Identifying card...');
      const scanResult = await identifyCardFromImage(base64Only, apiKey);

      const finalIsFoil = overrideFoil !== null ? overrideFoil : scanResult.isFoil;
      setStatusMessage(`Found "${scanResult.card.name}"!`);

      // Automatically add card to the chosen binder!
      await onAddCardToBinder(scanResult.card, cardQuantity, finalIsFoil, selectedBinderId);

      // Play success chime!
      playScanSuccessSound();

      // Add to accumulated batch list
      const batchItem: BatchScannedCard = {
        id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        card: scanResult.card,
        quantity: cardQuantity,
        isFoil: finalIsFoil,
        timestamp: Date.now(),
      };

      setScannedBatchCards((prev) => [batchItem, ...prev]);
      setRecentToast({
        card: scanResult.card,
        quantity: cardQuantity,
        isFoil: finalIsFoil,
      });

      // Keep camera live and clear status message for next card immediately!
      setStatusMessage('');
      setIsProcessing(false);
    } catch (err: any) {
      console.error('[CardScanner] Batch scan error:', err);
      playScanErrorSound();
      setScanError(err?.message || 'Could not recognize card. Ensure the card is in focus with good lighting.');
      setStatusMessage('');
      setIsProcessing(false);
    }
  };

  // Capture current live video frame
  const handleCaptureFrame = () => {
    if (!videoRef.current || isProcessing) return;
    try {
      navigator.vibrate?.(40);
    } catch {}
    handleProcessImage(videoRef.current);
  };

  // File upload input change
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessImage(file);
      e.target.value = '';
    }
  };

  // Autocomplete fallback
  useEffect(() => {
    if (!manualQuery.trim() || manualQuery.length < 2) {
      setManualSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await getAutocomplete(manualQuery);
        setManualSuggestions(results.slice(0, 5));
      } catch {}
    }, 200);
    return () => clearTimeout(timer);
  }, [manualQuery]);

  const handleSelectManualCard = async (name: string) => {
    setIsSearchingManual(true);
    unlockAudio();
    try {
      const prints = await fetchCardPrints(name);
      if (prints.length > 0) {
        const cardToAdd = prints[0];
        const isFoil = overrideFoil ?? false;
        await onAddCardToBinder(cardToAdd, cardQuantity, isFoil, selectedBinderId);
        playScanSuccessSound();
        const batchItem: BatchScannedCard = {
          id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          card: cardToAdd,
          quantity: cardQuantity,
          isFoil,
          timestamp: Date.now(),
        };
        setScannedBatchCards((prev) => [batchItem, ...prev]);
        setRecentToast({
          card: cardToAdd,
          quantity: cardQuantity,
          isFoil,
        });
        setManualQuery('');
        setManualSuggestions([]);
        setManualSearchOpen(false);
      } else {
        playScanErrorSound();
        setScanError(`Could not find "${name}" on Scryfall.`);
      }
    } catch (err: any) {
      playScanErrorSound();
      setScanError(err?.message || 'Failed to fetch card details');
    } finally {
      setIsSearchingManual(false);
    }
  };

  if (!isOpen) return null;

  const currentBinder = binders.find((b) => b.id === selectedBinderId) || activeBinder || binders[0];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white overflow-hidden animate-in fade-in duration-200">
      {/* Top Header: Controls, Binder Selector & Batch Counter */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
            <Camera className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-white truncate">
                Scan Cards to Binder
              </h2>
              {/* Batch counter badge */}
              {scannedBatchCards.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px] border border-emerald-500/40 shrink-0 animate-in zoom-in-95">
                  {scannedBatchCards.length} Added
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
              <select
                value={selectedBinderId}
                onChange={(e) => setSelectedBinderId(e.target.value)}
                className="bg-transparent text-slate-300 font-medium hover:text-white border-none focus:outline-none focus:ring-0 p-0 text-xs cursor-pointer truncate max-w-[150px] sm:max-w-[220px]"
                title="Target Binder"
              >
                {binders.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                    {b.name} ({b.cards?.length || 0})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* API Key Config Button */}
          <button
            type="button"
            onClick={() => setShowApiKeyModal(true)}
            className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              getStoredGeminiApiKey()
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 animate-pulse'
            }`}
            title="Configure Gemini API Key"
          >
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">
              {getStoredGeminiApiKey() ? 'API Key' : 'Set Key'}
            </span>
          </button>

          {/* Test Sound Button */}
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              playScanSuccessSound();
            }}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Test audio chime"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          {/* Done / Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1"
            title="Finish scanning and return to binder"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Area (Camera remains continuously active!) */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {/* Live Continuous Camera Viewfinder */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Card Alignment Reticle Frame */}
        <div className="relative z-10 w-[82vw] max-w-[320px] aspect-[1/1.4] pointer-events-none flex flex-col justify-between p-3">
          {/* Corner brackets */}
          <div className="flex justify-between">
            <div className="w-7 h-7 border-t-3 border-l-3 border-violet-500 rounded-tl-lg shadow-sm" />
            <div className="w-7 h-7 border-t-3 border-r-3 border-violet-500 rounded-tr-lg shadow-sm" />
          </div>

          {/* Set & Number Highlight Region */}
          <div className="w-full flex items-end justify-between">
            <div className="bg-violet-900/70 border border-violet-400/60 rounded px-2 py-1 text-[10px] text-violet-200 font-mono shadow-sm backdrop-blur-xs flex items-center gap-1">
              <span>SET & # \u2193</span>
            </div>
            <div className="w-7 h-7 border-b-3 border-r-3 border-violet-500 rounded-br-lg shadow-sm" />
          </div>
          <div className="absolute bottom-3 left-3 w-7 h-7 border-b-3 border-l-3 border-violet-500 rounded-bl-lg shadow-sm" />

          {/* Continuous Scanning Active Light */}
          {isProcessing && (
            <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-violet-400 to-transparent shadow-[0_0_12px_rgba(167,139,250,0.8)] animate-pulse" />
          )}
        </div>

        {/* Top Hint Bar over live camera */}
        <div className="absolute top-3 inset-x-4 z-20 flex justify-center pointer-events-none">
          <div className="bg-slate-900/85 backdrop-blur-md px-3.5 py-1 rounded-full border border-slate-700/60 text-[11px] text-slate-200 text-center shadow-lg">
            Batch Mode: Center card &bull; Camera stays open for multiple cards
          </div>
        </div>

        {/* Floating Controls (Torch & Flip) */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2.5 rounded-full shadow-lg backdrop-blur-md transition-colors cursor-pointer ${
                torchOn ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-900/80 text-white hover:bg-slate-800'
              }`}
              title={torchOn ? 'Turn off flash' : 'Turn on flash'}
            >
              {torchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={toggleFacingMode}
            className="p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white shadow-lg backdrop-blur-md transition-colors cursor-pointer"
            title="Switch camera"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Floating Success Toast (Appears over live camera without closing it!) */}
        {recentToast && (
          <div className="absolute top-12 inset-x-4 z-30 flex justify-center pointer-events-none animate-in slide-in-from-top-3 fade-in duration-200">
            <div className="bg-emerald-950/95 border border-emerald-500/80 rounded-2xl p-2.5 sm:p-3 shadow-2xl backdrop-blur-md max-w-sm w-full flex items-center justify-between gap-3 pointer-events-auto">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={getCardImageUrl(recentToast.card, 'small')}
                  alt={recentToast.card.name}
                  className="w-10 h-14 object-cover rounded shadow border border-emerald-500/40 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Added {recentToast.quantity}x</span>
                    {recentToast.isFoil && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-400/20 text-amber-300 border border-amber-400/40 inline-flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> Foil
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-white truncate">{recentToast.card.name}</h4>
                  <p className="text-[10px] text-emerald-200/80 font-mono">
                    {recentToast.card.set?.toUpperCase()} #{recentToast.card.collector_number} &bull; {currentBinder?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecentToast(null)}
                className="text-emerald-400 hover:text-white p-1 cursor-pointer shrink-0"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Floating Error Toast */}
        {scanError && !isProcessing && (
          <div className="absolute top-12 inset-x-4 z-30 flex justify-center pointer-events-none animate-in slide-in-from-top-3 fade-in duration-200">
            <div className="bg-rose-950/95 border border-rose-500/80 rounded-xl p-3 text-xs text-rose-200 shadow-2xl max-w-sm w-full flex items-center justify-between gap-3 pointer-events-auto backdrop-blur-md">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">{scanError}</span>
              </div>
              <button
                type="button"
                onClick={() => setScanError(null)}
                className="text-rose-400 hover:text-white font-bold p-1 cursor-pointer shrink-0"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Processing Indicator Overlay (Subtle spinner, camera stays visible behind) */}
        {isProcessing && (
          <div className="absolute inset-0 z-25 bg-slate-950/40 backdrop-blur-xs flex flex-col items-center justify-center p-4">
            <div className="bg-slate-900/90 border border-violet-500/40 rounded-2xl px-5 py-4 flex flex-col items-center shadow-2xl">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin mb-2" />
              <p className="text-xs font-bold text-white">{statusMessage || 'Analyzing card...'}</p>
            </div>
          </div>
        )}

        {/* Camera Permission / Device Error */}
        {cameraError && (
          <div className="absolute inset-0 z-30 bg-slate-950/95 p-6 flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Camera Notice</h3>
            <p className="text-xs text-slate-300 max-w-sm mb-4">{cameraError}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => startCamera()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Photo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Batch Scanned History Tray (Collapsible strip showing all cards added this session) */}
      {scannedBatchCards.length > 0 && (
        <div className="bg-slate-900 border-t border-slate-800 z-20">
          <div
            onClick={() => setShowBatchDrawer(!showBatchDrawer)}
            className="flex items-center justify-between px-4 py-1.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              <span>Current Batch: <strong>{scannedBatchCards.length} card{scannedBatchCards.length === 1 ? '' : 's'}</strong> added</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span>{showBatchDrawer ? 'Hide' : 'View List'}</span>
              {showBatchDrawer ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </div>
          </div>

          {/* Drawer content: horizontal carousel of scanned cards */}
          {showBatchDrawer && (
            <div className="p-3 overflow-x-auto flex gap-3 max-h-44 scrollbar-thin">
              {scannedBatchCards.map((item) => (
                <div
                  key={item.id}
                  className="flex-shrink-0 w-24 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-center shadow flex flex-col items-center"
                >
                  <img
                    src={getCardImageUrl(item.card, 'small')}
                    alt={item.card.name}
                    className="w-20 h-28 object-cover rounded shadow-xs mb-1"
                  />
                  <span className="text-[10px] font-bold text-white truncate w-full block">
                    {item.card.name}
                  </span>
                  <div className="flex items-center justify-center gap-1 mt-0.5 text-[9px] text-slate-400 font-mono">
                    <span>{item.card.set?.toUpperCase()}</span>
                    <span>#{item.card.collector_number}</span>
                    {item.isFoil && <Sparkles className="w-2.5 h-2.5 text-amber-300" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Interactive Toolbar: Foil, Quantity & Continuous Shutter Button */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 z-20 flex flex-col gap-2">
        {/* Options Row (Foil & Quantity) */}
        <div className="flex items-center justify-between text-xs text-slate-300">
          {/* Foil Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
            <button
              type="button"
              onClick={() => setOverrideFoil(null)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                overrideFoil === null ? 'bg-violet-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="Auto-detect foil finish from camera"
            >
              Auto-Foil
            </button>
            <button
              type="button"
              onClick={() => setOverrideFoil(true)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                overrideFoil === true ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="Force foil printing"
            >
              <Sparkles className="w-3 h-3" /> Foil
            </button>
            <button
              type="button"
              onClick={() => setOverrideFoil(false)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                overrideFoil === false ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="Force regular printing"
            >
              Regular
            </button>
          </div>

          {/* Quantity Stepper */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700/60">
            <span className="text-[11px] text-slate-400">Qty:</span>
            <button
              type="button"
              onClick={() => setCardQuantity((q) => Math.max(1, q - 1))}
              className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer"
            >
              -
            </button>
            <span className="font-bold text-white w-4 text-center">{cardQuantity}</span>
            <button
              type="button"
              onClick={() => setCardQuantity((q) => q + 1)}
              className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Shutter & Actions Bar */}
        <div className="flex items-center justify-between gap-4 pt-0.5">
          {/* File upload hidden input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Upload photo from device"
          >
            <Upload className="w-5 h-5" />
          </button>

          {/* Large Continuous Shutter Button */}
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleCaptureFrame}
            className={`w-16 h-16 rounded-full border-4 border-violet-500/50 p-1 flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer ${
              isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'
            }`}
            title="Snap card & add to binder (camera stays live for next card!)"
          >
            <div className="w-full h-full rounded-full bg-white hover:bg-slate-200 transition-colors shadow-inner flex items-center justify-center">
              <Camera className="w-6 h-6 text-slate-900" />
            </div>
          </button>

          {/* Quick manual search fallback button */}
          <button
            type="button"
            onClick={() => setManualSearchOpen(true)}
            className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Search by card name if camera cannot read card"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Manual Search Fallback Drawer */}
      {manualSearchOpen && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-violet-400" />
                Manual Card Lookup
              </h3>
              <button
                type="button"
                onClick={() => setManualSearchOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Type the card name to add it to <strong>{currentBinder?.name}</strong>:
            </p>
            <div className="relative mb-3">
              <input
                type="text"
                autoFocus
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="e.g. Birds of Paradise, Sol Ring..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
              />
              {isSearchingManual && (
                <Loader2 className="w-4 h-4 text-violet-400 animate-spin absolute right-3 top-2.5" />
              )}
            </div>

            {/* Suggestions list */}
            {manualSuggestions.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto mb-3">
                {manualSuggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelectManualCard(name)}
                    className="w-full text-left px-3 py-2 bg-slate-800/70 hover:bg-violet-900/40 rounded-lg text-xs text-slate-200 hover:text-white transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>{name}</span>
                    <Plus className="w-3.5 h-3.5 text-violet-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gemini API Key Configuration Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-violet-400" />
                <h3 className="text-sm font-bold text-white">Gemini API Key Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              Google Gemini Vision powers the instant recognition of card titles, set codes, and collector numbers directly from your camera in batch.
            </p>

            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                API Key
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Stored securely in your local browser only. Never shared with third parties.
              </p>
            </div>

            <div className="bg-slate-800/60 rounded-lg p-2.5 mb-4 text-xs text-slate-300 flex items-center justify-between">
              <span>Need a free API key?</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-violet-400 hover:text-violet-300 font-semibold inline-flex items-center gap-1"
              >
                Get Key on Google AI Studio <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {apiKeySavedSuccess && (
              <div className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 rounded-lg p-2 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                API key saved successfully!
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStoredGeminiApiKey(apiKeyInput);
                  setApiKeySavedSuccess(true);
                  setTimeout(() => {
                    setApiKeySavedSuccess(false);
                    setShowApiKeyModal(false);
                  }, 800);
                }}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Save API Key
              </button>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
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
