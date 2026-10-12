import type React from 'react';
import { ScryfallCard } from '../types/mtg';
import { getApiBaseUrl, apiFetch, DEFAULT_PROD_API_URL } from '../config/apiConfig';
import { GamechangerService } from './gamechangerService';
import { getPartnerApiQuery, getCardPartnerInfo, getCandidatePartnerNames, filterAvailablePartners, sortCardsByName, setCardCacheLookup } from '../utils/deckUtils';
import { filterPaperCardsOnly } from '../utils/cardUtils';
import { KNOWN_CONSPIRACY_NAMES, isConspiracyCardName, KNOWN_CARD_TYPES, getKnownCardType, getCanonicalCardName, normalizeCardQuotes, stripCardQuotes } from '../utils/cardNameUtils';

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
  if (Array.isArray(c.colors) && c.colors.length > 0) {
    colors = c.colors;
  } else if (typeof c.colors === 'string' && c.colors.trim() !== '') {
    colors = c.colors.split('').filter((ch: string) => /[WUBRG]/i.test(ch));
  } else if (Array.isArray(c.card_faces?.[0]?.colors) && c.card_faces[0].colors.length > 0) {
    colors = c.card_faces[0].colors;
  }
  // If still empty or undefined, check front face mana cost or top level mana cost pips
  if (!colors || colors.length === 0) {
    const costForColors = c.card_faces?.[0]?.mana_cost || c.mana_cost || '';
    if (costForColors) {
      const pips = costForColors.match(/[WUBRG]/gi);
      if (pips && pips.length > 0) {
        colors = Array.from(new Set(pips.map((p) => p.toUpperCase())));
      }
    }
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
  } else if (!image_uris && c.card_faces?.[0]?.image_uris) {
    image_uris = c.card_faces[0].image_uris;
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

  const rawType = (c.type_line || c.type || c.typeLine || '').trim();
  const isTypeInvalid = !rawType || rawType.toLowerCase() === 'no card type found' || rawType.toLowerCase() === 'card';
  const faceType = (c.card_faces?.[0]?.type_line || c.card_faces?.[0]?.type || '').trim();
  const isFaceTypeValid = faceType && faceType.toLowerCase() !== 'no card type found' && faceType.toLowerCase() !== 'card';

  let type_line = !isTypeInvalid ? rawType : (isFaceTypeValid ? faceType : '');

  // Authoritative check for Conspiracies (all 25 MTG conspiracy cards)
  if (isConspiracyCardName(c.name)) {
    type_line = 'Conspiracy';
  } else if (!type_line || isTypeInvalid) {
    const known = getKnownCardType(c.name);
    if (known) {
      type_line = known;
    }
  }

  const mana_cost = c.mana_cost || c.card_faces?.[0]?.mana_cost || '';

  return {
    id: c.scryfall_id || c.id,
    name: c.name,
    layout: c.layout || 'normal',
    oracle_id: c.oracle_id,
    mana_cost,
    cmc,
    type_line,
    oracle_text: c.oracle_text || c.card_faces?.[0]?.oracle_text || '',
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
    printed_name: c.printed_name || c.printedName || c.card_faces?.[0]?.printed_name || undefined,
    flavor_name: c.flavor_name || c.flavorName || c.card_faces?.[0]?.flavor_name || undefined,
    card_faces: Array.isArray(c.card_faces)
      ? c.card_faces.map((f) => ({
          ...f,
          printed_name: f.printed_name || f.printedName || undefined,
          flavor_name: f.flavor_name || f.flavorName || undefined,
        }))
      : undefined,
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
export const localCardCache = new Map<string, ScryfallCard>();
const autocompleteCache = new Map<string, { items: string[]; timestamp: number }>();
const printsCache = new Map<string, ScryfallCard[]>();
export const cardByIdCache = new Map<string, ScryfallCard>();

export function getCardFromLocalCache(nameOrId: string): ScryfallCard | undefined {
  if (!nameOrId || typeof nameOrId !== 'string') return undefined;
  const trimmed = nameOrId.trim().toLowerCase();
  const front = trimmed.split(/\s*\/\/\s*/)[0].trim();
  const canonical = getCanonicalCardName(nameOrId).toLowerCase().trim();
  const canonicalFront = canonical.split(/\s*\/\/\s*/)[0].trim();
  const stripQuotes = stripCardQuotes(trimmed).toLowerCase();
  const stripQuotesFront = stripCardQuotes(front).toLowerCase();
  const normQuotes = normalizeCardQuotes(trimmed).toLowerCase();
  const normQuotesFront = normalizeCardQuotes(front).toLowerCase();

  return (
    localCardCache.get(trimmed) ||
    localCardCache.get(front) ||
    localCardCache.get(canonical) ||
    localCardCache.get(canonicalFront) ||
    localCardCache.get(normQuotes) ||
    localCardCache.get(normQuotesFront) ||
    localCardCache.get(stripQuotes) ||
    localCardCache.get(stripQuotesFront) ||
    cardByIdCache.get(trimmed)
  );
}

// Wire up global lookup in deckUtils so getCardFrontTypeLine can seamlessly access localCardCache
setCardCacheLookup(getCardFromLocalCache);

// Initialize persistent card cache from localStorage
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(LOCAL_CARD_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (c && c.name) {
            const normalized = normalizeFrostpointCard(c);
            const exact = normalized.name.toLowerCase().trim();
            localCardCache.set(exact, normalized);
            const front = exact.split(/\s*\/\/\s*/)[0].trim();
            localCardCache.set(front, normalized);
            const canonical = getCanonicalCardName(normalized.name).toLowerCase().trim();
            const canonicalFront = canonical.split(/\s*\/\/\s*/)[0].trim();
            if (canonical) localCardCache.set(canonical, normalized);
            if (canonicalFront) localCardCache.set(canonicalFront, normalized);
            const sqExact = stripCardQuotes(exact).toLowerCase();
            const sqFront = stripCardQuotes(front).toLowerCase();
            if (sqExact) localCardCache.set(sqExact, normalized);
            if (sqFront) localCardCache.set(sqFront, normalized);
            if (normalized.id) cardByIdCache.set(normalized.id, normalized);
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
    const paperQuery = (trimmed.includes('game:paper') || trimmed.includes('not:digital')) ? trimmed : `${trimmed} game:paper not:digital`;
    const scryfallUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(paperQuery)}&page=${page}&order=${scryfallOrder}&dir=${scryfallDir}${unique === 'prints' ? '&unique=prints' : ''}`;

    const scryfallRes = await fetch(scryfallUrl, {
      signal,
      headers: { 'Accept': 'application/json' },
    });

    if (scryfallRes.ok) {
      const sJson = await scryfallRes.json();
      if (sJson.data && Array.isArray(sJson.data) && sJson.data.length > 0) {
        let normalized = filterPaperCardsOnly(sJson.data.map(normalizeFrostpointCard));
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

const notFoundCardIds = new Set<string>();

export async function getCardById(id: string, fallbackName?: string): Promise<ScryfallCard | null> {
  const trimmed = (id || '').trim();
  const lower = trimmed.toLowerCase();

  if (trimmed && !notFoundCardIds.has(lower)) {
    const cached = cardByIdCache.get(lower);
    if (cached) return cached;

    try {
      const res = await apiFetch(`/deckbuilder/cards/${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const norm = normalizeFrostpointCard(json.data);
          cardByIdCache.set(lower, norm);
          if (norm.name) {
            localCardCache.set(norm.name.toLowerCase().trim(), norm);
          }
          return norm;
        }
      } else if (res.status === 404) {
        notFoundCardIds.add(lower);
      }
    } catch (e) {
      // Silently catch single card errors to prevent unhandled rejections
    }
  }

  // If ID was not found or failed, try fallback name if provided
  if (fallbackName && fallbackName.trim()) {
    const cleanName = fallbackName.trim().toLowerCase();
    const cachedByName = localCardCache.get(cleanName);
    if (cachedByName) return cachedByName;

    try {
      const res = await apiFetch(`/deckbuilder/cards/${encodeURIComponent(fallbackName.trim())}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const norm = normalizeFrostpointCard(json.data);
          localCardCache.set(cleanName, norm);
          if (norm.id) {
            cardByIdCache.set(norm.id.toLowerCase(), norm);
          }
          return norm;
        }
      }
    } catch {}
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
        const list = filterPaperCardsOnly(json.data.map(normalizeFrostpointCard));
        if (list.length > 0) {
          printsCache.set(cacheKey, list);
          return list;
        }
      }
    }
  } catch (err) {
    console.warn('[CardService] Prints error:', err);
  }

  // Fallback to direct Scryfall prints search
  try {
    const scryUrl = 'https://api.scryfall.com/cards/search?q=%21%22' + encodeURIComponent(clean) + '%22+unique%3Aprints+game%3Apaper+not%3Adigital&order=released&dir=desc';
    const sRes = await fetch(scryUrl, {
      headers: { 'Accept': 'application/json' },
    });
    if (sRes.ok) {
      const sJson = await sRes.json();
      if (sJson.data && Array.isArray(sJson.data) && sJson.data.length > 0) {
        const list = filterPaperCardsOnly(sJson.data.map(normalizeFrostpointCard));
        if (list.length > 0) {
          printsCache.set(cacheKey, list);
          return list;
        }
      }
    }
  } catch (sErr) {
    console.warn('[CardService] Scryfall direct prints fallback error:', sErr);
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

  // 2. Fetch missing cards from API in batches using /deckbuilder/cards/lookup
  if (missingIds.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < missingIds.length; i += chunkSize) {
      const chunk = missingIds.slice(i, i + chunkSize);
      try {
        const res = await apiFetch('/deckbuilder/cards/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(chunk.map((id) => ({ id }))),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            for (const raw of json.data) {
              if (raw && raw.id) {
                const norm = normalizeFrostpointCard(raw);
                cardByIdCache.set(raw.id.toLowerCase(), norm);
                const usd = norm.prices?.usd ? parseFloat(norm.prices.usd) : undefined;
                const usdFoil = norm.prices?.usd_foil ? parseFloat(norm.prices.usd_foil) : undefined;
                const eur = norm.prices?.eur ? parseFloat(norm.prices.eur) : undefined;
                priceMap.set(raw.id, { usd, usdFoil, eur });
              }
            }
          }
        }
      } catch (err) {
        // Silently handle error
      }
    }
  }

  return priceMap;
}

export interface BatchCardFetchItem {
  name: string;
  set?: string;
  id?: string;
  scryfallId?: string;
  collectorNumber?: string;
  collector_number?: string;
}

/**
 * Batch resolve cards using Scryfall ID, set & collector number, or card name.
 * Uses Scryfall collection endpoint for exact printings/editions, and Frostpointlabs for generic lookups.
 */
export async function fetchBatchCardsCollection(
  cardsToFetch: BatchCardFetchItem[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, ScryfallCard>> {
  const cardMap = new Map<string, ScryfallCard>();
  if (cardsToFetch.length === 0) return cardMap;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Deduplicate identifiers
  const seenKeys = new Set<string>();
  const uniqueItems: BatchCardFetchItem[] = [];

  for (const item of cardsToFetch) {
    const rawId = (item.id && uuidRegex.test(item.id)) ? item.id.toLowerCase() : (item.scryfallId && uuidRegex.test(item.scryfallId)) ? item.scryfallId.toLowerCase() : '';
    const collNum = String(item.collectorNumber || item.collector_number || '').trim();
    const setCode = (item.set || '').toLowerCase().trim();
    const nameStr = (item.name || '').toLowerCase().trim();

    const key = rawId ? `id:${rawId}` : (setCode && collNum) ? `setnum:${setCode}|${collNum}` : `${nameStr}|${setCode}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueItems.push(item);
    }
  }

  // Check local cache first to cut down on extraneous network requests
  const itemsToFetch: BatchCardFetchItem[] = [];
  for (const item of uniqueItems) {
    const rawId = (item.id && uuidRegex.test(item.id)) ? item.id.toLowerCase() : (item.scryfallId && uuidRegex.test(item.scryfallId)) ? item.scryfallId.toLowerCase() : '';
    const exact = (item.name || '').toLowerCase().trim();
    const front = exact.split(' // ')[0].trim();
    const canonical = getCanonicalCardName(item.name || '').toLowerCase().trim();
    const canonicalFront = canonical.split(/\s*\/\/\s*/)[0].trim();
    const stripQuotes = stripCardQuotes(exact).toLowerCase();
    const stripQuotesFront = stripCardQuotes(front).toLowerCase();
    const setCode = (item.set || '').toLowerCase().trim();

    const cachedById = rawId ? cardByIdCache.get(rawId) : null;
    const cachedByName = (!rawId && !setCode) ? (
      localCardCache.get(exact) ||
      localCardCache.get(front) ||
      localCardCache.get(canonical) ||
      localCardCache.get(canonicalFront) ||
      localCardCache.get(stripQuotes) ||
      localCardCache.get(stripQuotesFront)
    ) : null;
    const cached = cachedById || cachedByName;

    if (cached) {
      if (cached.id) cardMap.set(cached.id.toLowerCase(), cached);
      if (exact) cardMap.set(exact, cached);
      if (front) cardMap.set(front, cached);
      if (cached.set && cached.collector_number) {
        cardMap.set(`${cached.set.toLowerCase()}|${cached.collector_number}`, cached);
      }
      if (cached.set && exact) {
        cardMap.set(`${exact}|${cached.set.toLowerCase()}`, cached);
      }
    } else {
      itemsToFetch.push(item);
    }
  }

  const totalCount = uniqueItems.length;
  let resolvedCount = uniqueItems.length - itemsToFetch.length;
  if (onProgress) onProgress(resolvedCount, totalCount);

  if (itemsToFetch.length === 0) {
    return cardMap;
  }

  // Helper to ingest and cache a ScryfallCard
  const registerCard = (raw: any) => {
    if (!raw || !raw.name) return;
    const normalized = normalizeFrostpointCard(raw);
    const exactLower = normalized.name.toLowerCase().trim();
    const frontName = exactLower.split(/\s*\/\/\s*/)[0].trim();
    const canonicalName = getCanonicalCardName(normalized.name).toLowerCase().trim();
    const canonicalFront = canonicalName.split(/\s*\/\/\s*/)[0].trim();
    const setLower = (normalized.set || '').toLowerCase().trim();
    const collNum = String(normalized.collector_number || '').trim();

    if (normalized.id) {
      const normId = normalized.id.toLowerCase().trim();
      cardMap.set(normId, normalized);
      cardByIdCache.set(normalized.id, normalized);
    }
    if (setLower && collNum) {
      cardMap.set(`${setLower}|${collNum}`, normalized);
    }
    if (setLower && exactLower) {
      cardMap.set(`${exactLower}|${setLower}`, normalized);
    }
    if (setLower && frontName) {
      cardMap.set(`${frontName}|${setLower}`, normalized);
    }
    if (setLower && canonicalFront) {
      cardMap.set(`${canonicalFront}|${setLower}`, normalized);
    }
    cardMap.set(exactLower, normalized);
    cardMap.set(frontName, normalized);
    cardMap.set(canonicalName, normalized);
    if (canonicalFront) cardMap.set(canonicalFront, normalized);
    localCardCache.set(exactLower, normalized);
    localCardCache.set(frontName, normalized);
    localCardCache.set(canonicalName, normalized);
    if (canonicalFront) localCardCache.set(canonicalFront, normalized);

    // Also register quote-stripped & quote-variation keys
    const stripQuotesExact = stripCardQuotes(exactLower).toLowerCase();
    const stripQuotesFront = stripCardQuotes(frontName).toLowerCase();
    if (stripQuotesExact) {
      cardMap.set(stripQuotesExact, normalized);
      localCardCache.set(stripQuotesExact, normalized);
    }
    if (stripQuotesFront) {
      cardMap.set(stripQuotesFront, normalized);
      localCardCache.set(stripQuotesFront, normalized);
    }
    const normQuotesExact = normalizeCardQuotes(exactLower).toLowerCase();
    if (normQuotesExact && normQuotesExact !== exactLower) {
      cardMap.set(normQuotesExact, normalized);
      localCardCache.set(normQuotesExact, normalized);
    }
    const commaQuoteNorm = exactLower.replace(/,\s*"/g, ' "');
    if (commaQuoteNorm && commaQuoteNorm !== exactLower) {
      cardMap.set(commaQuoteNorm, normalized);
      localCardCache.set(commaQuoteNorm, normalized);
    }
    const addCommaQuote = exactLower.replace(/([a-zA-Z0-9])\s*"/g, '$1, "');
    if (addCommaQuote && addCommaQuote !== exactLower) {
      cardMap.set(addCommaQuote, normalized);
      localCardCache.set(addCommaQuote, normalized);
    }
  };

  const isPopulatedCard = (c: any) => {
    if (!c) return false;
    const rawType = (c.type_line || c.type || c.card_faces?.[0]?.type_line || '').trim();
    const hasValidType = Boolean(rawType) && rawType.toLowerCase() !== 'no card type found' && rawType.toLowerCase() !== 'card';
    const isConspiracy = isConspiracyCardName(c.name);
    const hasKnown = Boolean(getKnownCardType(c.name));
    const hasMeaningfulData = Boolean(
      (c.mana_cost && c.mana_cost.trim() !== '') ||
      (c.oracle_text && c.oracle_text.trim() !== '') ||
      (c.image_uris && (c.image_uris.normal || c.image_uris.large)) ||
      (c.image_url && typeof c.image_url === 'string' && c.image_url.trim() !== '')
    );
    return Boolean((hasValidType || isConspiracy || hasKnown) && (hasMeaningfulData || hasValidType || isConspiracy || hasKnown));
  };

  // 1. Primary resolution: Use FrostpointApi /deckbuilder/cards/lookup for bulk resolution
  // This avoids Scryfall CORS / Cloudflare rate limits and resolves against the 109k+ cards in Turso DB.
  const fpChunkSize = 75;
  for (let i = 0; i < itemsToFetch.length; i += fpChunkSize) {
    const chunk = itemsToFetch.slice(i, i + fpChunkSize);
    const lookupPayload = chunk.map((it) => {
      const cleanId = (it.id && uuidRegex.test(it.id)) ? it.id : (it.scryfallId && uuidRegex.test(it.scryfallId)) ? it.scryfallId : undefined;
      const cleanSet = (it.set || '').trim().toLowerCase();
      const collNum = String(it.collectorNumber || it.collector_number || '').trim();
      const rawName = (it.name || '').trim();
      const canonical = getCanonicalCardName(rawName);
      const cleanFront = canonical.split(/\s*\/\/\s*/)[0].trim();
      const cleanName = cleanFront || canonical || rawName;

      const itemObj: any = {};
      if (cleanId) itemObj.id = cleanId;
      if (cleanName) itemObj.name = cleanName;
      if (cleanSet) itemObj.set = cleanSet;
      if (collNum) itemObj.collector_number = collNum;
      return itemObj;
    });

    try {
      const res = await apiFetch('/deckbuilder/cards/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(lookupPayload),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          GamechangerService.registerCardsFromLookup(json.data);
          for (const raw of json.data) {
            if (isPopulatedCard(raw)) {
              registerCard(raw);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[CardService] Frostpoint lookup chunk error:', err);
    }

    resolvedCount = Math.min(totalCount, resolvedCount + chunk.length);
    if (onProgress) onProgress(resolvedCount, totalCount);
  }

  // 2. Identify any items still unresolved in cardMap
  const unresolvedItems: BatchCardFetchItem[] = [];
  for (const item of itemsToFetch) {
    const rawId = (item.id && uuidRegex.test(item.id)) ? item.id.toLowerCase() : (item.scryfallId && uuidRegex.test(item.scryfallId)) ? item.scryfallId.toLowerCase() : '';
    const exact = (item.name || '').toLowerCase().trim();
    const front = exact.split(' // ')[0].trim();
    const setCode = (item.set || '').toLowerCase().trim();
    const collNum = String(item.collectorNumber || item.collector_number || '').trim();

    const canonical = getCanonicalCardName(item.name || '').toLowerCase().trim();
    const canonicalFront = canonical.split(/\s*\/\/\s*/)[0].trim();
    const stripQuotes = stripCardQuotes(exact).toLowerCase();
    const stripQuotesFront = stripCardQuotes(front).toLowerCase();

    const isResolved = (rawId && cardMap.has(rawId)) ||
      (setCode && collNum && cardMap.has(`${setCode}|${collNum}`)) ||
      (setCode && exact && cardMap.has(`${exact}|${setCode}`)) ||
      (setCode && front && cardMap.has(`${front}|${setCode}`)) ||
      (setCode && canonicalFront && cardMap.has(`${canonicalFront}|${setCode}`)) ||
      (setCode && stripQuotesFront && cardMap.has(`${stripQuotesFront}|${setCode}`)) ||
      cardMap.has(exact) ||
      cardMap.has(front) ||
      cardMap.has(canonical) ||
      cardMap.has(canonicalFront) ||
      cardMap.has(stripQuotes) ||
      cardMap.has(stripQuotesFront);

    if (!isResolved) {
      unresolvedItems.push(item);
    }
  }

  // 3. Fallback to Scryfall for unresolved items with strict rate-limiting (100ms) and retry resilience
  if (unresolvedItems.length > 0) {
    const scryChunkSize = 75;
    for (let i = 0; i < unresolvedItems.length; i += scryChunkSize) {
      const scryChunk = unresolvedItems.slice(i, i + scryChunkSize);

      // Throttling: Respect Scryfall's 50-100ms delay policy to prevent Cloudflare 429 & CORS blocks
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      try {
        const identifiers = scryChunk.map((it) => {
          const cleanId = (it.id && uuidRegex.test(it.id)) ? it.id : (it.scryfallId && uuidRegex.test(it.scryfallId)) ? it.scryfallId : undefined;
          if (cleanId) {
            return { id: cleanId };
          }
          const cleanSet = (it.set || '').trim().toLowerCase();
          const collNum = String(it.collectorNumber || it.collector_number || '').trim();
          if (cleanSet && collNum) {
            return { set: cleanSet, collector_number: collNum };
          }
          const rawName = (it.name || '').trim();
          const canonical = getCanonicalCardName(rawName);
          const cleanFront = canonical.split(/\s*\/\/\s*/)[0].trim();
          const queryName = cleanFront || canonical || rawName;
          if (cleanSet && queryName) {
            return { name: queryName, set: cleanSet };
          }
          return { name: queryName };
        });

        const fetchScryfallBatch = async () => {
          return fetch('https://api.scryfall.com/cards/collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ identifiers }),
          });
        };

        let sRes = await fetchScryfallBatch().catch(() => null);
        if (sRes && sRes.status === 429) {
          // Rate limited, wait 600ms and retry once
          await new Promise((resolve) => setTimeout(resolve, 600));
          sRes = await fetchScryfallBatch().catch(() => null);
        }

        if (sRes && sRes.ok) {
          const sJson = await sRes.json().catch(() => null);
          if (sJson && sJson.data && Array.isArray(sJson.data)) {
            GamechangerService.registerCardsFromLookup(sJson.data);
            for (const raw of sJson.data) {
              registerCard(raw);
            }
          }

          // If some items were not found with set or id, retry them by name
          if (sJson && sJson.not_found && Array.isArray(sJson.not_found) && sJson.not_found.length > 0) {
            const retryItems = sJson.not_found
              .filter((nf) => nf && nf.name)
              .map((nf) => ({ name: nf.name }));
            if (retryItems.length > 0) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              try {
                const retryRes = await fetch('https://api.scryfall.com/cards/collection', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                  body: JSON.stringify({ identifiers: retryItems }),
                });
                if (retryRes.ok) {
                  const retryJson = await retryRes.json().catch(() => null);
                  if (retryJson && retryJson.data && Array.isArray(retryJson.data)) {
                    GamechangerService.registerCardsFromLookup(retryJson.data);
                    for (const raw of retryJson.data) {
                      registerCard(raw);
                    }
                  }
                }
              } catch {}
            }
          }
        }
      } catch (err) {
        // Silently handle Scryfall batch network / CORS errors so collection imports continue uninterrupted
      }
    }
  }

  persistLocalCards();
  return cardMap;
}
export function toHighResImageUrl(url?: string, scryfallId?: string, name?: string): string {
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
  if (name && typeof name === 'string' && name.trim() !== '') {
    const cleanName = name.split(' // ')[0].trim();
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName)}&format=image&version=large`;
  }
  return 'https://cards.scryfall.io/back.jpg';
}

/**
 * Global resilient onError event handler for card <img> elements.
 * Seamlessly fails over from broken/cached CDN URLs to Scryfall API ID or named image lookup,
 * and finally to the MTG card back image.
 */
export function handleCardImageError(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  card?: { scryfallId?: string; name?: string; imageUrl?: string } | string
): void {
  const target = e.currentTarget;
  if (!target) return;

  const currentSrc = target.src || '';
  const scryId = typeof card === 'object' ? card?.scryfallId : undefined;
  const name = typeof card === 'object' ? card?.name : (typeof card === 'string' ? card : undefined);

  if (scryId && !currentSrc.includes(`/cards/${scryId}`)) {
    target.src = `https://api.scryfall.com/cards/${scryId}?format=image&version=large`;
    return;
  }

  if (name && typeof name === 'string' && name.trim() !== '' && !currentSrc.includes('/cards/named')) {
    const cleanName = name.split(' // ')[0].trim();
    target.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName)}&format=image&version=large`;
    return;
  }

  if (!currentSrc.includes('back.jpg')) {
    target.src = 'https://cards.scryfall.io/back.jpg';
  }
}

/**
 * Extracts card image uri safely, handling double-faced, transform, and flip cards,
 * with fallbacks across all size versions and Scryfall redirect URLs.
 */
export function getCardImageUrl(
  card: ScryfallCard | { image_uris?: any; card_faces?: any[]; imageUrl?: string; id?: string; scryfallId?: string; name?: string },
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

  // 5. Named card image lookup fallback
  const cardName = (card as any).name;
  if (cardName && typeof cardName === 'string' && cardName.trim() !== '') {
    const cleanName = cardName.split(' // ')[0].trim();
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName)}&format=image&version=${version === 'small' ? 'small' : 'large'}`;
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
