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
 * down to max ~1280px on its longest edge and converts to JPEG.
 * Returns a clean base64 data URL and raw base64 string.
 */
export async function optimizeCardImage(
  imageSource: Blob | File | HTMLImageElement | HTMLVideoElement
): Promise<{ dataUrl: string; base64Only: string }> {
  return new Promise((resolve, reject) => {
    let img: HTMLImageElement;

    const processLoadedImage = (imageEl: HTMLImageElement | HTMLVideoElement) => {
      try {
        const naturalWidth = (imageEl as HTMLImageElement).naturalWidth || (imageEl as HTMLVideoElement).videoWidth || imageEl.width;
        const naturalHeight = (imageEl as HTMLImageElement).naturalHeight || (imageEl as HTMLVideoElement).videoHeight || imageEl.height;

        if (!naturalWidth || !naturalHeight) {
          throw new Error('Invalid image dimensions');
        }

        const maxDimension = 1280;
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
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
        imageSource.onerror = (e) => reject(new Error('Failed to load image element'));
      }
      return;
    }

    // It's a Blob or File
    const reader = new FileReader();
    reader.onload = (e) => {
      img = new Image();
      img.onload = () => processLoadedImage(img);
      img.onerror = () => reject(new Error('Failed to parse uploaded image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = (e) => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(imageSource);
  });
}

/**
 * Look up exact card printing on Scryfall using set code and collector number,
 * with fallbacks to prints search and fuzzy name search.
 */
export async function lookupExactScryfallCard(
  cardName: string,
  setCode?: string,
  collectorNumber?: string
): Promise<ScryfallCard | null> {
  const cleanSet = (setCode || '').trim().toLowerCase();
  const cleanNum = (collectorNumber || '').trim();
  const cleanName = (cardName || '').trim();

  // 1. Direct Set + Collector Number lookup (Most accurate MTG identifier)
  if (cleanSet && cleanNum) {
    try {
      const url = `https://api.scryfall.com/cards/${encodeURIComponent(cleanSet)}/${encodeURIComponent(cleanNum.toLowerCase())}`;
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

  // 2. Exact Card Name prints search
  if (cleanName) {
    try {
      const printsUrl = `https://api.scryfall.com/cards/search?q=%21%22${encodeURIComponent(cleanName)}%22+unique%3Aprints&order=released&dir=desc`;
      const res = await fetch(printsUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          const cards: ScryfallCard[] = json.data.map(normalizeFrostpointCard);

          // Find match with same set or collector number
          if (cleanSet) {
            const setMatch = cards.find((c) => (c.set || '').toLowerCase() === cleanSet);
            if (setMatch) return setMatch;
          }
          if (cleanNum) {
            const numMatch = cards.find(
              (c) =>
                c.collector_number === cleanNum ||
                parseInt(c.collector_number, 10) === parseInt(cleanNum, 10)
            );
            if (numMatch) return numMatch;
          }

          // Return most recent print if set/num didn't match exactly
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

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are a professional Magic: The Gathering (MTG) card scanner.
Analyze this MTG card photo with extreme precision.
Examine the following specific card regions:
1. Top-left card title: Extract the exact official English card name.
2. Bottom-left corner: Modern MTG cards print "[collector_number]/[total] [rarity] [SET_CODE] • [LANG]".
   Extract the 3 to 5 letter set code (e.g. "NEO", "OTJ", "MH3", "BLB", "BRO", "MKM", "ONE", "LTR", "DMU", etc.).
   Extract the collector number (e.g. "242", "045", "123", "007", "301", etc.).
3. Foiling: Check if the card exhibits rainbow holographic sheen, metallic foil gloss, or a foil shooting-star stamp.
4. Confidence: Return "high", "medium", or "low".

Respond ONLY with a valid, raw JSON object matching this exact schema:
{
  "card_name": "Exact Card Name",
  "set_code": "SET",
  "collector_number": "123",
  "is_foil": false,
  "confidence": "high"
}`;

  let rawResponseText = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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

    rawResponseText = response.text || '';
  } catch (apiErr: any) {
    console.warn('[CardScanner] Error calling gemini-2.5-flash, trying gemini-1.5-flash:', apiErr);
    try {
      const fallbackResp = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
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
      rawResponseText = fallbackResp.text || '';
    } catch (secondErr: any) {
      throw new Error(secondErr?.message || apiErr?.message || 'Gemini Vision API request failed');
    }
  }

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
  } catch (jsonErr) {
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
