import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
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
  RefreshCw, 
  ExternalLink, 
  Volume2, 
  Layers, 
  ChevronUp, 
  ChevronDown, 
  Check, 
  X,
  XCircle,
  Copy,
  Bot,
  Cpu,
  Sliders,
  Trash2,
  Code,
  Eye,
  Sun,
  Info,
  Image
} from 'lucide-react';
import { JsonErrorModal } from './JsonErrorModal';
import { getTcgplayerMarketPrice } from '../utils/priceUtils';
import { ScryfallCard, Binder } from '../types/mtg';
import { getCardNames } from '../utils/cardNameUtils';
import { 
  optimizeCardImage, 
  identifyCardFromImage, 
  getStoredGeminiApiKey, 
  setStoredGeminiApiKey,
  getStoredGeminiModel,
  setStoredGeminiModel,
  getStoredScanEngine,
  setStoredScanEngine,
  getStoredScanTarget,
  setStoredScanTarget,
  getStoredRescanFull,
  setStoredRescanFull,
  ScanEngineMode,
  ScanTargetMode,
  POPULAR_GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL
} from '../services/cardScannerService';

// Calculate live camera image quality metrics (brightness %, contrast score, glare check)
export function analyzeCanvasImageQuality(canvas: HTMLCanvasElement): {
  brightnessPercent: number;
  contrastScore: number;
  glarePercent: number;
  qualityLabel: string;
  recommendations: string[];
} {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    return {
      brightnessPercent: 50,
      contrastScore: 50,
      glarePercent: 0,
      qualityLabel: 'Unknown',
      recommendations: [],
    };
  }

  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    let totalLuminance = 0;
    let brightPixelCount = 0;
    const sampleStep = 16; // every 4th pixel RGBA
    const totalSamples = pixels.length / sampleStep;

    const luminances: number[] = [];

    for (let i = 0; i < pixels.length; i += sampleStep) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;
      luminances.push(lum);
      if (lum > 240) {
        brightPixelCount++;
      }
    }

    const avgLum = totalLuminance / Math.max(1, totalSamples);
    const brightnessPercent = Math.round((avgLum / 255) * 100);
    const glarePercent = Math.round((brightPixelCount / Math.max(1, totalSamples)) * 100);

    let sumSqDiff = 0;
    for (let i = 0; i < luminances.length; i++) {
      const diff = luminances[i] - avgLum;
      sumSqDiff += diff * diff;
    }
    const variance = sumSqDiff / Math.max(1, luminances.length);
    const contrastScore = Math.min(100, Math.round(Math.sqrt(variance)));

    const recommendations: string[] = [];
    let qualityLabel = 'Good Lighting & Clarity';

    if (brightnessPercent < 28) {
      qualityLabel = '⚠️ Underexposed / Too Dark';
      recommendations.push('Turn on room lights or tap the 🔦 Flashlight icon to illuminate the card.');
    } else if (brightnessPercent > 82) {
      qualityLabel = '⚠️ Overexposed / Too Bright';
      recommendations.push('Avoid direct overhead spotlights to prevent blowing out text.');
    }

    if (glarePercent > 12) {
      qualityLabel = '⚠️ Surface Glare Detected';
      recommendations.push('Tilt card slightly away from direct overhead light or camera flash to remove glare.');
    }

    if (contrastScore < 20) {
      recommendations.push('Ensure card is in clear focus and held steady.');
    }

    return {
      brightnessPercent,
      contrastScore,
      glarePercent,
      qualityLabel,
      recommendations,
    };
  } catch (e) {
    return {
      brightnessPercent: 50,
      contrastScore: 50,
      glarePercent: 0,
      qualityLabel: 'Captured Frame',
      recommendations: [],
    };
  }
}
import { playScanSuccessSound, playScanErrorSound, unlockAudio } from '../utils/soundUtils';
import { getCardImageUrl, getAutocomplete, fetchCardPrints } from '../services/api';
import { filterPaperCardsOnly } from '../utils/cardUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export interface BatchScannedCard {
  id: string;
  card: ScryfallCard;
  quantity: number;
  isFoil: boolean;
  timestamp: number;
  scanEngine?: 'ocr' | 'gemini';
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
  onUpdateCardInBinder?: (
    oldCard: ScryfallCard,
    oldFoil: boolean,
    newCard: ScryfallCard,
    newFoil: boolean,
    quantity: number,
    targetBinderId?: string
  ) => Promise<void> | void;
  onDeleteCardFromBinder?: (
    card: ScryfallCard,
    isFoil: boolean,
    quantity: number,
    targetBinderId?: string
  ) => Promise<void> | void;
}

