import { ScryfallCard } from '../types/mtg';

const SCRYFALL_API_BASE = 'https://api.scryfall.com';



export interface SearchOptions {
  unique?: 'cards' | 'art' | 'prints';
  query: string;
  order?: 'name' | 'usd' | 'cmc' | 'rarity' | 'edhrec' | 'released';
  dir?: 'auto' | 'asc' | 'desc';
  page?: number;
  include_extras?: boolean;
}

export interface SearchResult {
  data: ScryfallCard[];
  total_cards: number;
  has_more: boolean;
  next_page?: string;
}

const CACHE_NAME = 'scryfall-search-cache-v1';

async function getFromBrowserCache(url: string): Promise<any | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(url);
    if (response) {
      return await response.json();
    }
  } catch (e) {
    console.warn('Cache read error:', e);
  }
  return null;
}

async function putToBrowserCache(url: string, data: any) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(url, response);
  } catch (e) {
    console.warn('Cache write error:', e);
  }
}

// In-memory fallback if Cache API is unavailable
const fallbackCache = new Map<string, any>();

export async function searchCards(options: SearchOptions): Promise<SearchResult> {
  const { query, order = 'name', dir = 'auto', page = 1, unique } = options;
  const trimmed = query.trim();
  if (!trimmed) {
    return { data: [], total_cards: 0, has_more: false };
  }

  const params = new URLSearchParams({
    q: trimmed,
    order,
    dir,
    page: page.toString(),
  });
  if (unique) params.append('unique', unique);

  const requestUrl = `${SCRYFALL_API_BASE}/cards/search?${params.toString()}`;
  
  // 1. Try Browser Cache API (Persistent across sessions)
  let cachedData = await getFromBrowserCache(requestUrl);
  
  // 2. Try In-Memory Fallback
  if (!cachedData && fallbackCache.has(requestUrl)) {
    cachedData = fallbackCache.get(requestUrl);
  }

  if (cachedData) {
    return {
      data: cachedData.data || [],
      total_cards: cachedData.total_cards || 0,
      has_more: cachedData.has_more || false,
      next_page: cachedData.next_page,
    };
  }

  try {
    const res = await fetch(requestUrl);
    if (res.status === 404) {
      return { data: [], total_cards: 0, has_more: false };
    }
    
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.details || `Scryfall error: ${res.statusText}`);
    }

    const data = await res.json();
    const result: SearchResult = {
      data: data.data || [],
      total_cards: data.total_cards || 0,
      has_more: data.has_more || false,
      next_page: data.next_page,
    };
    
    // Store in both caches
    fallbackCache.set(requestUrl, result);
    await putToBrowserCache(requestUrl, result);
    
    return result;
  } catch (error: any) {
    console.error('Error searching Scryfall cards:', error);
    if (error.message === 'Failed to fetch') {
      throw new Error('Network error: Blocked by rate-limit or adblocker. Please wait a moment, or try pausing browser shields/adblockers for Scryfall.');
    }
    throw error;
  }
}

export async function getAutocomplete(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const res = await fetch(`${SCRYFALL_API_BASE}/cards/autocomplete?q=${encodeURIComponent(trimmed)}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (e) {
    return [];
  }
}

export async function getCardById(id: string): Promise<ScryfallCard | null> {
  try {
    const res = await fetch(`${SCRYFALL_API_BASE}/cards/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Error fetching card by id:', e);
    return null;
  }
}

export async function getRandomCard(q?: string): Promise<ScryfallCard | null> {
  try {
    const url = q 
      ? `${SCRYFALL_API_BASE}/cards/random?q=${encodeURIComponent(q)}`
      : `${SCRYFALL_API_BASE}/cards/random`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Error fetching random card:', e);
    return null;
  }
}

/**
 * Batch update cards with fresh market prices from Scryfall
 * Scryfall allows up to 75 cards per batch request
 */
