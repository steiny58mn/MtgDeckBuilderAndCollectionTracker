/**
 * Consolidated MTG Deck, Collection & Remote API Service
 * Handles direct communication with remote C# Web API (api.frostpointlabs.com)
 * and manages reactive in-memory state for decks and binders.
 */

import { Deck, CollectionCard, DeckCard, Binder, DeckHistoryItem, DeckComparisonSummaryResult, MTGFormat } from '../types/mtg';
import { fetchBatchCardPrices, fetchBatchCardsCollection, getKnownMedianPrice } from './api';
import { AuthService } from './authService';
import { GamechangerService } from './gamechangerService';
import {
  createDeckListApi,
  createDeckPickListApi,
  getDeckColorStyle,
  generateDeckPickListLocal,
  getDeckColorName,
  MTG_COLOR_NAMES,
  isCardGamechanger,
} from '../utils/deckUtils';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type Unsubscribe = () => void;
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface TursoStatusResponse {
  nexusTools?: {
    databaseUrl?: string;
    configured?: boolean;
    source?: string;
    token?: string;
    connected?: boolean;
  };
  deckBuilder?: {
    databaseUrl?: string;
    configured?: boolean;
    source?: string;
    token?: string;
    connected?: boolean;
  };
}

export interface ApiHealthResponse {
  service: string;
  description: string;
  status: string;
  endpoints: string[];
}


// ============================================================================
// Constants & Centralized API Configuration (Imported from config/apiConfig)
// ============================================================================

import {
  getApiBaseUrl,
  setApiBaseUrl,
  resetApiBaseUrl,
  getVaultId,
  setVaultId,
  resetVaultId,
  getAuthHeaders,
  buildApiUrl,
  apiFetch,
  DEFAULT_LOCAL_API_URL,
  DEFAULT_PROD_API_URL,
  STORAGE_API_BASE_KEY,
  STORAGE_VAULT_KEY,
  isLocalEnvironment,
} from '../config/apiConfig';

export {
  getApiBaseUrl,
  setApiBaseUrl,
  resetApiBaseUrl,
  getVaultId,
  setVaultId,
  resetVaultId,
  getAuthHeaders,
  buildApiUrl,
  apiFetch,
  DEFAULT_LOCAL_API_URL,
  DEFAULT_PROD_API_URL,
  STORAGE_API_BASE_KEY,
  STORAGE_VAULT_KEY,
};

export const DEFAULT_API_BASE_URL = DEFAULT_LOCAL_API_URL;

export const DEFAULT_BINDER: Binder = {
  id: 'binder-main',
  name: 'Main Binder',
  description: 'Primary trade and collection binder',
  cards: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ============================================================================
// Direct Remote API Endpoints (Using centralized apiFetch & buildApiUrl)
// ============================================================================

/**
 * Check backend service health and available endpoints
 */
export async function getApiHealth(): Promise<ApiHealthResponse | null> {
  try {
    const res = await apiFetch('/');
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[DeckService] Health check error:', err);
    return null;
  }
}

/**
 * Check Turso database connection status on backend
 */
export async function getTursoStatus(): Promise<TursoStatusResponse | null> {
  try {
    const res = await apiFetch('/mtgtools/turso/status');
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[DeckService] Error fetching Turso status:', err);
    return null;
  }
}

/**
 * Normalizes a raw card object into a standardized DeckCard.
 * Ensures both camelCase (C# API) and snake_case properties are populated.
 */
export function normalizeCard(card: any): DeckCard {
  if (!card || typeof card !== 'object') return card;
  const typeLine = card.type_line || card.typeLine || card.TypeLine || '';
  const manaCost = card.mana_cost || card.manaCost || card.ManaCost || '';
  const setName = card.set_name || card.setName || card.SetName || '';
  const collectorNumber = card.collector_number || card.collectorNumber || card.CollectorNumber || '';
  const colorIdentity = card.color_identity || card.colorIdentity || card.ColorIdentity || [];
  const colors = card.colors || card.Colors || [];
  const quantity = typeof card.quantity === 'number' ? card.quantity : (typeof card.Quantity === 'number' ? card.Quantity : 1);
  const category = (card.category || card.Category || 'main').toLowerCase();

  return {
    ...card,
    id: card.id || card.Id || card.cardId || card.CardId || `c-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    scryfallId: card.scryfallId || card.ScryfallId || '',
    name: card.name || card.Name || '',
    set: card.set || card.Set || '',
    set_name: setName,
    setName,
    collector_number: collectorNumber,
    collectorNumber,
    category: category as any,
    quantity,
    isFoil: card.isFoil ?? card.IsFoil,
    mana_cost: manaCost,
    manaCost,
    cmc: card.cmc ?? card.Cmc ?? 0,
    type_line: typeLine,
    typeLine,
    oracle_text: card.oracle_text ?? card.OracleText ?? card.oracleText,
    keywords: card.keywords ?? card.Keywords,
    colors,
    color_identity: colorIdentity,
    colorIdentity,
    rarity: card.rarity || card.Rarity || 'common',
    imageUrl: card.imageUrl || card.ImageUrl,
    backImageUrl: card.backImageUrl || card.BackImageUrl,
    priceUsd: card.priceUsd ?? card.PriceUsd,
    priceUsdFoil: card.priceUsdFoil ?? card.PriceUsdFoil,
    legalities: card.legalities || card.Legalities || card.legalities_json || {},
    isGamechanger: isCardGamechanger(card),
    game_changer: isCardGamechanger(card),
    is_game_changer: isCardGamechanger(card),
    isGameChanger: isCardGamechanger(card),
    IsGameChanger: isCardGamechanger(card),
  };
}

/**
 * Normalizes a raw Deck object from remote C# API or local state.
 */
export function normalizeDeck(deck: any): Deck {
  if (!deck || typeof deck !== 'object') return deck;
  const rawCards = deck.cards || deck.Cards || [];
  const cards = Array.isArray(rawCards) ? rawCards.map(normalizeCard) : [];

  const deckId = deck.id || deck.Id || deck.deckId || deck.DeckId || '';

  let mtgNexusEditThreadUrl =
    deck.mtgNexusEditThreadUrl ??
    deck.mtgNexusEditThreadURL ??
    deck.MtgNexusEditThreadUrl ??
    deck.MtgNexusEditThreadURL ??
    deck.mtgThreadUrl ??
    deck.MtgThreadUrl;

  if (!mtgNexusEditThreadUrl && deckId && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('mtgnexus_url_' + deckId);
      if (cached) mtgNexusEditThreadUrl = cached;
    } catch {}
  }

  if (deckId && mtgNexusEditThreadUrl && typeof window !== 'undefined') {
    try {
      localStorage.setItem('mtgnexus_url_' + deckId, mtgNexusEditThreadUrl);
    } catch {}
  }

  return {
    ...deck,
    id: deckId,
    name: deck.name || deck.Name || 'Untitled Deck',
    description: deck.description ?? deck.Description,
    format: (deck.format || deck.Format || 'commander').toLowerCase() as any,
    commanderId: deck.commanderId ?? deck.CommanderId,
    commanderName: deck.commanderName ?? deck.CommanderName,
    commanderArtUrl: deck.commanderArtUrl ?? deck.CommanderArtUrl,
    commanderColorIdentity: deck.commanderColorIdentity ?? deck.CommanderColorIdentity ?? [],
    coverCardUrl: deck.coverCardUrl ?? deck.CoverCardUrl,
    mtgNexusEditThreadUrl: mtgNexusEditThreadUrl ? mtgNexusEditThreadUrl.trim() : undefined,
    mtgNexusEditThreadURL: mtgNexusEditThreadUrl ? mtgNexusEditThreadUrl.trim() : undefined,
    tags: deck.tags ?? deck.Tags ?? [],
    createdAt: parseTimestamp(deck.createdAt ?? deck.CreatedAt),
    updatedAt: parseTimestamp(deck.updatedAt ?? deck.UpdatedAt),
    cards,
  };
}

/**
 * Normalizes a collection / binder card from remote C# API or local state.
 */
export function normalizeBinderCard(card: any): CollectionCard {
  if (!card || typeof card !== 'object') return card;
  const typeLine = card.type_line || card.typeLine || card.TypeLine || '';
  const manaCost = card.mana_cost || card.manaCost || card.ManaCost || '';
  const setName = card.setName || card.set_name || card.SetName || '';
  const collectorNumber = card.collectorNumber || card.collector_number || card.CollectorNumber || '';
  const colorIdentity = card.colorIdentity || card.color_identity || card.ColorIdentity || [];
  const colors = card.colors || card.Colors || [];

  return {
    ...card,
    id: card.id || card.Id || card.cardId || card.CardId || `bc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    scryfallId: card.scryfallId || card.ScryfallId || '',
    name: card.name || card.Name || '',
    set: card.set || card.Set || '',
    setName,
    set_name: setName,
    collectorNumber,
    collector_number: collectorNumber,
    quantity: typeof card.quantity === 'number' ? card.quantity : (typeof card.Quantity === 'number' ? card.Quantity : 1),
    isFoil: Boolean(card.isFoil ?? card.IsFoil),
    condition: card.condition || card.Condition || 'NM',
    cmc: card.cmc ?? card.Cmc ?? 0,
    mana_cost: manaCost,
    manaCost,
    type_line: typeLine,
    typeLine,
    colors,
    color_identity: colorIdentity,
    colorIdentity,
    rarity: card.rarity || card.Rarity || 'common',
    imageUrl: (card.imageUrl || card.ImageUrl || (card.scryfallId ? `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=normal` : ''))?.replace('version=small', 'version=normal'),
    acquiredPrice: card.acquiredPrice ?? card.AcquiredPrice,
    currentPriceUsd: card.currentPriceUsd ?? card.CurrentPriceUsd ?? card.priceUsd,
    addedAt: parseTimestamp(card.addedAt ?? card.AddedAt),
    notes: card.notes ?? card.Notes,
    isGamechanger: isCardGamechanger(card),
    game_changer: isCardGamechanger(card),
    is_game_changer: isCardGamechanger(card),
  };
}

/**
 * Automatically enriches deck cards that are missing metadata or out of date using Scryfall/Frostpointlabs.
 * Repositions cards from 'Other' to proper type categories and updates game_changer flags strictly from Scryfall.
 */
export async function enrichDeckCards(deck: Deck): Promise<Deck> {
  if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) return deck;

  // If cards are already pre-hydrated by backend (have typeLine, manaCost, isGameChanger, etc.), skip external lookups
  const needsEnrichment = deck.cards.some((c) => !c.type_line && !c.typeLine);
  if (!needsEnrichment) {
    return deck;
  }

  try {
    const validCards = deck.cards.filter((c) => Boolean(c.name));
    if (validCards.length === 0) return deck;

    const cardsToFetch = validCards.map((c) => ({ name: c.name, set: c.set }));
    const scryfallMap = await fetchBatchCardsCollection(cardsToFetch);

    let changed = false;
    const updatedCards = deck.cards.map((c) => {
      const exact = (c.name || '').toLowerCase().trim();
      const front = exact.split(' // ')[0].trim();
      const matched = scryfallMap.get(exact) || scryfallMap.get(front);
      if (matched) {
        const typeLine = matched.type_line || matched.card_faces?.[0]?.type_line || c.type_line || '';
        const manaCost = matched.mana_cost || matched.card_faces?.[0]?.mana_cost || c.mana_cost || '';
        const img = matched.image_uris?.normal || matched.card_faces?.[0]?.image_uris?.normal || c.imageUrl;
        // Check gamechanger from API response property
        const isGc = isCardGamechanger(matched);
        const gcMismatch = isCardGamechanger(c) !== isGc;
        const typeMismatch = !c.type_line && Boolean(typeLine);
        const colorMismatch = matched.color_identity && (!c.color_identity || c.color_identity.length === 0);
        const oracleMismatch = !c.oracle_text && Boolean(matched.oracle_text || matched.card_faces?.[0]?.oracle_text);

        if (gcMismatch || typeMismatch || colorMismatch || oracleMismatch) {
          changed = true;
          return {
            ...c,
            type_line: typeLine,
            typeLine: typeLine || c.typeLine,
            mana_cost: manaCost,
            manaCost: manaCost || c.manaCost,
            oracle_text: matched.oracle_text || matched.card_faces?.[0]?.oracle_text || c.oracle_text,
            cmc: matched.cmc ?? c.cmc,
            imageUrl: img || c.imageUrl,
            colors: matched.colors || c.colors,
            color_identity: matched.color_identity || c.color_identity,
            rarity: matched.rarity || c.rarity,
            set_name: matched.set_name || c.set_name,
            isGamechanger: isGc,
            game_changer: isGc,
            is_game_changer: isGc,
          };
        }
      }
      return c;
    });

    if (changed) {
      const enrichedDeck: Deck = {
        ...deck,
        cards: updatedCards,
      };
      DeckService.updateDeckMetadataInMemory(enrichedDeck);
      return enrichedDeck;
    }
  } catch (err) {
    console.warn('[DeckService] Failed to auto-enrich cards with Scryfall:', err);
  }
  return deck;
}

