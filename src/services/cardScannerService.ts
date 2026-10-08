import { GoogleGenAI } from '@google/genai';
import { ScryfallCard } from '../types/mtg';
import { normalizeFrostpointCard, fetchCardPrints } from './api';
import { isDigitalOnlyCard, filterPaperCardsOnly } from '../utils/cardUtils';

export interface CardScanResult {
  card: ScryfallCard;
  isFoil: boolean;
  confidence: 'high' | 'medium' | 'low';
  scanEngine?: 'ocr' | 'gemini';
  rawDetected?: {
    card_name?: string;
    set_code?: string;
    collector_number?: string;
    is_foil?: boolean;
    engine?: 'ocr' | 'gemini';
  };
}

export type ScanEngineMode = 'hybrid' | 'gemini_only' | 'ocr_only';
export type ScanTargetMode = 'full' | 'footer';

const STORAGE_KEY_GEMINI_API_KEY = 'mtg_gemini_api_key';
const STORAGE_KEY_GEMINI_MODEL = 'mtg_gemini_model';
const STORAGE_KEY_SCAN_ENGINE = 'mtg_scan_engine';
const STORAGE_KEY_SCAN_TARGET = 'mtg_scan_target';

export function getStoredScanTarget(): ScanTargetMode {
  if (typeof window === 'undefined') return 'full';
  const val = localStorage.getItem(STORAGE_KEY_SCAN_TARGET)?.trim() as ScanTargetMode;
  if (val === 'footer' || val === 'full') return val;
  return 'full';
}

export function setStoredScanTarget(target: ScanTargetMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_SCAN_TARGET, target);
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export function getStoredScanEngine(): ScanEngineMode {
  if (typeof window === 'undefined') return 'hybrid';
  const val = localStorage.getItem(STORAGE_KEY_SCAN_ENGINE)?.trim() as ScanEngineMode;
  if (val === 'gemini_only' || val === 'ocr_only' || val === 'hybrid') {
    return val;
  }
  return 'hybrid';
}

export function setStoredScanEngine(engine: ScanEngineMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_SCAN_ENGINE, engine);
}

export const POPULAR_GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Latest / Recommended)' },
  { id: 'gemini-3.8-flash-lite', label: 'Gemini 3.8 Flash Lite (Fastest)' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
] as const;

/**
 * Retrieves the configured Gemini model, defaulting to gemini-3.8-flash.
 * Automatically clears out and migrates legacy/prohibited models (e.g. gemini-2.0-flash, gemini-1.5-flash).
 */
export function getStoredGeminiModel(): string {
  if (typeof window === 'undefined') return DEFAULT_GEMINI_MODEL;
  const localModel = localStorage.getItem(STORAGE_KEY_GEMINI_MODEL)?.trim();
  if (localModel) {
    // Automatically sanitize and migrate deprecated models
    if (
      localModel.includes('2.0') ||
      localModel.includes('1.5') ||
      localModel.includes('gemini-pro') ||
      localModel === 'gemini-1.0-pro'
    ) {
      localStorage.setItem(STORAGE_KEY_GEMINI_MODEL, DEFAULT_GEMINI_MODEL);
      return DEFAULT_GEMINI_MODEL;
    }
    return localModel;
  }
  return DEFAULT_GEMINI_MODEL;
}

/**
 * Saves user-configured Gemini model to localStorage.
 */
export function setStoredGeminiModel(model: string): void {
  if (typeof window === 'undefined') return;
  const clean = model.trim();
  if (clean) {
    localStorage.setItem(STORAGE_KEY_GEMINI_MODEL, clean);
  } else {
    localStorage.removeItem(STORAGE_KEY_GEMINI_MODEL);
  }
}

/**
 * Retrieves the Gemini API key from environment variables or browser localStorage.
 */
export function getStoredGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  const localKey = localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY)?.trim();
  if (localKey) return localKey;

  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }

  return '';
}

/**
 * Saves user-configured Gemini API key to localStorage.
 */
export function setStoredGeminiApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return;
  const clean = apiKey.trim();
  if (clean) {
    localStorage.setItem(STORAGE_KEY_GEMINI_API_KEY, clean);
  } else {
    localStorage.removeItem(STORAGE_KEY_GEMINI_API_KEY);
  }
}

/**
 * Compresses and resizes an image (Blob or HTMLCanvasElement or Image)
 * down to max ~960px on its longest edge and converts to JPEG.
 * Returns a clean base64 data URL and raw base64 string.
 */
