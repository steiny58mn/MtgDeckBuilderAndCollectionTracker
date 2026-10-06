import { ScryfallCard } from '../types/mtg';
import { getApiBaseUrl, apiFetch, DEFAULT_PROD_API_URL } from '../config/apiConfig';
import { GamechangerService } from './gamechangerService';
import { getPartnerApiQuery, getCardPartnerInfo, getCandidatePartnerNames, filterAvailablePartners, sortCardsByName } from '../utils/deckUtils';

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
    c.isGameChanger === true ||
    c.isGameChanger === 'true' ||
    c.IsGameChanger === true ||
    c.IsGameChanger === 'true' ||
    c.isGamechanger === true ||
    c.isGamechanger === 'true' ||
    c.is_gamechanger === true ||
    c.is_gamechanger === 'true' ||
    c.game_changer === true ||
    c.game_changer === 'true' ||
    c.is_game_changer === true ||
    c.is_game_changer === 'true' ||
    c.gameChanger === true
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
  signal?: AbortSignal;
}

export interface SearchResult {
  data: ScryfallCard[];
  total_cards: number;
  has_more: boolean;
  next_page?: string;
}

const CACHE_NAME = 'card-search-cache-v1';

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

// Local cache for card lookup and details to prevent extraneous DB reads
const LOCAL_CARD_CACHE_KEY = 'fp_db_card_cache_v1';
const localCardCache = new Map<string, ScryfallCard>();
const autocompleteCache = new Map<string, { items: string[]; timestamp: number }>();
const printsCache = new Map<string, ScryfallCard[]>();
const cardByIdCache = new Map<string, ScryfallCard>();

// Initialize persistent card cache from localStorage
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(LOCAL_CARD_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (c && c.name) {
            const exact = c.name.toLowerCase().trim();
            localCardCache.set(exact, c);
            const front = exact.split(' // ')[0].trim();
            localCardCache.set(front, c);
            if (c.id) cardByIdCache.set(c.id, c);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[CardService] Failed to load localCardCache:', e);
  }
}

function persistLocalCards() {
  if (typeof window === 'undefined') return;
  try {
    // Keep most recent 1200 cards in localStorage
    const sample = Array.from(new Set(localCardCache.values())).slice(0, 1200);
    localStorage.setItem(LOCAL_CARD_CACHE_KEY, JSON.stringify(sample));
  } catch {}
}