/**
 * Fetch decks from remote C# API (/deckbuilder/decks)
 */
export async function getRemoteDecks(): Promise<Deck[]> {
  const targetUrl = buildApiUrl('/deckbuilder/decks');
  const headers = getAuthHeaders();
  const vaultId = headers['X-Vault-Id'];
  const start = performance.now();

  console.groupCollapsed(`[DeckService] 📡 Fetching decks from ${targetUrl} [Vault: ${vaultId}]`);
  console.log('[DeckService] Request URL:', targetUrl);
  console.log('[DeckService] Request Headers:', headers);

  try {
    const res = await apiFetch('/deckbuilder/decks');
    const durationMs = Math.round(performance.now() - start);

    console.log(`[DeckService] Response status: ${res.status} ${res.statusText} (${durationMs}ms)`);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[DeckService] ⚠️ getRemoteDecks returned HTTP ${res.status}:`, errText);
      console.groupEnd();
      return [];
    }

    const rawText = await res.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[DeckService] ❌ Failed to parse deck JSON response:', parseErr, { rawTextPreview: rawText.slice(0, 300) });
      console.groupEnd();
      return [];
    }

    if (!Array.isArray(data)) {
      console.warn('[DeckService] ⚠️ getRemoteDecks returned non-array payload:', data);
      console.groupEnd();
      return [];
    }

    const normalizedDecks: Deck[] = data.map(normalizeDeck);

    console.log(`[DeckService] ✅ Loaded ${normalizedDecks.length} deck(s) from server (${durationMs}ms):`, normalizedDecks.map((d: any) => ({
      id: d.id,
      name: d.name,
      format: d.format,
      cardCount: d.cards?.reduce((sum: number, c: any) => sum + (c.quantity || 1), 0) || 0,
      vaultId: (d as any).vaultId ?? '(none/null)',
      userId: (d as any).userId ?? '(none/null)',
    })));

    if (normalizedDecks.length === 0) {
      console.warn(`[DeckService] ℹ️ 0 decks returned for Vault ID "${vaultId}". Note: If decks in the database were created with a different Vault ID or with NULL Vault ID, backend tenant filtering will exclude them.`);
    }

    console.groupEnd();
    return normalizedDecks;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    console.warn(`[DeckService] ⚠️ Network/Fetch error in getRemoteDecks (${durationMs}ms) - using local fallback:`, err);
    console.groupEnd();
    return [];
  }
}

/**
 * Save/upsert deck to remote C# API (POST /deckbuilder/decks)
 */
export async function saveRemoteDeck(deck: Deck): Promise<boolean> {
  const targetUrl = buildApiUrl('/deckbuilder/decks');
  const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
  const start = performance.now();

  const rawNexusUrl =
    deck.mtgNexusEditThreadUrl ||
    (deck as any).mtgNexusEditThreadURL ||
    (deck as any).MtgNexusEditThreadUrl ||
    (deck as any).MtgNexusEditThreadURL ||
    (deck.id && typeof window !== 'undefined' ? localStorage.getItem('mtgnexus_url_' + deck.id) : '') ||
    '';
  const mtgNexusEditThreadUrl = rawNexusUrl.trim() || undefined;

  const preparedDeck = {
    ...deck,
    deckId: deck.id || (deck as any).deckId,
    id: deck.id || (deck as any).deckId,
    mtgNexusEditThreadUrl,
    mtgNexusEditThreadURL: mtgNexusEditThreadUrl,
    totalCards: (deck.cards || []).reduce((sum, c) => sum + (c.quantity || 1), 0),
    cards: (deck.cards || []).map((c) => {
      const typeLine = c.type_line || (c as any).typeLine || (c as any).TypeLine || '';
      const manaCost = c.mana_cost || (c as any).manaCost || (c as any).ManaCost || '';
      const setName = c.set_name || (c as any).setName || (c as any).SetName || '';
      const collectorNumber = c.collector_number || (c as any).collectorNumber || (c as any).CollectorNumber || '';
      const colorIdentity = c.color_identity || (c as any).colorIdentity || (c as any).ColorIdentity || [];
      const isGc = Boolean(c.game_changer || c.isGamechanger || c.is_gamechanger) || isCardGamechanger(c);
      return {
        ...c,
        type_line: typeLine,
        typeLine,
        mana_cost: manaCost,
        manaCost,
        set_name: setName,
        setName,
        collector_number: collectorNumber,
        collectorNumber,
        color_identity: colorIdentity,
        colorIdentity,
        legalities: c.legalities || (c as any).Legalities || {},
        isGameChanger: isGc,
        IsGameChanger: isGc,
        game_changer: isGc,
        is_game_changer: isGc,
        isGamechanger: isGc,
      };
    }),
  };

  console.log(`[DeckService] 💾 Saving deck "${deck.name}" (${deck.id}) to ${targetUrl}...`, {
    deckId: deck.id,
    name: deck.name,
    format: deck.format,
    mtgNexusEditThreadUrl,
    cardCount: preparedDeck.totalCards,
    vaultId: headers['X-Vault-Id'],
  });

  try {
    const res = await apiFetch('/deckbuilder/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preparedDeck),
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DeckService] ❌ Failed to save deck: HTTP ${res.status} ${res.statusText} (${durationMs}ms)`, {
        errorBody: errText,
        deckId: deck.id,
      });
      return false;
    }
    console.log(`[DeckService] ✅ Successfully saved deck "${deck.name}" (${durationMs}ms)`);
    return true;
  } catch (err) {
    console.error('[DeckService] ❌ Error saving remote deck:', err);
    return false;
  }
}

/**
 * Delete deck from remote C# API (DELETE /deckbuilder/decks/{id})
 */
export async function deleteRemoteDeck(deckId: string): Promise<boolean> {
  const start = performance.now();
  console.log(`[DeckService] 🗑️ Deleting deck ${deckId}...`);

  try {
    const res = await apiFetch(`/deckbuilder/decks/${encodeURIComponent(deckId)}`, {
      method: 'DELETE',
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DeckService] ❌ Failed to delete deck: HTTP ${res.status} ${res.statusText} (${durationMs}ms)`, {
        errorBody: errText,
        deckId,
      });
      return false;
    }
    console.log(`[DeckService] ✅ Successfully deleted deck ${deckId} (${durationMs}ms)`);
    return true;
  } catch (err) {
    console.error('[DeckService] ❌ Error deleting remote deck:', err);
    return false;
  }
}

/**
 * Fetch binders from remote C# API (/deckbuilder/binders)
 */
/**
 * Safely parses any date/timestamp format (string digits ms, numeric epoch ms, unix seconds, ISO-8601 strings) into numeric milliseconds.
 */
export function parseTimestamp(val: any): number {
  if (val === null || val === undefined || val === '') return Date.now();
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return Date.now();
    return val < 10000000000 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return Date.now();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!isNaN(num) && num > 0) {
        return num < 10000000000 ? num * 1000 : num;
      }
    }
    const withT = trimmed.replace(' ', 'T');
    const parsedWithT = Date.parse(withT);
    if (!isNaN(parsedWithT) && parsedWithT > 0) {
      return parsedWithT;
    }
    const directParsed = Date.parse(trimmed);
    if (!isNaN(directParsed) && directParsed > 0) {
      return directParsed;
    }
  }
  return Date.now();
}

/**
 * Normalizes raw deck history JSON payloads from C# API (handles camelCase and PascalCase)
 */
export function normalizeHistoryItem(item: any): DeckHistoryItem {
  if (!item || typeof item !== 'object') {
    return item;
  }
  const historyId = item.historyId || item.HistoryId || item.id || item.Id || '';
  const deckId = item.deckId || item.DeckId || (item.historyId ? (item.id || item.Id) : '') || '';
  const archivedAtNum = parseTimestamp(item.archivedAt ?? item.ArchivedAt);
  const createdAtNum = (item.createdAt ?? item.CreatedAt) != null ? parseTimestamp(item.createdAt ?? item.CreatedAt) : undefined;
  const updatedAtNum = (item.updatedAt ?? item.UpdatedAt) != null ? parseTimestamp(item.updatedAt ?? item.UpdatedAt) : undefined;

  return {
    ...item,
    id: historyId,
    historyId: historyId,
    deckId: deckId,
    name: item.name || item.Name || '',
    format: (item.format || item.Format || 'commander').toLowerCase(),
    archivedAt: archivedAtNum,
    createdAt: createdAtNum,
    updatedAt: updatedAtNum,
    description: item.description ?? item.Description,
    commanderName: item.commanderName ?? item.CommanderName,
    commanderArtUrl: item.commanderArtUrl ?? item.CommanderArtUrl,
    commanderColorIdentity: item.commanderColorIdentity ?? item.CommanderColorIdentity ?? [],
    cardCount: (() => {
      const rawCards = item.cards ?? item.Cards;
      const sum = Array.isArray(rawCards) ? rawCards.filter((c: any) => ((c.category || c.Category || 'main').toLowerCase()) !== 'maybeboard').reduce((s: number, c: any) => s + (c.quantity || c.Quantity || 1), 0) : undefined;
      return sum ?? item.cardCount ?? item.CardCount ?? item.totalCards ?? item.TotalCards;
    })(),
    changeSummary: item.changeSummary ?? item.ChangeSummary,
    cards: (Array.isArray(item.cards ?? item.Cards) ? (item.cards ?? item.Cards).map(normalizeCard) : []),
  };
}

/**
 * Fetch deck history list from C# API
 * Primary route: GET /deckbuilder/decks/{id}/history
 * Alias route:   GET /deckbuilder/decks/history/{id}
 */
export async function getRemoteDeckHistory(
  deckId: string,
  useAliasRoute: boolean = false
): Promise<DeckHistoryItem[]> {
  const routePath = useAliasRoute
    ? `/deckbuilder/decks/history/${encodeURIComponent(deckId)}`
    : `/deckbuilder/decks/${encodeURIComponent(deckId)}/history`;
  const start = performance.now();

  console.groupCollapsed(`[DeckService] 📜 Fetching deck history for deck ${deckId}`);
  console.log('[DeckService] Deck ID:', deckId, 'Use Alias:', useAliasRoute);

  try {
    const res = await apiFetch(routePath);
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[DeckService] ⚠️ getRemoteDeckHistory returned HTTP ${res.status}:`, errText);
      console.groupEnd();
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      console.warn('[DeckService] ⚠️ getRemoteDeckHistory returned non-array:', data);
      console.groupEnd();
      return [];
    }

    const normalized = data.map(normalizeHistoryItem);
    console.log(`[DeckService] ✅ Loaded ${normalized.length} history snapshot(s) (${durationMs}ms)`);
    console.groupEnd();
    return normalized;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    console.debug(`[DeckService] ℹ️ getRemoteDeckHistory offline/unreachable (${durationMs}ms):`, (err as any)?.message || err);
    console.groupEnd();
    return [];
  }
}