export const CardScannerModal: React.FC<CardScannerModalProps> = ({
  isOpen,
  onClose,
  binders,
  activeBinder,
  onAddCardToBinder,
  onUpdateCardInBinder,
  onDeleteCardFromBinder,
}) => {
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  // Video and Stream state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reticleRef = useRef<HTMLDivElement | null>(null);

  // Scanner stream state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Diagnostic State for Captured Frame Inspection
  const [lastCapturedImage, setLastCapturedImage] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    scanTarget: ScanTargetMode;
    scanEngine: ScanEngineMode;
    timestamp: number;
    diagnostics: ReturnType<typeof analyzeCanvasImageQuality>;
    usedFullFrameFallback?: boolean;
  } | null>(null);
  const [showInspectImageModal, setShowInspectImageModal] = useState<boolean>(false);

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

  // Realtime Persistent Counts (Successes & Failures)
  const [successCount, setSuccessCount] = useState<number>(0);
  const [failureCount, setFailureCount] = useState<number>(0);
  const [hasCopiedError, setHasCopiedError] = useState<boolean>(false);

  // Quick Fade-out Notification Toasts
  const [quickNotice, setQuickNotice] = useState<{
    type: 'success' | 'failure';
    title: string;
    detail?: string;
    imageUrl?: string;
    isFoil?: boolean;
    rawJson?: string;
    timestamp: number;
    suggestions?: string[];
  } | null>(null);

  // Error Log History State (View on demand)
  const [errorLogs, setErrorLogs] = useState<{
    id: string;
    title: string;
    detail?: string;
    rawJson?: string;
    imageDataUrl?: string;
    suggestions?: string[];
    timestamp: number;
  }[]>([]);
  const [showErrorDropdown, setShowErrorDropdown] = useState<boolean>(false);

  // Raw JSON Error Inspector Modal State
  const [inspectJsonData, setInspectJsonData] = useState<{
    title: string;
    errorMessage?: string;
    rawJson: string;
  } | null>(null);

  // Automatic Crosshairs Detection State
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(true);
  const [isCrosshairLocked, setIsCrosshairLocked] = useState<boolean>(false);
  const [swapGuidanceText, setSwapGuidanceText] = useState<string>('Position card in crosshairs');
  const cardSwapStateRef = useRef<'WAITING_FOR_REMOVAL' | 'WAITING_FOR_NEW_CARD' | 'SETTLING'>('WAITING_FOR_NEW_CARD');
  const hasSeenCardRemovalRef = useRef<boolean>(true);
  const prevFrameLumaRef = useRef<Float32Array | null>(null);
  const steadyCountRef = useRef<number>(0);
  const lastScannedLumaRef = useRef<Float32Array | null>(null);
  const lastScanTimestampRef = useRef<number>(0);

  // Batch Session state (accumulates all cards scanned while camera stays open)
  const [scannedBatchCards, setScannedBatchCards] = useState<BatchScannedCard[]>([]);
  const [showBatchDrawer, setShowBatchDrawer] = useState(false);

  // API Key Settings Modal
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getStoredGeminiApiKey());
  const [selectedModel, setSelectedModel] = useState<string>(() => getStoredGeminiModel());
  const [scanEngine, setScanEngine] = useState<ScanEngineMode>(() => getStoredScanEngine());
  const [scanTarget, setScanTarget] = useState<ScanTargetMode>(() => getStoredScanTarget());
  const [enableRescanFull, setEnableRescanFull] = useState<boolean>(() => getStoredRescanFull());
  const [apiKeySavedSuccess, setApiKeySavedSuccess] = useState(false);

  // Manual fallback search & version picker
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualSuggestions, setManualSuggestions] = useState<string[]>([]);
  const [isSearchingManual, setIsSearchingManual] = useState(false);
  const [manualPrints, setManualPrints] = useState<ScryfallCard[]>([]);
  const [selectedManualVersion, setSelectedManualVersion] = useState<ScryfallCard | null>(null);
  const [selectedManualFoil, setSelectedManualFoil] = useState<boolean>(false);
  const [selectedManualQuantity, setSelectedManualQuantity] = useState<number>(1);
  const [manualVersionFilter, setManualVersionFilter] = useState<string>('');
  const [manualAddSuccess, setManualAddSuccess] = useState<string | null>(null);

  // Edit Card Version / Finish state
  const [editingBatchItem, setEditingBatchItem] = useState<BatchScannedCard | null>(null);
  const [editPrintsList, setEditPrintsList] = useState<ScryfallCard[]>([]);
  const [isLoadingEditPrints, setIsLoadingEditPrints] = useState<boolean>(false);
  const [selectedEditCard, setSelectedEditCard] = useState<ScryfallCard | null>(null);
  const [selectedEditFoil, setSelectedEditFoil] = useState<boolean>(false);
  const [selectedEditQuantity, setSelectedEditQuantity] = useState<number>(1);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editVersionFilter, setEditVersionFilter] = useState<string>('');

  // Auto fade-out timer for quick success/failure notification toast (all toasts fade out automatically in 3.5s)
  useEffect(() => {
    if (!quickNotice) return;
    const duration = 3500;
    const timer = setTimeout(() => {
      setQuickNotice(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [quickNotice]);

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

        // Apply continuous focus/exposure track constraints on mobile/webcam
        const track = stream.getVideoTracks()[0];
        if (track && track.applyConstraints) {
          try {
            await track.applyConstraints({
              advanced: [
                { focusMode: 'continuous' } as any,
                { exposureMode: 'continuous' } as any,
                { whiteBalanceMode: 'continuous' } as any,
              ],
            });
          } catch {}
        }

        // Check torch capability
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
    setIsCrosshairLocked(false);
  }, []);

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setScannedBatchCards([]);
      setQuickNotice(null);
      setIsProcessing(false);
      setShowBatchDrawer(false);
      setIsCrosshairLocked(false);
      setSuccessCount(0);
      setFailureCount(0);
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
  const handleProcessImage = async (
    imageSource: Blob | File | HTMLVideoElement | HTMLCanvasElement,
    isCroppedReticle = false
  ) => {
    unlockAudio();
    setIsProcessing(true);
    setStatusMessage('Analyzing photo...');

    let currentCapturedDataUrl = '';
    let currentDiagnostics = {
      brightnessPercent: 50,
      contrastScore: 50,
      glarePercent: 0,
      qualityLabel: 'Captured Frame',
      recommendations: [] as string[],
    };

    try {
      const { dataUrl, base64Only } = await optimizeCardImage(imageSource);
      currentCapturedDataUrl = dataUrl;

      // Calculate diagnostics on canvas if available
      if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
        currentDiagnostics = analyzeCanvasImageQuality(imageSource);
        setLastCapturedImage({
          dataUrl,
          width: imageSource.width,
          height: imageSource.height,
          scanTarget,
          scanEngine,
          timestamp: Date.now(),
          diagnostics: currentDiagnostics,
        });
      }

      const apiKey = getStoredGeminiApiKey();
      if (scanEngine === 'gemini_only' && !apiKey) {
        setStatusMessage('');
        setIsProcessing(false);
        setIsCrosshairLocked(false);
        setFailureCount((c) => c + 1);
        playScanErrorSound();
        setShowApiKeyModal(true);
        setQuickNotice({
          type: 'failure',
          title: 'Gemini API Key Required',
          detail: 'Enter your free Gemini key in settings to enable Gemini Vision scanning.',
          timestamp: Date.now(),
        });
        return;
      }

      if (scanEngine === 'hybrid') {
        setStatusMessage('Scanning card (Local OCR)...');
      } else if (scanEngine === 'ocr_only') {
        setStatusMessage('Scanning card (Local OCR)...');
      } else {
        setStatusMessage('Identifying card with Gemini...');
      }

      const scanResult = await identifyCardFromImage(base64Only, apiKey, scanEngine, scanTarget);

      const finalIsFoil = overrideFoil !== null ? overrideFoil : scanResult.isFoil;
      const engineLabel = scanResult.scanEngine === 'ocr' ? '⚡ Local OCR' : '🤖 Gemini 3.8 Flash';
      setStatusMessage(`Found "${scanResult.card.name}" (${engineLabel})!`);

      // Automatically add card to the chosen binder!
      await onAddCardToBinder(scanResult.card, cardQuantity, finalIsFoil, selectedBinderId);

      // Play success chime!
      playScanSuccessSound();

      // Update realtime success count & batch list
      setSuccessCount((c) => c + 1);
      const batchItem: BatchScannedCard = {
        id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        card: scanResult.card,
        quantity: cardQuantity,
        isFoil: finalIsFoil,
        timestamp: Date.now(),
        scanEngine: scanResult.scanEngine,
      };

      setScannedBatchCards((prev) => [batchItem, ...prev]);

      lastScanTimestampRef.current = Date.now();
      setStatusMessage('');
      setIsProcessing(false);
      setIsCrosshairLocked(false);
    } catch (err: any) {
      // 2nd Chance Fallback: If reticle crop scan failed, optionally attempt full-frame uncropped camera view
      // (Only when enabled by user in settings, and NEVER in footer mode where full video frame is redundant)
      if (enableRescanFull && scanTarget !== 'footer' && isCroppedReticle && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          setStatusMessage('Rescanning full video view...');
          const video = videoRef.current;
          const fullCanvas = document.createElement('canvas');
          const maxDim = 960;
          let targetW = video.videoWidth;
          let targetH = video.videoHeight;
          if (targetW > maxDim || targetH > maxDim) {
            if (targetW > targetH) {
              targetW = maxDim;
              targetH = Math.round((video.videoHeight * maxDim) / video.videoWidth);
            } else {
              targetH = maxDim;
              targetW = Math.round((video.videoWidth * maxDim) / video.videoHeight);
            }
          }
          fullCanvas.width = targetW;
          fullCanvas.height = targetH;
          const fullCtx = fullCanvas.getContext('2d');
          if (fullCtx) {
            fullCtx.imageSmoothingEnabled = true;
            fullCtx.imageSmoothingQuality = 'high';
            fullCtx.drawImage(video, 0, 0, targetW, targetH);
            const { dataUrl: fullDataUrl, base64Only: fullBase64 } = await optimizeCardImage(fullCanvas);
            const apiKey = getStoredGeminiApiKey();
            const fallbackResult = await identifyCardFromImage(fullBase64, apiKey, scanEngine, 'full');

            const finalIsFoil = overrideFoil !== null ? overrideFoil : fallbackResult.isFoil;
            const engineLabel = fallbackResult.scanEngine === 'ocr' ? '⚡ Local OCR' : '🤖 Gemini 3.8 Flash';
            setStatusMessage(`Found "${fallbackResult.card.name}" (${engineLabel})!`);

            await onAddCardToBinder(fallbackResult.card, cardQuantity, finalIsFoil, selectedBinderId);
            playScanSuccessSound();
            setSuccessCount((c) => c + 1);

            const batchItem: BatchScannedCard = {
              id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              card: fallbackResult.card,
              quantity: cardQuantity,
              isFoil: finalIsFoil,
              timestamp: Date.now(),
              scanEngine: fallbackResult.scanEngine,
            };
            setScannedBatchCards((prev) => [batchItem, ...prev]);

            lastScanTimestampRef.current = Date.now();
            setStatusMessage('');
            setIsProcessing(false);
            setIsCrosshairLocked(false);
            return;
          }
        } catch (fallbackErr) {
          console.warn('[CardScanner] Full frame rescan fallback also failed:', fallbackErr);
        }
      }

      console.error('[CardScanner] Scan error:', err);
      playScanErrorSound();
      setFailureCount((c) => c + 1);

      let errorDetail = err?.message || 'Could not recognize card. Ensure card is clear, centered, and well-lit.';
      let errorTitle = 'Scan Failed';

      if (err?.errorType === 'lookup_failed' || errorDetail.includes('[Scryfall Lookup Issue]')) {
        errorTitle = 'Scryfall Lookup Issue';
      } else if (err?.errorType === 'scan_failed' || errorDetail.includes('[Optical Scan Issue]') || errorDetail.includes('[OCR Scan Failed]')) {
        errorTitle = 'Camera Read Issue';
      }

      if (errorDetail.includes('no longer available') || errorDetail.includes('gemini-2.0')) {
        setStoredGeminiModel(DEFAULT_GEMINI_MODEL);
        setSelectedModel(DEFAULT_GEMINI_MODEL);
        errorDetail = 'Updated scanner to Gemini 3.8 Flash. Please retry your scan.';
      } else if (
        errorDetail.includes('quota') ||
        errorDetail.includes('429') ||
        errorDetail.includes('RESOURCE_EXHAUSTED') ||
        errorDetail.includes('free-tier') ||
        errorDetail.includes('free tier')
      ) {
        errorTitle = scanEngine === 'hybrid' ? 'Hybrid AI Fallback Quota Limit' : 'Gemini Rate Limit';
        if (scanEngine === 'hybrid') {
          errorDetail = 'Fast Local OCR could not read this card, and the Gemini fallback hit its free-tier rate limit (15 scans/min). Tap "Switch to Local OCR Only" below for unlimited 100% free scans, or ensure the card title and footer are well-lit.';
        }
      }

      if (errorTitle === 'Camera Read Issue' && currentDiagnostics) {
        errorDetail += `\n[Image Diagnostics: Light ${currentDiagnostics.brightnessPercent}% · Contrast ${currentDiagnostics.contrastScore}/100 · ${currentDiagnostics.qualityLabel}]`;
      }

      const rawJsonText = err?.rawResponseText || err?.rawJson || err?.rawOutput || (typeof err?.message === 'string' && (err.message.includes('{') || err.message.includes('[')) ? err.message : undefined);

      let suggestions: string[] = [];
      const quotedMatch = errorDetail.match(/"([^"]{2,35})"/);
      const candidateQuery = quotedMatch ? quotedMatch[1] : '';
      if (candidateQuery && candidateQuery.length >= 3) {
        try {
          const results = await getAutocomplete(candidateQuery.slice(0, 20));
          if (Array.isArray(results) && results.length > 0) {
            suggestions = results.slice(0, 3);
          }
        } catch {}
      }

      const errorLogItem = {
        id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        title: errorTitle,
        detail: errorDetail,
        rawJson: rawJsonText,
        imageDataUrl: currentCapturedDataUrl || undefined,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        timestamp: Date.now(),
      };
      setErrorLogs((prev) => [errorLogItem, ...prev]);

      setQuickNotice({
        type: 'failure',
        title: errorTitle,
        detail: errorDetail,
        rawJson: rawJsonText,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        timestamp: Date.now(),
      });

      setStatusMessage('');
      setIsProcessing(false);
      setIsCrosshairLocked(false);
    }
  };

  // Capture current live video frame with exact screen-to-video source coordinates
  const handleCaptureFrame = () => {
    if (!videoRef.current || isProcessing) return;
    try {
      navigator.vibrate?.(40);
    } catch {}

    const video = videoRef.current;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (vw && vh && video.clientWidth && video.clientHeight) {
      let cropX = 0;
      let cropY = 0;
      let cropW = vw;
      let cropH = vh;
      let isCroppedReticle = false;

      if (reticleRef.current) {
        const reticleRect = reticleRef.current.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();

        if (videoRect.width > 0 && videoRect.height > 0 && reticleRect.width > 0 && reticleRect.height > 0) {
          const scale = Math.max(videoRect.width / vw, videoRect.height / vh);
          const scaledW = vw * scale;
          const scaledH = vh * scale;
          const offsetX = (videoRect.width - scaledW) / 2;
          const offsetY = (videoRect.height - scaledH) / 2;

          const relX = reticleRect.left - videoRect.left;
          const relY = reticleRect.top - videoRect.top;

          // Add a generous 6% safety margin around reticle box so text edges aren't shaved off
          const padX = reticleRect.width * 0.06;
          const padY = reticleRect.height * 0.06;

          const paddedX = Math.max(0, relX - padX);
          const paddedY = Math.max(0, relY - padY);
          const paddedW = Math.min(videoRect.width - paddedX, reticleRect.width + padX * 2);
          const paddedH = Math.min(videoRect.height - paddedY, reticleRect.height + padY * 2);

          cropX = Math.max(0, Math.round((paddedX - offsetX) / scale));
          cropY = Math.max(0, Math.round((paddedY - offsetY) / scale));
          cropW = Math.min(vw - cropX, Math.round(paddedW / scale));
          cropH = Math.min(vh - cropY, Math.round(paddedH / scale));
          isCroppedReticle = true;
        }
      }

      if (cropW > 80 && cropH > 80 && isCroppedReticle) {
        const canvas = document.createElement('canvas');
        const targetW = scanTarget === 'footer' ? 960 : 800;
        const targetH = scanTarget === 'footer' ? 280 : 1100;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
          handleProcessImage(canvas, true);
          return;
        }
      }
    }

    handleProcessImage(video, false);
  };

  // =========================================================================
  // Automatic Crosshairs Card Detection Effect with Motion Transition Tracking
  // Automatically detects when a previous card is removed / motion occurs,
  // then locks on when a new card comes into frame and settles steady.
  useEffect(() => {
    // Pauses scanning automatically if camera disabled, autoScan off, scanner processing, or card detail editor/settings open
    if (!cameraActive || !autoScanEnabled || isProcessing || editingBatchItem !== null || showApiKeyModal) return;

    const sampleW = 60;
    const sampleH = 84;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let isMounted = true;

    const interval = setInterval(() => {
      if (!isMounted || isProcessing || !videoRef.current || editingBatchItem !== null) return;
      const video = videoRef.current;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Sample central reticle zone
      const maxAllowedH = Math.round(vh * 0.80);
      let cropW = Math.round(vw * 0.60);
      let cropH = Math.round(cropW * 1.4);
      if (cropH > maxAllowedH) {
        cropH = maxAllowedH;
        cropW = Math.round(cropH / 1.4);
      }
      const cropX = Math.max(0, Math.round((vw - cropW) / 2));
      const cropY = Math.max(0, Math.round((vh - cropH) / 2));

      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, sampleW, sampleH);
      const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
      const d = imgData.data;

      const count = sampleW * sampleH;
      const currLuma = new Float32Array(count);
      let sum = 0;

      for (let i = 0; i < count; i++) {
        const idx = i * 4;
        const y = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        currLuma[i] = y;
        sum += y;
      }

      const mean = sum / count;

      // Calculate motion (frame-to-frame pixel delta)
      let motion = 0;
      if (prevFrameLumaRef.current) {
        let diffSum = 0;
        for (let i = 0; i < count; i++) {
          diffSum += Math.abs(currLuma[i] - prevFrameLumaRef.current[i]);
        }
        motion = diffSum / count;
      }
      prevFrameLumaRef.current = currLuma;

      // Calculate contrast (standard deviation of luminance)
      let varianceSum = 0;
      for (let i = 0; i < count; i++) {
        const diff = currLuma[i] - mean;
        varianceSum += diff * diff;
      }
      const stdDev = Math.sqrt(varianceSum / count);

      // Measure visual difference from the last scanned card
      let diffFromLast = 0;
      if (lastScannedLumaRef.current) {
        let lastDiffSum = 0;
        for (let i = 0; i < count; i++) {
          lastDiffSum += Math.abs(currLuma[i] - lastScannedLumaRef.current[i]);
        }
        diffFromLast = lastDiffSum / count;
      }

      const isCardInFrame = mean >= 25 && mean <= 240 && stdDev >= 12;

      // -------------------------------------------------------------
      // STATE 1: WAITING_FOR_REMOVAL (Previous card was scanned)
      // Strictly enforces that the old card MUST leave the reticle frame first.
      // -------------------------------------------------------------
      if (cardSwapStateRef.current === 'WAITING_FOR_REMOVAL') {
        // Card is considered removed if reticle goes empty (!isCardInFrame)
        // or significant motion/visual difference indicates the card left the reticle.
        const cardIsOut = !isCardInFrame || (motion > 7.0 && (diffFromLast > 10 || stdDev < 15));

        if (cardIsOut) {
          hasSeenCardRemovalRef.current = true;
          cardSwapStateRef.current = 'WAITING_FOR_NEW_CARD';
          steadyCountRef.current = 0;
          setIsCrosshairLocked(false);
          setSwapGuidanceText('Card removed — place next card in crosshairs');
        } else {
          setSwapGuidanceText('Card added! Remove card to scan next...');
        }
        return;
      }

      // -------------------------------------------------------------
      // STATE 2: WAITING_FOR_NEW_CARD (Old card is out, waiting for new card)
      // Detects when a new card enters the crosshairs frame.
      // -------------------------------------------------------------
      if (cardSwapStateRef.current === 'WAITING_FOR_NEW_CARD' || !hasSeenCardRemovalRef.current) {
        if (isCardInFrame) {
          cardSwapStateRef.current = 'SETTLING';
          steadyCountRef.current = 0;
          setIsCrosshairLocked(false);
          setSwapGuidanceText('New card detected — hold steady...');
        } else {
          cardSwapStateRef.current = 'WAITING_FOR_NEW_CARD';
          setSwapGuidanceText('Position next card in crosshairs');
        }
        return;
      }

      // -------------------------------------------------------------
      // STATE 3: SETTLING (New card is in frame, waiting for low motion)
      // Lock on and trigger scan when card is steady.
      // -------------------------------------------------------------
      if (!isCardInFrame) {
        // Card was pulled back out before settling
        cardSwapStateRef.current = 'WAITING_FOR_NEW_CARD';
        steadyCountRef.current = 0;
        setIsCrosshairLocked(false);
        setSwapGuidanceText('Position card in crosshairs');
        return;
      }

      // Enforce minimum time interval between scans (~1.0s)
      const timeSinceLastScan = Date.now() - lastScanTimestampRef.current;
      if (timeSinceLastScan < 1000) {
        steadyCountRef.current = 0;
        setIsCrosshairLocked(false);
        setSwapGuidanceText('Ready for next card...');
        return;
      }

      // Require low motion (motion < 7) for lock-on
      if (motion > 7) {
        steadyCountRef.current = 0;
        setIsCrosshairLocked(false);
        setSwapGuidanceText('Hold card steady in crosshairs...');
      } else {
        steadyCountRef.current += 1;
        setSwapGuidanceText('Card detected — hold still...');

        // Lock on after 2 consecutive steady samples (~560ms)
        if (steadyCountRef.current >= 2) {
          setIsCrosshairLocked(true);
          setSwapGuidanceText('Card locked in — scanning!');
          steadyCountRef.current = 0;
          hasSeenCardRemovalRef.current = false;
          lastScannedLumaRef.current = currLuma;
          lastScanTimestampRef.current = Date.now();
          cardSwapStateRef.current = 'WAITING_FOR_REMOVAL';
          handleCaptureFrame();
        }
      }
    }, 280);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cameraActive, autoScanEnabled, isProcessing, editingBatchItem, showApiKeyModal]);

  // File upload input change (supports all image files without forcing camera)
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

  // Open Version & Finish Editor for a scanned batch card
  const handleOpenVersionEditor = async (item: BatchScannedCard) => {
    // Reset swap state so scanner requires card removal when editor closes
    cardSwapStateRef.current = 'WAITING_FOR_REMOVAL';
    hasSeenCardRemovalRef.current = false;
    lastScanTimestampRef.current = Date.now();
    steadyCountRef.current = 0;
    setIsCrosshairLocked(false);

    setEditingBatchItem(item);
    setSelectedEditCard(item.card);
    setSelectedEditFoil(item.isFoil);
    setSelectedEditQuantity(item.quantity || 1);
    setEditPrintsList([]);
    setIsLoadingEditPrints(true);

    try {
      const cleanName = item.card.name.split(' // ')[0].trim();
      const rawPrints = await fetchCardPrints(cleanName);
      const prints = filterPaperCardsOnly(rawPrints);
      if (Array.isArray(prints) && prints.length > 0) {
        const selectedId = item.card.id;
        const selectedIndex = prints.findIndex((p) => p.id === selectedId);
        if (selectedIndex > 0) {
          const selectedPrint = prints[selectedIndex];
          const reordered = [
            selectedPrint,
            ...prints.slice(0, selectedIndex),
            ...prints.slice(selectedIndex + 1),
          ];
          setEditPrintsList(reordered);
        } else {
          setEditPrintsList(prints);
        }
      }
    } catch (err) {
      console.warn('[CardScanner] Error fetching prints for edit:', err);
    } finally {
      setIsLoadingEditPrints(false);
    }
  };

  // Adjust quantity of a previously scanned card in the batch
  const handleUpdateBatchCardQuantity = async (item: BatchScannedCard, delta: number) => {
    // Re-arm swap requirement so stepper clicks don't re-trigger scanning
    cardSwapStateRef.current = 'WAITING_FOR_REMOVAL';
    hasSeenCardRemovalRef.current = false;
    lastScanTimestampRef.current = Date.now();
    steadyCountRef.current = 0;
    setIsCrosshairLocked(false);

    const currentQty = item.quantity || 1;
    const newQty = currentQty + delta;

    if (newQty <= 0) {
      await handleDeleteBatchCard(item);
      return;
    }

    try {
      if (delta > 0) {
        await onAddCardToBinder(item.card, delta, item.isFoil, selectedBinderId);
        setSuccessCount((c) => c + delta);
      } else if (delta < 0 && onDeleteCardFromBinder) {
        await onDeleteCardFromBinder(item.card, item.isFoil, Math.abs(delta), selectedBinderId);
        setSuccessCount((c) => Math.max(0, c - Math.abs(delta)));
      }

      // Update in local batch cards state
      setScannedBatchCards((prev) =>
        prev.map((b) => (b.id === item.id ? { ...b, quantity: newQty } : b))
      );

      // Refresh toast notification with updated quantity
      const scanNames = getCardNames(item.card);
      setQuickNotice({
        type: 'success',
        title: `Added ${newQty}x ${scanNames.actualName}`,
        detail: `${newQty} copies in ${currentBinder?.name || 'Binder'} · ${item.card.set?.toUpperCase()} #${item.card.collector_number}`,
        imageUrl: getCardImageUrl(item.card, 'small'),
        isFoil: item.isFoil,
        timestamp: Date.now(),
      });

      playScanSuccessSound();
      try {
        navigator.vibrate?.(30);
      } catch {}
    } catch (err) {
      console.error('[CardScanner] Error updating batch card quantity:', err);
    }
  };

  // Save updated version / finish / quantity to binder
  const handleSaveCardEdit = async () => {
    if (!editingBatchItem || !selectedEditCard) return;
    setIsSavingEdit(true);

    try {
      const oldQty = editingBatchItem.quantity || 1;
      const targetQty = selectedEditQuantity || 1;

      // 1. If card or foil changed, update through onUpdateCardInBinder
      const cardChanged = selectedEditCard.id !== editingBatchItem.card.id;
      const foilChanged = selectedEditFoil !== editingBatchItem.isFoil;

      if ((cardChanged || foilChanged) && onUpdateCardInBinder) {
        await onUpdateCardInBinder(
          editingBatchItem.card,
          editingBatchItem.isFoil,
          selectedEditCard,
          selectedEditFoil,
          oldQty,
          selectedBinderId
        );
      }

      // 2. Adjust quantity delta if changed
      if (targetQty > oldQty) {
        const delta = targetQty - oldQty;
        await onAddCardToBinder(selectedEditCard, delta, selectedEditFoil, selectedBinderId);
        setSuccessCount((c) => c + delta);
      } else if (targetQty < oldQty && onDeleteCardFromBinder) {
        const delta = oldQty - targetQty;
        await onDeleteCardFromBinder(selectedEditCard, selectedEditFoil, delta, selectedBinderId);
        setSuccessCount((c) => Math.max(0, c - delta));
      }

      // Update in local batch state
      setScannedBatchCards((prev) =>
        prev.map((item) =>
          item.id === editingBatchItem.id
            ? { ...item, card: selectedEditCard, isFoil: selectedEditFoil, quantity: targetQty }
            : item
        )
      );

      const editNames = getCardNames(selectedEditCard);
      // Show quick notification
      setQuickNotice({
        type: 'success',
        title: `Updated: ${targetQty}x ${editNames.actualName}`,
        detail: `${editNames.hasAlternateName && editNames.subtitle ? `${editNames.subtitle} · ` : ''}${selectedEditCard.set?.toUpperCase()} #${selectedEditCard.collector_number} · ${selectedEditFoil ? 'Foil' : 'Regular'}`,
        imageUrl: getCardImageUrl(selectedEditCard, 'small'),
        isFoil: selectedEditFoil,
        timestamp: Date.now(),
      });

      setEditingBatchItem(null);
    } catch (err) {
      console.error('[CardScanner] Error updating card:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete scanned card from binder and batch session if scan was incorrect
  const handleDeleteBatchCard = async (item: BatchScannedCard) => {
    try {
      if (onDeleteCardFromBinder) {
        await onDeleteCardFromBinder(item.card, item.isFoil, item.quantity, selectedBinderId);
      }
      setScannedBatchCards((prev) => prev.filter((b) => b.id !== item.id));
      setSuccessCount((c) => Math.max(0, c - 1));
      setEditingBatchItem(null);
      setQuickNotice({
        type: 'success',
        title: `Deleted "${item.card.name}"`,
        detail: 'Removed from binder and batch queue',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[CardScanner] Error deleting card:', err);
    }
  };

  const handleSelectManualCard = async (name: string) => {
    setIsSearchingManual(true);
    unlockAudio();
    try {
      const rawPrints = await fetchCardPrints(name);
      const prints = filterPaperCardsOnly(rawPrints);
      if (prints.length > 0) {
        setManualPrints(prints);
        setSelectedManualVersion(prints[0]);
        setSelectedManualFoil(overrideFoil ?? false);
        setSelectedManualQuantity(cardQuantity || 1);
        setManualVersionFilter('');
      } else {
        playScanErrorSound();
        setFailureCount((c) => c + 1);
        setQuickNotice({
          type: 'failure',
          title: 'Card Not Found',
          detail: `Could not find "${name}" on Scryfall.`,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      playScanErrorSound();
      setFailureCount((c) => c + 1);
      setQuickNotice({
        type: 'failure',
        title: 'Search Failed',
        detail: err?.message || 'Failed to fetch card details.',
        timestamp: Date.now(),
      });
    } finally {
      setIsSearchingManual(false);
    }
  };

  const handleConfirmAddManualCard = async () => {
    if (!selectedManualVersion) return;
    setIsSearchingManual(true);
    setManualAddSuccess(null);
    try {
      const cardToAdd = selectedManualVersion;
      const isFoil = selectedManualFoil;
      const qty = selectedManualQuantity;
      await onAddCardToBinder(cardToAdd, qty, isFoil, selectedBinderId);
      playScanSuccessSound();
      setSuccessCount((c) => c + 1);

      const batchItem: BatchScannedCard = {
        id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        card: cardToAdd,
        quantity: qty,
        isFoil,
        timestamp: Date.now(),
      };
      setScannedBatchCards((prev) => [batchItem, ...prev]);

      // Set inline success feedback banner inside the modal (no bottom popup banner)
      setManualAddSuccess(`Added ${qty}x ${cardToAdd.name} [${cardToAdd.set?.toUpperCase()} #${cardToAdd.collector_number}] ${isFoil ? '✨ Foil' : ''} to binder!`);
    } catch (err: any) {
      playScanErrorSound();
      setFailureCount((c) => c + 1);
    } finally {
      setIsSearchingManual(false);
    }
  };

  if (!isOpen) return null;

  const currentBinder = binders.find((b) => b.id === selectedBinderId) || activeBinder || binders[0];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white overflow-hidden animate-in fade-in duration-200">
      {/* Top Header: Responsive Multi-tier Layout ensuring Hybrid Badge & Controls are 100% visible on mobile */}
      <div className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 z-30 px-3 sm:px-4 py-2 space-y-2 sm:space-y-0">
        {/* Top Row: Binder + Hybrid Engine Badge + Done Button */}
        <div className="flex items-center justify-between gap-2">
          {/* Target Binder Selector */}
          <div className="flex items-center gap-2 min-w-0 max-w-[38%] sm:max-w-none">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
              <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0">
              <div className="hidden sm:block text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">
                Target Binder
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                <select
                  value={selectedBinderId}
                  onChange={(e) => setSelectedBinderId(e.target.value)}
                  className="bg-transparent text-slate-200 font-semibold hover:text-white border-none focus:outline-none focus:ring-0 p-0 text-xs cursor-pointer truncate max-w-[95px] sm:max-w-[170px]"
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

          {/* Realtime Success & Failure Persistent Badge (Desktop only inline) */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 shadow-inner text-xs font-semibold shrink-0">
            <span
              className="flex items-center gap-1 text-emerald-400 font-bold"
              title="Successful card scans added to binder"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{successCount}</span>
              <span className="font-normal text-[11px] text-emerald-300/80">Added</span>
            </span>
            <span className="text-slate-600 font-normal">|</span>
            <button
              type="button"
              onClick={() => setShowErrorDropdown((prev) => !prev)}
              className={`flex items-center gap-1 font-bold cursor-pointer transition-all px-2 py-0.5 rounded-full ${
                errorLogs.length > 0
                  ? 'text-rose-300 bg-rose-950/90 border border-rose-600/70 hover:bg-rose-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Click to view error log on demand"
            >
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>{failureCount}</span>
              <span className="font-normal text-[11px]">Errors</span>
              {errorLogs.length > 0 && <ChevronDown className="w-3 h-3 text-rose-300" />}
            </button>
          </div>

          {/* Prominent Center Hybrid Mode Badge (100% visible on mobile and desktop) */}
          <div className="flex items-center justify-center shrink-0">
            <button
              type="button"
              onClick={() => {
                const nextMode: Record<ScanEngineMode, ScanEngineMode> = {
                  hybrid: 'ocr_only',
                  ocr_only: 'gemini_only',
                  gemini_only: 'hybrid',
                };
                const next = nextMode[scanEngine];
                setScanEngine(next);
                setStoredScanEngine(next);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer shadow-md active:scale-95 ${
                scanEngine === 'hybrid'
                  ? 'bg-gradient-to-r from-violet-900/95 to-fuchsia-900/95 border-violet-400 text-violet-100 shadow-violet-500/30 ring-1 ring-violet-400/60'
                  : scanEngine === 'ocr_only'
                  ? 'bg-emerald-950/95 border-emerald-400 text-emerald-100 shadow-emerald-500/30 ring-1 ring-emerald-400/60'
                  : 'bg-indigo-950/95 border-indigo-400 text-indigo-100 shadow-indigo-500/30 ring-1 ring-indigo-400/60'
              }`}
              title={`Active Scan Engine: ${
                scanEngine === 'hybrid'
                  ? 'Hybrid Model (Fast Local OCR + Gemini 3.8 Flash Fallback)'
                  : scanEngine === 'ocr_only'
                  ? 'Local OCR Only (Free / Unlimited / On-Device)'
                  : 'Gemini 3.8 Flash Only'
              }. Tap to cycle mode.`}
            >
              {scanEngine === 'hybrid' && <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />}
              {scanEngine === 'ocr_only' && <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              {scanEngine === 'gemini_only' && <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              <span className="font-extrabold text-xs tracking-wide">
                {scanEngine === 'hybrid' ? 'Hybrid' : scanEngine === 'ocr_only' ? 'OCR Only' : 'Gemini'}
              </span>
            </button>
          </div>

          {/* Right Action Tools & Done Button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Desktop API Key Config */}
            <button
              type="button"
              onClick={() => setShowApiKeyModal(true)}
              className={`hidden sm:flex p-2 rounded-lg text-xs font-medium transition-colors items-center gap-1 ${
                getStoredGeminiApiKey()
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 animate-pulse'
              }`}
              title="Configure Gemini API Key"
            >
              <Key className="w-4 h-4" />
              <span>{getStoredGeminiApiKey() ? 'API Key' : 'Set Key'}</span>
            </button>

            {/* Desktop Test Sound Button */}
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                playScanSuccessSound();
              }}
              className="hidden sm:flex p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Test audio chime"
            >
              <Volume2 className="w-4 h-4" />
            </button>

            {/* Done / Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1 active:scale-95"
              title="Finish scanning and return to binder"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          </div>
        </div>

        {/* Mobile Row 2: Live Counts + Secondary Actions (API Key, Sound, Flashlight) */}
        <div className="flex sm:hidden items-center justify-between pt-1 border-t border-slate-800/60 gap-2">
          {/* Live Added / Failed persistent counter */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-[11px] font-semibold shrink-0">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <CheckCircle2 className="w-3 h-3" />
              <span>{successCount}</span>
              <span className="font-normal text-[10px] text-emerald-300/80">Added</span>
            </span>
            <span className="text-slate-600 font-normal">|</span>
            <button
              type="button"
              onClick={() => setShowErrorDropdown((prev) => !prev)}
              className={`flex items-center gap-1 font-bold cursor-pointer transition-all px-1.5 py-0.5 rounded ${
                errorLogs.length > 0
                  ? 'text-rose-300 bg-rose-950/90 border border-rose-600/70 hover:bg-rose-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Click to view error log on demand"
            >
              <XCircle className="w-3 h-3 text-rose-400" />
              <span>{failureCount}</span>
              <span className="font-normal text-[10px]">Errors</span>
            </button>
          </div>

          {/* Quick Tools on Mobile */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  torchOn ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Toggle flashlight"
              >
                <span>{torchOn ? 'Torch On' : 'Torch'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowApiKeyModal(true)}
              className={`p-1.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                getStoredGeminiApiKey()
                  ? 'bg-slate-800 text-slate-300'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
              }`}
              title="Configure Gemini API Key"
            >
              <Key className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                playScanSuccessSound();
              }}
              className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Test audio chime"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </div>
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

        {/* Card Alignment Reticle Frame (Full Card vs Footer Text Only) */}
        {scanTarget === 'footer' ? (
          <div
            ref={reticleRef}
            className={`relative z-10 w-[94vw] max-w-[460px] h-[125px] pointer-events-none flex flex-col justify-between p-3.5 transition-all duration-200 rounded-2xl bg-black/5 border-2 ${
              isCrosshairLocked || isProcessing
                ? 'border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.5)]'
                : 'border-amber-400/90 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
            }`}
          >
            <div className="flex justify-between items-center">
              <div
                className={`w-6 h-6 border-t-3 border-l-3 rounded-tl-lg ${
                  isCrosshairLocked || isProcessing ? 'border-emerald-400' : 'border-amber-400'
                }`}
              />
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-amber-300 px-2 py-0.5 rounded bg-black/80 border border-amber-500/40">
                🔎 ALIGN FOOTER TEXT (e.g. 045 BLB)
              </span>
              <div
                className={`w-6 h-6 border-t-3 border-r-3 rounded-tr-lg ${
                  isCrosshairLocked || isProcessing ? 'border-emerald-400' : 'border-amber-400'
                }`}
              />
            </div>
            <div className="flex justify-between items-center">
              <div
                className={`w-6 h-6 border-b-3 border-l-3 rounded-bl-lg ${
                  isCrosshairLocked || isProcessing ? 'border-emerald-400' : 'border-amber-400'
                }`}
              />
              <span className="text-[9.5px] font-mono text-slate-200">
                {isProcessing ? 'Reading footer...' : 'Center bottom border text'}
              </span>
              <div
                className={`w-6 h-6 border-b-3 border-r-3 rounded-br-lg ${
                  isCrosshairLocked || isProcessing ? 'border-emerald-400' : 'border-amber-400'
                }`}
              />
            </div>

            {/* Continuous Scanning Active Light */}
            {isProcessing && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_rgba(245,158,11,0.9)] animate-pulse" />
            )}
          </div>
        ) : (
          <div
            ref={reticleRef}
            className={`relative z-10 w-[90vw] max-w-[365px] sm:max-w-[390px] aspect-[1/1.4] pointer-events-none flex flex-col justify-between p-3.5 transition-all duration-200 ${
              isCrosshairLocked || isProcessing
                ? 'scale-102 shadow-[0_0_25px_rgba(52,211,153,0.3)]'
                : ''
            }`}
          >
            {/* Corner brackets (turn emerald green when card is locked in!) */}
            <div className="flex justify-between">
              <div
                className={`w-7 h-7 border-t-3 border-l-3 rounded-tl-lg shadow-sm transition-colors duration-200 ${
                  isCrosshairLocked || isProcessing
                    ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]'
                    : 'border-violet-500'
                }`}
              />
              <div
                className={`w-7 h-7 border-t-3 border-r-3 rounded-tr-lg shadow-sm transition-colors duration-200 ${
                  isCrosshairLocked || isProcessing
                    ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]'
                    : 'border-violet-500'
                }`}
              />
            </div>

            {/* Set & Number Highlight Region */}
            <div className="w-full flex items-end justify-between">
              <div
                className={`border rounded px-2 py-1 text-[10px] font-mono shadow-sm backdrop-blur-xs flex items-center gap-1 transition-colors ${
                  isCrosshairLocked || isProcessing
                    ? 'bg-emerald-900/80 border-emerald-400 text-emerald-200'
                    : 'bg-violet-900/70 border-violet-400/60 text-violet-200'
                }`}
              >
                <span>{isCrosshairLocked ? 'CARD LOCKED IN' : 'SET & # ↓'}</span>
                {cardQuantity > 1 && (
                  <span className="ml-1 pl-1 border-l border-white/30 font-bold text-amber-300">
                    +{cardQuantity}x copies
                  </span>
                )}
              </div>
              <div
                className={`w-7 h-7 border-b-3 border-r-3 rounded-br-lg shadow-sm transition-colors duration-200 ${
                  isCrosshairLocked || isProcessing
                    ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]'
                    : 'border-violet-500'
                }`}
              />
            </div>
            <div
              className={`absolute bottom-3 left-3 w-7 h-7 border-b-3 border-l-3 rounded-bl-lg shadow-sm transition-colors duration-200 ${
                isCrosshairLocked || isProcessing
                  ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]'
                  : 'border-violet-500'
              }`}
            />

            {/* Continuous Scanning Active Light */}
            {isProcessing && (
              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-pulse" />
            )}
          </div>
        )}

        {/* Top Hint Bar & Mode Badges over live camera */}
        <div className="absolute top-3 inset-x-3 sm:inset-x-4 z-20 flex items-center justify-between pointer-events-none gap-2">
          <div className="flex items-center gap-1.5 flex-wrap pointer-events-auto">
            {/* Prominent Target Framing Switcher: Full Card vs Footer Only */}
            <button
              type="button"
              onClick={() => {
                const nextTarget: ScanTargetMode = scanTarget === 'full' ? 'footer' : 'full';
                setScanTarget(nextTarget);
                setStoredScanTarget(nextTarget);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md border shadow-lg cursor-pointer transition-all active:scale-95 shrink-0 ${
                scanTarget === 'footer'
                  ? 'bg-amber-950/90 border-amber-400 text-amber-200 shadow-amber-500/20 ring-1 ring-amber-400/50'
                  : 'bg-slate-900/90 border-slate-700 text-slate-200 hover:border-slate-500'
              }`}
              title="Click to toggle between Full Card scan and Footer Text Only scan"
            >
              {scanTarget === 'footer' ? (
                <>
                  <Search className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>🔎 Footer Text Mode</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5 text-violet-400" />
                  <span>🃏 Full Card</span>
                </>
              )}
            </button>

            {/* Engine Mode Badge */}
            <button
              type="button"
              onClick={() => {
                const nextMode: Record<ScanEngineMode, ScanEngineMode> = {
                  hybrid: 'ocr_only',
                  ocr_only: 'gemini_only',
                  gemini_only: 'hybrid',
                };
                const next = nextMode[scanEngine];
                setScanEngine(next);
                setStoredScanEngine(next);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md border shadow-lg cursor-pointer transition-all active:scale-95 shrink-0 ${
                scanEngine === 'hybrid'
                  ? 'bg-violet-950/90 border-violet-400 text-violet-200 shadow-violet-500/20'
                  : scanEngine === 'ocr_only'
                  ? 'bg-emerald-950/90 border-emerald-400 text-emerald-200 shadow-emerald-500/20'
                  : 'bg-indigo-950/90 border-indigo-400 text-indigo-200 shadow-indigo-500/20'
              }`}
              title="Click to switch between Hybrid, Local OCR, and Gemini models"
            >
              {scanEngine === 'hybrid' && <Zap className="w-3.5 h-3.5 text-amber-400" />}
              {scanEngine === 'ocr_only' && <Cpu className="w-3.5 h-3.5 text-emerald-400" />}
              {scanEngine === 'gemini_only' && <Bot className="w-3.5 h-3.5 text-indigo-400" />}
              <span>{scanEngine === 'hybrid' ? '⚡ Hybrid' : scanEngine === 'ocr_only' ? '⚙️ Local OCR' : '🤖 Gemini'}</span>
            </button>
          </div>

          <div
            className={`backdrop-blur-md px-3 py-1 rounded-full border text-[10.5px] text-center shadow-lg transition-colors pointer-events-none max-w-[45%] truncate ${
              isCrosshairLocked || isProcessing
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200 font-bold'
                : 'bg-slate-900/85 border-slate-700/60 text-slate-200'
            }`}
          >
            {isProcessing
              ? (scanEngine === 'hybrid' ? '⚡ Reading text...' : 'Analyzing card...')
              : isCrosshairLocked
              ? 'Card locked in!'
              : autoScanEnabled
              ? swapGuidanceText
              : 'Center card & tap camera button'}
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

        {/* On-Demand Error Log History Dropdown Panel */}
        {showErrorDropdown && (
          <div className="absolute top-12 right-3 sm:right-6 z-50 w-[92vw] max-w-sm sm:max-w-md bg-slate-900/98 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 p-3.5 sm:p-4 text-white backdrop-blur-md">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-200">
                  Scan Error Log ({errorLogs.length})
                </h4>
              </div>
              <div className="flex items-center gap-2">
                {errorLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setErrorLogs([])}
                    className="text-[10px] text-slate-400 hover:text-rose-300 font-semibold underline cursor-pointer"
                  >
                    Clear History
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowErrorDropdown(false)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer font-bold text-base leading-none"
                  title="Close log dropdown"
                >
                  &times;
                </button>
              </div>
            </div>

            {errorLogs.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No scan errors in this session. All clear!
              </div>
            ) : (
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1 scrollbar-thin">
                {errorLogs.map((log) => {
                  const isLookupError = log.title.includes('Lookup') || (log.detail && log.detail.includes('Scryfall'));
                  return (
                    <div key={log.id} className="p-3 rounded-xl bg-slate-950/90 border border-rose-900/50 text-xs">
                      <div className="flex items-center justify-between gap-2 text-rose-300 font-bold text-[11px] mb-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span>{log.title}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${
                            isLookupError
                              ? 'bg-blue-950 text-blue-300 border border-blue-700/60'
                              : 'bg-amber-950 text-amber-300 border border-amber-700/60'
                          }`}>
                            {isLookupError ? '🌐 Lookup Issue' : '📷 Optical/Camera Issue'}
                          </span>
                        </div>
                        <span className="text-[9.5px] font-mono text-slate-500 font-normal">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      {log.detail && (
                        <p className="text-[10.5px] font-mono text-rose-200/90 leading-relaxed bg-black/60 p-2.5 rounded-lg border border-rose-900/60 break-words whitespace-pre-line mb-2">
                          {log.detail}
                        </p>
                      )}

                    {/* Suggestions recovery */}
                    {log.suggestions && log.suggestions.length > 0 && (
                      <div className="mb-2 pt-1.5 border-t border-slate-800">
                        <div className="text-[10px] text-amber-300 font-bold mb-1 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>Did you mean to scan:</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {log.suggestions.map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              onClick={() => {
                                handleSelectManualCard(sug);
                                setShowErrorDropdown(false);
                              }}
                              className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/50 text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1 active:scale-95"
                            >
                              <span>+ Add</span>
                              <span className="underline">{sug}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setManualSearchOpen(true);
                          setShowErrorDropdown(false);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer border border-slate-700 inline-flex items-center gap-1"
                      >
                        <Search className="w-3 h-3 text-emerald-400" />
                        <span>Search Manually</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${log.title}: ${log.detail || ''}`);
                          setHasCopiedError(true);
                          setTimeout(() => setHasCopiedError(false), 2000);
                        }}
                        className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-200 text-[10px] font-semibold cursor-pointer border border-rose-800 inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Error</span>
                      </button>
                      {log.imageDataUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowInspectImageModal(true);
                            setShowErrorDropdown(false);
                          }}
                          className="px-2.5 py-1 rounded bg-indigo-950 hover:bg-indigo-900 text-indigo-200 text-[10px] font-bold cursor-pointer border border-indigo-600 inline-flex items-center gap-1"
                          title="Inspect exact captured camera image frame"
                        >
                          <Eye className="w-3 h-3 text-indigo-300" />
                          <span>Inspect Frame</span>
                        </button>
                      )}
                      {log.rawJson && (
                        <button
                          type="button"
                          onClick={() => {
                            setInspectJsonData({
                              title: `${log.title} - Raw JSON Response`,
                              errorMessage: log.detail,
                              rawJson: log.rawJson || '',
                            });
                            setShowErrorDropdown(false);
                          }}
                          className="px-2.5 py-1 rounded bg-amber-950 hover:bg-amber-900 text-amber-200 text-[10px] font-bold cursor-pointer border border-amber-600 inline-flex items-center gap-1"
                        >
                          <Code className="w-3 h-3 text-amber-400" />
                          <span>View JSON</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>
        )}

        {/* Quick 3.5s Fade-out Notification Toast (Success or Subtle Error) */}
        {quickNotice && (
          <div className="absolute top-14 inset-x-3 sm:inset-x-4 z-40 flex justify-center pointer-events-none animate-in slide-in-from-top-3 fade-in duration-200">
            <div
              className={`rounded-xl px-3.5 py-2.5 shadow-2xl backdrop-blur-md max-w-md w-full flex items-center justify-between gap-3 pointer-events-auto border transition-all duration-300 ${
                quickNotice.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/80 text-emerald-100'
                  : 'bg-rose-950/95 border-rose-500/80 text-rose-100'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {quickNotice.imageUrl ? (
                  <img
                    src={quickNotice.imageUrl}
                    alt="Card"
                    className="w-8 h-11 object-cover rounded shadow border border-emerald-500/40 shrink-0"
                  />
                ) : quickNotice.type === 'success' ? (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold truncate">
                    {quickNotice.type === 'success' ? (
                      <span className="text-emerald-300 truncate">{quickNotice.title}</span>
                    ) : (
                      <span className="text-rose-300 truncate">{quickNotice.title}</span>
                    )}
                    {quickNotice.isFoil && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-400/20 text-amber-300 border border-amber-400/40 inline-flex items-center gap-0.5 shrink-0">
                        <Sparkles className="w-2.5 h-2.5" /> Foil
                      </span>
                    )}
                  </div>
                  {quickNotice.detail && (
                    <div className="text-[10.5px] text-slate-300/90 truncate mt-0.5 font-mono">
                      {quickNotice.detail}
                    </div>
                  )}
                </div>
              </div>

              {quickNotice.type === 'failure' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {lastCapturedImage && (
                    <button
                      type="button"
                      onClick={() => setShowInspectImageModal(true)}
                      className="px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 text-indigo-200 border border-indigo-600 text-[10px] font-bold cursor-pointer transition-colors inline-flex items-center gap-1"
                      title="Inspect exact camera frame sent to scanner"
                    >
                      <Eye className="w-3 h-3 text-indigo-300" />
                      <span>Inspect</span>
                    </button>
                  )}
                  {errorLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowErrorDropdown(true)}
                      className="px-2 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-600/60 text-[10px] font-bold cursor-pointer transition-colors"
                      title="View full error details in dropdown"
                    >
                      Details
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setQuickNotice(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer shrink-0 font-bold text-sm leading-none"
                title="Dismiss toast"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Processing Indicator Overlay (Subtle spinner, camera stays visible behind) */}
        {isProcessing && (
          <div className="absolute inset-0 z-25 bg-slate-950/40 backdrop-blur-xs flex flex-col items-center justify-center p-4">
            <div className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl px-5 py-4 flex flex-col items-center shadow-2xl">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-2" />
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

      {/* Expandable Current Batch Drawer (collapsible at bottom) */}
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
                  onClick={() => handleOpenVersionEditor(item)}
                  className="flex-shrink-0 w-24 bg-slate-950 border border-slate-800 hover:border-violet-500 rounded-lg p-1.5 text-center shadow flex flex-col items-center cursor-pointer group transition-all"
                  title="Click to change version or finish without deleting"
                >
                  <div className="relative w-20 h-28 mb-1 rounded overflow-hidden">
                    <img
                      src={getCardImageUrl(item.card, 'small')}
                      alt={item.card.name}
                      className="w-full h-full object-cover rounded shadow-xs group-hover:scale-105 transition-transform"
                    />
                    {item.isFoil && (
                      <div className="absolute top-1 left-1 bg-amber-400/90 text-slate-950 p-0.5 rounded-full shadow z-10">
                        <Sparkles className="w-2.5 h-2.5" />
                      </div>
                    )}
                    {(item.quantity || 1) > 1 && (
                      <div className="absolute top-1 left-1 bg-emerald-600 text-white text-[9.5px] font-extrabold px-1.5 py-0.2 rounded-full shadow-md border border-emerald-400/80 z-10 font-mono">
                        {item.quantity}x
                      </div>
                    )}
                    {/* Quick Delete Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBatchCard(item);
                      }}
                      className="absolute top-1 right-1 p-1 rounded-md bg-slate-950/85 hover:bg-rose-900 text-slate-400 hover:text-rose-200 border border-slate-700/60 transition-colors z-10 cursor-pointer shadow-sm"
                      title="Delete this card from binder"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                    </button>
                    <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/30 transition-colors flex items-center justify-center pointer-events-none">
                      <span className="opacity-0 group-hover:opacity-100 bg-slate-950/85 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow border border-violet-400/50">
                        Edit
                      </span>
                    </div>
                  </div>
                  {(() => {
                    const names = getCardNames(item.card);
                    return (
                      <div className="w-full text-center">
                        <span
                          className="text-[10px] font-bold text-white truncate w-full block group-hover:text-violet-300 transition-colors"
                          title={names.hasAlternateName ? `${names.actualName} (Oracle: ${names.oracleName})` : names.actualName}
                        >
                          {names.actualName}
                        </span>
                        {names.hasAlternateName && names.subtitle && (
                          <span className="text-[8.5px] text-slate-400 italic truncate w-full block">
                            {names.subtitle}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-center gap-1 mt-0.5 text-[9px] text-slate-400 font-mono">
                    <span>{item.card.set?.toUpperCase()}</span>
                    <span>#{item.card.collector_number}</span>
                    {item.isFoil && <Sparkles className="w-2.5 h-2.5 text-amber-300" />}
                  </div>

                  {/* Quantity Stepper on Card */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-between w-full mt-1.5 px-1 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-[10px]"
                    title="Change number of copies in binder"
                  >
                    <button
                      type="button"
                      onClick={() => handleUpdateBatchCardQuantity(item, -1)}
                      className="w-4 h-4 rounded hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold cursor-pointer active:scale-90"
                      title="Decrease copies (-1)"
                    >
                      -
                    </button>
                    <span className="font-extrabold text-white font-mono px-0.5">
                      {item.quantity || 1}x
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateBatchCardQuantity(item, 1)}
                      className="w-4 h-4 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white flex items-center justify-center font-bold cursor-pointer shadow-2xs active:scale-90"
                      title="Increase copies (+1)"
                    >
                      +
                    </button>
                  </div>

                  {item.scanEngine && (
                    <span className={`text-[8px] font-semibold px-1.5 py-0.2 rounded-full mt-1 inline-flex items-center gap-0.5 ${
                      item.scanEngine === 'ocr'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/40'
                        : 'bg-violet-950/80 text-violet-300 border border-violet-600/40'
                    }`}>
                      {item.scanEngine === 'ocr' ? '⚡ OCR' : '🤖 AI'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Interactive Toolbar: Auto-Scan Toggle, Foil, Quantity & Continuous Shutter Button */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 z-20 flex flex-col gap-2">
        {/* Options Row (Auto-Scan, Foil & Quantity) */}
        <div className="flex items-center justify-between text-xs text-slate-300 flex-wrap gap-2">
          {/* Auto-Scan Toggle Button */}
          <button
            type="button"
            onClick={() => setAutoScanEnabled(!autoScanEnabled)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              autoScanEnabled
                ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300 shadow-sm'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-white'
            }`}
            title="Automatically scan when card is held steady within the crosshairs"
          >
            <Zap className={`w-3 h-3 ${autoScanEnabled ? 'text-emerald-400 fill-emerald-400' : ''}`} />
            <span>Auto-Scan: {autoScanEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <div className="flex items-center gap-2">
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

            {/* Quantity Stepper & Quick Playset Presets */}
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border transition-all ${
              cardQuantity > 1
                ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-200 shadow-sm'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-300'
            }`}>
              <span className="text-[11px] font-bold text-slate-400">Qty:</span>
              <button
                type="button"
                onClick={() => setCardQuantity((q) => Math.max(1, q - 1))}
                className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer active:scale-90 transition-transform"
                title="Decrease copies per scan"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={99}
                value={cardQuantity}
                onChange={(e) => setCardQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="font-mono font-extrabold text-white w-6 text-center bg-transparent focus:outline-none focus:bg-slate-700/60 rounded text-xs"
                title="Direct quantity input (number of copies added per scan)"
              />
              <button
                type="button"
                onClick={() => setCardQuantity((q) => q + 1)}
                className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer active:scale-90 transition-transform"
                title="Increase copies per scan"
              >
                +
              </button>
              {/* Quick playset buttons */}
              <div className="flex items-center gap-1 pl-1 border-l border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setCardQuantity(1)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                    cardQuantity === 1 ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="1 copy per card scan"
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => setCardQuantity(4)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                    cardQuantity === 4 ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                  title="4 copies (Playset per card scan)"
                >
                  4x
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Shutter & Actions Bar */}
        <div className="flex items-center justify-between gap-4 pt-0.5">
          {/* File upload hidden input (standard file picker for gallery, photos & storage) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
            className={`w-16 h-16 rounded-full border-4 p-1 flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer ${
              isCrosshairLocked || isProcessing
                ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] scale-105'
                : 'border-violet-500/50 hover:scale-105'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Snap card & add to binder (Auto-scan also triggers when card is in crosshairs)"
          >
            <div
              className={`w-full h-full rounded-full transition-colors shadow-inner flex items-center justify-center ${
                isCrosshairLocked || isProcessing
                  ? 'bg-emerald-400 text-slate-950'
                  : 'bg-white hover:bg-slate-200 text-slate-900'
              }`}
            >
              <Camera className="w-6 h-6" />
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

      {/* Manual Search Fallback & Version Picker Drawer */}
      {manualSearchOpen && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-violet-400" />
                <span>Manual Card Addition</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setManualSearchOpen(false);
                  setManualPrints([]);
                  setSelectedManualVersion(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Version Selection Mode if prints are loaded */}
            {manualPrints.length > 0 && selectedManualVersion ? (
              <div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
                {/* Active Card Header */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-extrabold text-violet-400 tracking-wider block">Selected Card</span>
                    <h4 className="text-sm font-extrabold text-white truncate">{selectedManualVersion.name}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManualPrints([]);
                      setSelectedManualVersion(null);
                      setManualAddSuccess(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                  >
                    Search Different Card
                  </button>
                </div>

                {/* Inline Success Notice & Add Another Version CTA */}
                {manualAddSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500/80 text-emerald-100 text-xs flex flex-col gap-2.5 shadow-lg animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 font-bold text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{manualAddSuccess}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-emerald-800/60">
                      <button
                        type="button"
                        onClick={() => {
                          setManualAddSuccess(null);
                        }}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Another Version</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setManualPrints([]);
                          setSelectedManualVersion(null);
                          setManualAddSuccess(null);
                        }}
                        className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer transition-colors"
                      >
                        Search Different Card
                      </button>
                    </div>
                  </div>
                )}

                {/* Dropdown Version Selector & Filter */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-violet-400" />
                      <span>Select Card Version ({manualPrints.length} versions found)</span>
                    </label>
                  </div>

                  {/* Filter Box for 100+ Versions */}
                  {manualPrints.length > 3 && (
                    <div className="relative">
                      <input
                        type="text"
                        value={manualVersionFilter}
                        onChange={(e) => setManualVersionFilter(e.target.value)}
                        placeholder='Search set name, year, code, or collector # (e.g. "Revised", "CMM", "#402")...'
                        className="w-full px-3 py-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-violet-500 pr-7"
                      />
                      {manualVersionFilter && (
                        <button
                          type="button"
                          onClick={() => setManualVersionFilter('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Select Dropdown */}
                  <div className="relative">
                    <select
                      value={selectedManualVersion.id}
                      onChange={(e) => {
                        const found = manualPrints.find((p) => p.id === e.target.value);
                        if (found) setSelectedManualVersion(found);
                      }}
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-violet-500 cursor-pointer appearance-none pr-8"
                    >
                      {manualPrints
                        .filter((p) => {
                          if (!manualVersionFilter.trim()) return true;
                          const q = manualVersionFilter.toLowerCase().trim();
                          const setCode = (p.set || '').toLowerCase();
                          const setName = (p.set_name || '').toLowerCase();
                          const num = String(p.collector_number || '').toLowerCase();
                          return setCode.includes(q) || setName.includes(q) || num.includes(q);
                        })
                        .map((p) => {
                          const regP = getTcgplayerMarketPrice(p, false);
                          const foilP = getTcgplayerMarketPrice(p, true);
                          const priceStr = selectedManualFoil
                            ? (foilP > 0 ? `$${foilP.toFixed(2)}` : (regP > 0 ? `$${regP.toFixed(2)}` : 'N/A'))
                            : (regP > 0 ? `$${regP.toFixed(2)}` : (foilP > 0 ? `$${foilP.toFixed(2)}` : 'N/A'));
                          const year = p.released_at ? p.released_at.slice(0, 4) : '';
                          return (
                            <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                              [{p.set?.toUpperCase()}] {p.set_name || p.set} #{p.collector_number} {year ? `(${year})` : ''} - {priceStr}
                            </option>
                          );
                        })}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-3" />
                  </div>
                </div>

                {/* Selected Version Preview Card Box */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex gap-3 items-center">
                  <div className="w-16 h-22 rounded-lg bg-slate-900 overflow-hidden shrink-0 border border-slate-800 shadow">
                    <img
                      src={getCardImageUrl(selectedManualVersion, 'small')}
                      alt={selectedManualVersion.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-violet-950 text-violet-300 border border-violet-800/60">
                        {selectedManualVersion.set?.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-200 font-bold truncate">
                        {selectedManualVersion.set_name}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Collector #{selectedManualVersion.collector_number} · Rarity: <span className="capitalize">{selectedManualVersion.rarity}</span>
                    </p>
                    <div className="text-xs font-mono font-bold text-emerald-400">
                      Market Price: {(() => {
                        const rP = getTcgplayerMarketPrice(selectedManualVersion, false);
                        const fP = getTcgplayerMarketPrice(selectedManualVersion, true);
                        if (selectedManualFoil) return fP > 0 ? `$${fP.toFixed(2)} (Foil)` : (rP > 0 ? `$${rP.toFixed(2)}` : 'N/A');
                        return rP > 0 ? `$${rP.toFixed(2)}` : (fP > 0 ? `$${fP.toFixed(2)} (Foil)` : 'N/A');
                      })()}
                    </div>
                  </div>
                </div>

                {/* Finish / Foil Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Finish / Printing Type
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSelectedManualFoil(false)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        !selectedManualFoil
                          ? 'bg-slate-800 text-white shadow border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Regular</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedManualFoil(true)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        selectedManualFoil
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Foil ✨</span>
                    </button>
                  </div>
                </div>

                {/* Quantity Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                      Quantity to Add
                    </label>
                    <span className="text-[11px] text-emerald-400 font-mono font-bold">
                      {selectedManualQuantity} {selectedManualQuantity === 1 ? 'copy' : 'copies'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800 flex-wrap">
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => setSelectedManualQuantity((q) => Math.max(1, q - 1))}
                        className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer active:scale-95 transition-transform"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={selectedManualQuantity}
                        onChange={(e) => setSelectedManualQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-12 text-center bg-transparent font-extrabold text-xs text-white focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedManualQuantity((q) => q + 1)}
                        className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer active:scale-95 transition-transform"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setSelectedManualQuantity(q)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            selectedManualQuantity === q
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow-xs'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                        >
                          {q === 4 ? '4x' : `${q}x`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Inline Success Notice */}
                {manualAddSuccess && (
                  <div className="p-3 bg-emerald-950/90 border border-emerald-500/60 rounded-xl flex items-center justify-between gap-2 animate-in fade-in">
                    <div className="flex items-center gap-2 text-xs text-emerald-200 font-semibold min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">{manualAddSuccess}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setManualAddSuccess(null)}
                      className="text-xs text-emerald-400 hover:text-white font-bold underline shrink-0 cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleConfirmAddManualCard}
                    disabled={isSearchingManual}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                  >
                    {isSearchingManual ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Add Selected Version to {currentBinder?.name || 'Binder'}</span>
                      </>
                    )}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setManualAddSuccess(null);
                        // User can now pick another printing from the version dropdown above!
                      }}
                      className="py-2 px-3 rounded-xl bg-violet-900/40 hover:bg-violet-900/70 border border-violet-700/50 text-violet-200 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      title="Select another printing/set from the dropdown above to add"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-violet-300" />
                      <span>Add Another Version</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setManualPrints(null);
                        setSelectedManualVersion(null);
                        setManualAddSuccess(null);
                        setManualQuery('');
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Search className="w-3.5 h-3.5 text-slate-400" />
                      <span>Search Different Card</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Search Query View */
              <>
                <p className="text-xs text-slate-400 mb-3">
                  Type card name to select from version list & add to <strong>{currentBinder?.name}</strong>:
                </p>
                <div className="relative mb-3">
                  <input
                    type="text"
                    autoFocus
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manualQuery.trim()) {
                        handleSelectManualCard(manualQuery.trim());
                      }
                    }}
                    placeholder="e.g. Birds of Paradise, Sol Ring, Swamp..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500 pr-8"
                  />
                  {isSearchingManual && (
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin absolute right-3 top-2.5" />
                  )}
                </div>

                {/* Suggestions List */}
                {manualSuggestions.length > 0 && (
                  <div className="space-y-1 max-h-52 overflow-y-auto mb-3">
                    {manualSuggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleSelectManualCard(name)}
                        className="w-full text-left px-3 py-2 bg-slate-800/70 hover:bg-violet-900/40 rounded-lg text-xs text-slate-200 hover:text-white transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span>{name}</span>
                        <div className="flex items-center gap-1 text-[11px] text-violet-400 font-semibold">
                          <span>Select Version</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Change Version & Finish Modal */}
      {editingBatchItem && selectedEditCard && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    Change Version or Finish
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    {editingBatchItem.card.name} · Currently {editingBatchItem.card.set?.toUpperCase()} #{editingBatchItem.card.collector_number} ({editingBatchItem.isFoil ? 'Foil' : 'Regular'})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDeleteBatchCard(editingBatchItem)}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-300 hover:text-white bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                  title="Delete this card from binder if scan was incorrect"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Delete Card</span>
                  <span className="sm:hidden">Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBatchItem(null)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Scan Error Discard Banner */}
              <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0 text-slate-300">
                  <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="truncate">Was this card misidentified by the scanner?</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteBatchCard(editingBatchItem)}
                  className="px-2.5 py-1 rounded-lg bg-rose-950/90 hover:bg-rose-900 text-rose-200 border border-rose-800/80 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0 transition-colors shadow-xs"
                >
                  <span>Delete from Binder</span>
                </button>
              </div>

              {/* Finish Switcher */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Card Finish / Printing Type
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedEditFoil(false)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !selectedEditFoil
                        ? 'bg-slate-800 text-white shadow border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>Regular (Non-foil)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedEditFoil(true)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      selectedEditFoil
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Foil ✨</span>
                  </button>
                </div>
              </div>

              {/* Quantity / Copies in Binder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Quantity / Copies in Binder
                  </label>
                  <span className="text-[11px] text-emerald-400 font-mono font-bold">
                    Total: {selectedEditQuantity} copies
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex-wrap">
                  <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setSelectedEditQuantity((q) => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer active:scale-95 transition-transform"
                      title="Decrease copies (-1)"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={selectedEditQuantity}
                      onChange={(e) => setSelectedEditQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 text-center bg-transparent font-extrabold text-sm text-white focus:outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedEditQuantity((q) => q + 1)}
                      className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer active:scale-95 transition-transform"
                      title="Increase copies (+1)"
                    >
                      +
                    </button>
                  </div>
                  {/* Quick preset buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[1, 2, 3, 4, 8].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setSelectedEditQuantity(q)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          selectedEditQuantity === q
                            ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                            : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                        }`}
                      >
                        {q === 4 ? '4x (Playset)' : `${q}x`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Version Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-violet-400" />
                    <span>Select Card Printing & Art</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {editPrintsList.length > 0 ? `${editPrintsList.length} printings available` : ''}
                  </span>
                </div>

                {/* Dropdown Version Selector & Search Filter for cards with many versions */}
                {editPrintsList.length > 0 && (
                  <div className="space-y-2 mb-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <div className="relative">
                      <input
                        type="text"
                        value={editVersionFilter}
                        onChange={(e) => setEditVersionFilter(e.target.value)}
                        placeholder='Search / weed through versions by set name, code, or collector # (e.g. "Revised", "CMM", "#402")...'
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-violet-500 pr-7"
                      />
                      {editVersionFilter && (
                        <button
                          type="button"
                          onClick={() => setEditVersionFilter('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <select
                        value={selectedEditCard.id}
                        onChange={(e) => {
                          const found = editPrintsList.find((p) => p.id === e.target.value);
                          if (found) setSelectedEditCard(found);
                        }}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-violet-500 cursor-pointer appearance-none pr-8"
                      >
                        {editPrintsList
                          .filter((p) => {
                            if (!editVersionFilter.trim()) return true;
                            const q = editVersionFilter.toLowerCase().trim();
                            const setCode = (p.set || '').toLowerCase();
                            const setName = (p.set_name || '').toLowerCase();
                            const num = String(p.collector_number || '').toLowerCase();
                            return setCode.includes(q) || setName.includes(q) || num.includes(q);
                          })
                          .map((p) => {
                            const regP = getTcgplayerMarketPrice(p, false);
                            const foilP = getTcgplayerMarketPrice(p, true);
                            const priceStr = selectedEditFoil
                              ? (foilP > 0 ? `$${foilP.toFixed(2)}` : (regP > 0 ? `$${regP.toFixed(2)}` : 'N/A'))
                              : (regP > 0 ? `$${regP.toFixed(2)}` : (foilP > 0 ? `$${foilP.toFixed(2)}` : 'N/A'));
                            const year = p.released_at ? p.released_at.slice(0, 4) : '';
                            return (
                              <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                                [{p.set?.toUpperCase()}] {p.set_name || p.set} #{p.collector_number} {year ? `(${year})` : ''} - {priceStr}
                              </option>
                            );
                          })}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-2.5" />
                    </div>
                  </div>
                )}

                {isLoadingEditPrints ? (
                  <div className="p-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                    <span className="text-xs">Loading all printings from Scryfall...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[42vh] overflow-y-auto pr-1">
                    {(editPrintsList.length > 0 ? editPrintsList : [editingBatchItem.card])
                      .filter((p) => {
                        if (!editVersionFilter.trim()) return true;
                        const q = editVersionFilter.toLowerCase().trim();
                        const setCode = (p.set || '').toLowerCase();
                        const setName = (p.set_name || '').toLowerCase();
                        const num = String(p.collector_number || '').toLowerCase();
                        return setCode.includes(q) || setName.includes(q) || num.includes(q);
                      })
                      .map((p) => {
                        const isSelected = p.id === selectedEditCard.id;
                        const regP = getTcgplayerMarketPrice(p, false);
                        const foilP = getTcgplayerMarketPrice(p, true);
                        const regularPrice = regP > 0 ? `$${regP.toFixed(2)}` : null;
                        const foilPrice = foilP > 0 ? `$${foilP.toFixed(2)}` : null;

                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedEditCard(p)}
                            className={`relative p-2 rounded-xl border text-left cursor-pointer transition-all flex flex-col items-center ${
                              isSelected
                                ? 'bg-violet-950/60 border-violet-400 ring-2 ring-violet-500/40 shadow-lg'
                                : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                            }`}
                          >
                            <div className="relative w-full aspect-[2.5/3.5] rounded-lg overflow-hidden mb-1.5 bg-slate-900">
                              <img
                                src={getCardImageUrl(p, 'small')}
                                alt={p.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                              {isSelected && (
                                <div className="absolute top-1 right-1 bg-emerald-500 text-slate-950 rounded-full p-0.5 shadow">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-white truncate w-full text-center">
                              {p.set_name || p.set?.toUpperCase()}
                            </span>
                            <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-400 font-mono mt-0.5">
                              <span className="uppercase font-bold text-slate-300">{p.set}</span>
                              <span>#{p.collector_number}</span>
                            </div>
                            <div className="text-[9px] font-mono text-emerald-400 mt-0.5">
                              {selectedEditFoil ? (foilPrice || regularPrice || '—') : (regularPrice || foilPrice || '—')}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-t border-slate-800 gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleDeleteBatchCard(editingBatchItem)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-rose-300 hover:text-white bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                title="Delete this card from binder if the scan was incorrect"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Card</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setEditingBatchItem(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={handleSaveCardEdit}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Card Scanner & Gemini Configuration Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-violet-400" />
                <h3 className="text-sm font-bold text-white">Card Scanner Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scan Engine Mode Selector */}
            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Recognition Engine Mode
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setScanEngine('hybrid')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    scanEngine === 'hybrid'
                      ? 'bg-violet-950/70 border-violet-500 shadow-md ring-1 ring-violet-500/40'
                      : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Hybrid Mode (Recommended)
                    </span>
                    <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/40 px-1.5 py-0.2 rounded-full font-semibold">
                      Best Performance
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Tries ultra-fast client-side OCR first (0 API cost, ~200ms). Seamlessly falls back to Gemini 3.8 Flash Vision for foil sheen, full-art, or vintage cards.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScanEngine('ocr_only')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    scanEngine === 'ocr_only'
                      ? 'bg-emerald-950/70 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                      : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      Local OCR Only (Free / On-Device)
                    </span>
                    <span className="text-[10px] bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 px-1.5 py-0.2 rounded-full font-semibold">
                      0 API Cost
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Runs 100% in your browser via WebAssembly (Tesseract.js). No API key or cloud credits needed. Best for modern cards with standard bottom-left footers.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScanEngine('gemini_only')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    scanEngine === 'gemini_only'
                      ? 'bg-indigo-950/70 border-indigo-500 shadow-md ring-1 ring-indigo-500/40'
                      : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-indigo-400" />
                      Gemini 3.8 Flash Only
                    </span>
                    <span className="text-[10px] bg-indigo-400/20 text-indigo-300 border border-indigo-400/40 px-1.5 py-0.2 rounded-full font-semibold">
                      AI Vision
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Uses Google Gemini Vision for every scan. Highest accuracy for complex art, vintage cards, and lighting glare, requiring a Gemini API key.
                  </p>
                </button>
              </div>
            </div>

            {/* Gemini Configuration (Shown for Hybrid & Gemini Only) */}
            {scanEngine !== 'ocr_only' && (
              <div className="border-t border-slate-800 pt-3">
                <div className="mb-3">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Gemini Vision Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => {
                      setSelectedModel(e.target.value);
                      setStoredGeminiModel(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500 font-sans"
                  >
                    {POPULAR_GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Default: <span className="text-violet-400 font-mono font-medium">{DEFAULT_GEMINI_MODEL}</span> (Recommended)
                  </p>
                </div>

                <div className="mb-3">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Stored securely in your local browser only.
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
              </div>
            )}

            {scanEngine === 'ocr_only' && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-600/30 text-emerald-200 text-xs mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Local OCR runs entirely on your device in WebAssembly. No API key required!</span>
              </div>
            )}

            {/* 2nd-Chance Full Frame Rescan Option */}
            <div className="border-t border-slate-800 pt-3 mb-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-white block">
                    2nd-Chance Full Frame Rescan
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    If cropped reticle scan fails, automatically triggers a 2nd scan of the entire video view. Turn off for maximum scanning speed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableRescanFull((v) => !v)}
                  className={`w-11 h-6 shrink-0 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    enableRescanFull ? 'bg-violet-600' : 'bg-slate-700'
                  }`}
                  title="Toggle 2nd-chance full frame rescan"
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      enableRescanFull ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {apiKeySavedSuccess && (
              <div className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 rounded-lg p-2 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Settings saved successfully!
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStoredScanEngine(scanEngine);
                  setStoredGeminiApiKey(apiKeyInput);
                  setStoredGeminiModel(selectedModel);
                  setStoredRescanFull(enableRescanFull);
                  setApiKeySavedSuccess(true);
                  setTimeout(() => {
                    setApiKeySavedSuccess(false);
                    setShowApiKeyModal(false);
                  }, 800);
                }}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Save Settings
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

      {/* Interactive Captured Image & Quality Diagnostics Inspector Modal */}
      {showInspectImageModal && lastCapturedImage && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-400 shrink-0" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Captured Frame Inspector
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInspectImageModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Body */}
            <div className="p-4 overflow-y-auto space-y-4 text-xs text-slate-300">
              {/* Captured Image View */}
              <div className="relative bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center min-h-[220px] max-h-[340px] p-2">
                <img
                  src={lastCapturedImage.dataUrl}
                  alt="Captured Camera Scan Frame"
                  className="max-h-[320px] w-auto object-contain rounded-lg shadow-lg"
                />
                <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/80 border border-slate-700 text-[10px] font-mono font-bold text-amber-300 shadow">
                  {lastCapturedImage.width} &times; {lastCapturedImage.height} px
                </div>
                <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/80 border border-slate-700 text-[10px] font-mono font-bold text-indigo-300 shadow">
                  {lastCapturedImage.scanTarget === 'footer' ? '🔎 Footer Reticle' : '🃏 Full Card Reticle'}
                </div>
              </div>

              {/* Quality Diagnostics Cards */}
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-sans uppercase mb-1 flex items-center justify-center gap-1">
                    <Sun className="w-3 h-3 text-amber-400" /> Light
                  </div>
                  <div className={`text-sm font-bold ${
                    lastCapturedImage.diagnostics.brightnessPercent < 28 || lastCapturedImage.diagnostics.brightnessPercent > 82
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}>
                    {lastCapturedImage.diagnostics.brightnessPercent}%
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-sans uppercase mb-1 flex items-center justify-center gap-1">
                    <Sliders className="w-3 h-3 text-violet-400" /> Contrast
                  </div>
                  <div className={`text-sm font-bold ${
                    lastCapturedImage.diagnostics.contrastScore < 22 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {lastCapturedImage.diagnostics.contrastScore}/100
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-sans uppercase mb-1 flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400" /> Glare Check
                  </div>
                  <div className={`text-sm font-bold ${
                    lastCapturedImage.diagnostics.glarePercent > 12 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {lastCapturedImage.diagnostics.glarePercent}%
                  </div>
                </div>
              </div>

              {/* Quality Status & Recommendations */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Image Assessment: {lastCapturedImage.diagnostics.qualityLabel}</span>
                </div>
                {lastCapturedImage.diagnostics.recommendations.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px] font-sans">
                    {lastCapturedImage.diagnostics.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-400 font-sans">
                    The camera captured a clear high-resolution frame. If details were missing, ensure card title (top) or set code (bottom) wasn't covered by fingers or sleeve reflections.
                  </p>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                    torchOn
                      ? 'bg-amber-950 border-amber-400 text-amber-200'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>{torchOn ? 'Torch On' : 'Flashlight'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowInspectImageModal(false);
                  handleCaptureFrame();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-colors flex items-center gap-1.5 cursor-pointer ml-auto"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Retry Frame Scan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw JSON Error Inspector Modal */}
      <JsonErrorModal
        isOpen={Boolean(inspectJsonData)}
        onClose={() => setInspectJsonData(null)}
        title={inspectJsonData?.title || 'JSON Error Inspector'}
        errorMessage={inspectJsonData?.errorMessage}
        rawJson={inspectJsonData?.rawJson || ''}
      />
    </div>
  );
};
