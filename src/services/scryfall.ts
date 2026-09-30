import { ScryfallCard } from '../types/mtg';
import { getApiBaseUrl, apiFetch, DEFAULT_PROD_API_URL } from '../config/apiConfig';
import { GamechangerService } from './gamechangerService';

const SCRYFALL_API_BASE = 'https://api.scryfall.com';

export function getFrostpointBaseUrl(): string {
  const url = getApiBaseUrl();
  return (url || DEFAULT_PROD_API_URL).replace(/\/+$/, '');
}

/**
 * Normalizes card data returned from Frostpointlabs API to match ScryfallCard schema
 */
export function normalizeFrostpointCard(c: any): ScryfallCard {
  if (!c) return c;

  // Normalization for colors: can be "B", ["B"], or empty
  let colors: string[] | undefined = undefined;
  if (Array.isArray(c.colors)) {
    colors = c.colors;
  } else if (typeof c.colors === 'string' && c.colors.trim() !== '') {
    colors = c.colors.split('').filter((ch: string) => /[WUBRG]/i.test(ch));
  }

  // Normalization for color_identity:
  let color_identity: string[] = [];
  if (Array.isArray(c.color_identity)) {
    color_identity = c.color_identity;
  } else if (typeof c.color_identity === 'string' && c.color_identity.trim() !== '') {
    color_identity = c.color_identity.split('').filter((ch: string) => /[WUBRG]/i.test(ch));
  }

  // Normalization for cmc:
  let cmc = 0;
  if (typeof c.cmc === 'number') {
    cmc = c.cmc;
  } else if (typeof c.cmc === 'string') {
    const parsed = parseFloat(c.cmc);
    cmc = isNaN(parsed) ? 0 : parsed;
  }

  // Normalization for image_uris:
  let image_uris = c.image_uris;
  if (!image_uris && c.image_url) {
    image_uris = {
      small: c.image_url,
      normal: c.image_url,
      large: c.image_url,
      art_crop: c.image_url,
      png: c.image_url,
    };
  }

  const isGc = Boolean(
    c.game_changer === true ||
    c.game_changer === 'true' ||
    c.is_game_changer === true ||
    c.is_game_changer === 'true' ||
    c.isGamechanger === true ||
    c.is_gamechanger === true ||
    c.gameChanger === true ||
    (c.name && GamechangerService.isKnownGamechanger(c.name))
  );

  return {
    id: c.scryfall_id || c.id,
    name: c.name,
    layout: c.layout || 'normal',
    oracle_id: c.oracle_id,
    mana_cost: c.mana_cost,
    cmc,
    type_line: c.type_line || c.type || '',
    oracle_text: c.oracle_text || '',
    power: c.power,
    toughness: c.toughness,
    loyalty: c.loyalty,
    colors,
    color_identity,
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    rarity: c.rarity || 'common',
    set: (c.set || c.set_code || '').toLowerCase(),
    set_name: c.set_name || '',
    collector_number: String(c.collector_number || ''),
    image_uris,
    card_faces: Array.isArray(c.card_faces) ? c.card_faces : undefined,
    legalities: c.legalities || {},
    prices: c.prices || {},
    isGamechanger: isGc,
    is_gamechanger: isGc,
    game_changer: isGc,
    is_game_changer: isGc,
    gameChanger: isGc,
    foil: Boolean(c.foil),
    nonfoil: Boolean(c.nonfoil),
    scryfall_uri: c.related_uris?.gatherer || c.related_uris?.edhrec,
    purchase_uris: c.purchase_uris,
  };
}

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

  const limit = 50;
  const offset = (page - 1) * limit;
  const frostpointBase = getFrostpointBaseUrl();

  const cacheKey = `search-${trimmed}-${order}-${dir}-${page}-${unique || ''}`;
  let cachedData = await getFromBrowserCache(cacheKey);
  if (!cachedData && fallbackCache.has(cacheKey)) {
    cachedData = fallbackCache.get(cacheKey);
  }
  if (cachedData) {
    return cachedData;
  }

  // 1. Primary: Query Frostpointlabs Search API
  try {
    const queryObj: Record<string, string> = {
      q: trimmed,
      limit: String(limit),
      offset: String(offset),
    };
    if (order && order !== 'name') queryObj.order = order;
    if (dir && dir !== 'auto') queryObj.dir = dir;

    const res = await apiFetch('/deckbuilder/cards/search', { query: queryObj });
    if (res.ok) {
      const json = await res.json();
      if (json.data && Array.isArray(json.data) && json.data.length > 0) {
        const normalized = json.data.map(normalizeFrostpointCard);
        const result: SearchResult = {
          data: normalized,
          total_cards: json.total_cards || normalized.length,
          has_more: Boolean(json.has_more),
        };
        fallbackCache.set(cacheKey, result);
        await putToBrowserCache(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('[CardService] Frostpoint search error, falling back to Scryfall:', err);
  }

  // 2. Fallback to Scryfall if Frostpoint returns no results (e.g. database still populating)
  const scryParams = new URLSearchParams({
    q: trimmed,
    order,
    dir,
    page: page.toString(),
  });
  if (unique) scryParams.append('unique', unique);

  const requestUrl = `${SCRYFALL_API_BASE}/cards/search?${scryParams.toString()}`;
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
    
    fallbackCache.set(cacheKey, result);
    await putToBrowserCache(cacheKey, result);
    
    return result;
  } catch (error: any) {
    console.error('Error searching cards:', error);
    if (error.message === 'Failed to fetch') {
      throw new Error('Network error: Blocked by rate-limit or connection issue. Please wait a moment.');
    }
    throw error;
  }
}

export async function getAutocomplete(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const res = await apiFetch('/deckbuilder/cards/autocomplete', {
      query: { q: trimmed },
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch (e) {
    console.warn('[CardService] Frostpoint autocomplete error:', e);
  }

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
  const trimmed = (id || '').trim();
  if (!trimmed) return null;

  try {
    const res = await apiFetch(`/deckbuilder/cards/${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return normalizeFrostpointCard(json.data);
      }
    }
  } catch (e) {
    console.warn('[CardService] Frostpoint single card error:', e);
  }

  try {
    const res = await fetch(`${SCRYFALL_API_BASE}/cards/${encodeURIComponent(trimmed)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Error fetching card by id:', e);
    return null;
  }
}

/**
 * Fetch all available printings and editions of a card
 */
export async function fetchCardPrints(cardNameOrId: string): Promise<ScryfallCard[]> {
  const clean = cardNameOrId.trim();
  if (!clean) return [];

  try {
    const res = await apiFetch(`/deckbuilder/cards/${encodeURIComponent(clean)}/prints`, {
      query: { limit: 100 },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data && Array.isArray(json.data) && json.data.length > 0) {
        return json.data.map(normalizeFrostpointCard);
      }
    }
  } catch (err) {
    console.warn('[CardService] Frostpoint prints error:', err);
  }

  try {
    const res = await fetch(`${SCRYFALL_API_BASE}/cards/search?q=!"${encodeURIComponent(clean)}"+include:extras&unique=prints`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data)) {
        return data.data;
      }
    }
  } catch (err) {
    console.error('Error fetching printings fallback:', err);
  }

  return [];
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
export const KNOWN_MEDIAN_PRICES: Record<string, number> = {
  'timetwister': 1809.00,
  'black lotus': 12500.00,
  'ancestral recall': 3950.00,
  'time walk': 4200.00,
  'mox sapphire': 3450.00,
  'mox jet': 3200.00,
  'mox ruby': 2950.00,
  'mox emerald': 2800.00,
  'mox pearl': 2750.00,
  'the tabernacle at pendrell vale': 3100.00,
  'bazaar of baghdad': 2100.00,
  'library of alexandria': 1450.00,
  'candelabra of tawnos': 850.00,
  'chains of mephistopheles': 1100.00,
  'drop of honey': 650.00,
  'juzám djinn': 1500.00,
  'chaos orb': 1200.00,
  'mishra\'s workshop': 2600.00,
  'diamond valley': 650.00,
  'guardian beast': 550.00,
};

export function getKnownMedianPrice(cardName?: string): number | undefined {
  if (!cardName) return undefined;
  const clean = cardName.trim().toLowerCase();
  return KNOWN_MEDIAN_PRICES[clean];
}

const cardNameMedianPriceCache = new Map<string, number>();

/**
 * Calculates the median market price across all available paper prints of a card from Scryfall.
 * Used as an accurate fallback when a specific printing does not have a direct USD market price (e.g. Timetwister).
 */
export async function fetchCardMedianPrice(cardName: string): Promise<number | undefined> {
  const cleanName = cardName.trim().toLowerCase();
  if (cardNameMedianPriceCache.has(cleanName)) {
    return cardNameMedianPriceCache.get(cleanName);
  }

  const staticFallback = KNOWN_MEDIAN_PRICES[cleanName];

  try {
    const res = await fetch(
      `${SCRYFALL_API_BASE}/cards/search?q=%21%22${encodeURIComponent(cardName)}%22+include%3Aextras&unique=prints`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' } }
    );
    if (!res.ok) {
      if (staticFallback) {
        cardNameMedianPriceCache.set(cleanName, staticFallback);
        return staticFallback;
      }
      return undefined;
    }
    const json = await res.json();
    const prices: number[] = [];
    if (json.data && Array.isArray(json.data)) {
      for (const c of json.data) {
        if (c.prices?.usd) {
          const p = parseFloat(c.prices.usd);
          if (!isNaN(p) && p > 0) prices.push(p);
        } else if (c.prices?.usd_foil) {
          const p = parseFloat(c.prices.usd_foil);
          if (!isNaN(p) && p > 0) prices.push(p);
        } else if (c.prices?.eur) {
          const p = parseFloat(c.prices.eur) * 1.08;
          if (!isNaN(p) && p > 0) prices.push(p);
        }
      }
    }
    if (prices.length > 0) {
      prices.sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      const median = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
      const roundedMedian = parseFloat(median.toFixed(2));
      cardNameMedianPriceCache.set(cleanName, roundedMedian);
      return roundedMedian;
    }
  } catch (err) {
    console.warn('[Scryfall] Failed to calculate median price for', cardName, err);
  }

  if (staticFallback) {
    cardNameMedianPriceCache.set(cleanName, staticFallback);
    return staticFallback;
  }
  return undefined;
}

export interface CardPriceResult {
  usd?: number;
  usdFoil?: number;
  eur?: number;
  isEstimated?: boolean;
}

/**
 * Batch update cards with fresh market prices from Scryfall.
 * Scryfall allows up to 75 cards per batch request.
 * If a card does not have a USD market price (e.g., Timetwister), computes the median price across printings.
 */
export async function fetchBatchCardPrices(scryfallIds: string[]): Promise<Map<string, CardPriceResult>> {
  const priceMap = new Map<string, CardPriceResult>();
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify({ identifiers }),
      });

      if (!res.ok) {
        console.warn('Batch price collection failed:', res.statusText);
        continue;
      }

      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        const unpricedCards: Array<{ id: string; name: string }> = [];

        for (const card of json.data) {
          const hasUsd = card.prices?.usd && !isNaN(parseFloat(card.prices.usd)) && parseFloat(card.prices.usd) > 0;
          const hasFoil = card.prices?.usd_foil && !isNaN(parseFloat(card.prices.usd_foil)) && parseFloat(card.prices.usd_foil) > 0;
          const usd = hasUsd ? parseFloat(card.prices.usd) : undefined;
          const usdFoil = hasFoil ? parseFloat(card.prices.usd_foil) : undefined;
          const rawEur = card.prices?.eur && !isNaN(parseFloat(card.prices.eur)) && parseFloat(card.prices.eur) > 0 
            ? parseFloat(card.prices.eur) 
            : undefined;

          let effectiveUsd = usd;
          let isEstimated = false;

          // If no direct USD market price (like Timetwister), use median price
          if (effectiveUsd === undefined) {
            isEstimated = true;
            if (card.name) {
              const known = getKnownMedianPrice(card.name);
              if (known) {
                effectiveUsd = known;
              } else if (rawEur) {
                effectiveUsd = parseFloat((rawEur * 1.08).toFixed(2));
              }
              unpricedCards.push({ id: card.id, name: card.name });
            }
          }

          priceMap.set(card.id, {
            usd: effectiveUsd,
            usdFoil: usdFoil ?? effectiveUsd,
            eur: rawEur,
            isEstimated,
          });
        }

        // For any cards that have no direct USD market price, compute median across available printings
        if (unpricedCards.length > 0) {
          const uniqueNames = Array.from(new Set(unpricedCards.map((c) => c.name)));
          for (const name of uniqueNames) {
            const median = await fetchCardMedianPrice(name);
            if (median !== undefined && median > 0) {
              for (const unpriced of unpricedCards.filter((c) => c.name === name)) {
                const existing = priceMap.get(unpriced.id);
                priceMap.set(unpriced.id, {
                  ...existing,
                  usd: median,
                  usdFoil: existing?.usdFoil ?? median,
                  isEstimated: true,
                });
              }
            }
          }
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
 * Batch resolve cards by name and optional set code using Frostpointlabs deckbuilder lookup endpoint,
 * with fallback for unindexed cards.
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

  const frostpointBase = getFrostpointBaseUrl();
  const chunkSize = 200;
  const chunks: Array<Array<{ name: string; set?: string }>> = [];
  for (let i = 0; i < uniqueItems.length; i += chunkSize) {
    chunks.push(uniqueItems.slice(i, i + chunkSize));
  }

  const missingFromFrostpoint: Array<{ name: string; set?: string }> = [];

  for (const chunk of chunks) {
    try {
      const names = chunk.map((c) => c.name);
      const res = await apiFetch('/deckbuilder/cards/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(names),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          GamechangerService.registerCardsFromLookup(json.data);
          for (const raw of json.data) {
            // Check that card actually has metadata (not null placeholder)
            if (raw && raw.name && (raw.type_line || raw.mana_cost || raw.set || raw.image_uris || raw.game_changer !== undefined)) {
              const card = normalizeFrostpointCard(raw);
              const exactLower = card.name.toLowerCase().trim();
              cardMap.set(exactLower, card);
              const frontName = exactLower.split(' // ')[0].trim();
              cardMap.set(frontName, card);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[CardService] Frostpoint lookup error:', err);
    }

    // Check which items in this chunk were not populated
    for (const item of chunk) {
      const exact = item.name.toLowerCase().trim();
      const front = exact.split(' // ')[0].trim();
      if (!cardMap.has(exact) && !cardMap.has(front)) {
        missingFromFrostpoint.push(item);
      }
    }
  }

  // Fallback to Scryfall for unindexed cards so decks never show blank/missing cards
  if (missingFromFrostpoint.length > 0) {
    const fallbackChunks: Array<Array<{ name: string; set?: string }>> = [];
    for (let i = 0; i < missingFromFrostpoint.length; i += 75) {
      fallbackChunks.push(missingFromFrostpoint.slice(i, i + 75));
    }

    const notFoundList: string[] = [];

    for (const chunk of fallbackChunks) {
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

        if (res.ok) {
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
        }
      } catch (err) {
        console.error('Error in fallback batch card collection:', err);
      }
    }

    for (const missingName of notFoundList.slice(0, 10)) {
      try {
        const searchRes = await searchCards({ query: `!"${missingName}"` });
        if (searchRes.data && searchRes.data.length > 0) {
          const found = searchRes.data[0];
          cardMap.set(missingName.toLowerCase().trim(), found);
          cardMap.set(found.name.toLowerCase().trim(), found);
        }
      } catch (e) {
        // ignore
      }
    }
  }

  return cardMap;
}

export function toHighResImageUrl(url?: string, scryfallId?: string): string {
  if (url && typeof url === 'string' && url.trim() !== '') {
    let upgraded = url
      .replace('/small/', '/large/')
      .replace('/normal/', '/large/')
      .replace('version=small', 'version=large')
      .replace('version=normal', 'version=large');
    if (upgraded.includes('format=image') && !upgraded.includes('version=')) {
      upgraded += '&version=large';
    }
    return upgraded;
  }
  if (scryfallId) {
    return `https://api.scryfall.com/cards/${scryfallId}?format=image&version=large`;
  }
  return 'https://cards.scryfall.io/back.jpg';
}

/**
 * Extracts card image uri safely, handling double-faced, transform, and flip cards,
 * with fallbacks across all size versions and Scryfall redirect URLs.
 */
export function getCardImageUrl(
  card: ScryfallCard | { image_uris?: any; card_faces?: any[]; imageUrl?: string; id?: string; scryfallId?: string },
  version: 'normal' | 'large' | 'art_crop' | 'small' = 'large'
): string {
  if (!card) return 'https://cards.scryfall.io/back.jpg';

  // 1. Direct imageUrl property if already stored
  if ((card as any).imageUrl && typeof (card as any).imageUrl === 'string' && (card as any).imageUrl.trim() !== '') {
    // If art_crop was specifically requested and imageUrl is not art_crop, try image_uris first
    if (version !== 'art_crop' || !(card as any).image_uris?.art_crop) {
      let storedUrl = (card as any).imageUrl;
      if (storedUrl.includes('version=small')) {
        storedUrl = storedUrl.replace('version=small', `version=${version === 'small' ? 'normal' : version}`);
      }
      if (storedUrl.includes('version=normal') && version === 'large') {
        storedUrl = storedUrl.replace('version=normal', 'version=large');
      }
      if (storedUrl.includes('/small/') && version !== 'small') {
        storedUrl = storedUrl.replace('/small/', '/large/');
      }
      if (storedUrl.includes('/normal/') && version === 'large') {
        storedUrl = storedUrl.replace('/normal/', '/large/');
      }
      return storedUrl;
    }
  }

  // 2. Check root image_uris with size fallback cascade
  if (card.image_uris) {
    if (version === 'large' && card.image_uris.large) return card.image_uris.large;
    if (card.image_uris[version]) return card.image_uris[version];
    if (card.image_uris.large) return card.image_uris.large;
    if (card.image_uris.normal) return card.image_uris.normal;
    if (card.image_uris.small) return card.image_uris.small;
    if (card.image_uris.art_crop) return card.image_uris.art_crop;
  }

  // 3. Check card_faces for double-faced / transform / modal cards
  if (card.card_faces && Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    const frontFace = card.card_faces[0];
    if (frontFace.image_uris) {
      if (version === 'large' && frontFace.image_uris.large) return frontFace.image_uris.large;
      if (frontFace.image_uris[version]) return frontFace.image_uris[version];
      if (frontFace.image_uris.large) return frontFace.image_uris.large;
      if (frontFace.image_uris.normal) return frontFace.image_uris.normal;
      if (frontFace.image_uris.small) return frontFace.image_uris.small;
      if (frontFace.image_uris.art_crop) return frontFace.image_uris.art_crop;
    }
  }

  // 4. Direct Scryfall ID redirect fallback
  const cardId = card.id || (card as any).scryfallId;
  if (cardId) {
    const scryfallVersion = version === 'art_crop' ? 'art_crop' : version === 'small' ? 'small' : 'large';
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