/**
 * Fetch specific deck history snapshot by deckId and historyId
 * Route: GET /deckbuilder/decks/{id}/history/{historyId}
 */
export async function getRemoteDeckHistorySnapshot(
  deckId: string,
  historyId: string
): Promise<DeckHistoryItem | null> {
  const routePath = `/deckbuilder/decks/${encodeURIComponent(deckId)}/history/${encodeURIComponent(historyId)}`;
  const start = performance.now();

  console.groupCollapsed(`[DeckService] 📜 Fetching history snapshot ${historyId} for deck ${deckId}`);

  try {
    const res = await apiFetch(routePath);
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[DeckService] ⚠️ getRemoteDeckHistorySnapshot returned HTTP ${res.status}:`, errText);
      console.groupEnd();
      return null;
    }

    const data = await res.json();
    const normalized = normalizeHistoryItem(data);
    console.log(`[DeckService] ✅ Loaded snapshot ${historyId} (${durationMs}ms)`);
    console.groupEnd();
    return normalized;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    console.debug(`[DeckService] ℹ️ getRemoteDeckHistorySnapshot offline/unreachable (${durationMs}ms):`, (err as any)?.message || err);
    console.groupEnd();
    return null;
  }
}

/**
 * Delete deck history snapshot from C# API
 * Primary route: DELETE /deckbuilder/decks/{id}/history/{historyId}
 * Alias route:   DELETE /deckbuilder/decks/history/{historyId}
 */
export async function deleteRemoteDeckHistory(
  deckId: string,
  historyId: string
): Promise<boolean> {
  const routePath = `/deckbuilder/decks/${encodeURIComponent(deckId)}/history/${encodeURIComponent(historyId)}`;
  const start = performance.now();

  console.groupCollapsed(`[DeckService] 🗑️ Deleting deck history snapshot ${historyId} for deck ${deckId}`);

  try {
    const res = await apiFetch(routePath, {
      method: 'DELETE',
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      // Try alias route DELETE /deckbuilder/decks/history/{historyId}
      const aliasPath = `/deckbuilder/decks/history/${encodeURIComponent(historyId)}`;
      const resAlias = await apiFetch(aliasPath, {
        method: 'DELETE',
      });
      if (!resAlias.ok) {
        const errText = await resAlias.text().catch(() => '');
        console.warn(`[DeckService] ⚠️ deleteRemoteDeckHistory failed: HTTP ${resAlias.status}:`, errText);
        console.groupEnd();
        return false;
      }
    }

    console.log(`[DeckService] ✅ Successfully deleted snapshot ${historyId} (${durationMs}ms)`);
    console.groupEnd();
    return true;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    console.error(`[DeckService] ❌ Error in deleteRemoteDeckHistory (${durationMs}ms):`, err);
    console.groupEnd();
    return false;
  }
}

/**
 * Known canonical MTG split and aftermath cards (printed on a single card face with 2 castable halves).
 * For these cards, MTG APIs and parsers expect the full combined name (e.g. "Life // Death").
 * For all other multi-faced cards (MDFCs, Transform DFCs, Adventures, Flip cards),
 * APIs expect only the front face name (e.g. "Emeritus of Abundance" or "Bala Ged Recovery").
 */
export const KNOWN_SPLIT_CARDS = new Set<string>([
  "alive // well",
  "appeal // authority",
  "armed // dangerous",
  "assault // battery",
  "assure // assemble",
  "beck // call",
  "bedeck // bedazzle",
  "bind // liberate",
  "boom // bust",
  "bottomless pool // locker room",
  "bound // determined",
  "breaking // entering",
  "carnival // carnage",
  "catch // release",
  "cease // desist",
  "central elevator // promising stairs",
  "charred foyer // warped space",
  "chic // ago",
  "claim // fame",
  "collision // colossus",
  "commit // memory",
  "connive // concoct",
  "consecrate // consume",
  "consign // oblivion",
  "coward // killer",
  "cramped vents // access maze",
  "crime // punishment",
  "crude abattoir // unsavory kitchen",
  "cut // ribbons",
  "dazzling theater // prop room",
  "dead // gone",
  "defiled crypt // cadaver lab",
  "depose // deploy",
  "derelict attic // widow's walk",
  "destined // lead",
  "discovery // dispersal",
  "dollmaker's shop // porcelain gallery",
  "double jump // flying kick",
  "down // dirty",
  "driven // despair",
  "dusk // dawn",
  "expansion // explosion",
  "experimental lab // staff room",
  "failure // comply",
  "far // away",
  "farm // market",
  "fast // furious",
  "fear (split card) // loathing",
  "find // finality",
  "fire // ice",
  "flesh // blood",
  "flotsam // jetsam",
  "flower // flourish",
  "funeral room // awakening hall",
  "fuss // bother",
  "gallifrey falls // no more",
  "give // take",
  "glassworks // shattered yard",
  "grand entryway // elegant rotunda",
  "greenhouse // rickety gazebo",
  "grind // dust",
  "heaven // earth",
  "hide // seek",
  "hit // run",
  "hustle // bustle",
  "illusion // reality",
  "incubation // incongruity",
  "indulge // excess",
  "insult // injury",
  "integrity // intervention",
  "invert // invent",
  "knowing // half the battle",
  "leave // chance",
  "life // death",
  "meat locker // drowned diner",
  "mirror room // fractured realm",
  "moldering gym // weight room",
  "mouth // feed",
  "naughty // nice",
  "never // return",
  "night // day",
  "odds // ends",
  "onward // victory",
  "order // chaos",
  "pain // suffering",
  "painter's studio // defaced gallery",
  "polluted cistern // dim oubliette",
  "prepare // fight",
  "profit // loss",
  "protect // serve",
  "pure // simple",
  "push // pull",
  "rags // riches",
  "ready // willing",
  "reason // believe",
  "reduce // rubble",
  "refuse // cooperate",
  "repudiate // replicate",
  "research // development",
  "response // resurgence",
  "restricted office // lecture hall",
  "revival // revenge",
  "rise // fall",
  "road // ruin",
  "roaring furnace // steaming sauna",
  "rough // tumble",
  "said // done",
  "secret arcade // dusty parlor",
  "smelt // herd // saw",
  "smoky lounge // misty salon",
  "solitary study // endless corridor",
  "spiked corridor // torture pit",
  "spite // malice",
  "spring // mind",
  "stand // deliver",
  "start // finish",
  "start // fire",
  "status // statue",
  "struggle // survive",
  "supply // demand",
  "surgical suite // hospital room",
  "takesies // backsies",
  "there // they're // their",
  "thrash // threat",
  "ticket booth // tunnel of hate",
  "toil // trouble",
  "trial // error",
  "turn // burn",
  "underwater tunnel // slimy aquarium",
  "unholy annex // ritual chamber",
  "walk-in closet // forgotten cellar",
  "warrant // warden",
  "wax // wane",
  "wear // tear",
  "who // what // when // where // why",
  "yeah nah // nah yeah"
]);

/**
 * Checks if a card is a true MTG split or aftermath card (e.g. "Life // Death").
 */
export function isSplitCard(
  cardOrName: DeckCard | { name?: string; layout?: string; backImageUrl?: string; type_line?: string } | string
): boolean {
  if (!cardOrName) return false;

  let name = '';
  let layout = '';
  let hasBackImage = false;
  let typeLine = '';

  if (typeof cardOrName === 'string') {
    name = cardOrName;
  } else {
    name = cardOrName.name || '';
    layout = (cardOrName as any).layout || '';
    hasBackImage = !!(cardOrName as any).backImageUrl;
    typeLine = (cardOrName as any).type_line || '';
  }

  // Cards with separate physical back faces (DFCs, MDFCs) are never split cards
  if (hasBackImage) {
    return false;
  }

  // Adventure cards have type_line with "Adventure" and are not split cards
  if (typeLine.includes('Adventure')) {
    return false;
  }

  // Explicit Scryfall layout tag
  if (layout === 'split' || layout === 'aftermath') {
    return true;
  }

  // If name doesn't contain a double-slash delimiter, it's not a multi-face name at all
  if (!name.includes('//')) {
    return false;
  }

  // Check against normalized canonical split card names
  const normalized = name
    .toLowerCase()
    .replace(/\s*\/\/\s*/g, ' // ')
    .trim();

  return KNOWN_SPLIT_CARDS.has(normalized);
}

/**
 * Resolves the appropriate card name to send when formatting card lists for remote MTG APIs
 * (such as /mtgtools/createdecklist, /mtgtools/createdeckpicklist, and /mtgtools/comparefiles).
 * 
 * - If the card is a split card (like "Life // Death"), returns the full name ("Life // Death").
 * - If the card is NOT a split card (such as MDFCs, e.g. "Emeritus of Abundance // Regrowth" or
 *   "Bala Ged Recovery // Bala Ged Sanctuary"), returns strictly the front face name.
 */
export function getCardApiName(
  cardOrName: DeckCard | { name?: string; layout?: string; backImageUrl?: string; type_line?: string } | string
): string {
  if (!cardOrName) return '';

  const rawName = typeof cardOrName === 'string' ? cardOrName : (cardOrName.name || '');
  const trimmed = rawName.trim();

  if (!trimmed.includes('//')) {
    return trimmed;
  }

  if (isSplitCard(cardOrName)) {
    return trimmed;
  }

  // Not a split card: extract front face name
  const frontFace = trimmed.split(/\s*\/\/\s*/)[0].trim();
  return frontFace || trimmed;
}

/**
 * Formats a deck, snapshot, or card list into plain text card lines (qty name)
 * suitable for the C# API POST /mtgtools/comparefiles endpoint.
 * Ensures non-split multi-faced cards only send the front face name.
 */
export function formatCardsForApiComparison(
  deckOrCards: Deck | DeckHistoryItem | DeckCard[] | string
): string {
  if (typeof deckOrCards === 'string') {
    return deckOrCards
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        const match = trimmed.match(/^(\d+\s+)(.+)$/);
        if (match) {
          const qtyPrefix = match[1];
          const rawName = match[2];
          return `${qtyPrefix}${getCardApiName(rawName)}`;
        }
        return getCardApiName(trimmed);
      })
      .filter(Boolean)
      .join('\n');
  }
  let cards: DeckCard[] = [];
  if (Array.isArray(deckOrCards)) {
    cards = deckOrCards;
  } else if (deckOrCards && Array.isArray((deckOrCards as any).cards)) {
    cards = (deckOrCards as any).cards;
  }

  // Aggregate quantities by API-safe card name to handle multiple printings / entries accurately
  const cardMap = new Map<string, number>();
  for (const c of cards) {
    if (!c || !c.name || c.category === 'maybeboard') continue;
    const name = getCardApiName(c);
    if (!name) continue;
    const qty = c.quantity || 1;
    cardMap.set(name, (cardMap.get(name) || 0) + qty);
  }

  return Array.from(cardMap.entries())
    .map(([name, qty]) => `${qty} ${name}`)
    .join('\n');
}

/**
 * Formats a deck into plain text card lines suitable for /mtgtools/createdecklist
 * and /mtgtools/createdeckpicklist.
 * - Trims multi-faced card names to front face (via getCardApiName)
 * - Flags the Commander(s) as being in the Sideboard section so the C# backend recognises them
 * - Includes any regular sideboard cards under Sideboard
 * - Excludes maybeboard cards
 */
export function formatCardsForDeckListApi(deck: Deck): string {
  if (!deck || !deck.cards) return '';

  const cards = deck.cards;
  let commanderCards = cards.filter((c) => c.category === 'commander');
  let mainCards = cards.filter((c) => c.category === 'main');
  const sideCards = cards.filter((c) => c.category === 'sideboard');

  // If no card has category 'commander' explicitly set, check commanderName/commanderId
  if (commanderCards.length === 0 && (deck.commanderName || deck.commanderId)) {
    const matchingIdx = mainCards.findIndex(
      (c) =>
        (deck.commanderId && c.scryfallId === deck.commanderId) ||
        (deck.commanderName &&
          c.name.toLowerCase().trim() === deck.commanderName.toLowerCase().trim())
    );
    if (matchingIdx !== -1) {
      commanderCards = [mainCards[matchingIdx]];
      mainCards = mainCards.filter((_, idx) => idx !== matchingIdx);
    }
  }

  // Aggregate mainboard cards
  const mainMap = new Map<string, number>();
  for (const c of mainCards) {
    if (!c || !c.name || c.category === 'maybeboard') continue;
    const name = getCardApiName(c);
    if (!name) continue;
    mainMap.set(name, (mainMap.get(name) || 0) + (c.quantity || 1));
  }

  // Aggregate sideboard & commander cards
  const sideMap = new Map<string, number>();
  // Commanders first in sideboard
  for (const c of commanderCards) {
    if (!c || !c.name) continue;
    const name = getCardApiName(c);
    if (!name) continue;
    sideMap.set(name, (sideMap.get(name) || 0) + (c.quantity || 1));
  }
  for (const c of sideCards) {
    if (!c || !c.name || c.category === 'maybeboard') continue;
    const name = getCardApiName(c);
    if (!name) continue;
    sideMap.set(name, (sideMap.get(name) || 0) + (c.quantity || 1));
  }

  const lines: string[] = [];
  for (const [name, qty] of mainMap.entries()) {
    lines.push(`${qty} ${name}`);
  }

  if (sideMap.size > 0) {
    lines.push('');
    lines.push('Sideboard');
    for (const [name, qty] of sideMap.entries()) {
      lines.push(`${qty} ${name}`);
    }
  }

  return lines.join('\n');
}

/**
 * Unwraps and cleans raw diff output from /mtgtools/comparefiles, handling
 * potential JSON wrapping, escaped newlines, and surrounding quotes.
 */
export function cleanRawDiff(raw: string): string {
  if (!raw) return '';
  let str = String(raw).trim();

  // Strip UTF-8 BOM if present
  if (str.charCodeAt(0) === 0xFEFF) {
    str = str.slice(1).trim();
  }

  if (
    (str.startsWith('{') && str.endsWith('}')) ||
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith('[') && str.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'string') {
        str = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Detect backend failure payload
        if (parsed.success === false) {
          throw new Error(parsed.fileInfo || parsed.message || 'Compare Decks Failed on backend');
        }
        str =
          parsed.deckDifferences ||
          parsed.result ||
          parsed.diff ||
          parsed.data ||
          parsed.output ||
          parsed.text ||
          parsed.fileInfo ||
          str;
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Compare Decks Failed')) {
        throw e;
      }
      // not JSON or other parse error, keep as is
    }
  }

  // Handle literal escaped newlines (e.g. \r\n or \n from JSON responses)
  if (str.includes('\\n')) {
    str = str.split('\\r\\n').join('\n').split('\\n').join('\n').split('\\r').join('\n');
  }
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }

  return str.trim();
}

/**
 * Calls remote C# API POST /mtgtools/comparefiles to compare two deck iterations.
 * The endpoint expects multipart/form-data with key "files" containing 2 .txt files:
 * - files[0]: Base / older deck iteration
 * - files[1]: Target / newer deck iteration
 * 
 * Returns the raw diff output from the C# backend (e.g. [deck] ... CUTS ... ADDS ... [/deck]).
 * Throws if the API request fails (strictly no local fallback).
 */
export async function compareDeckFilesApi(
  firstFileContent: string,
  secondFileContent: string,
  firstFileName: string = 'iteration_a.txt',
  secondFileName: string = 'iteration_b.txt',
  commander?: string
): Promise<string> {
  const baseUrl = getApiBaseUrl();
  const query = commander && commander.trim() ? `?commander=${encodeURIComponent(commander.trim())}` : '';

  // Determine candidate endpoints:
  // 1. If in browser on localhost (e.g. Vite dev server on port 5173), prefer the relative Vite proxy '/mtgtools/comparefiles'
  //    because Vite's proxy avoids CORS, handles HTTPS self-signed certs automatically, and forwards to port 5205/7091.
  // 2. Direct baseUrl endpoint (e.g. http://localhost:5205/mtgtools/comparefiles or remote production).
  // 3. Fallback to relative '/mtgtools/comparefiles'.
  const candidates: string[] = [];
  const isLocalDev =
    typeof window !== 'undefined' &&
    window.location &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocalDev) {
    candidates.push(`/mtgtools/comparefiles${query}`);
  }
  if (baseUrl) {
    candidates.push(`${baseUrl.replace(/\/+$/, '')}/mtgtools/comparefiles${query}`);
  }
  if (!candidates.some((c) => c.startsWith('/mtgtools/comparefiles'))) {
    candidates.push(`/mtgtools/comparefiles${query}`);
  }

  const formData = new FormData();
  formData.append(
    'files',
    new Blob([firstFileContent], { type: 'text/plain' }),
    firstFileName.endsWith('.txt') ? firstFileName : `${firstFileName}.txt`
  );
  formData.append(
    'files',
    new Blob([secondFileContent], { type: 'text/plain' }),
    secondFileName.endsWith('.txt') ? secondFileName : `${secondFileName}.txt`
  );
  if (commander && commander.trim()) {
    formData.append('commander', commander.trim());
  }

  const start = performance.now();
  console.groupCollapsed('[DeckService] ⚖️ Calling /mtgtools/comparefiles');
  console.log('[DeckService] File 1:', firstFileName, 'Length:', firstFileContent.length);
  console.log('[DeckService] File 2:', secondFileName, 'Length:', secondFileContent.length);
  if (commander) console.log('[DeckService] Commander parameter:', commander);

  let lastError: any = null;

  for (const targetUrl of candidates) {
    try {
      console.log(`[DeckService] Attempting comparison request via: ${targetUrl}`);
      const res = await fetch(targetUrl, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[DeckService] ❌ ${targetUrl} returned HTTP ${res.status}:`, errorText);
        throw new Error(`API error (${res.status}): ${errorText || res.statusText || 'Compare Decks Failed'}`);
      }

      // Read response body robustly (supports Results.File, application/txt, octet-stream, and plain text)
      let rawOutput = '';
      try {
        const buffer = await res.arrayBuffer();
        rawOutput = new TextDecoder('utf-8').decode(buffer);
      } catch {
        rawOutput = await res.text();
      }

      if (rawOutput.charCodeAt(0) === 0xfeff) {
        rawOutput = rawOutput.slice(1);
      }

      const diffOutput = cleanRawDiff(rawOutput);
      const durationMs = Math.round(performance.now() - start);
      console.log(`[DeckService] ✅ Comparison received (${durationMs}ms), length: ${diffOutput.length}`);
      console.log('[DeckService] Diff preview:\n', diffOutput.slice(0, 500));
      console.groupEnd();
      return diffOutput;
    } catch (err: any) {
      console.warn(`[DeckService] ⚠️ Failed comparison attempt at ${targetUrl}:`, err);
      lastError = err;
    }
  }

  const durationMs = Math.round(performance.now() - start);
  console.error(`[DeckService] ❌ All candidate URLs failed (${durationMs}ms):`, lastError);
  console.groupEnd();

  const isNetworkFailure =
    lastError?.name === 'TypeError' ||
    lastError?.message?.includes('Failed to fetch') ||
    lastError?.message?.includes('NetworkError');

  if (isNetworkFailure) {
    throw new Error(
      `Unable to reach MTG API server (${candidates.join(', ')}). ` +
      `Please verify that FrostpointApi is running (e.g. on port 5205 with the 'http' profile) or check your network connection.`
    );
  }

  throw lastError || new Error('Failed to compare deck iterations via /mtgtools/comparefiles');
}