export async function fetchBatchCardPrices(scryfallIds: string[]): Promise<Map<string, { usd?: number; usdFoil?: number; eur?: number }>> {
  const priceMap = new Map<string, { usd?: number; usdFoil?: number; eur?: number }>();
  if (scryfallIds.length === 0) return priceMap;

  // Deduplicate IDs
  const uniqueIds = Array.from(new Set(scryfallIds));
  const chunkSize = 75;
  const chunks: string[][] = [];

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    chunks.push(uniqueIds.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    try {
      const identifiers = chunk.map((id) => ({ id }));
      const res = await fetch(`${SCRYFALL_API_BASE}/cards/collection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifiers }),
      });

      if (!res.ok) {
        console.warn('Batch price collection failed:', res.statusText);
        continue;
      }

      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        for (const card of json.data) {
          const usd = card.prices?.usd ? parseFloat(card.prices.usd) : undefined;
          const usdFoil = card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : undefined;
          const eur = card.prices?.eur ? parseFloat(card.prices.eur) : undefined;
          priceMap.set(card.id, { usd, usdFoil, eur });
        }
      }

      // Respect Scryfall 50-100ms rate limit recommendation between collection batches
      if (chunks.length > 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      console.error('Error fetching batch card prices:', err);
    }
  }

  return priceMap;
}

/**
 * Batch resolve cards by name and optional set code using Scryfall's /cards/collection endpoint.
 * Up to 75 cards per batch request for maximum import speed.
 */
export async function fetchBatchCardsCollection(
  cardsToFetch: Array<{ name: string; set?: string }>
): Promise<Map<string, ScryfallCard>> {
  const cardMap = new Map<string, ScryfallCard>();
  if (cardsToFetch.length === 0) return cardMap;

  // Deduplicate identifiers
  const seenKeys = new Set<string>();
  const uniqueItems: Array<{ name: string; set?: string }> = [];

  for (const item of cardsToFetch) {
    const key = `${item.name.toLowerCase().trim()}|${(item.set || '').toLowerCase().trim()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueItems.push(item);
    }
  }

  const chunkSize = 75;
  const chunks: Array<Array<{ name: string; set?: string }>> = [];
  for (let i = 0; i < uniqueItems.length; i += chunkSize) {
    chunks.push(uniqueItems.slice(i, i + chunkSize));
  }

  const notFoundList: string[] = [];

  for (const chunk of chunks) {
    try {
      const identifiers = chunk.map((item) => {
        if (item.set) {
          return { name: item.name, set: item.set.toLowerCase() };
        }
        return { name: item.name };
      });

      const res = await fetch(`${SCRYFALL_API_BASE}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers }),
      });

      if (!res.ok) {
        console.warn('Batch card collection response status:', res.status);
        continue;
      }

      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        for (const card of json.data) {
          const exactLower = card.name.toLowerCase().trim();
          cardMap.set(exactLower, card);
          const frontName = exactLower.split(' // ')[0].trim();
          cardMap.set(frontName, card);
        }
      }

      if (json.not_found && Array.isArray(json.not_found)) {
        for (const missing of json.not_found) {
          if (missing.name) notFoundList.push(missing.name);
        }
      }

      if (chunks.length > 1) {
        await new Promise((r) => setTimeout(r, 75));
      }
    } catch (err) {
      console.error('Error fetching batch card collection:', err);
    }
  }

  // Fallback for not_found or unmatched items (e.g. slight name variances)
  for (const missingName of notFoundList.slice(0, 15)) {
    try {
      const searchRes = await searchCards({ query: `!"${missingName}"` });
      if (searchRes.data && searchRes.data.length > 0) {
        const found = searchRes.data[0];
        cardMap.set(missingName.toLowerCase().trim(), found);
        cardMap.set(found.name.toLowerCase().trim(), found);
      }
    } catch (e) {
      // Ignore fallback failures
    }
  }

  return cardMap;
}

/**
 * Extracts card image uri safely, handling double-faced, transform, and flip cards,
 * with fallbacks across all size versions and Scryfall redirect URLs.
 */
export function getCardImageUrl(
  card: ScryfallCard | { image_uris?: any; card_faces?: any[]; imageUrl?: string; id?: string; scryfallId?: string },
  version: 'normal' | 'large' | 'art_crop' | 'small' = 'normal'
): string {
  if (!card) return 'https://cards.scryfall.io/back.jpg';

  // 1. Direct imageUrl property if already stored
  if ((card as any).imageUrl && typeof (card as any).imageUrl === 'string' && (card as any).imageUrl.trim() !== '') {
    // If art_crop was specifically requested and imageUrl is not art_crop, try image_uris first
    if (version !== 'art_crop' || !(card as any).image_uris?.art_crop) {
      return (card as any).imageUrl;
    }
  }

  // 2. Check root image_uris with size fallback cascade
  if (card.image_uris) {
    if (card.image_uris[version]) return card.image_uris[version];
    if (version === 'large' && card.image_uris.normal) return card.image_uris.normal;
    if (version === 'normal' && card.image_uris.large) return card.image_uris.large;
    if (card.image_uris.normal) return card.image_uris.normal;
    if (card.image_uris.small) return card.image_uris.small;
    if (card.image_uris.art_crop) return card.image_uris.art_crop;
  }

  // 3. Check card_faces for double-faced / transform / modal cards
  if (card.card_faces && Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    const frontFace = card.card_faces[0];
    if (frontFace.image_uris) {
      if (frontFace.image_uris[version]) return frontFace.image_uris[version];
      if (version === 'large' && frontFace.image_uris.normal) return frontFace.image_uris.normal;
      if (version === 'normal' && frontFace.image_uris.large) return frontFace.image_uris.large;
      if (frontFace.image_uris.normal) return frontFace.image_uris.normal;
      if (frontFace.image_uris.small) return frontFace.image_uris.small;
      if (frontFace.image_uris.art_crop) return frontFace.image_uris.art_crop;
    }
  }

  // 4. Direct Scryfall ID redirect fallback
  const cardId = card.id || (card as any).scryfallId;
  if (cardId) {
    const scryfallVersion = version === 'art_crop' ? 'art_crop' : version === 'small' ? 'small' : version === 'large' ? 'large' : 'normal';
    return `https://api.scryfall.com/cards/${cardId}?format=image&version=${scryfallVersion}`;
  }

  return 'https://cards.scryfall.io/back.jpg';
}

export function getCardBackImageUrl(card: ScryfallCard | { card_faces?: any[]; id?: string; scryfallId?: string }): string | undefined {
  if (!card) return undefined;

  if (card.card_faces && Array.isArray(card.card_faces) && card.card_faces.length > 1) {
    const backFace = card.card_faces[1];
    if (backFace.image_uris) {
      return (
        backFace.image_uris.large ||
        backFace.image_uris.normal ||
        backFace.image_uris.small ||
        backFace.image_uris.art_crop
      );
    }
    const cardId = card.id || (card as any).scryfallId;
    if (cardId) {
      return `https://api.scryfall.com/cards/${cardId}?format=image&face=back`;
    }
  }
  return undefined;
}
