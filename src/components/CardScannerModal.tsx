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
  SlidersHorizontal,
  Volume2
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

  // Scanner state
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

  // Result state
  const [lastScanResult, setLastScanResult] = useState<CardScanResult | null>(null);
  const [lastCapturedImage, setLastCapturedImage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // API Key Settings Modal
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getStoredGeminiApiKey());
  const [apiKeySavedSuccess, setApiKeySavedSuccess] = useState(false);

  // Manual fallback search
  const [manualQuery, setManualQuery] = useState('');
  const [manualSuggestions, setManualSuggestions] = useState<string[]>([]);
  const [isSearchingManual, setIsSearchingManual] = useState(false);

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
        msg = 'Camera permission was denied. Please allow camera access in your browser or upload a photo.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera device found. Please upload a photo instead.';
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
      setLastScanResult(null);
      setLastCapturedImage(null);
      setScanError(null);
      setIsProcessing(false);
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

  // Process and analyze image
  const handleProcessImage = async (imageSource: Blob | File | HTMLVideoElement) => {
    unlockAudio();
    setIsProcessing(true);
    setScanError(null);
    setStatusMessage('Optimizing photo...');

    try {
      const { dataUrl, base64Only } = await optimizeCardImage(imageSource);
      setLastCapturedImage(dataUrl);

      const apiKey = getStoredGeminiApiKey();
      if (!apiKey) {
        setStatusMessage('Gemini API key missing');
        setIsProcessing(false);
        playScanErrorSound();
        setShowApiKeyModal(true);
        setScanError('Please configure your free Gemini API key to enable instant card recognition.');
        return;
      }

      setStatusMessage('Analyzing card with Gemini Vision...');
      const scanResult = await identifyCardFromImage(base64Only, apiKey);

      const finalIsFoil = overrideFoil !== null ? overrideFoil : scanResult.isFoil;
      setStatusMessage(`Found "${scanResult.card.name}"! Adding to binder...`);

      // Automatically add to collection binder!
      await onAddCardToBinder(scanResult.card, cardQuantity, finalIsFoil, selectedBinderId);

      // Play success chime
      playScanSuccessSound();
      setLastScanResult({
        ...scanResult,
        isFoil: finalIsFoil,
      });
      setStatusMessage('');
      setIsProcessing(false);
    } catch (err: any) {
      console.error('[CardScanner] Scan error:', err);
      playScanErrorSound();
      setScanError(err?.message || 'Could not recognize card. Please ensure the card is in focus and well-lit.');
      setStatusMessage('');
      setIsProcessing(false);
    }
  };

  // Capture current video frame
  const handleCaptureFrame = () => {
    if (!videoRef.current || isProcessing) return;
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

  // Reset to scan next card
  const handleScanNext = () => {
    setLastScanResult(null);
    setLastCapturedImage(null);
    setScanError(null);
    setCardQuantity(1);
    setOverrideFoil(null);
    if (!cameraActive) {
      startCamera();
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
        setLastScanResult({
          card: cardToAdd,
          isFoil,
          confidence: 'high',
        });
        setManualQuery('');
        setManualSuggestions([]);
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
      {/* Top Navigation & Controls Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              Card Scanner
              <span className="text-[10px] px-1.5 py-0.2 bg-violet-500/20 text-violet-300 rounded font-medium border border-violet-500/30">
                AI Vision
              </span>
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
              <select
                value={selectedBinderId}
                onChange={(e) => setSelectedBinderId(e.target.value)}
                className="bg-transparent text-slate-300 font-medium hover:text-white border-none focus:outline-none focus:ring-0 p-0 text-xs cursor-pointer truncate max-w-[150px] sm:max-w-[200px]"
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

        <div className="flex items-center gap-2">
          {/* Gemini API Key Button */}
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

          {/* Close Modal Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Close Scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {/* Live Camera Viewfinder */}
        {!lastScanResult && (
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
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

              {/* Scanning animation line */}
              {isProcessing && (
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-violet-400 to-transparent shadow-[0_0_12px_rgba(167,139,250,0.8)] animate-pulse" />
              )}
            </div>

            {/* Viewfinder Instructions Banner */}
            <div className="absolute top-4 inset-x-4 z-10 flex justify-center pointer-events-none">
              <div className="bg-slate-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-700/60 text-xs text-slate-200 text-center shadow-lg">
                Center card in frame &bull; Keep set code in bottom-left visible
              </div>
            </div>

            {/* Camera Floating Controls (Torch & Flip) */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
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

            {/* Camera Error / Permission Fallback */}
            {cameraError && (
              <div className="absolute inset-0 z-20 bg-slate-950/90 p-6 flex flex-col items-center justify-center text-center">
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
        )}

        {/* Processing Spinner Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-4">
            <Loader2 className="w-10 h-10 text-violet-400 animate-spin mb-3" />
            <p className="text-sm font-semibold text-white">{statusMessage || 'Processing card image...'}</p>
            <p className="text-xs text-slate-400 mt-1">Extracting set code and collector number...</p>
          </div>
        )}

        {/* Success Card Recognition Result View */}
        {lastScanResult && (
          <div className="relative z-20 w-full max-w-md p-4 flex flex-col items-center justify-center animate-in zoom-in-95 duration-200">
            {/* Success Banner */}
            <div className="w-full bg-emerald-950/90 border border-emerald-500/50 rounded-xl p-3 mb-4 shadow-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-200">Successfully Added to Binder!</h4>
                  <p className="text-[11px] text-emerald-300/80">
                    {cardQuantity}x copy added to <strong>{currentBinder?.name || 'Binder'}</strong>
                  </p>
                </div>
              </div>
              {lastScanResult.isFoil && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Foil
                </span>
              )}
            </div>

            {/* Scanned Card Details Preview Card */}
            <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl flex gap-4 items-center">
              <img
                src={getCardImageUrl(lastScanResult.card, 'normal')}
                alt={lastScanResult.card.name}
                className="w-24 sm:w-28 rounded-lg shadow-md border border-slate-700/60 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white truncate">{lastScanResult.card.name}</h3>
                <p className="text-xs text-slate-400 truncate mt-0.5">{lastScanResult.card.type_line}</p>

                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <span className="px-2 py-0.5 bg-slate-800 rounded text-[11px] font-mono text-violet-300 border border-slate-700 uppercase">
                    {lastScanResult.card.set?.toUpperCase()}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-800 rounded text-[11px] font-mono text-slate-300 border border-slate-700">
                    #{lastScanResult.card.collector_number}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-800 rounded text-[11px] text-slate-300 capitalize border border-slate-700">
                    {lastScanResult.card.rarity}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Market Price:</span>
                  <span className="font-semibold text-emerald-400">
                    ${lastScanResult.isFoil && lastScanResult.card.prices?.usd_foil 
                      ? lastScanResult.card.prices.usd_foil 
                      : (lastScanResult.card.prices?.usd || '0.00')}
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons after successful scan */}
            <div className="w-full flex gap-3 mt-4">
              <button
                type="button"
                onClick={handleScanNext}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
              >
                <Camera className="w-4 h-4" />
                Scan Next Card
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Scan Error Banner */}
        {scanError && !isProcessing && (
          <div className="absolute bottom-24 inset-x-4 z-20 flex justify-center">
            <div className="bg-rose-950/95 border border-rose-500/60 rounded-xl p-3 text-xs text-rose-200 shadow-xl max-w-md w-full flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{scanError}</span>
              </div>
              <button
                type="button"
                onClick={() => setScanError(null)}
                className="text-rose-400 hover:text-white font-bold p-1"
              >
                &times;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Interactive Toolbar */}
      {!lastScanResult && (
        <div className="bg-slate-900 border-t border-slate-800 px-4 py-3 z-20 flex flex-col gap-2">
          {/* Options Row (Foil & Quantity) */}
          <div className="flex items-center justify-between text-xs text-slate-300">
            {/* Foil Toggle */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
              <button
                type="button"
                onClick={() => setOverrideFoil(null)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  overrideFoil === null ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Auto-detect foil status from card image"
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
                  overrideFoil === false ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Force non-foil printing"
              >
                Regular
              </button>
            </div>

            {/* Quantity Stepper */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/60">
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

          {/* Shutter Capture Bar */}
          <div className="flex items-center justify-between gap-4 pt-1">
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

            {/* Shutter Button */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleCaptureFrame}
              className={`w-16 h-16 rounded-full border-4 border-violet-500/40 p-1 flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer ${
                isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'
              }`}
              title="Capture card photo"
            >
              <div className="w-full h-full rounded-full bg-white hover:bg-slate-200 transition-colors shadow-inner flex items-center justify-center">
                <Camera className="w-6 h-6 text-slate-900" />
              </div>
            </button>

            {/* Quick manual search fallback button */}
            <button
              type="button"
              onClick={() => {
                const query = prompt('Enter Card Name to search Scryfall:');
                if (query) {
                  handleSelectManualCard(query);
                }
              }}
              className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Manual Name Search"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Gemini API Key Configuration Drawer / Modal */}
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
              Google Gemini Vision powers the instant recognition of card titles, set codes, and collector numbers directly from your camera.
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