export async function optimizeCardImage(
  imageSource: Blob | File | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<{ dataUrl: string; base64Only: string }> {
  // If already a pre-cropped canvas, serialize immediately
  if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
    const dataUrl = imageSource.toDataURL('image/jpeg', 0.82);
    const base64Only = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    return { dataUrl, base64Only };
  }
  // 1. Try createImageBitmap for Blob/File (fast, handles EXIF orientation)
  if (
    typeof window !== 'undefined' &&
    'createImageBitmap' in window &&
    (imageSource instanceof Blob || imageSource instanceof File)
  ) {
    try {
      const bitmap = await createImageBitmap(imageSource);
      const naturalWidth = bitmap.width;
      const naturalHeight = bitmap.height;

      if (naturalWidth > 0 && naturalHeight > 0) {
        const maxDimension = 960;
        let targetWidth = naturalWidth;
        let targetHeight = naturalHeight;

        if (naturalWidth > maxDimension || naturalHeight > maxDimension) {
          if (naturalWidth > naturalHeight) {
            targetWidth = maxDimension;
            targetHeight = Math.round((naturalHeight * maxDimension) / naturalWidth);
          } else {
            targetHeight = maxDimension;
            targetWidth = Math.round((naturalWidth * maxDimension) / naturalHeight);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
          try {
            bitmap.close();
          } catch {}
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const base64Only = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          return { dataUrl, base64Only };
        }
      }
    } catch (bitmapErr) {
      console.warn('[CardScanner] createImageBitmap fallback to Image element:', bitmapErr);
    }
  }

  // 2. Standard HTMLImageElement / FileReader processing
  return new Promise((resolve, reject) => {
    const processLoadedImage = (imageEl: HTMLImageElement | HTMLVideoElement) => {
      try {
        const naturalWidth =
          (imageEl as HTMLImageElement).naturalWidth ||
          (imageEl as HTMLVideoElement).videoWidth ||
          imageEl.width;
        const naturalHeight =
          (imageEl as HTMLImageElement).naturalHeight ||
          (imageEl as HTMLVideoElement).videoHeight ||
          imageEl.height;

        if (!naturalWidth || !naturalHeight) {
          throw new Error('Invalid image dimensions');
        }

        const maxDimension = 960;
        let targetWidth = naturalWidth;
        let targetHeight = naturalHeight;

        if (naturalWidth > maxDimension || naturalHeight > maxDimension) {
          if (naturalWidth > naturalHeight) {
            targetWidth = maxDimension;
            targetHeight = Math.round((naturalHeight * maxDimension) / naturalWidth);
          } else {
            targetHeight = maxDimension;
            targetWidth = Math.round((naturalWidth * maxDimension) / naturalHeight);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to create canvas 2d context');
        }

        ctx.drawImage(imageEl, 0, 0, targetWidth, targetHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const base64Only = dataUrl.replace(/^data:image\/\w+;base64,/, '');

        resolve({ dataUrl, base64Only });
      } catch (err) {
        reject(err);
      }
    };

    if (imageSource instanceof HTMLVideoElement) {
      processLoadedImage(imageSource);
      return;
    }

    if (imageSource instanceof HTMLImageElement) {
      if (imageSource.complete && imageSource.naturalWidth > 0) {
        processLoadedImage(imageSource);
      } else {
        imageSource.onload = () => processLoadedImage(imageSource);
        imageSource.onerror = (_e) => reject(new Error('Failed to load image element'));
      }
      return;
    }

    // Blob or File fallback using URL.createObjectURL
    try {
      const objectUrl = URL.createObjectURL(imageSource as Blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        processLoadedImage(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        // Fallback to FileReader
        const reader = new FileReader();
        reader.onload = (e) => {
          const img2 = new Image();
          img2.onload = () => processLoadedImage(img2);
          img2.onerror = () =>
            reject(new Error('Failed to parse uploaded image file.'));
          img2.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(imageSource as Blob);
      };
      img.src = objectUrl;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Helper to ensure a returned card is a physical paper printing, converting digital-only cards to physical paper versions.
 */
async function resolvePaperCard(card: ScryfallCard | null): Promise<ScryfallCard | null> {
  if (!card) return null;
  if (!isDigitalOnlyCard(card)) return card;
  try {
    const paperPrints = await fetchCardPrints(card.name);
    if (paperPrints && paperPrints.length > 0) {
      return paperPrints[0];
    }
  } catch {}
  return null;
}

/**
 * Look up exact card printing on Scryfall using set code and collector number,
 * with fallbacks to prints search and fuzzy name search.
 * Ensures the EXACT printing version (set and collector number) is matched and is physical paper only.
 */
export async function lookupExactScryfallCard(
  cardName: string,
  setCode?: string,
  collectorNumber?: string
): Promise<ScryfallCard | null> {
  const cleanSet = (setCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Clean rawNum of slashes (e.g. "045/281" -> "045", "242 / 271" -> "242", "#045" -> "045")
  let rawNum = (collectorNumber || '').trim();
  if (rawNum.includes('/')) {
    rawNum = rawNum.split('/')[0].trim();
  }
  rawNum = rawNum.replace(/^[#\s\.\-]+/, '').trim();

  const unpaddedNum = rawNum.replace(/^0+(?=\d)/, ''); // e.g. "045" -> "45"
  const cleanName = (cardName || '').trim();

  const scryHeaders: HeadersInit = {
    Accept: 'application/json',
    ...(typeof window === 'undefined' ? { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MTGCardScanner/1.0' } : {}),
  };

  // 1. Direct Set + Collector Number lookup on Scryfall (/cards/:set/:number)
  if (cleanSet && rawNum) {
    // Generate candidate set codes (including OCR letter fixes e.g. "8lb" -> "blb", "0tj" -> "otj", "1tr" -> "ltr")
    const setCandidates = Array.from(
      new Set([
        cleanSet,
        cleanSet.replace(/^8/, 'b'),
        cleanSet.replace(/^0/, 'o'),
        cleanSet.replace(/^1/, 'l'),
        cleanSet.replace(/^5/, 's'),
      ])
    ).filter(Boolean);

    const numCandidates = Array.from(
      new Set([rawNum.toLowerCase(), unpaddedNum.toLowerCase()])
    ).filter(Boolean);

    for (const candSet of setCandidates) {
      for (const num of numCandidates) {
        try {
          const url = `https://api.scryfall.com/cards/${encodeURIComponent(candSet)}/${encodeURIComponent(num)}`;
          const res = await fetch(url, { headers: scryHeaders });
          if (res.ok) {
            const json = await res.json();
            if (json && json.id) {
              const norm = normalizeFrostpointCard(json);
              const paper = await resolvePaperCard(norm);
              if (paper) return paper;
            }
          }
        } catch (err) {
          console.warn('[CardScanner] Direct set/collector lookup failed:', err);
        }
      }
    }

    // Direct search on Scryfall for set + collector number e.g. "e:blb cn:045" or "e:blb cn:45"
    try {
      const searchUrl = `https://api.scryfall.com/cards/search?q=e%3A${encodeURIComponent(cleanSet)}+cn%3A${encodeURIComponent(unpaddedNum || rawNum)}+game%3Apaper+not%3Adigital`;
      const searchRes = await fetch(searchUrl, { headers: scryHeaders });
      if (searchRes.ok) {
        const searchJson = await searchRes.json();
        if (Array.isArray(searchJson?.data) && searchJson.data.length > 0) {
          const norm = normalizeFrostpointCard(searchJson.data[0]);
          const paper = await resolvePaperCard(norm);
          if (paper) return paper;
        }
      }
    } catch {}
  }

  // 2. Exact Card Name prints search
  if (cleanName) {
    try {
      const printsUrl = `https://api.scryfall.com/cards/search?q=%21%22${encodeURIComponent(cleanName)}%22+unique%3Aprints+game%3Apaper+not%3Adigital&order=released&dir=desc`;
      const res = await fetch(printsUrl, { headers: scryHeaders });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          const cards: ScryfallCard[] = filterPaperCardsOnly(json.data.map(normalizeFrostpointCard));

          // Priority 1: Match BOTH set code AND exact collector number
          if (cleanSet && rawNum) {
            const bothMatch = cards.find((c) => {
              const setOk = (c.set || '').toLowerCase() === cleanSet;
              const cNum = (c.collector_number || '').toLowerCase();
              const numOk =
                cNum === rawNum.toLowerCase() ||
                cNum === unpaddedNum.toLowerCase() ||
                parseInt(cNum, 10) === parseInt(rawNum, 10);
              return setOk && numOk;
            });
            if (bothMatch) return await resolvePaperCard(bothMatch);
          }

          // Priority 2: Match in the specified set if set is known
          if (cleanSet) {
            const sameSetCards = cards.filter((c) => (c.set || '').toLowerCase() === cleanSet);
            if (sameSetCards.length === 1) {
              return await resolvePaperCard(sameSetCards[0]);
            } else if (sameSetCards.length > 1 && rawNum) {
              // If multiple printings in the same set (e.g. variants, showcase, basics), pick closest number
              const targetInt = parseInt(rawNum, 10);
              if (!isNaN(targetInt)) {
                let closest = sameSetCards[0];
                let minDiff = Infinity;
                for (const c of sameSetCards) {
                  const cInt = parseInt(c.collector_number, 10);
                  if (!isNaN(cInt)) {
                    const diff = Math.abs(cInt - targetInt);
                    if (diff < minDiff) {
                      minDiff = diff;
                      closest = c;
                    }
                  }
                }
                return await resolvePaperCard(closest);
              }
              return await resolvePaperCard(sameSetCards[0]);
            } else if (sameSetCards.length > 0) {
              return await resolvePaperCard(sameSetCards[0]);
            }
          }

          // Priority 3: Match collector number across all prints if set code was unrecognized
          if (rawNum) {
            const numMatch = cards.find((c) => {
              const cNum = (c.collector_number || '').toLowerCase();
              return (
                cNum === rawNum.toLowerCase() ||
                cNum === unpaddedNum.toLowerCase() ||
                parseInt(cNum, 10) === parseInt(rawNum, 10)
              );
            });
            if (numMatch) return await resolvePaperCard(numMatch);
          }

          // Fallback: If neither set nor collector number matched, return most recent paper print
          if (cards.length > 0) {
            return await resolvePaperCard(cards[0]);
          }
        }
      }
    } catch (err) {
      console.warn('[CardScanner] Prints search fallback failed:', err);
    }

    // 3. Fuzzy card name search
    if (isValidCardName(cleanName) && !/^(our|market|shows|here|this|the|i|scanning|analyzing|unable|cannot|error)\b/i.test(cleanName)) {
      try {
        const fuzzyUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleanName)}`;
        const res = await fetch(fuzzyUrl, { headers: scryHeaders });
        if (res.ok) {
          const json = await res.json();
          if (json && json.id) {
            const paper = await resolvePaperCard(normalizeFrostpointCard(json));
            if (paper) return paper;
          }
        }
      } catch (err) {
        console.warn('[CardScanner] Fuzzy lookup fallback failed:', err);
      }

      // 4. Normalized variations
      const variations: string[] = [];
      const noBrackets = cleanName.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
      if (noBrackets && noBrackets !== cleanName) variations.push(noBrackets);

      if (cleanName.includes('//')) {
        const face1 = cleanName.split('//')[0].trim();
        if (face1) variations.push(face1);
      }

      if (cleanName.includes(',')) {
        const preComma = cleanName.split(',')[0].trim();
        if (preComma.length >= 3) variations.push(preComma);
      }

      if (cleanName.includes(' - ')) {
        const preDash = cleanName.split(' - ')[0].trim();
        if (preDash.length >= 3) variations.push(preDash);
      }

      const wordTokens = cleanName.split(/\s+/).filter((w) => w.length >= 2);
      if (wordTokens.length >= 2) {
        variations.push(wordTokens.slice(0, 2).join(' '));
        if (wordTokens.length >= 3) {
          variations.push(wordTokens.slice(0, 3).join(' '));
        }
      }

      for (const variant of variations) {
        if (!isValidCardName(variant)) continue;
        try {
          const varUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(variant)}`;
          const varRes = await fetch(varUrl, { headers: scryHeaders });
          if (varRes.ok) {
            const varJson = await varRes.json();
            if (varJson && varJson.id) {
              const paper = await resolvePaperCard(normalizeFrostpointCard(varJson));
              if (paper) return paper;
            }
          }
        } catch {}
      }

      // 5. Scryfall Autocomplete fallback
      try {
        const acQuery = cleanName.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().slice(0, 24);
        if (acQuery.length >= 3) {
          const acUrl = `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(acQuery)}`;
          const acRes = await fetch(acUrl, { headers: scryHeaders });
          if (acRes.ok) {
            const acJson = await acRes.json();
            if (Array.isArray(acJson?.data) && acJson.data.length > 0) {
              const bestMatch = acJson.data[0];
              const matchUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(bestMatch)}`;
              const matchRes = await fetch(matchUrl, { headers: scryHeaders });
              if (matchRes.ok) {
                const matchJson = await matchRes.json();
                if (matchJson && matchJson.id) {
                  const paper = await resolvePaperCard(normalizeFrostpointCard(matchJson));
                  if (paper) return paper;
                }
              }
            }
          }
        }
      } catch (acErr) {
        console.warn('[CardScanner] Autocomplete fallback lookup failed:', acErr);
      }

      // 6. Broad keyword search fallback
      try {
        const searchWords = cleanName.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
        if (searchWords.length >= 3) {
          const searchUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchWords)}+game%3Apaper+not%3Adigital&order=relevance`;
          const sRes = await fetch(searchUrl, { headers: scryHeaders });
          if (sRes.ok) {
            const sJson = await sRes.json();
            if (Array.isArray(sJson?.data) && sJson.data.length > 0) {
              const paper = await resolvePaperCard(normalizeFrostpointCard(sJson.data[0]));
              if (paper) return paper;
            }
          }
        }
      } catch (sErr) {
        console.warn('[CardScanner] Broad search fallback failed:', sErr);
      }
    }
  }

  return null;
}

/**
 * Flash models supported on Google Generative Language v1beta.
 * Primary model is gemini-3.8-flash (as directed by Google API migration notice).
 */
export const SUPPORTED_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.8-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
] as const;

// Cache the verified working model in memory so subsequent scans hit it on attempt #1 with 0ms delay
let cachedWorkingModel: string | null = null;

async function queryGeminiVision(
  apiKey: string,
  base64Jpeg: string,
  prompt: string
): Promise<string> {
  const preferredModel = getStoredGeminiModel();
  // Candidate sequence:
  // 1. User preferred model (if valid and not deprecated)
  // 2. Previously cached working model
  // 3. Other supported models in cascade order
  const rawCandidates = [
    preferredModel,
    cachedWorkingModel || '',
    ...SUPPORTED_MODELS,
  ];

  // Strictly filter out any deprecated 1.5, 2.0, or legacy pro models
  const candidateModels = Array.from(
    new Set(
      rawCandidates.filter(
        (m) =>
          Boolean(m) &&
          !m.includes('2.0') &&
          !m.includes('1.5') &&
          !m.includes('gemini-pro')
      )
    )
  );
  if (candidateModels.length === 0) {
    candidateModels.push(DEFAULT_GEMINI_MODEL);
  }

  let primaryError: Error | null = null;
  let lastError: Error | null = null;

  // 1. Direct REST API calls (clean, robust across all client environments)
  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Jpeg,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
          responseMimeType: 'application/json',
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          cachedWorkingModel = model;
          if (model !== preferredModel) {
            setStoredGeminiModel(model);
          }
          return text;
        }
      } else {
        const errorJson = await res.json().catch(() => null);
        const rawMsg =
          errorJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        console.warn(`[CardScanner] Gemini REST attempt (${model}) error:`, rawMsg);

        // Check for specific actionable errors
        if (res.status === 400 && (rawMsg.includes('API key not valid') || rawMsg.includes('API_KEY_INVALID'))) {
          throw new Error('Gemini API key is invalid. Please verify your API key in scanner settings.');
        }

        if (res.status === 403) {
          throw new Error(`Gemini API permission denied: ${rawMsg}. Verify your API key has Generative Language API enabled.`);
        }

        if (res.status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('Quota exceeded')) {
          const quotaErr = new Error(
            'Gemini free tier quota limit reached (15 scans/min or daily quota). Please wait a moment before scanning.'
          );
          if (!primaryError) primaryError = quotaErr;
          lastError = quotaErr;
          // Try next model in cascade
          continue;
        }

        // If this model is deprecated, decommissioned or not found, proceed to next candidate without blocking
        if (rawMsg.includes('no longer available') || rawMsg.includes('not found') || res.status === 404) {
          continue;
        }

        const modelErr = new Error(`Gemini (${model}): ${rawMsg}`);
        if (!primaryError) primaryError = modelErr;
        lastError = modelErr;
      }
    } catch (err: any) {
      // Re-throw immediately if it's an invalid key or permission denied
      if (
        err?.message?.includes('API key is invalid') ||
        err?.message?.includes('permission denied')
      ) {
        throw err;
      }
      console.warn(`[CardScanner] Gemini REST attempt (${model}) network error:`, err);
      if (!primaryError) primaryError = err;
      lastError = err;
    }
  }

  // 2. GoogleGenAI SDK fallback attempts
  for (const sdkModel of candidateModels) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const sdkResp = await ai.models.generateContent({
        model: sdkModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Jpeg,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      });
      if (sdkResp && sdkResp.text) {
        cachedWorkingModel = sdkModel;
        if (sdkModel !== preferredModel) {
          setStoredGeminiModel(sdkModel);
        }
        return sdkResp.text;
      }
    } catch (sdkErr: any) {
      console.warn(`[CardScanner] GoogleGenAI SDK error (${sdkModel}):`, sdkErr);
      const sdkMsg = sdkErr?.message || String(sdkErr);
      if (sdkMsg.includes('API key not valid') || sdkMsg.includes('API_KEY_INVALID')) {
        throw new Error('Gemini API key is invalid. Please verify your API key in scanner settings.');
      }
      if (sdkMsg.includes('no longer available') || sdkMsg.includes('not found')) {
        continue;
      }
      if (!primaryError) primaryError = sdkErr;
      lastError = sdkErr;
    }
  }

  throw primaryError || lastError || new Error(`Failed to analyze card image with Gemini (${preferredModel}). Please ensure your Gemini API key is valid and has active quota.`);
}

let ocrWorkerPromise: Promise<any> | null = null;

async function getOcrWorker(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        return worker;
      } catch (err) {
        console.warn('[CardScanner] Failed to init Tesseract OCR worker:', err);
        ocrWorkerPromise = null;
        return null;
      }
    })();
  }
  return ocrWorkerPromise;
}