/**
 * Formats the raw diff output from /mtgtools/comparefiles into a structured
 * Deck Summary text block and parsed data model.
 */
export function formatDeckSummaryTextBlock(
  rawDiff: string,
  options?: {
    deckName?: string;
    versionAName?: string;
    versionBName?: string;
    commander?: string;
  }
): DeckComparisonSummaryResult {
  const cleanedDiff = cleanRawDiff(rawDiff);
  const lines = cleanedDiff.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentSection: 'CUTS' | 'ADDS' | '' = '';
  const cutCards: { quantity: number; name: string }[] = [];
  const addedCards: { quantity: number; name: string }[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (/^(?:CUTS?|CARDS?\s+CUT|REMOVED?|CARDS?\s+REMOVED?|DELETIONS?)(?:\s*[:(]|\b)/i.test(upper)) {
      currentSection = 'CUTS';
      continue;
    }
    if (/^(?:ADDS?|CARDS?\s+ADDED?|ADDED?|INSERTIONS?)(?:\s*[:(]|\b)/i.test(upper)) {
      currentSection = 'ADDS';
      continue;
    }

    if (line.startsWith('[/') || line.startsWith('[deck')) {
      continue;
    }

    let effectiveSection = currentSection;
    if (line.startsWith('-') || line.startsWith('–') || line.startsWith('—')) {
      effectiveSection = 'CUTS';
    } else if (line.startsWith('+')) {
      effectiveSection = 'ADDS';
    }

    const match = line.match(/^[-+*•]?\s*(\d+)\s*x?\s+(.+)$/i);
    if (match) {
      const qty = parseInt(match[1], 10);
      let name = match[2].trim();
      name = name.replace(/^\[card\]/i, '').replace(/\[\/card\]$/i, '').trim();
      name = name.replace(/^["']/, '').replace(/["']$/, '').trim();

      if (effectiveSection === 'CUTS') {
        cutCards.push({ quantity: qty, name });
      } else if (effectiveSection === 'ADDS') {
        addedCards.push({ quantity: qty, name });
      }
    } else if (effectiveSection && !line.startsWith('[') && !line.startsWith('=')) {
      let name = line.replace(/^[-+*•]\s*/, '').trim();
      name = name.replace(/^\[card\]/i, '').replace(/\[\/card\]$/i, '').trim();
      if (name) {
        if (effectiveSection === 'CUTS') {
          cutCards.push({ quantity: 1, name });
        } else if (effectiveSection === 'ADDS') {
          addedCards.push({ quantity: 1, name });
        }
      }
    }
  }

  const cutsCount = cutCards.reduce((acc, c) => acc + c.quantity, 0);
  const addsCount = addedCards.reduce((acc, c) => acc + c.quantity, 0);
  const netChange = addsCount - cutsCount;

  const deckTitle = options?.deckName || 'MTG Deck';
  const verA = options?.versionAName || 'Base Version';
  const verB = options?.versionBName || 'Target Version';
  const nowStr = new Date().toLocaleString();

  const cutsFormatted =
    cutCards.length > 0
      ? cutCards.map((c) => `- ${c.quantity} ${c.name}`).join('\n')
      : '(No cards cut)';

  const addsFormatted =
    addedCards.length > 0
      ? addedCards.map((c) => `+ ${c.quantity} ${c.name}`).join('\n')
      : '(No cards added)';

  const netStr =
    netChange > 0
      ? `+${netChange} cards`
      : netChange < 0
      ? `${netChange} cards`
      : '0 cards (even)';

  const summaryTextBlock = [
    '==================================================',
    `DECK COMPARISON: ${deckTitle}`,
    `Baseline:   ${verA}`,
    `Comparison: ${verB}`,
    `Generated:  ${nowStr}`,
    '==================================================',
    '',
    'CHANGE OVERVIEW:',
    `• Cards Added: +${addsCount}`,
    `• Cards Cut:   -${cutsCount}`,
    `• Net Change:  ${netStr}`,
    '',
    '--------------------------------------------------',
    `CUTS (${cutsCount} total):`,
    cutsFormatted,
    '',
    '--------------------------------------------------',
    `ADDS (${addsCount} total):`,
    addsFormatted,
    '==================================================',
  ].join('\n');

  return {
    rawApiOutput: cleanedDiff,
    diffText: cleanedDiff,
    summaryTextBlock,
    cutsCount,
    addsCount,
    netChange,
    cutCards,
    addedCards,
  };
}

/**
 * Compare two deck iterations via C# API POST /mtgtools/comparefiles
 * and return the structured Deck Summary result including text block.
 */
export async function compareDeckIterationsWithApi(
  iterationA: Deck | DeckHistoryItem | DeckCard[] | string,
  iterationB: Deck | DeckHistoryItem | DeckCard[] | string,
  options?: {
    deckName?: string;
    versionAName?: string;
    versionBName?: string;
    commander?: string;
  }
): Promise<DeckComparisonSummaryResult> {
  const contentA = formatCardsForApiComparison(iterationA);
  const contentB = formatCardsForApiComparison(iterationB);

  const safeNameA = (options?.versionAName || 'iteration_a').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const safeNameB = (options?.versionBName || 'iteration_b').replace(/[^a-zA-Z0-9_-]+/g, '_');

  // Auto-detect or use explicit commander parameter
  const resolvedCommander =
    options?.commander ||
    (typeof iterationB === 'object' && iterationB !== null ? (iterationB as any).commanderName : undefined) ||
    (typeof iterationA === 'object' && iterationA !== null ? (iterationA as any).commanderName : undefined) ||
    (() => {
      const cardsB = Array.isArray(iterationB) ? iterationB : (iterationB as any)?.cards;
      if (Array.isArray(cardsB)) {
        const cmdrCard = cardsB.find((c: any) => c.category === 'commander');
        if (cmdrCard?.name) return cmdrCard.name;
      }
      const cardsA = Array.isArray(iterationA) ? iterationA : (iterationA as any)?.cards;
      if (Array.isArray(cardsA)) {
        const cmdrCard = cardsA.find((c: any) => c.category === 'commander');
        if (cmdrCard?.name) return cmdrCard.name;
      }
      return undefined;
    })();

  const rawDiff = await compareDeckFilesApi(contentA, contentB, `${safeNameA}.txt`, `${safeNameB}.txt`, resolvedCommander);
  return formatDeckSummaryTextBlock(rawDiff, options);
}

export const compareDecks = compareDeckIterationsWithApi;
export const CompareDecks = compareDeckIterationsWithApi;

export async function getRemoteBinders(): Promise<Binder[]> {
  const start = performance.now();
  console.groupCollapsed(`[DeckService] 📡 Fetching binders`);

  try {
    const res = await apiFetch('/deckbuilder/binders');
    const durationMs = Math.round(performance.now() - start);

    console.log(`[DeckService] Response status: ${res.status} ${res.statusText} (${durationMs}ms)`);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[DeckService] ⚠️ getRemoteBinders returned HTTP ${res.status}:`, errText);
      console.groupEnd();
      return [];
    }

    const rawText = await res.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[DeckService] ❌ Failed to parse binder JSON response:', parseErr, { rawTextPreview: rawText.slice(0, 300) });
      console.groupEnd();
      return [];
    }

    if (!Array.isArray(data)) {
      console.warn('[DeckService] ⚠️ getRemoteBinders returned non-array payload:', data);
      console.groupEnd();
      return [];
    }

    const normalizedBinders: Binder[] = data.map((b: any) => ({
      ...b,
      id: b.id || b.Id || b.binderId || b.BinderId || '',
      name: b.name || b.Name || 'Main Binder',
      description: b.description ?? b.Description,
      coverCardUrl: b.coverCardUrl ?? b.CoverCardUrl,
      createdAt: parseTimestamp(b.createdAt ?? b.CreatedAt),
      updatedAt: parseTimestamp(b.updatedAt ?? b.UpdatedAt),
      cards: (b.cards || b.Cards || []).map(normalizeBinderCard),
    }));

    console.log(`[DeckService] ✅ Loaded ${normalizedBinders.length} binder(s) from server (${durationMs}ms):`, normalizedBinders.map((b: any) => ({
      id: b.id,
      name: b.name,
      cardCount: b.cards?.reduce((sum: number, c: any) => sum + (c.quantity || 1), 0) || 0,
      vaultId: (b as any).vaultId ?? '(none/null)',
      userId: (b as any).userId ?? '(none/null)',
    })));

    console.groupEnd();
    return normalizedBinders;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    console.warn(`[DeckService] ⚠️ Network/Fetch error in getRemoteBinders (${durationMs}ms) - using local fallback:`, err);
    console.groupEnd();
    return [];
  }
}

/**
 * Save/upsert binder to remote C# API (POST /deckbuilder/binders)
 */
export async function saveRemoteBinder(binder: Binder): Promise<boolean> {
  const preparedCards = (binder.cards || []).map((c) => {
    const typeLine = c.type_line || (c as any).typeLine || (c as any).TypeLine || '';
    const manaCost = c.mana_cost || (c as any).manaCost || (c as any).ManaCost || '';
    const setName = c.setName || c.set_name || (c as any).SetName || '';
    const collectorNumber = c.collectorNumber || c.collector_number || (c as any).CollectorNumber || '';
    const colorIdentity = c.color_identity || (c as any).colorIdentity || (c as any).ColorIdentity || [];
    return {
      ...c,
      type_line: typeLine,
      typeLine,
      mana_cost: manaCost,
      manaCost,
      set_name: setName,
      setName,
      collector_number: collectorNumber,
      collectorNumber,
      color_identity: colorIdentity,
      colorIdentity,
    };
  });

  const preparedBinder = {
    ...binder,
    cards: preparedCards,
  };

  const start = performance.now();
  console.log(`[DeckService] 💾 Saving binder "${binder.name}" (${binder.id})...`, {
    binderId: binder.id,
    name: binder.name,
    cardCount: preparedCards.reduce((sum, c) => sum + (c.quantity || 1), 0),
  });

  try {
    const res = await apiFetch('/deckbuilder/binders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preparedBinder),
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DeckService] ❌ Failed to save binder: HTTP ${res.status} ${res.statusText} (${durationMs}ms)`, {
        errorBody: errText,
        binderId: binder.id,
      });
      return false;
    }
    console.log(`[DeckService] ✅ Successfully saved binder "${binder.name}" (${durationMs}ms)`);
    return true;
  } catch (err) {
    console.error('[DeckService] ❌ Error saving remote binder:', err);
    return false;
  }
}

/**
 * Delete binder from remote C# API (DELETE /deckbuilder/binders/{id})
 */
export async function deleteRemoteBinder(binderId: string): Promise<boolean> {
  const start = performance.now();
  console.log(`[DeckService] 🗑️ Deleting binder ${binderId}...`);

  try {
    const res = await apiFetch(`/deckbuilder/binders/${encodeURIComponent(binderId)}`, {
      method: 'DELETE',
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DeckService] ❌ Failed to delete binder: HTTP ${res.status} ${res.statusText} (${durationMs}ms)`, {
        errorBody: errText,
        binderId,
      });
      return false;
    }
    console.log(`[DeckService] ✅ Successfully deleted binder ${binderId} (${durationMs}ms)`);
    return true;
  } catch (err) {
    console.error('[DeckService] ❌ Error deleting remote binder:', err);
    return false;
  }
}

// ============================================================================
// Reactive In-Memory Store & State Manager (DeckService)
// ============================================================================

/**
 * Deck & Collection Service
 * Maintains reactive in-memory state and syncs directly with remote C# Web API.
 */
/**
 * Calls remote C# API GET /mtgtools/getbbcode to retrieve generated BBCode markup.
 * @param color The MTG color or color combination name (e.g. 'Izzet', 'Esper', 'White', 'Colorless')
 * @param bbCodeType 1 = DeckUpdate, 2 = SetReviews, 3 = GameSummary
 */
export async function getRemoteBBCode(color: string, bbCodeType: number = 3): Promise<string> {
  const res = await apiFetch('/mtgtools/getbbcode', {
    method: 'GET',
    query: { color, bbCodeType },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`API error (${res.status}): ${errorText || res.statusText}`);
  }

  let text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') text = parsed;
  } catch {
    // raw string
  }
  return text;
}

export class DeckService {
  private static statusListeners: Set<(status: SyncStatus, error?: string) => void> = new Set();
  private static currentStatus: SyncStatus = 'syncing';
  private static deckListeners: Set<(decks: Deck[]) => void> = new Set();
  private static colListeners: Set<(cards: CollectionCard[]) => void> = new Set();
  private static binderListeners: Set<(binders: Binder[]) => void> = new Set();

  private static inMemoryDecks: Deck[] = [];
  private static inMemoryBinders: Binder[] = [];
  private static inMemoryDeckHistory: Map<string, DeckHistoryItem[]> = new Map();
  private static hasInitialized = false;

  private static unsavedDeckIds: Set<string> = new Set();
  private static unsavedListeners: Set<(unsavedIds: Set<string>) => void> = new Set();
  private static lastSavedDecks: Map<string, Deck> = new Map();

  private static getCacheKey(type: 'decks' | 'binders'): string {
    const user = AuthService.getCurrentUser();
    const id = user?.userId || user?.username || 'guest';
    return `mtg_cached_${type}_${id}`;
  }

  private static loadCachedState() {
    if (typeof window === 'undefined') return;
    try {
      const decksKey = this.getCacheKey('decks');
      const rawDecks = localStorage.getItem(decksKey);
      if (rawDecks && this.inMemoryDecks.length === 0) {
        const parsed = JSON.parse(rawDecks);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[DeckService] ⚡ Loaded ${parsed.length} cached deck(s) from localStorage.`);
          this.inMemoryDecks = parsed.map(normalizeDeck);
          for (const d of this.inMemoryDecks) {
            if (!this.lastSavedDecks.has(d.id)) {
              this.lastSavedDecks.set(d.id, JSON.parse(JSON.stringify(d)));
            }
          }
        }
      }

      const bindersKey = this.getCacheKey('binders');
      const rawBinders = localStorage.getItem(bindersKey);
      if (rawBinders && this.inMemoryBinders.length === 0) {
        const parsedB = JSON.parse(rawBinders);
        if (Array.isArray(parsedB) && parsedB.length > 0) {
          this.inMemoryBinders = parsedB.map((b: any) => ({
            ...b,
            cards: (b.cards || []).map(normalizeBinderCard),
          }));
        }
      }
    } catch (e) {
      console.warn('[DeckService] Error reading cached library:', e);
    }
  }

  public static persistDecksToCache(decks: Deck[]) {
    if (typeof window === 'undefined') return;
    try {
      const key = this.getCacheKey('decks');
      localStorage.setItem(key, JSON.stringify(decks));
    } catch {}
  }

  public static persistBindersToCache(binders: Binder[]) {
    if (typeof window === 'undefined') return;
    try {
      const key = this.getCacheKey('binders');
      localStorage.setItem(key, JSON.stringify(binders));
    } catch {}
  }

  static onSyncStatusChange(callback: (status: SyncStatus, error?: string) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.currentStatus);
    return () => this.statusListeners.delete(callback);
  }

  private static setStatus(status: SyncStatus, error?: string) {
    this.currentStatus = status;
    this.statusListeners.forEach((fn) => fn(status, error));
  }

  public static getStatus(): SyncStatus {
    return this.currentStatus;
  }

  /**
   * Helper to derive flat collection from all binders
   */
  private static getCollectionFromBinders(binders: Binder[]): CollectionCard[] {
    return binders.flatMap((b) => (b.cards || []).map((c) => ({
      ...c,
      binderId: c.binderId || b.id,
    })));
  }

  private static notifyDecks() {
    this.inMemoryDecks.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    console.log(`[DeckService] 📢 Notifying ${this.deckListeners.size} deck listener(s) with ${this.inMemoryDecks.length} deck(s).`);
    this.deckListeners.forEach((cb) => cb([...this.inMemoryDecks]));
  }

  private static notifyBinders() {
    this.inMemoryBinders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    console.log(`[DeckService] 📢 Notifying ${this.binderListeners.size} binder listener(s) with ${this.inMemoryBinders.length} binder(s).`);
    this.binderListeners.forEach((cb) => cb([...this.inMemoryBinders]));
    const col = this.getCollectionFromBinders(this.inMemoryBinders);
    this.colListeners.forEach((cb) => cb(col));
  }

  private static notifyUnsavedChanges() {
    const copy = new Set(this.unsavedDeckIds);
    this.unsavedListeners.forEach((cb) => {
      try {
        cb(copy);
      } catch (err) {
        console.error('[DeckService] Error in unsaved listener:', err);
      }
    });
  }

  /**
   * Check if a deck has pending unsaved changes in memory.
   */
  static hasUnsavedChanges(deckId: string): boolean {
    return this.unsavedDeckIds.has(deckId);
  }

  /**
   * Explicitly set or clear the unsaved status of a deck.
   */
  static setDeckHasUnsavedChanges(deckId: string, hasUnsaved: boolean): void {
    if (hasUnsaved) {
      this.unsavedDeckIds.add(deckId);
    } else {
      this.unsavedDeckIds.delete(deckId);
    }
    this.notifyUnsavedChanges();
  }

  /**
   * Clear all unsaved statuses (or for a specific deck).
   */
  static clearUnsavedChanges(deckId?: string): void {
    if (deckId) {
      this.unsavedDeckIds.delete(deckId);
    } else {
      this.unsavedDeckIds.clear();
    }
    this.notifyUnsavedChanges();
  }

  /**
   * Revert an in-memory deck back to its last saved remote state.
   */
  static getLastSavedDeck(deckId: string): Deck | undefined {
    return this.lastSavedDecks.get(deckId);
  }

  static setLastSavedDeck(deck: Deck): void {
    if (!deck?.id) return;
    this.lastSavedDecks.set(deck.id, JSON.parse(JSON.stringify(deck)));
  }

  static revertDeck(deckId: string): Deck | null {
    const original = this.lastSavedDecks.get(deckId);
    if (original) {
      const cloned = JSON.parse(JSON.stringify(original));
      const idx = this.inMemoryDecks.findIndex((d) => d.id === deckId);
      if (idx >= 0) {
        this.inMemoryDecks[idx] = cloned;
      }
      this.unsavedDeckIds.delete(deckId);
      this.notifyDecks();
      this.notifyUnsavedChanges();
      return cloned;
    }
    // If it was never saved to remote (brand new draft deck discarded by user), remove from in-memory decks
    this.inMemoryDecks = this.inMemoryDecks.filter((d) => d.id !== deckId);
    this.unsavedDeckIds.delete(deckId);
    this.notifyDecks();
    this.notifyUnsavedChanges();
    return null;
  }

  /**
   * Subscribe to changes in the unsaved deck IDs set.
   */
  static subscribeUnsavedChanges(onUpdate: (unsavedIds: Set<string>) => void): Unsubscribe {
    this.unsavedListeners.add(onUpdate);
    onUpdate(new Set(this.unsavedDeckIds));
    return () => {
      this.unsavedListeners.delete(onUpdate);
    };
  }

  /**
   * Fetch all decks and binders from the remote API
   */
  public static async syncWithRemote(): Promise<void> {
    if (!AuthService.isLoggedIn()) {
      console.log('[DeckService] User is not logged in. Operating in local guest mode.');
      this.setStatus('synced');
      return;
    }
    console.log('[DeckService] 🔄 Starting syncWithRemote()...');
    this.setStatus('syncing');

    try {
      // Unblock decks from binders: update and render decks immediately as soon as getRemoteDecks resolves!
      const decksPromise = getRemoteDecks().then((remoteDecks) => {
        this.inMemoryDecks = remoteDecks;
        this.lastSavedDecks.clear();
        for (const d of remoteDecks) {
          this.lastSavedDecks.set(d.id, JSON.parse(JSON.stringify(d)));
        }
        this.unsavedDeckIds.clear();
        this.notifyUnsavedChanges();
        this.persistDecksToCache(remoteDecks);
        this.notifyDecks();
        console.log(`[DeckService] ⚡ Decks retrieved and notified immediately (${remoteDecks.length} deck(s)).`);
        return remoteDecks;
      });

      const bindersPromise = getRemoteBinders().then((remoteBinders) => {
        this.inMemoryBinders = remoteBinders.length > 0 ? remoteBinders : [DEFAULT_BINDER];
        this.persistBindersToCache(this.inMemoryBinders);
        this.notifyBinders();
        console.log(`[DeckService] ⚡ Binders retrieved and notified (${this.inMemoryBinders.length} binder(s)).`);
        return remoteBinders;
      });

      await Promise.all([decksPromise, bindersPromise]);
      this.setStatus('synced');
      console.log('[DeckService] ✅ syncWithRemote complete. All library data synced.');
    } catch (e: any) {
      console.error('[DeckService] ❌ Error syncing with remote API:', e);
      this.setStatus('offline', e?.message);
    }
  }

  private static initSync() {
    this.loadCachedState();
    if (this.hasInitialized) return;
    this.hasInitialized = true;
    this.syncWithRemote();
  }

  static subscribeDecks(onUpdate: (decks: Deck[]) => void): Unsubscribe {
    this.loadCachedState();
    this.deckListeners.add(onUpdate);
    console.log(`[DeckService] 📥 Subscribed new deck listener (total: ${this.deckListeners.size}). Initializing with ${this.inMemoryDecks.length} cached deck(s).`);
    onUpdate([...this.inMemoryDecks]);
    this.initSync();

    return () => {
      this.deckListeners.delete(onUpdate);
      console.log(`[DeckService] 📤 Unsubscribed deck listener (remaining: ${this.deckListeners.size}).`);
    };
  }

  static subscribeBinders(onUpdate: (binders: Binder[]) => void): Unsubscribe {
    this.binderListeners.add(onUpdate);
    console.log(`[DeckService] 📥 Subscribed new binder listener (total: ${this.binderListeners.size}). Initializing with ${this.inMemoryBinders.length} cached binder(s).`);
    onUpdate([...this.inMemoryBinders]);
    this.initSync();

    return () => {
      this.binderListeners.delete(onUpdate);
      console.log(`[DeckService] 📤 Unsubscribed binder listener (remaining: ${this.binderListeners.size}).`);
    };
  }

  static subscribeCollection(onUpdate: (cards: CollectionCard[]) => void): Unsubscribe {
    this.colListeners.add(onUpdate);
    onUpdate(this.getCollectionFromBinders(this.inMemoryBinders));
    this.initSync();

    return () => {
      this.colListeners.delete(onUpdate);
    };
  }

  static getLocalDecks(): Deck[] {
    return [...this.inMemoryDecks].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    );
  }

  static getLocalBinders(): Binder[] {
    return [...this.inMemoryBinders].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    );
  }

  static getLocalCollection(): CollectionCard[] {
    return this.getCollectionFromBinders(this.inMemoryBinders);
  }

  /**
   * Update in-memory deck state without persisting/archiving to the remote API.
   * Use this for working draft changes (card additions, removals, quantity changes)
   * until the user explicitly commits a save.
   */
  static updateDeckInMemory(deck: Deck): void {
    const normalized = normalizeDeck(deck);
    const idx = this.inMemoryDecks.findIndex((d) => d.id === normalized.id);
    if (idx >= 0) {
      this.inMemoryDecks[idx] = { ...normalized };
    } else {
      this.inMemoryDecks.unshift({ ...normalized });
    }
    this.unsavedDeckIds.add(normalized.id);
    this.notifyDecks();
    this.notifyUnsavedChanges();
  }

  /**
   * Update deck metadata (like card gamechanger flags or types) in-memory without marking unsaved.
   */
  static updateDeckMetadataInMemory(deck: Deck): void {
    const normalized = normalizeDeck(deck);
    const idx = this.inMemoryDecks.findIndex((d) => d.id === normalized.id);
    if (idx >= 0) {
      this.inMemoryDecks[idx] = { ...normalized };
    } else {
      this.inMemoryDecks.unshift({ ...normalized });
    }
    this.lastSavedDecks.set(normalized.id, JSON.parse(JSON.stringify(normalized)));
    this.unsavedDeckIds.delete(normalized.id);
    this.notifyDecks();
    this.notifyUnsavedChanges();
  }

  /**
   * Save or update a Deck on the remote server.
   * Commits the current iteration and triggers an archived history snapshot on the backend.
   */
  static async saveDeck(deck: Deck): Promise<boolean> {
    const updated: Deck = normalizeDeck({
      ...deck,
      updatedAt: Date.now(),
    });

    const idx = this.inMemoryDecks.findIndex((d) => d.id === updated.id);
    if (idx >= 0) {
      const existing = this.inMemoryDecks[idx];
      if (existing && existing.cards && existing.cards.length > 0) {
        const snapshotId = `deckhist-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const historyItem: DeckHistoryItem = {
          id: snapshotId,
          historyId: snapshotId,
          deckId: existing.id,
          name: existing.name,
          description: existing.description,
          format: existing.format,
          commanderId: existing.commanderId,
          commanderName: existing.commanderName,
          commanderArtUrl: existing.commanderArtUrl,
          commanderColorIdentity: existing.commanderColorIdentity,
          coverCardUrl: existing.coverCardUrl,
          mtgNexusEditThreadUrl: existing.mtgNexusEditThreadUrl,
          totalCards: (existing.cards || []).filter((c) => (c.category || 'main').toLowerCase() !== 'maybeboard').reduce((s, c) => s + (c.quantity || 1), 0),
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          archivedAt: Date.now(),
          cards: JSON.parse(JSON.stringify(existing.cards)),
        };
        const currentHist = this.inMemoryDeckHistory.get(existing.id) || [];
        this.inMemoryDeckHistory.set(existing.id, [historyItem, ...currentHist]);
      }
      this.inMemoryDecks[idx] = updated;
    } else {
      this.inMemoryDecks.unshift(updated);
    }
    this.notifyDecks();

    this.setStatus('syncing');
    const ok = await saveRemoteDeck(updated);
    if (ok) {
      this.lastSavedDecks.set(updated.id, JSON.parse(JSON.stringify(updated)));
      this.unsavedDeckIds.delete(updated.id);
      this.notifyUnsavedChanges();
      this.clearDeckFormatCache(updated.id);
      this.persistDecksToCache(this.inMemoryDecks);
      this.setStatus('synced');
    } else {
      this.setStatus('offline');
    }
    return ok;
  }

  /**
   * Delete a deck from the remote server
   */
  static async deleteDeck(deckId: string): Promise<void> {
    this.clearDeckFormatCache(deckId);
    this.unsavedDeckIds.delete(deckId);
    this.lastSavedDecks.delete(deckId);
    this.notifyUnsavedChanges();
    this.inMemoryDecks = this.inMemoryDecks.filter((d) => d.id !== deckId);
    this.persistDecksToCache(this.inMemoryDecks);
    this.notifyDecks();

    this.setStatus('syncing');
    const ok = await deleteRemoteDeck(deckId);
    if (ok) {
      this.setStatus('synced');
    } else {
      this.setStatus('offline');
    }
  }

  /**
   * Save or update a Binder on the remote server
   */
  static async saveBinder(binder: Binder): Promise<void> {
    const updated: Binder = {
      ...binder,
      cards: binder.cards || [],
      updatedAt: Date.now(),
    };

    const idx = this.inMemoryBinders.findIndex((b) => b.id === updated.id);
    if (idx >= 0) {
      this.inMemoryBinders[idx] = updated;
    } else {
      this.inMemoryBinders.unshift(updated);
    }
    this.notifyBinders();

    this.setStatus('syncing');
    const ok = await saveRemoteBinder(updated);
    if (ok) {
      this.setStatus('synced');
    } else {
      this.setStatus('offline');
    }
  }

  /**
   * Create a new Binder
   */
  static async createBinder(name: string, description?: string): Promise<Binder> {
    const newBinder: Binder = {
      id: `binder-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: name.trim(),
      description: description?.trim() || '',
      cards: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.saveBinder(newBinder);
    return newBinder;
  }

  /**
   * Delete a binder from the remote server
   */
  static async deleteBinder(binderId: string): Promise<void> {
    this.inMemoryBinders = this.inMemoryBinders.filter((b) => b.id !== binderId);
    this.notifyBinders();

    this.setStatus('syncing');
    const ok = await deleteRemoteBinder(binderId);
    if (ok) {
      this.setStatus('synced');
    } else {
      this.setStatus('offline');
    }
  }

  /**
   * Add or update a card inside its binder
   */
  static async saveCollectionCard(card: CollectionCard): Promise<void> {
    let targetBinder = this.inMemoryBinders.find((b) => b.id === (card.binderId || 'binder-main'));
    if (!targetBinder) {
      if (this.inMemoryBinders.length > 0) {
        targetBinder = this.inMemoryBinders[0];
      } else {
        targetBinder = await this.createBinder('Main Binder', 'Primary collection binder');
      }
    }

    const currentCards = [...(targetBinder.cards || [])];
    const idx = currentCards.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      currentCards[idx] = card;
    } else {
      currentCards.unshift(card);
    }

    const updatedBinder: Binder = {
      ...targetBinder,
      cards: currentCards,
      cardCount: currentCards.reduce((acc, c) => acc + c.quantity, 0),
      updatedAt: Date.now(),
    };

    await this.saveBinder(updatedBinder);
  }

  /**
   * Remove a card from its binder
   */
  static async deleteCollectionCard(cardId: string): Promise<void> {
    for (const binder of this.inMemoryBinders) {
      const cards = binder.cards || [];
      if (cards.some((c) => c.id === cardId)) {
        const updatedCards = cards.filter((c) => c.id !== cardId);
        const updatedBinder: Binder = {
          ...binder,
          cards: updatedCards,
          cardCount: updatedCards.reduce((acc, c) => acc + c.quantity, 0),
          updatedAt: Date.now(),
        };
        await this.saveBinder(updatedBinder);
        break;
      }
    }
  }

  /**
   * Real-time refresh prices for all cards in a deck via Scryfall batch lookup
   */
  static async refreshDeckPrices(deck: Deck): Promise<Deck> {
    const scryfallIds = deck.cards.map((c) => c.scryfallId).filter(Boolean);
    if (scryfallIds.length === 0) return deck;

    this.setStatus('syncing');
    const priceMap = await fetchBatchCardPrices(scryfallIds);

    const updatedCards: DeckCard[] = deck.cards.map((card) => {
      const fresh = priceMap.get(card.scryfallId);
      if (fresh) {
        return {
          ...card,
          priceUsd: fresh.usd ?? card.priceUsd,
          priceUsdFoil: fresh.usdFoil ?? card.priceUsdFoil,
        };
      }
      return card;
    });

    const updatedDeck: Deck = {
      ...deck,
      cards: updatedCards,
      updatedAt: Date.now(),
    };

    await this.saveDeck(updatedDeck);
    return updatedDeck;
  }

  /**
   * Real-time refresh prices for all cards in binders
   */
  static async refreshCollectionPrices(cards: CollectionCard[]): Promise<CollectionCard[]> {
    const scryfallIds = cards.map((c) => c.scryfallId).filter(Boolean);
    if (scryfallIds.length === 0) return cards;

    this.setStatus('syncing');
    const priceMap = await fetchBatchCardPrices(scryfallIds);

    for (const binder of this.inMemoryBinders) {
      if (!binder.cards || binder.cards.length === 0) continue;
      let hasChanges = false;
      const updatedCards = binder.cards.map((item) => {
        const fresh = priceMap.get(item.scryfallId);
        if (fresh) {
          const freshPrice = item.isFoil
            ? (fresh.usdFoil !== undefined ? fresh.usdFoil : fresh.usd)
            : (fresh.usd !== undefined ? fresh.usd : fresh.usdFoil);
          if (freshPrice !== undefined && freshPrice > 0) {
            if (freshPrice !== item.currentPriceUsd || fresh.isEstimated !== item.isPriceEstimated) {
              hasChanges = true;
              return {
                ...item,
                currentPriceUsd: freshPrice,
                medianPriceUsd: fresh.isEstimated ? freshPrice : item.medianPriceUsd,
                isPriceEstimated: fresh.isEstimated,
              };
            }
          }
        } else if (!item.currentPriceUsd || item.currentPriceUsd === 0) {
          const knownMedian = getKnownMedianPrice(item.name);
          if (knownMedian && knownMedian > 0) {
            hasChanges = true;
            return {
              ...item,
              currentPriceUsd: knownMedian,
              medianPriceUsd: knownMedian,
              isPriceEstimated: true,
            };
          }
        }
        return item;
      });

      if (hasChanges) {
        await this.saveBinder({
          ...binder,
          cards: updatedCards,
          updatedAt: Date.now(),
        });
      }
    }

    return this.getLocalCollection();
  }

  private static deckListCache = new Map<string, string>();
  private static pickListCache = new Map<string, string>();
  private static deckListInFlight = new Map<string, Promise<string>>();
  private static pickListInFlight = new Map<string, Promise<string>>();

  private static getDeckCacheKey(deck: Deck): string {
    const cardSummary = (deck.cards || [])
      .filter((c) => c.category !== 'maybeboard')
      .map((c) => `${getCardApiName(c)}:${c.quantity}:${c.category}`)
      .sort()
      .join('|');
    return `${deck.id || 'deck'}::${deck.name}::${cardSummary}`;
  }

  static clearDeckFormatCache(deckId?: string): void {
    if (deckId) {
      for (const key of this.deckListCache.keys()) {
        if (key.startsWith(`${deckId}::`)) this.deckListCache.delete(key);
      }
      for (const key of this.pickListCache.keys()) {
        if (key.startsWith(`${deckId}::`)) this.pickListCache.delete(key);
      }
    } else {
      this.deckListCache.clear();
      this.pickListCache.clear();
    }
  }

  /**
   * Request remote BBCode layout from /mtgtools/createdecklist
   */
  static async createDeckList(deck: Deck, forceRefresh = false): Promise<string> {
    const key = this.getDeckCacheKey(deck);
    if (!forceRefresh && this.deckListCache.has(key)) {
      return this.deckListCache.get(key)!;
    }
    if (!forceRefresh && this.deckListInFlight.has(key)) {
      return this.deckListInFlight.get(key)!;
    }

    const promise = (async () => {
      try {
        const result = await createDeckListApi(deck);
        this.deckListCache.set(key, result);
        return result;
      } finally {
        this.deckListInFlight.delete(key);
      }
    })();

    this.deckListInFlight.set(key, promise);
    return promise;
  }

  /**
   * Request remote physical picklist layout from /mtgtools/createdeckpicklist
   */
  static async createDeckPickList(deck: Deck, forceRefresh = false): Promise<string> {
    const key = this.getDeckCacheKey(deck);
    if (!forceRefresh && this.pickListCache.has(key)) {
      return this.pickListCache.get(key)!;
    }
    if (!forceRefresh && this.pickListInFlight.has(key)) {
      return this.pickListInFlight.get(key)!;
    }

    const promise = (async () => {
      try {
        const result = await createDeckPickListApi(deck);
        this.pickListCache.set(key, result);
        return result;
      } finally {
        this.pickListInFlight.delete(key);
      }
    })();

    this.pickListInFlight.set(key, promise);
    return promise;
  }

  /**
   * Preload both decklist (BBCode) and picklist via API for current deck.
   * Strictly only loads for current decks, never for historical iterations.
   */
  static async preloadDeckFormats(
    deck: Deck,
    isHistorical: boolean = false
  ): Promise<{ deckList?: string; pickList?: string }> {
    if (isHistorical || !deck || !deck.cards || deck.cards.length === 0) {
      return {};
    }
    const [deckListRes, pickListRes] = await Promise.allSettled([
      this.createDeckList(deck),
      this.createDeckPickList(deck),
    ]);
    return {
      deckList: deckListRes.status === "fulfilled" ? deckListRes.value : undefined,
      pickList: pickListRes.status === "fulfilled" ? pickListRes.value : undefined,
    };
  }

  /**
   * Fetch all archived iterations for a deck in descending order of ArchivedAt
   * GET /deckbuilder/decks/{id}/history (or alias GET /deckbuilder/decks/history/{id})
   */
  static async getDeckHistory(deckId: string, useAliasRoute = false): Promise<DeckHistoryItem[]> {
    const remote = await getRemoteDeckHistory(deckId, useAliasRoute);
    if (remote && remote.length > 0) {
      return remote;
    }
    return this.inMemoryDeckHistory.get(deckId) || [];
  }

  /**
   * Fetch a specific history snapshot by deck ID and history ID
   * GET /deckbuilder/decks/{id}/history/{historyId}
   */
  static async getDeckHistorySnapshot(deckId: string, historyId: string): Promise<DeckHistoryItem | null> {
    return getRemoteDeckHistorySnapshot(deckId, historyId);
  }

  /**
   * Revert a deck to a previous historical iteration snapshot.
   * Restores the snapshot cards, metadata, and commits it as the active deck.
   */
  static async revertToIteration(deckId: string, historyId: string): Promise<Deck | null> {
    const snapshot = await this.getDeckHistorySnapshot(deckId, historyId);
    if (!snapshot) {
      throw new Error(`Historical snapshot ${historyId} not found`);
    }

    const currentDeck = this.inMemoryDecks.find((d) => d.id === deckId);
    if (!currentDeck) {
      throw new Error(`Deck ${deckId} not found in memory`);
    }

    const restoredDeck: Deck = normalizeDeck({
      ...currentDeck,
      cards: snapshot.cards || [],
      commanderName: snapshot.commanderName !== undefined ? snapshot.commanderName : currentDeck.commanderName,
      commanderArtUrl: snapshot.commanderArtUrl !== undefined ? snapshot.commanderArtUrl : currentDeck.commanderArtUrl,
      commanderId: snapshot.commanderId !== undefined ? snapshot.commanderId : currentDeck.commanderId,
      commanderColorIdentity: snapshot.commanderColorIdentity !== undefined ? snapshot.commanderColorIdentity : currentDeck.commanderColorIdentity,
      format: (snapshot.format as MTGFormat) || currentDeck.format,
      updatedAt: Date.now(),
    });

    this.updateDeckInMemory(restoredDeck);
    await this.saveDeck(restoredDeck);
    return restoredDeck;
  }

  /**
   * Delete a specific historical iteration snapshot from Turso DB and memory
   * DELETE /deckbuilder/decks/{id}/history/{historyId}
   */
  static async deleteDeckHistory(deckId: string, historyId: string): Promise<boolean> {
    const inMem = this.inMemoryDeckHistory.get(deckId) || [];
    this.inMemoryDeckHistory.set(
      deckId,
      inMem.filter((h) => (h.id || h.historyId) !== historyId && h.historyId !== historyId && h.id !== historyId)
    );
    return deleteRemoteDeckHistory(deckId, historyId);
  }

  /**
   * Compare two deck iterations using remote API /mtgtools/comparefiles
   * and returns the generated Deck Summary text block and parsed diff.
   */
  static async compareDeckIterations(
    iterationA: Deck | DeckHistoryItem | DeckCard[] | string,
    iterationB: Deck | DeckHistoryItem | DeckCard[] | string,
    options?: {
      deckName?: string;
      versionAName?: string;
      versionBName?: string;
      commander?: string;
    }
  ): Promise<DeckComparisonSummaryResult> {
    return compareDeckIterationsWithApi(iterationA, iterationB, options);
  }

  /**
   * Compare two deck iterations (CompareDecks) using remote API /mtgtools/comparefiles
   * with optional Commander parameter passed in.
   */
  static async compareDecks(
    iterationA: Deck | DeckHistoryItem | DeckCard[] | string,
    iterationB: Deck | DeckHistoryItem | DeckCard[] | string,
    options?: {
      deckName?: string;
      versionAName?: string;
      versionBName?: string;
      commander?: string;
    }
  ): Promise<DeckComparisonSummaryResult> {
    return compareDeckIterationsWithApi(iterationA, iterationB, options);
  }

  static async CompareDecks(
    iterationA: Deck | DeckHistoryItem | DeckCard[] | string,
    iterationB: Deck | DeckHistoryItem | DeckCard[] | string,
    options?: {
      deckName?: string;
      versionAName?: string;
      versionBName?: string;
      commander?: string;
    }
  ): Promise<DeckComparisonSummaryResult> {
    return compareDeckIterationsWithApi(iterationA, iterationB, options);
  }

  /**
   * Resolves card name for API requests: preserves full name for split cards (Life // Death),
   * but sends only front face for non-split cards (Emeritus of Abundance).
   */
  static getCardApiName(
    cardOrName: DeckCard | { name?: string; layout?: string; backImageUrl?: string; type_line?: string } | string
  ): string {
    return getCardApiName(cardOrName);
  }

  /**
   * Checks if a card is an MTG split card (Life // Death).
   */
  static isSplitCard(
    cardOrName: DeckCard | { name?: string; layout?: string; backImageUrl?: string; type_line?: string } | string
  ): boolean {
    return isSplitCard(cardOrName);
  }

  static normalizeCard(card: any): DeckCard {
    return normalizeCard(card);
  }

  static normalizeDeck(deck: any): Deck {
    return normalizeDeck(deck);
  }

  static normalizeBinderCard(card: any): CollectionCard {
    return normalizeBinderCard(card);
  }

  static async enrichDeckCards(deck: Deck): Promise<Deck> {
    return enrichDeckCards(deck);
  }

  /**
   * Request BBCode markup from /mtgtools/getbbcode
   * @param color The MTG color or color combination name (e.g. 'Izzet', 'White', 'Colorless')
   * @param bbCodeType 1 = DeckUpdate, 2 = SetReviews, 3 = GameSummary (default: 3)
   */
  static async getBBCode(color: string, bbCodeType: number = 3): Promise<string> {
    return getRemoteBBCode(color, bbCodeType);
  }

  /**
   * Resolve canonical deck color name (e.g. 'Izzet', 'Azorius', 'Esper', 'White', 'Colorless')
   */
  static getDeckColorName(deck: Deck): string {
    return getDeckColorName(deck);
  }

  /**
   * Generates Game Summary BBCode (BBCodeType = 3) for a deck by passing in its color
   */
  static async getGameSummaryBBCode(deck: Deck): Promise<string> {
    const color = getDeckColorName(deck);
    return getRemoteBBCode(color, 3);
  }

  /**
   * Reset in-memory library state on user logout
   */
  public static clearUserData(): void {
    console.log('[DeckService] 🧹 Clearing user data on logout.');
    try {
      localStorage.removeItem(this.getCacheKey('decks'));
      localStorage.removeItem(this.getCacheKey('binders'));
    } catch {}
    this.inMemoryDecks = [];
    this.inMemoryDeckHistory.clear();
    this.lastSavedDecks.clear();
    this.unsavedDeckIds.clear();
    this.inMemoryBinders = [DEFAULT_BINDER];
    this.notifyDecks();
    this.notifyBinders();
    this.notifyUnsavedChanges();
    this.setStatus('synced');
  }
}

// Wire auth state changes to DeckService sync & cleanup
AuthService.onAuthStateChanged((user) => {
  if (user) {
    console.log(`[DeckService] 🔑 User authenticated as "${user.username}". Triggering syncWithRemote...`);
    DeckService.syncWithRemote();
  } else {
    console.log('[DeckService] 🔒 User logged out. Clearing local library data.');
    DeckService.clearUserData();
  }
});

/**
 * Re-export remote API layout and picklist helpers
 */
export { createDeckListApi, createDeckPickListApi, getDeckColorStyle, generateDeckPickListLocal };

/**
 * Backward compatibility alias
 */
export const StorageService = DeckService;