export async function searchCards(options: SearchOptions): Promise<SearchResult> {
  const { query, order = 'name', dir = 'auto', page = 1, unique, signal } = options;
  const trimmed = query.trim();
  if (!trimmed) {
    return { data: [], total_cards: 0, has_more: false };
  }

  const cacheKey = `search-${trimmed.toLowerCase()}-${order}-${dir}-${page}-${unique || ''}`;
  let cachedData = await getFromBrowserCache(cacheKey);
  if (!cachedData && fallbackCache.has(cacheKey)) {
    cachedData = fallbackCache.get(cacheKey);
  }
  if (cachedData) {
    return cachedData;
  }

  // 1. Primary Card Search via Scryfall API (complete, official 30,000+ card database with all 3,500+ legal commanders)
  try {
    const scryfallOrder = ((order as any) === 'synergy' || (order as any) === 'commander_decks' || (order as any) === 'category') ? 'edhrec' : (order || 'name');
    const scryfallDir = dir && dir !== 'auto' ? dir : 'auto';
    const scryfallUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(trimmed)}&page=${page}&order=${scryfallOrder}&dir=${scryfallDir}${unique === 'prints' ? '&unique=prints' : ''}`;

    const scryfallRes = await fetch(scryfallUrl, {
      signal,
      headers: { 'Accept': 'application/json' },
    });

    if (scryfallRes.ok) {
      const sJson = await scryfallRes.json();
      if (sJson.data && Array.isArray(sJson.data) && sJson.data.length > 0) {
        let normalized = sJson.data.map(normalizeFrostpointCard);
        if (unique !== 'prints') {
          const seenNames = new Set<string>();
          normalized = normalized.filter((card: ScryfallCard) => {
            const clean = (card.name || '').toLowerCase().trim();
            if (!clean || seenNames.has(clean)) return false;
            seenNames.add(clean);
            return true;
          });
        }
        for (const card of normalized) {
          if (card.name) {
            localCardCache.set(card.name.toLowerCase().trim(), card);
            if (card.id) cardByIdCache.set(card.id, card);
          }
        }
        persistLocalCards();

        const result: SearchResult = {
          data: normalized,
          total_cards: sJson.total_cards || normalized.length,
          has_more: Boolean(sJson.has_more),
          next_page: sJson.next_page,
        };
        fallbackCache.set(cacheKey, result);
        await putToBrowserCache(cacheKey, result);
        return result;
      }
    }
  } catch (sErr: any) {
    if (signal?.aborted || sErr?.name === 'AbortError') {
      return { data: [], total_cards: 0, has_more: false };
    }
    console.warn('[CardService] Scryfall primary search error, falling back to backend:', sErr);
  }

  // 2. Secondary fallback: Query /deckbuilder/cards/search on remote backend
  const lowerQuery = trimmed.toLowerCase();
  const cleanSearchTerm = lowerQuery
    .replace(/\bnot:digital\b/gi, '')
    .replace(/\b\(?f:[a-z0-9_-]+(\s+or\s+banned:[a-z0-9_-]+)?\)?/gi, '')
    .replace(/\bformat:[a-z0-9_-]+/gi, '')
    .replace(/\b(?:id<=|identity<=|ci<=|id:)[a-z0-9_-]+/gi, '')
    .replace(/\b(?:type|t):[a-z0-9_-]+/gi, '')
    .replace(/\b(?:c|color):[a-z0-9_-]+/gi, '')
    .replace(/\bcmc[<>=]+\d+/gi, '')
    .replace(/\b(?:o|oracle):"[^"]*"/gi, '')
    .replace(/\b(?:o|oracle):[^\s]+/gi, '')
    .replace(/\bis:commander\b/gi, '')
    .replace(/["()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();



  // 4. Secondary fallback: Query /deckbuilder/cards/search on backend
  try {
    const limit = 50;
    const offset = (page - 1) * limit;
    const queryObj: Record<string, string> = {
      limit: String(limit),
      offset: String(offset),
    };
    if (unique) {
      queryObj.unique = unique;
    }
    if (cleanSearchTerm) {
      queryObj.name = cleanSearchTerm;
    }

    const fMatch = trimmed.match(/\b(?:f|format):([a-z0-9_-]+)/i);
    if (fMatch) queryObj.format = fMatch[1];
    const typeMatch = trimmed.match(/\b(?:type|t):([a-z0-9_-]+)/i);
    if (typeMatch) queryObj.type = typeMatch[1];
    const colorMatch = trimmed.match(/\b(?:c|color):([a-z0-9_-]+)/i);
    if (colorMatch) queryObj.colors = colorMatch[1];
    const idMatch = trimmed.match(/\b(?:id<=|identity<=|ci<=|id:)([a-z0-9_-]+)/i);
    if (idMatch) queryObj.color_identity = idMatch[1];
    const oMatch = trimmed.match(/\b(?:o|oracle):"([^"]+)"/i) || trimmed.match(/\b(?:o|oracle):([^\s]+)/i);
    if (oMatch) queryObj.oracle = oMatch[1];
    const rarityMatch = trimmed.match(/\brarity:([a-z0-9_-]+)/i);
    if (rarityMatch) queryObj.rarity = rarityMatch[1];
    if (/\bis:commander\b/i.test(trimmed)) {
      if (!queryObj.type) queryObj.type = 'legendary creature';
    }
    const cmcMatch = trimmed.match(/\bcmc([<>=]+)(\d+)/i);
    if (cmcMatch) {
      queryObj.cmc = cmcMatch[2];
      queryObj.cmc_operator = cmcMatch[1];
    }
    if (order && order !== 'name') queryObj.order = order;
    if (dir && dir !== 'auto') queryObj.dir = dir;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeout);
        return { data: [], total_cards: 0, has_more: false };
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const res = await apiFetch('/deckbuilder/cards/search', {
      query: queryObj,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      if (json.data && Array.isArray(json.data) && json.data.length > 0) {
        let normalized = json.data.map(normalizeFrostpointCard);
        if (unique !== 'prints') {
          const seenNames = new Set<string>();
          normalized = normalized.filter((card) => {
            const clean = (card.name || '').toLowerCase().trim();
            if (!clean || seenNames.has(clean)) return false;
            seenNames.add(clean);
            return true;
          });
        }
        for (const card of normalized) {
          if (card.name) {
            localCardCache.set(card.name.toLowerCase().trim(), card);
            if (card.id) cardByIdCache.set(card.id, card);
          }
        }
        persistLocalCards();

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
  } catch (err: any) {
    if (signal?.aborted || err?.name === 'AbortError') {
      // Abort is normal
    } else {
      console.warn('[CardService] Backend search error:', err);
    }
  }

  // 3. Fallback to localCardCache if both Scryfall and Backend returned nothing
  const matchingCached: ScryfallCard[] = [];
  if (cleanSearchTerm) {
    for (const card of localCardCache.values()) {
      if (card && card.name && card.name.toLowerCase().includes(cleanSearchTerm)) {
        if (!matchingCached.some((c) => c.id === card.id || c.name.toLowerCase() === card.name.toLowerCase())) {
          matchingCached.push(card);
        }
      }
    }
  }

  if (matchingCached.length > 0) {
    const result: SearchResult = {
      data: matchingCached.slice(0, 50),
      total_cards: matchingCached.length,
      has_more: matchingCached.length > 50,
    };
    return result;
  }

  return { data: [], total_cards: 0, has_more: false };
}

export async function getAutocomplete(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cacheKey = trimmed.toLowerCase();
  const cached = autocompleteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    return cached.items;
  }

  try {
    const res = await apiFetch('/deckbuilder/cards/autocomplete', {
      query: { q: trimmed },
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        autocompleteCache.set(cacheKey, { items: json.data, timestamp: Date.now() });
        return json.data;
      }
    }
  } catch (e) {
    console.warn('[CardService] Autocomplete error:', e);
  }

  // Local cache matching if network is slow or offline
  const localMatches = Array.from(localCardCache.values())
    .filter((c) => c && c.name && c.name.toLowerCase().includes(cacheKey))
    .map((c) => c.name)
    .slice(0, 20);
  return localMatches;
}

export async function getCardById(id: string): Promise<ScryfallCard | null> {
  const trimmed = (id || '').trim();
  if (!trimmed) return null;

  const cached = cardByIdCache.get(trimmed.toLowerCase());
  if (cached) return cached;

  try {
    const res = await apiFetch(`/deckbuilder/cards/${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        const norm = normalizeFrostpointCard(json.data);
        cardByIdCache.set(trimmed.toLowerCase(), norm);
        if (norm.name) {
          localCardCache.set(norm.name.toLowerCase().trim(), norm);
        }
        return norm;
      }
    }
  } catch (e) {
    console.warn('[CardService] Single card error:', e);
  }

  return null;
}