const IGNORED_SET_CODES = new Set([
  'THE', 'AND', 'FOR', 'SET', 'CARD', 'COPY', 'RULE', 'TEXT', 'WOTC',
  'COAST', 'COASTS', 'ILLUS', 'GAME', 'MAGIC', 'EN', 'JP', 'FR', 'DE', 'IT', 'ES', 'PT', 'RU', 'ZHO'
]);

/**
 * Parses MTG card footer text for collector number and set code
 * e.g. "242/271 R MH3 • EN", "045 BLB", "123a NEO", "MH3 242", "301/280 LTR", "312/281 \n BLB - EN"
 */
export function parseMtgFooterText(text: string): { setCode?: string; collectorNumber?: string; isFoil?: boolean } | null {
  if (!text) return null;

  // Modern MTG cards print a STAR symbol ★ in the bottom border text for FOIL printings, or a DOT/CIRCLE • for NON-FOIL
  const hasFoilStar = /[\u2605\u2606★\*]|star|\bfoil\b/i.test(text);

  let clean = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Separate fused single-letter rarity indicator from set code (e.g. "UCM2" -> "U CM2", "CBLB" -> "C BLB")
  clean = clean.replace(/\b([CURMLSTP])([A-Z0-9]{3,5})\b/g, '$1 $2');

  // 2. Re-attach split alphanumeric set codes where OCR inserted a space before digits (e.g. "CM 2" -> "CM2", "GN 2" -> "GN2", "MH 3" -> "MH3", "M 21" -> "M21")
  clean = clean.replace(/\b([A-Z]{1,4})\s+([0-9]{1,2})\b/g, '$1$2');

  // 3. Re-attach spaced multi-character set codes (e.g. "2 X 2" -> "2X2")
  clean = clean.replace(/\b([0-9])\s*X\s*([0-9])\b/gi, '$1X$2');

  // Helper to fix common OCR number/letter misreads (including 4-digit numbers like "OO14" -> "0014")
  const fixNum = (s: string) =>
    s
      .trim()
      .replace(/[OQ]/gi, '0') // handles multiple zeros like OO14, 0O14
      .replace(/^S/i, '5')
      .replace(/^Z/i, '2')
      .replace(/^[Il|]/i, '1')
      .replace(/S$/i, '5');

  const fixSet = (s: string) =>
    s
      .trim()
      .toUpperCase()
      .replace(/^8/, 'B')
      .replace(/^0/, 'O')
      .replace(/^1/, 'L')
      .replace(/^5(?=[A-Z])/, 'S') // e.g. "5PM" -> "SPM"
      .replace(/([A-Z]{2})Z$/, '$12'); // e.g. "CMZ" -> "CM2", "GNZ" -> "GN2"

  // Pattern UB: Universes Beyond / Modern Borderless stacked layout e.g. "R 0014 SPM • EN", "M 0014 SPM", "R 0014 \n SPM * EN"
  // Rarity letter [CURMLS] followed by 1-4 digit number, then set code
  const patUB = /\b([CURMLS])\s*([0-9OIQlSZb]{1,4}[a-z]?)\s+[•\*\.\-\_e★]?\s*(?:[A-Z]{2}\s+)?([A-Z0-9]{3,5})\b/i.exec(clean);
  if (patUB) {
    const num = fixNum(patUB[2]);
    const rawSet = patUB[3].trim().toUpperCase();
    const set = fixSet(rawSet);
    if (set.length >= 3 && set.length <= 5 && !IGNORED_SET_CODES.has(set) && /^\d+[a-z]?$/i.test(num)) {
      return { collectorNumber: num, setCode: set, isFoil: hasFoilStar };
    }
  }

  // Pattern EA: Extended Art / Showcase layout e.g. "307  R \n BRO ★ EN Kekai Kotaki", "307 R BRO", "045 C BLB"
  // Collector number [1-4 digits], optional rarity indicator [CURMLS], then set code [3-5 chars]
  const patEA = /\b([0-9OIQlSZb]{1,4}[a-z]?)\s+(?:[CURMLS]\s+)?([A-Z0-9]{3,5})\b/i.exec(clean);
  if (patEA) {
    const num = fixNum(patEA[1]);
    const rawSet = patEA[2].trim().toUpperCase();
    const set = fixSet(rawSet);
    if (set.length >= 3 && set.length <= 5 && !IGNORED_SET_CODES.has(set) && /^\d+[a-z]?$/i.test(num)) {
      return { collectorNumber: num, setCode: set, isFoil: hasFoilStar };
    }
  }

  // Pattern A: Modern fraction layout e.g. "242/271 R MH3", "045/281 C BLB", "123a/280 M FDN", "301/280 LTR"
  // Note: allows ANY single-letter rarity indicator [A-Za-z] (C, U, R, M, L, S, T, P, A, F, B, E, N, H)
  const patA = /([0-9OIQlSZb]{1,4}[a-z]?)\s*\/\s*\d{2,4}\s*(?:[A-Za-z]\s+)?([A-Z0-9]{3,5})\b/i.exec(clean);
  if (patA) {
    const num = fixNum(patA[1]);
    const rawSet = patA[2].trim().toUpperCase();
    const set = fixSet(rawSet);
    if (set.length >= 3 && set.length <= 5 && !IGNORED_SET_CODES.has(set)) {
      return { collectorNumber: num, setCode: set, isFoil: hasFoilStar };
    }
  }

  // Pattern B: Set then Number or Number then Set without fraction e.g. "BLB 045", "MH3 242", "045 BLB", "242 MH3", "BLB • 045"
  const patB1 = /\b([A-Z0-9]{3,5})\s+[•\*\.\-\_e★]?\s*(?:[A-Z]{2}\s+)?([0-9OIQlSZb]{1,4}[a-z]?)\b/i.exec(clean);
  if (patB1) {
    const rawSet = patB1[1].trim().toUpperCase();
    const set = fixSet(rawSet);
    const num = fixNum(patB1[2]);
    if (set.length >= 3 && set.length <= 5 && !IGNORED_SET_CODES.has(set) && /^\d+[a-z]?$/i.test(num)) {
      return { collectorNumber: num, setCode: set, isFoil: hasFoilStar };
    }
  }

  const patB2 = /\b([0-9OIQlSZb]{1,4}[a-z]?)\s+[•\*\.\-\_e★]?\s*([A-Z0-9]{3,5})\b/i.exec(clean);
  if (patB2) {
    const num = fixNum(patB2[1]);
    const rawSet = patB2[2].trim().toUpperCase();
    const set = fixSet(rawSet);
    if (set.length >= 3 && set.length <= 5 && !IGNORED_SET_CODES.has(set) && /^\d+[a-z]?$/i.test(num)) {
      return { collectorNumber: num, setCode: set, isFoil: hasFoilStar };
    }
  }

  // Pattern C: e.g. "MH3 • EN 242/271" or "BLB • EN 045"
  const patC = /\b([A-Z0-9]{3,5})\s*[\•\*\.\-\_]?\s*[A-Z]{2}\s*([0-9OIQlSZb]{1,4}[a-z]?)\b/i.exec(clean);
  if (patC) {
    const rawSet = patC[1].trim().toUpperCase();
    const set = fixSet(rawSet);
    const num = fixNum(patC[2]);
    if (set.length >= 3 && set.length <= 5 && !IGNORED_SET_CODES.has(set) && /^\d+[a-z]?$/i.test(num)) {
      return { collectorNumber: num, setCode: set, isFoil: hasFoilStar };
    }
  }

  // Pattern D: Modern slash fraction anywhere e.g. "242/271" coupled with any 3-5 char set code
  const slashMatch = /([0-9OIQlSZb]{1,4}[a-z]?)\s*\/\s*\d{2,4}/i.exec(clean);
  if (slashMatch) {
    const num = fixNum(slashMatch[1]);
    const words = clean.split(/[^a-zA-Z0-9]/).filter((w) => w.length >= 3 && w.length <= 5);
    for (const word of words) {
      const candidateSet = fixSet(word);
      if (!IGNORED_SET_CODES.has(candidateSet) && !/^\d+$/.test(candidateSet)) {
        return { collectorNumber: num, setCode: candidateSet, isFoil: hasFoilStar };
      }
    }
  }

  return null;
}

