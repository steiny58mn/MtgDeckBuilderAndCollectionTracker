import { GoogleGenAI } from '@google/genai';
import { ScryfallCard } from '../types/mtg';
import { normalizeFrostpointCard } from './api';

export interface CardScanResult {
  card: ScryfallCard;
  isFoil: boolean;
  confidence: 'high' | 'medium' | 'low';
  rawDetected?: {
    card_name?: string;
    set_code?: string;
    collector_number?: string;
    is_foil?: boolean;
  };
}

const STORAGE_KEY_GEMINI_API_KEY = 'mtg_gemini_api_key';
const STORAGE_KEY_GEMINI_MODEL = 'mtg_gemini_model';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export const POPULAR_GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Latest / Recommended)' },
  { id: 'gemini-3.8-flash-lite', label: 'Gemini 3.8 Flash Lite (Fastest)' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
] as const;

/**
 * Retrieves the configured Gemini model, defaulting to gemini-3.8-flash.
 */
export function getStoredGeminiModel(): string {
  if (typeof window === 'undefined') return DEFAULT_GEMINI_MODEL;
  const localModel = localStorage.getItem(STORAGE_KEY_GEMINI_MODEL)?.trim();
  if (localModel) return localModel;
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
 * Look up exact card printing on Scryfall using set code and collector number,
 * with fallbacks to prints search and fuzzy name search.
 * Ensures the EXACT printing version (set and collector number) is matched.
 */
export async function lookupExactScryfallCard(
  cardName: string,
  setCode?: string,
  collectorNumber?: string
): Promise<ScryfallCard | null> {
  const cleanSet = (setCode || '').trim().toLowerCase();
  const rawNum = (collectorNumber || '').trim();
  const unpaddedNum = rawNum.replace(/^0+(?=\d)/, ''); // e.g. "045" -> "45"
  const cleanName = (cardName || '').trim();

  // 1. Direct Set + Collector Number lookup on Scryfall (/cards/:set/:number)
  if (cleanSet && rawNum) {
    const numCandidates = Array.from(
      new Set([rawNum.toLowerCase(), unpaddedNum.toLowerCase()])
    );
    for (const num of numCandidates) {
      try {
        const url = `https://api.scryfall.com/cards/${encodeURIComponent(cleanSet)}/${encodeURIComponent(num)}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const json = await res.json();
          if (json && json.id) {
            return normalizeFrostpointCard(json);
          }
        }
      } catch (err) {
        console.warn('[CardScanner] Direct set/collector lookup failed:', err);
      }
    }
  }

  // 2. Exact Card Name prints search
  if (cleanName) {
    try {
      const printsUrl = `https://api.scryfall.com/cards/search?q=%21%22${encodeURIComponent(cleanName)}%22+unique%3Aprints&order=released&dir=desc`;
      const res = await fetch(printsUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          const cards: ScryfallCard[] = json.data.map(normalizeFrostpointCard);

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
            if (bothMatch) return bothMatch;
          }

          // Priority 2: Match in the specified set if set is known
          if (cleanSet) {
            const sameSetCards = cards.filter((c) => (c.set || '').toLowerCase() === cleanSet);
            if (sameSetCards.length === 1) {
              return sameSetCards[0];
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
                return closest;
              }
              return sameSetCards[0];
            } else if (sameSetCards.length > 0) {
              return sameSetCards[0];
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
            if (numMatch) return numMatch;
          }

          // Fallback: If neither set nor collector number matched, return most recent print
          return cards[0];
        }
      }
    } catch (err) {
      console.warn('[CardScanner] Prints search fallback failed:', err);
    }

    // 3. Fuzzy card name search
    try {
      const fuzzyUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleanName)}`;
      const res = await fetch(fuzzyUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const json = await res.json();
        if (json && json.id) {
          return normalizeFrostpointCard(json);
        }
      }
    } catch (err) {
      console.warn('[CardScanner] Fuzzy lookup fallback failed:', err);
    }
  }

  return null;
}

/**
 * Flash models supported on Google Generative Language v1beta.
 * Primary model is gemini-3.8-flash (as directed by Google API migration notice).
 */
const SUPPORTED_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.8-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
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
  // 1. User preferred model
  // 2. Previously cached working model
  // 3. Other supported models in cascade order
  const candidateModels = Array.from(
    new Set([preferredModel, cachedWorkingModel || '', ...SUPPORTED_MODELS])
  ).filter(Boolean);

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
          maxOutputTokens: 250,
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          cachedWorkingModel = model;
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

        const modelErr = new Error(`Gemini (${model}): ${rawMsg}`);

        // If this model is deprecated, decommissioned or not found, proceed to next candidate without blocking
        if (rawMsg.includes('no longer available') || rawMsg.includes('not found') || res.status === 404) {
          lastError = modelErr;
          continue;
        }

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
      const ai = new GoogleGenAI({ apiKey });
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
      });
      if (sdkResp && sdkResp.text) {
        cachedWorkingModel = sdkModel;
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

  throw primaryError || lastError || new Error('Failed to analyze card image with Gemini Vision');
}

/**
 * Uses Gemini Vision model to inspect the card photo and identify its exact printing details.
 */
export async function identifyCardFromImage(
  base64Jpeg: string,
  customApiKey?: string
): Promise<CardScanResult> {
  const apiKey = (customApiKey || getStoredGeminiApiKey()).trim();
  if (!apiKey) {
    throw new Error(
      'Gemini API key is required for AI card recognition. Please enter your API key in the scanner settings.'
    );
  }

  const prompt = `You are a professional Magic: The Gathering (MTG) card scanner.
Analyze THIS SPECIFIC MTG card photo with extreme precision. Do NOT guess or repeat a previous card.
Examine the following specific card regions:
1. Card Title (top): Extract the exact official English card name.
2. Bottom-left footer: Modern MTG cards print "[collector_number]/[total] [rarity] [SET_CODE] \u2022 [LANG]" or "[collector_number] [SET_CODE]".
   - Extract the 3 to 5 letter set code in UPPERCASE (e.g. "NEO", "OTJ", "MH3", "BLB", "BRO", "MKM", "ONE", "LTR", "DMU", "CLB", "2X2", "SLD", "FDN", etc.).
   - Extract the exact collector number (e.g. "242", "045", "123a", "007", "301", "298").
   - If older card without bottom-left footer, identify the expansion set from the expansion symbol on the middle-right line.
3. Version Sensitivity: Cards often have multiple different printings and arts. Read the exact set code and collector number on THIS card.
4. Foiling: Check if the card exhibits rainbow holographic sheen, metallic foil gloss, or a foil shooting-star stamp.
5. Confidence: Return "high", "medium", or "low".

Respond ONLY with a valid, raw JSON object matching this exact schema:
{
  "card_name": "Exact Card Name",
  "set_code": "SET",
  "collector_number": "123",
  "is_foil": false,
  "confidence": "high"
}`;

  const rawResponseText = await queryGeminiVision(apiKey, base64Jpeg, prompt);

  if (!rawResponseText) {
    throw new Error('Gemini Vision did not return any analysis for the image');
  }

  // Parse JSON from model response (cleaning any markdown code blocks)
  const cleanJsonText = rawResponseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJsonText);
  } catch (_jsonErr) {
    // Attempt regex extraction if JSON parsing failed
    const nameMatch = rawResponseText.match(/"card_name"\s*:\s*"([^"]+)"/i);
    const setMatch = rawResponseText.match(/"set_code"\s*:\s*"([^"]+)"/i);
    const numMatch = rawResponseText.match(/"collector_number"\s*:\s*"([^"]+)"/i);
    const foilMatch = rawResponseText.match(/"is_foil"\s*:\s*(true|false)/i);

    if (nameMatch) {
      parsed = {
        card_name: nameMatch[1],
        set_code: setMatch ? setMatch[1] : '',
        collector_number: numMatch ? numMatch[1] : '',
        is_foil: foilMatch ? foilMatch[1].toLowerCase() === 'true' : false,
        confidence: 'medium',
      };
    } else {
      throw new Error('Could not parse card identification details from AI response');
    }
  }

  const detectedName = (parsed.card_name || '').trim();
  const detectedSet = (parsed.set_code || '').trim();
  const detectedNumber = String(parsed.collector_number || '').trim();
  const detectedFoil = Boolean(parsed.is_foil);
  const confidence = (parsed.confidence || 'medium') as 'high' | 'medium' | 'low';

  if (!detectedName && !detectedSet) {
    throw new Error('Could not identify a Magic card in this image. Please ensure the card is well-lit and clearly centered.');
  }

  // Lookup the card on Scryfall
  const matchedCard = await lookupExactScryfallCard(detectedName, detectedSet, detectedNumber);
  if (!matchedCard) {
    throw new Error(
      `Recognized "${detectedName}" (${detectedSet.toUpperCase()} #${detectedNumber}), but could not find matching card on Scryfall.`
    );
  }

  // If Scryfall matched under official rules name but image identified a printed/unofficial title (e.g. "Xenk, Paladin Unbroken"), preserve it!
  if (!matchedCard.printed_name && detectedName && detectedName.toLowerCase() !== matchedCard.name.toLowerCase()) {
    matchedCard.printed_name = detectedName;
  }

  return {
    card: matchedCard,
    isFoil: detectedFoil,
    confidence,
    rawDetected: {
      card_name: detectedName,
      set_code: detectedSet,
      collector_number: detectedNumber,
      is_foil: detectedFoil,
    },
  };
}