/**
 * Fetch all available printings and editions of a card
 */
export async function fetchCardPrints(cardNameOrId: string): Promise<ScryfallCard[]> {
  const clean = cardNameOrId.trim();
  if (!clean) return [];

  const cacheKey = clean.toLowerCase();
  const cached = printsCache.get(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const res = await apiFetch(`/deckbuilder/cards/${encodeURIComponent(clean)}/prints`, {
      query: { limit: 100 },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data && Array.isArray(json.data) && json.data.length > 0) {
        const list = json.data.map(normalizeFrostpointCard);
        printsCache.set(cacheKey, list);
        return list;
      }
    }
  } catch (err) {
    console.warn('[CardService] Prints error:', err);
  }

  const existing = localCardCache.get(clean.toLowerCase());
  return existing ? [existing] : [];
}

export async function getRandomCard(_q?: string): Promise<ScryfallCard | null> {
  const allCached = Array.from(localCardCache.values());
  if (allCached.length > 0) {
    const idx = Math.floor(Math.random() * allCached.length);
    return allCached[idx];
  }
  return null;
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
 * Calculates the median market price across all available paper prints of a card from database prints.
 * Used as an accurate fallback when a specific printing does not have a direct USD market price (e.g. Timetwister).
 */
export async function fetchCardMedianPrice(cardName: string): Promise<number | undefined> {
  const cleanName = cardName.trim().toLowerCase();
  if (cardNameMedianPriceCache.has(cleanName)) {
    return cardNameMedianPriceCache.get(cleanName);
  }

  const staticFallback = KNOWN_MEDIAN_PRICES[cleanName];

  try {
    const prints = await fetchCardPrints(cardName);
    const prices: number[] = [];
    if (prints && Array.isArray(prints)) {
      for (const c of prints) {
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
    console.warn('[CardService] Failed to calculate median price for', cardName, err);
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
 * Batch update cards with fresh market prices from API database.
 */
export async function fetchBatchCardPrices(scryfallIds: string[]): Promise<Map<string, CardPriceResult>> {
  const priceMap = new Map<string, CardPriceResult>();
  if (scryfallIds.length === 0) return priceMap;

  // 1. Resolve from memory / localCardCache first
  const missingIds: string[] = [];
  for (const id of scryfallIds) {
    const cached = cardByIdCache.get(id.toLowerCase());
    if (cached) {
      const usd = cached.prices?.usd ? parseFloat(cached.prices.usd) : undefined;
      const usdFoil = cached.prices?.usd_foil ? parseFloat(cached.prices.usd_foil) : undefined;
      const eur = cached.prices?.eur ? parseFloat(cached.prices.eur) : undefined;
      priceMap.set(id, { usd, usdFoil, eur });
    } else {
      missingIds.push(id);
    }
  }

  // 2. Fetch missing cards from API
  if (missingIds.length > 0) {
    for (const id of missingIds.slice(0, 15)) {
      try {
        const card = await getCardById(id);
        if (card) {
          const usd = card.prices?.usd ? parseFloat(card.prices.usd) : undefined;
          const usdFoil = card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : undefined;
          const eur = card.prices?.eur ? parseFloat(card.prices.eur) : undefined;
          priceMap.set(id, { usd, usdFoil, eur });
        }
      } catch (e) {
        // ignore
      }
    }
  }

  return priceMap;
}

/**
 * Batch resolve cards by name and optional set code using Frostpointlabs deckbuilder lookup endpoint.
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

  // Check local cache first to cut down on extraneous DB lookups
  const itemsToFetch: Array<{ name: string; set?: string }> = [];
  for (const item of uniqueItems) {
    const exact = item.name.toLowerCase().trim();
    const front = exact.split(' // ')[0].trim();
    const cached = localCardCache.get(exact) || localCardCache.get(front);
    if (cached) {
      cardMap.set(exact, cached);
      cardMap.set(front, cached);
    } else {
      itemsToFetch.push(item);
    }
  }

  if (itemsToFetch.length === 0) {
    return cardMap;
  }

  const chunkSize = 50;
  const chunks: Array<Array<{ name: string; set?: string }>> = [];
  for (let i = 0; i < itemsToFetch.length; i += chunkSize) {
    chunks.push(itemsToFetch.slice(i, i + chunkSize));
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
            if (raw && raw.name && (raw.type_line || raw.mana_cost || raw.set || raw.image_uris || raw.game_changer !== undefined)) {
              const card = normalizeFrostpointCard(raw);
              const exactLower = card.name.toLowerCase().trim();
              cardMap.set(exactLower, card);
              localCardCache.set(exactLower, card);
              const frontName = exactLower.split(' // ')[0].trim();
              cardMap.set(frontName, card);
              localCardCache.set(frontName, card);
              if (card.id) cardByIdCache.set(card.id, card);
            }
          }
          persistLocalCards();
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

  // Attempt individual API lookup for missing items (up to 10)
  for (const item of missingFromFrostpoint.slice(0, 10)) {
    try {
      const single = await getCardById(item.name);
      if (single) {
        const exact = item.name.toLowerCase().trim();
        cardMap.set(exact, single);
        localCardCache.set(exact, single);
      }
    } catch (e) {
      // ignore
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

/**
 * Loads available partner/background options strictly from the database API (never Scryfall).
 * Uses exact partner matching rules (e.g. generic Partner pairs only with generic Partner,
 * "Partner - Character Select" pairs only with other "Partner - Character Select",
 * "Choose a Background" pairs only with Background enchantments).
 */
export async function fetchAvailablePartnersFromApi(
  primaryCommander: { name: string; type_line?: string; oracle_text?: string; keywords?: string[] },
  currentPartner?: { name: string } | null
): Promise<ScryfallCard[]> {
  const pInfo = getCardPartnerInfo(primaryCommander);
  if (!pInfo.canHavePartner) return [];

  // 1. Get authoritative candidate names for this commander's partner mechanic
  const candidateNames = getCandidatePartnerNames(primaryCommander);
  if (candidateNames.length === 0) return [];

  // 2. Resolve candidate cards: check local cache first, fetch missing in parallel batches
  const resolvedCards: ScryfallCard[] = [];
  const missingNames: string[] = [];

  for (const name of candidateNames) {
    const exact = name.toLowerCase().trim();
    const front = exact.split(' // ')[0].trim();
    const cached = localCardCache.get(exact) || localCardCache.get(front);
    if (cached) {
      resolvedCards.push(cached);
    } else {
      missingNames.push(name);
    }
  }

  if (missingNames.length > 0) {
    // Fetch missing candidates in concurrent chunks of 12 for swift resolution (~2s)
    const chunkSize = 12;
    for (let i = 0; i < missingNames.length; i += chunkSize) {
      const chunk = missingNames.slice(i, i + chunkSize);
      const fetched = await Promise.all(
        chunk.map(async (name) => {
          try {
            const res = await apiFetch(`/deckbuilder/cards/${encodeURIComponent(name)}`);
            if (res.ok) {
              const json = await res.json();
              if (json.data) {
                const card = normalizeFrostpointCard(json.data);
                const exact = (card.name || name).toLowerCase().trim();
                localCardCache.set(exact, card);
                if (card.id) cardByIdCache.set(card.id, card);
                return card;
              }
            }
          } catch {}
          return null;
        })
      );
      for (const card of fetched) {
        if (card) resolvedCards.push(card);
      }
    }
    persistLocalCards();
  }

  // 3. Validate cards strictly against MTG partner rules
  const validPartners = filterAvailablePartners(primaryCommander, resolvedCards, currentPartner);

  // 4. Deduplicate by card name so only 1 entry per unique partner card is shown
  const seenNames = new Set<string>();
  const uniquePartners: ScryfallCard[] = [];
  for (const card of validPartners) {
    const cleanName = (card.name || '').toLowerCase().trim();
    if (!cleanName || seenNames.has(cleanName)) continue;
    seenNames.add(cleanName);
    uniquePartners.push(card);
  }

  return sortCardsByName(uniquePartners);
}