/**
 * Fast client-side OCR recognition targeting MTG card footer & title banner.
 * Runs in WebAssembly via Tesseract.js with 0 API cost.
 */
export async function recognizeCardWithLocalOcr(
  base64Jpeg: string,
  scanTarget?: ScanTargetMode
): Promise<CardScanResult | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  try {
    const worker = await getOcrWorker();
    if (!worker) return null;

    // Set page segmentation mode to SINGLE_BLOCK (PSM 6) or SPARSE_TEXT (PSM 11) for high accuracy on card footers & titles
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
      });
    } catch {}

    // Load image onto canvas to perform targeted crops
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = base64Jpeg.startsWith('data:') ? base64Jpeg : `data:image/jpeg;base64,${base64Jpeg}`;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    // If scanTarget === 'footer', the input image is ALREADY a focused zoom on the card's bottom border!
    if (scanTarget === 'footer') {
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = w * 2.5;
      fullCanvas.height = h * 2.5;
      const ctx = fullCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // PASS 1: Inverted High-Contrast (Turns white footer text on dark border into CRISP BLACK TEXT on WHITE BACKGROUND for Tesseract)
        ctx.drawImage(img, 0, 0, w, h, 0, 0, w * 2.5, h * 2.5);
        const imgData1 = ctx.getImageData(0, 0, w * 2.5, h * 2.5);
        const d1 = imgData1.data;
        for (let i = 0; i < d1.length; i += 4) {
          const lum = d1[i] * 0.299 + d1[i + 1] * 0.587 + d1[i + 2] * 0.114;
          const bin = lum > 115 ? 0 : 255; // INVERTED: lum > 115 is text -> BLACK (0), dark border -> WHITE (255)
          d1[i] = bin;
          d1[i + 1] = bin;
          d1[i + 2] = bin;
        }
        ctx.putImageData(imgData1, 0, 0);
        const invFooterDataUrl = fullCanvas.toDataURL('image/png');
        const invFooterRes = await worker.recognize(invFooterDataUrl);
        let parsedFooter = parseMtgFooterText(invFooterRes?.data?.text || '');

        // PASS 2: Lower threshold inverted pass (for fainter, gold, or colored border cards)
        if (!parsedFooter) {
          ctx.drawImage(img, 0, 0, w, h, 0, 0, w * 2.5, h * 2.5);
          const imgData2 = ctx.getImageData(0, 0, w * 2.5, h * 2.5);
          const d2 = imgData2.data;
          for (let i = 0; i < d2.length; i += 4) {
            const lum = d2[i] * 0.299 + d2[i + 1] * 0.587 + d2[i + 2] * 0.114;
            const bin = lum > 80 ? 0 : 255;
            d2[i] = bin;
            d2[i + 1] = bin;
            d2[i + 2] = bin;
          }
          ctx.putImageData(imgData2, 0, 0);
          const invFooterDataUrl2 = fullCanvas.toDataURL('image/png');
          const invFooterRes2 = await worker.recognize(invFooterDataUrl2);
          parsedFooter = parseMtgFooterText(invFooterRes2?.data?.text || '');
        }

        // PASS 3: Raw zoomed canvas
        if (!parsedFooter) {
          ctx.drawImage(img, 0, 0, w, h, 0, 0, w * 2.5, h * 2.5);
          const rawFooterDataUrl = fullCanvas.toDataURL('image/png');
          const rawFooterRes = await worker.recognize(rawFooterDataUrl);
          parsedFooter = parseMtgFooterText(rawFooterRes?.data?.text || '');
        }

        if (parsedFooter?.setCode && parsedFooter?.collectorNumber) {
          console.log('[CardScanner:OCR:FooterMode] 🎯 Parsed footer:', parsedFooter);
          const cardMatch = await lookupExactScryfallCard('', parsedFooter.setCode, parsedFooter.collectorNumber);
          if (cardMatch) {
            const detectedFoil = Boolean(parsedFooter.isFoil);
            return {
              card: cardMatch,
              isFoil: detectedFoil,
              confidence: 'high',
              scanEngine: 'ocr',
              rawDetected: {
                card_name: cardMatch.name,
                set_code: parsedFooter.setCode,
                collector_number: parsedFooter.collectorNumber,
                is_foil: detectedFoil,
                engine: 'ocr',
              },
            };
          }
        }
      }
    }

    // 1. Footer Crop on Full Card Photo (bottom 18% of card, upscaled 2.5x with inverted binarization)
    const footerCanvas = document.createElement('canvas');
    const footerH = Math.max(45, Math.floor(h * 0.18));
    const footerY = Math.max(0, h - footerH);
    footerCanvas.width = w * 2.5;
    footerCanvas.height = footerH * 2.5;
    const fCtx = footerCanvas.getContext('2d');
    if (fCtx) {
      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = 'high';
      fCtx.drawImage(img, 0, footerY, w, footerH, 0, 0, w * 2.5, footerH * 2.5);

      // Pass 1: Inverted High Contrast
      const fImgData = fCtx.getImageData(0, 0, w * 2.5, footerH * 2.5);
      const fd = fImgData.data;
      for (let i = 0; i < fd.length; i += 4) {
        const lum = fd[i] * 0.299 + fd[i + 1] * 0.587 + fd[i + 2] * 0.114;
        const bin = lum > 115 ? 0 : 255;
        fd[i] = bin;
        fd[i + 1] = bin;
        fd[i + 2] = bin;
      }
      fCtx.putImageData(fImgData, 0, 0);
      const invFooterUrl = footerCanvas.toDataURL('image/png');
      const invFooterRes = await worker.recognize(invFooterUrl);
      let parsedFooter = parseMtgFooterText(invFooterRes?.data?.text || '');

      // Pass 2: Raw Footer
      if (!parsedFooter) {
        fCtx.drawImage(img, 0, footerY, w, footerH, 0, 0, w * 2.5, footerH * 2.5);
        const rawFooterDataUrl = footerCanvas.toDataURL('image/png');
        const rawFooterRes = await worker.recognize(rawFooterDataUrl);
        parsedFooter = parseMtgFooterText(rawFooterRes?.data?.text || '');
      }

      if (parsedFooter?.setCode && parsedFooter?.collectorNumber) {
        console.log('[CardScanner:OCR] 🎯 Parsed footer:', parsedFooter);
        const cardMatch = await lookupExactScryfallCard('', parsedFooter.setCode, parsedFooter.collectorNumber);
        if (cardMatch) {
          const detectedFoil = Boolean(parsedFooter.isFoil);
          return {
            card: cardMatch,
            isFoil: detectedFoil,
            confidence: 'high',
            scanEngine: 'ocr',
            rawDetected: {
              card_name: cardMatch.name,
              set_code: parsedFooter.setCode,
              collector_number: parsedFooter.collectorNumber,
              is_foil: detectedFoil,
              engine: 'ocr',
            },
          };
        }
      }
    }

    // 2. Focused Title Banner Crop (top 2.5% to 15% of card, avoiding mana cost on right, upscaled 2x)
    const titleCanvas = document.createElement('canvas');
    const titleY = Math.max(0, Math.floor(h * 0.025));
    const titleH = Math.max(35, Math.floor(h * 0.13));
    const titleX = Math.max(0, Math.floor(w * 0.04));
    const titleW = Math.max(50, Math.floor(w * 0.76)); // cuts out right mana symbols
    titleCanvas.width = titleW * 2;
    titleCanvas.height = titleH * 2;
    const tCtx = titleCanvas.getContext('2d');
    if (tCtx) {
      tCtx.imageSmoothingEnabled = true;
      tCtx.imageSmoothingQuality = 'high';
      tCtx.drawImage(img, titleX, titleY, titleW, titleH, 0, 0, titleW * 2, titleH * 2);
      const titleDataUrl = titleCanvas.toDataURL('image/png');
      const titleRes = await worker.recognize(titleDataUrl);
      const titleLines = (titleRes?.data?.text || '')
        .split('\n')
        .map((l: string) => l.replace(/[^a-zA-Z0-9\s,'\-\/\(\)]/g, '').trim())
        .filter((l: string) => l.length >= 3);

      for (const rawLine of titleLines) {
        // Skip generic header words
        if (/^(creature|instant|sorcery|enchantment|artifact|land|legendary|planeswalker|battle|tribal)$/i.test(rawLine)) {
          continue;
        }

        // Test raw line and cleaned line (stripping trailing mana noise like "UU", "2G", "(2)", etc.)
        const cleanedCandidate = rawLine.replace(/\s+([0-9WUBRGwubrg]{1,4}|[\(\[\{].*[\)\]\}])$/, '').trim();
        const candidates = Array.from(new Set([rawLine, cleanedCandidate])).filter((c) => c.length >= 3);

        for (const candidateName of candidates) {
          console.log('[CardScanner:OCR] 🔍 Testing candidate title line:', candidateName);
          const cardMatch = await lookupExactScryfallCard(candidateName);
          if (cardMatch) {
            return {
              card: cardMatch,
              isFoil: false,
              confidence: 'medium',
              scanEngine: 'ocr',
              rawDetected: {
                card_name: cardMatch.name,
                set_code: cardMatch.set,
                collector_number: cardMatch.collector_number,
                is_foil: false,
                engine: 'ocr',
              },
            };
          }
        }
      }
    }

    return null;
  } catch (ocrErr) {
    console.warn('[CardScanner] Local OCR recognition attempt error:', ocrErr);
    return null;
  }
}

/**
 * Validates whether an extracted string is a plausible MTG card name
 * and filters out JSON schema keys, placeholders (like "card_"), and boilerplate.
 */
export function isValidCardName(name: string | undefined | null): boolean {
  if (!name) return false;
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 70) return false;

  // Reject JSON keys, variable identifiers, schema fields, and values (e.g. "is_foil", "set_code", "collector_number", "card_name", "confidence")
  if (/^[a-z0-9]+_[a-z0-9_]+$/i.test(clean)) return false;
  if (/^is[_\s-]?foil$/i.test(clean) || /^set[_\s-]?code$/i.test(clean) || /^collector[_\s-]?num/i.test(clean) || /^card[_\s-]?/i.test(clean) || /^confidence$/i.test(clean)) return false;
  if (/[_\s-]name$/i.test(clean) && !/\s/.test(clean)) return false;
  if (
    /^(card|name|title|exact card name|card name|unknown|null|undefined|none|n\/a|not found|no card|mtg card|magic card|sample card|sample|collector|collector_number|collectorNumber|set_code|setCode|json|foil|is_foil|isFoil|true|false|front|back|front_face|back_face|confidence|high|medium|low)$/i.test(
      clean
    )
  ) {
    return false;
  }

  // Reject conversational text, boilerplate, or AI phrases
  if (
    /^(our market research|market research|shows that players|here is|analyzing|this image|the card|error|json|i have|i cannot|sorry|as an ai|unable to|could not)/i.test(
      clean
    )
  ) {
    return false;
  }
  if (/our\s+market\s+research/i.test(clean)) return false;

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(clean)) return false;

  // Cannot contain code syntax brackets, braces, unparsed quotes, or key-value colons
  if (/[{}[\]\\\/=:]/.test(clean)) return false;

  return true;
}

/**
 * Resiliently extracts MTG card identification fields from raw AI output.
 * Handles strict JSON, markdown codeblocks, trailing commas, single quotes,
 * unquoted keys, bold markdown labels (**Card Name:**), natural language,
 * and key variations across different Gemini models.
 */
export function parseCardAiResponse(rawResponseText: string): {
  card_name: string;
  set_code: string;
  collector_number: string;
  is_foil: boolean;
  confidence: 'high' | 'medium' | 'low';
} {
  if (!rawResponseText) {
    throw new Error('Gemini Vision did not return any analysis for the image');
  }

  // 1. Clean code fences anywhere in the response text
  const cleanFences = rawResponseText
    .replace(/```(?:json)?/gi, '')
    .trim();

  // 2. Extract JSON bracketed object {...} if present
  const firstBrace = cleanFences.indexOf('{');
  const lastBrace = cleanFences.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    let candidateJson = cleanFences
      .substring(firstBrace, lastBrace + 1)
      .replace(/,\s*([\}\]])/g, '$1') // strip trailing commas
      .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1'); // strip JS comments

    // Attempt direct parse
    try {
      const parsed = JSON.parse(candidateJson);
      let name = (parsed.card_name || parsed.name || parsed.cardName || parsed.title || parsed.cardTitle || '').trim();
      if (!isValidCardName(name)) name = '';
      const set = (parsed.set_code || parsed.setCode || parsed.set || parsed.expansion || '').trim().replace(/[^a-zA-Z0-9]/g, '');
      let rawNumStr = String(parsed.collector_number || parsed.collectorNumber || parsed.number || parsed.collector_no || '').trim();
      if (rawNumStr.includes('/')) rawNumStr = rawNumStr.split('/')[0].trim();
      const num = rawNumStr.replace(/[^a-zA-Z0-9]/g, '');
      const foil = Boolean(parsed.is_foil ?? parsed.isFoil ?? parsed.foil);
      const conf = (parsed.confidence || 'medium') as 'high' | 'medium' | 'low';
      if (name || (set && num)) {
        return {
          card_name: name,
          set_code: set,
          collector_number: num,
          is_foil: foil,
          confidence: conf,
        };
      }
    } catch (_err) {
      // Try quoting unquoted keys: e.g. { card_name: "Sol Ring" }
      try {
        const quotedKeysJson = candidateJson
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
          .replace(/'/g, '"');
        const parsed = JSON.parse(quotedKeysJson);
        let name = (parsed.card_name || parsed.name || parsed.cardName || parsed.title || parsed.cardTitle || '').trim();
        if (!isValidCardName(name)) name = '';
        const set = (parsed.set_code || parsed.setCode || parsed.set || parsed.expansion || '').trim().replace(/[^a-zA-Z0-9]/g, '');
        let rawNumStr2 = String(parsed.collector_number || parsed.collectorNumber || parsed.number || parsed.collector_no || '').trim();
        if (rawNumStr2.includes('/')) rawNumStr2 = rawNumStr2.split('/')[0].trim();
        const num = rawNumStr2.replace(/[^a-zA-Z0-9]/g, '');
        const foil = Boolean(parsed.is_foil ?? parsed.isFoil ?? parsed.foil);
        const conf = (parsed.confidence || 'medium') as 'high' | 'medium' | 'low';
        if (name || (set && num)) {
          return {
            card_name: name,
            set_code: set,
            collector_number: num,
            is_foil: foil,
            confidence: conf,
          };
        }
      } catch (_err2) {
        // Fall through to regex extraction
      }
    }
  }

  // 3. Resilient regex extraction across text (handles **, quotes, unquoted keys, line-based output)
  const setMatch =
    rawResponseText.match(/(?:\*{1,2}|["'`])?(?:set[_\s-]?code|set|expansion)(?:\*{1,2}|["'`])?\s*[:=]\s*(?:\*{1,2}|["'`])?([a-zA-Z0-9]{3,5})/i);

  const numMatch =
    rawResponseText.match(/(?:\*{1,2}|["'`])?(?:collector[_\s-]?number|collectorNumber|number|collector[_\s-]?no|card[_\s-]?no|#)(?:\*{1,2}|["'`])?\s*[:=]\s*(?:\*{1,2}|["'`])?([0-9]{1,4}[a-zA-Z]?)/i);

  const foilMatch =
    rawResponseText.match(/(?:\*{1,2}|["'`])?(?:is[_\s-]?foil|foil|finish)(?:\*{1,2}|["'`])?\s*[:=]\s*(?:\*{1,2}|["'`])?(true|false|yes|no|foil|non-foil|regular)/i);

  const nameMatch =
    rawResponseText.match(/(?:\*{1,2}|["'`])?(?:card[_\s-]?name|card[_\s-]?title|name|title)(?:\*{1,2}|["'`])?\s*[:=]\s*(?:\*{1,2}|["'`])?([^\r\n"',\}\*]+)/i);

  if (nameMatch && nameMatch[1]) {
    const rawFoil = foilMatch ? foilMatch[1].toLowerCase() : 'false';
    const cleanName = nameMatch[1].replace(/^[*\s"':]+|[*\s"':]+$/g, '').trim();
    if (isValidCardName(cleanName)) {
      return {
        card_name: cleanName,
        set_code: setMatch ? setMatch[1].trim() : '',
        collector_number: numMatch ? numMatch[1].trim() : '',
        is_foil: rawFoil === 'true' || rawFoil === 'yes' || rawFoil === 'foil',
        confidence: 'medium',
      };
    }
  }

  // 4. Natural language sentence extraction: "The card is Sol Ring", "Identified card: Sol Ring", "shows a Lightning Bolt"
  const nlMatch =
    rawResponseText.match(/(?:card(?:\s+is|\s+identified\s+as|\s+shown\s+is|\s+name\s+is)?[:\s]+)(?:["']([^"'\n\r]+)["']|([A-Z][A-Za-z0-9',\-\s]{2,35}))/i) ||
    rawResponseText.match(/(?:identified|recognize[d]?|shows)\s+(?:a\s+|an\s+)?["']?([A-Z][a-zA-Z0-9',\s\-]{2,35}?)["']?\s+(?:from|\(|\-|\.)/i);
  if (nlMatch) {
    const foundName = (nlMatch[1] || nlMatch[2] || '').trim();
    if (isValidCardName(foundName)) {
      return {
        card_name: foundName,
        set_code: setMatch ? setMatch[1].trim() : '',
        collector_number: numMatch ? numMatch[1].trim() : '',
        is_foil: false,
        confidence: 'medium',
      };
    }
  }

  // 5. If set code and collector number were extracted, prefer exact set/collector lookup over line guessing
  if (setMatch && numMatch) {
    const rawFoil = foilMatch ? foilMatch[1].toLowerCase() : 'false';
    return {
      card_name: '',
      set_code: setMatch[1].trim(),
      collector_number: numMatch[1].trim(),
      is_foil: rawFoil === 'true' || rawFoil === 'yes' || rawFoil === 'foil',
      confidence: 'medium',
    };
  }

  // 6. Scan lines for any quoted card title
  const lines = rawResponseText.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Skip JSON key-value lines (e.g. "is_foil": false)
    if (/^[":'a-z_]+\s*:/i.test(line)) continue;
    const quoted = line.match(/"([^"]{2,55})"/);
    if (quoted && isValidCardName(quoted[1])) {
      return {
        card_name: quoted[1].trim(),
        set_code: setMatch ? setMatch[1].trim() : '',
        collector_number: numMatch ? numMatch[1].trim() : '',
        is_foil: false,
        confidence: 'low',
      };
    }
  }

  // 7. Last resort: clean non-empty line between 3 and 40 characters that passes card name validation
  for (const line of lines) {
    if (/^[":'a-z_]+\s*:/i.test(line)) continue;
    const stripped = line.replace(/^[*\-#\s"':]+|[*\-#\s"':]+$/g, '').trim();
    if (
      isValidCardName(stripped) &&
      !/^[{}[\]\/\\]/.test(stripped) &&
      !/^(here is|i have|analyzing|this image|the card|error|json)/i.test(stripped)
    ) {
      return {
        card_name: stripped,
        set_code: setMatch ? setMatch[1].trim() : '',
        collector_number: numMatch ? numMatch[1].trim() : '',
        is_foil: false,
        confidence: 'low',
      };
    }
  }

  console.warn('[CardScanner] Raw unparseable AI response:', rawResponseText);
  throw new Error('Could not read card identification details. Please center the card within the crosshairs under steady light.');
}

/**
 * Hybrid card identification pipeline:
 * Tier 1: Fast local on-device OCR (0 API cost, ~200ms)
 * Tier 2: Gemini 3.8 Flash Vision (for complex art, foiling, vintage editions, and low-light)
 */
export async function identifyCardFromImage(
  base64Jpeg: string,
  customApiKey?: string,
  preferredEngine?: ScanEngineMode,
  scanTarget?: ScanTargetMode
): Promise<CardScanResult> {
  const engine = preferredEngine || getStoredScanEngine();

  // Tier 1: Fast Local OCR
  if (engine === 'hybrid' || engine === 'ocr_only') {
    try {
      const ocrResult = await recognizeCardWithLocalOcr(base64Jpeg, scanTarget);
      if (ocrResult) {
        console.log('[CardScanner] ⚡ Card recognized via Fast Local OCR:', ocrResult.card.name);
        return ocrResult;
      }
    } catch (ocrErr) {
      console.warn('[CardScanner] Local OCR failed, falling back to Gemini Vision:', ocrErr);
    }

    if (engine === 'ocr_only') {
      throw new Error(
        scanTarget === 'footer'
          ? 'Local OCR could not read footer set/collector code. Ensure the bottom text is well-lit and aligned inside the frame.'
          : 'Local OCR could not read card title or set info. Please ensure card is clear and well-lit, or switch to Hybrid/AI mode.'
      );
    }
  }

  // Tier 2: Gemini 3.8 Flash AI Vision
  const apiKey = (customApiKey || getStoredGeminiApiKey()).trim();
  if (!apiKey) {
    if (engine === 'hybrid') {
      throw new Error(
        'Local OCR could not read card footer/title. Enter a free Gemini API key in settings for AI fallback on difficult or vintage cards.'
      );
    }
    throw new Error(
      'Gemini API key is required for AI card recognition. Please enter your API key in the scanner settings.'
    );
  }

  // Unified, robust Gemini card vision prompt that handles full cards, macro footer crops,
  // visible flavor text, artist credits, and foil glare reflections gracefully.
  const prompt = `You are an expert Magic: The Gathering (MTG) card scanner and multimodal card recognizer.
Analyze this MTG card photo and identify the card with high precision.

NOTE: This image may be a FULL CARD, or it may be a ZOOMED-IN CLOSE-UP of the BOTTOM BORDER / FOOTER / RULES BOX.

DETECTION INSTRUCTIONS:
1. FOOTER SET CODE & COLLECTOR NUMBER (Bottom Border):
   - Extract the 3 to 5 character uppercase expansion SET CODE (e.g. "SPM", "CM2", "GN2", "2X2", "BLB", "MH3", "OTJ", "FDN", "ONE", "LTR", "M21", "FIN", "DSK").
     * Universes Beyond and special sets often use letters like SPM (Spider-Man), WHO (Doctor Who), PIP (Fallout), etc.
     * Note: If a bright glare spot partially obscures the set code or collector number, deduce them from the visible letters and remaining clues!
   - Extract the COLLECTOR NUMBER:
     * Standard cards: "045", "242", "050/312" (extract "050").
     * Extended Art / Showcase cards (e.g. BRO, BLB): formatted as "[NUMBER]  [RARITY]" (e.g. "307  R") stacked above "[SET] ★ [LANG] [ARTIST]" (e.g. "BRO ★ EN Kekai Kotaki") -> extract "307" and set "BRO".
     * Universes Beyond / Modern Borderless cards (like SPM): often formatted as "R 0014" or "M 0014" stacked above the set code (extract "0014" or "14").
   - PHYSICAL PAPER SETS ONLY: NEVER output digital-only or Magic Online sets (e.g. VMA, ME1-ME4, TPR, Alchemy).

2. CARD IDENTIFICATION (Card Title, Artwork, Flavor Text, Rules, & Artist):
   - If the card title banner or illustration is visible, identify the card name.
   - If ONLY the bottom slice of the card is visible:
     * Look at the VISIBLE FLAVOR TEXT (e.g. quote "Have no fear. Spidey is here!"), rules text, or card frame style.
     * Look at the ARTIST CREDIT (e.g. "Kekai Kotaki" on BRO #307 Soul Partition, "Roberta Ingranata", "Dan Murayama Scott", etc.).
     * Use these clues to deduce and output the exact official English card name in "card_name" (e.g. artist "Kekai Kotaki" + set "BRO" #307 = "Soul Partition")!

3. FOIL SYMBOL RULE:
   - Modern MTG cards feature a STAR symbol ★ in the bottom border text (next to collector number or set code) or rainbow sheen / shooting star stamp for FOIL printings.
   - Non-foil cards feature a DOT/CIRCLE symbol • in the bottom border text.
   - Set "is_foil": true if a star ★ or rainbow foil sheen is visible; otherwise false.

Respond ONLY with a valid, raw JSON object:
{
  "card_name": "Official Card Name",
  "set_code": "BRO",
  "collector_number": "307",
  "is_foil": true,
  "confidence": "high"
}`;

  let rawResponseText: string;
  try {
    rawResponseText = await queryGeminiVision(apiKey, base64Jpeg, prompt);
  } catch (aiErr: any) {
    if (engine === 'hybrid') {
      const msg = aiErr?.message || '';
      if (
        msg.includes('quota') ||
        msg.includes('429') ||
        msg.includes('limit') ||
        msg.includes('RESOURCE_EXHAUSTED')
      ) {
        throw new Error(
          'Local OCR could not match this card and Gemini AI fallback reached its free-tier rate limit (15 scans/min). Tap "Switch to Local OCR Only" on screen for unlimited scans, or center the card in brighter light.'
        );
      }
    }
    throw aiErr;
  }

  if (!rawResponseText) {
    throw new Error('Gemini Vision did not return any analysis for the image');
  }

  // Resilient JSON and attribute parsing
  const parsed = parseCardAiResponse(rawResponseText);

  const detectedName = isValidCardName(parsed.card_name) ? parsed.card_name.trim() : '';
  const detectedSet = (parsed.set_code || '').trim().replace(/[^a-zA-Z0-9]/g, '');
  const detectedNumber = String(parsed.collector_number || '').trim().replace(/[^a-zA-Z0-9]/g, '');
  const detectedFoil = Boolean(parsed.is_foil);
  const confidence = (parsed.confidence || 'medium') as 'high' | 'medium' | 'low';

  if (!detectedName && (!detectedSet || !detectedNumber)) {
    const rawInfoParts: string[] = [];
    if (parsed.card_name) rawInfoParts.push(`Name: "${parsed.card_name}"`);
    if (parsed.set_code) rawInfoParts.push(`Set: ${parsed.set_code.toUpperCase()}`);
    if (parsed.collector_number) rawInfoParts.push(`Collector #: ${parsed.collector_number}`);
    
    const rawSummary = rawInfoParts.length > 0 ? rawInfoParts.join(' · ') : 'None (Text blurred/unrecognized)';
    const errMessage = `[Optical Scan Issue]\nCould not read card details from image.\n🔍 Picked up on Card: [${rawSummary}]. Please center the card under steady light.`;

    const err: any = new Error(errMessage);
    err.rawResponseText = rawResponseText;
    err.rawDetected = {
      card_name: parsed.card_name || '',
      set_code: parsed.set_code || '',
      collector_number: parsed.collector_number || '',
      is_foil: Boolean(parsed.is_foil),
    };
    err.errorType = 'scan_failed';
    throw err;
  }

  // Lookup the card on Scryfall
  const matchedCard = await lookupExactScryfallCard(detectedName, detectedSet, detectedNumber);
  if (!matchedCard) {
    const parts: string[] = [];
    if (detectedName) parts.push(`Name: "${detectedName}"`);
    if (detectedSet) parts.push(`Set: ${detectedSet.toUpperCase()}`);
    if (detectedNumber) parts.push(`Collector #: ${detectedNumber}`);
    parts.push(`Foil: ${detectedFoil ? 'Yes' : 'No'}`);

    const extractedSummary = parts.length > 0 ? parts.join(' · ') : 'None';

    const errMessage = detectedName
      ? `[Scryfall Lookup Issue]\nCould not find card "${detectedName}" on Scryfall.\n🔍 Picked up on Card: [${extractedSummary}]`
      : `[Scryfall Lookup Issue]\nCould not find a card matching set ${detectedSet.toUpperCase()} #${detectedNumber} on Scryfall.\n🔍 Picked up on Card: [${extractedSummary}]`;

    const err: any = new Error(errMessage);
    err.rawResponseText = rawResponseText;
    err.rawDetected = {
      card_name: detectedName,
      set_code: detectedSet,
      collector_number: detectedNumber,
      is_foil: detectedFoil,
    };
    err.errorType = 'lookup_failed';
    throw err;
  }

  // If Scryfall matched under official rules name but image identified a printed/unofficial title (e.g. "Xenk, Paladin Unbroken"), preserve it!
  if (!matchedCard.printed_name && detectedName && detectedName.toLowerCase() !== matchedCard.name.toLowerCase()) {
    matchedCard.printed_name = detectedName;
  }

  return {
    card: matchedCard,
    isFoil: detectedFoil,
    confidence,
    scanEngine: 'gemini',
    rawDetected: {
      card_name: detectedName,
      set_code: detectedSet,
      collector_number: detectedNumber,
      is_foil: detectedFoil,
      engine: 'gemini',
    },
  };
}
