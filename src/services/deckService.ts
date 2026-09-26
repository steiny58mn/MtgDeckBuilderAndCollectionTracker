/**
 * Consolidated MTG Deck, Collection & Remote API Service
 * Handles direct communication with remote C# Web API (api.frostpointlabs.com)
 * and manages reactive in-memory state for decks and binders.
 */

import { Deck, CollectionCard, DeckCard, Binder } from '../types/mtg';
import { fetchBatchCardPrices } from './scryfall';

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
// Constants & Tenant Partition Configuration
// ============================================================================

const STORAGE_API_BASE_KEY = 'mtg_custom_api_base_url';
const STORAGE_VAULT_KEY = 'mtg_cloud_vault_id';

export const DEFAULT_API_BASE_URL = 
  ((import.meta as any).env?.VITE_API_BASE_URL as string) || 'https://api.frostpointlabs.com';

export const DEFAULT_BINDER: Binder = {
  id: 'binder-main',
  name: 'Main Binder',
  description: 'Primary trade and collection binder',
  cards: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/**
 * Generate a randomized persistent Vault ID
 */
export function generateRandomVaultId(): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `vault-${rand}`;
}

/**
 * Get active Vault / User ID used for backend tenant partition
 */
export function getVaultId(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_VAULT_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
    const newId = generateRandomVaultId();
    localStorage.setItem(STORAGE_VAULT_KEY, newId);
    console.info(`[DeckService] ?? Initialized new random Vault ID: "${newId}". Saved in localStorage['${STORAGE_VAULT_KEY}'].`);
    return newId;
  }
  return 'vault-default';
}

/**
 * Set active Vault / User ID
 */
export function setVaultId(vaultId: string): void {
  if (typeof window !== 'undefined') {
    const clean = vaultId.trim();
    if (!clean) {
      const fresh = generateRandomVaultId();
      localStorage.setItem(STORAGE_VAULT_KEY, fresh);
      console.info(`[DeckService] ?? Vault ID cleared -> generated fresh Vault ID: "${fresh}".`);
    } else {
      localStorage.setItem(STORAGE_VAULT_KEY, clean);
      console.info(`[DeckService] ?? Vault ID set to: "${clean}".`);
    }
  }
}

/**
 * Reset active Vault ID to a newly generated ID
 */
export function resetVaultId(): string {
  const fresh = generateRandomVaultId();
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_VAULT_KEY, fresh);
    console.info(`[DeckService] ?? Vault ID reset to: "${fresh}".`);
  }
  return fresh;
}

/**
 * Get standard headers including user / vault identification
 */
export function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const vaultId = getVaultId();
  return {
    'Accept': 'application/json',
    'X-Vault-Id': vaultId,
    'X-User-Id': vaultId,
    ...customHeaders,
  };
}

/**
 * Get active API Base URL (supports localStorage override for live deployment debugging)
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_API_BASE_KEY);
    if (saved !== null) {
      return saved.trim();
    }
  }
  return DEFAULT_API_BASE_URL;
}

/**
 * Set active API Base URL
 */
export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    const clean = url.trim();
    if (!clean) {
      localStorage.removeItem(STORAGE_API_BASE_KEY);
    } else {
      localStorage.setItem(STORAGE_API_BASE_KEY, clean.replace(/\/+$/, ''));
    }
  }
}

/**
 * Reset API Base URL to default
 */
export function resetApiBaseUrl(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_API_BASE_KEY);
  }
}

// ============================================================================
// Direct Remote API Endpoints (Fetch Calls)
// ============================================================================


/**
 * Check backend service health and available endpoints
 */
export async function getApiHealth(): Promise<ApiHealthResponse | null> {
  const baseUrl = getApiBaseUrl();
  try {
    const targetUrl = baseUrl ? `${baseUrl}/` : '/';
    const res = await fetch(targetUrl, {
      headers: getAuthHeaders(),
    });
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
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/mtgtools/turso/status` : '/mtgtools/turso/status';
  try {
    const res = await fetch(targetUrl, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[DeckService] Error fetching Turso status:', err);
    return null;
  }
}

/**
 * Fetch decks from remote C# API (/deckbuilder/decks)
 */
export async function getRemoteDecks(): Promise<Deck[]> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/decks` : '/deckbuilder/decks';
  const headers = getAuthHeaders();
  const vaultId = headers['X-Vault-Id'];
  const start = performance.now();

  console.groupCollapsed(`[DeckService] ?? Fetching decks from ${targetUrl} [Vault: ${vaultId}]`);
  console.log('[DeckService] Request URL:', targetUrl);
  console.log('[DeckService] Request Headers:', headers);

  try {
    const res = await fetch(targetUrl, {
      headers,
    });
    const durationMs = Math.round(performance.now() - start);

    console.log(`[DeckService] Response status: ${res.status} ${res.statusText} (${durationMs}ms)`);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[DeckService] ?? getRemoteDecks returned HTTP ${res.status}:`, errText);
      console.groupEnd();
      return [];
    }

    const rawText = await res.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[DeckService] ? Failed to parse deck JSON response:', parseErr, { rawTextPreview: rawText.slice(0, 300) });
      console.groupEnd();
      return [];
    }

    if (!Array.isArray(data)) {
      console.warn('[DeckService] ?? getRemoteDecks returned non-array payload:', data);
      console.groupEnd();
      return [];
    }

    console.log(`[DeckService] ? Loaded ${data.length} deck(s) from server (${durationMs}ms):`, data.map((d: any) => ({
      id: d.id,
      name: d.name,
      format: d.format,
      cardCount: d.cards?.length || 0,
      vaultId: d.vaultId ?? '(none/null)',
      userId: d.userId ?? '(none/null)',
    })));

    if (data.length === 0) {
      console.warn(`[DeckService] ?? 0 decks returned for Vault ID "${vaultId}". Note: If decks in the database were created with a different Vault ID or with NULL Vault ID, backend tenant filtering will exclude them.`);
    }

    console.groupEnd();
    return data;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    console.error(`[DeckService] ? Network/Fetch error in getRemoteDecks (${durationMs}ms):`, err);
    console.groupEnd();
    return [];
  }
}

/**
 * Save/upsert deck to remote C# API (POST /deckbuilder/decks)
 */
export async function saveRemoteDeck(deck: Deck): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/decks` : '/deckbuilder/decks';
  const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
  const start = performance.now();

  console.log(`[DeckService] ?? Saving deck "${deck.name}" (${deck.id}) to ${targetUrl}...`, {
    deckId: deck.id,
    name: deck.name,
    format: deck.format,
    cardCount: deck.cards?.length || 0,
    vaultId: headers['X-Vault-Id'],
  });

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(deck),
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DeckService] ? Failed to save deck: HTTP ${res.status} ${res.statusText} (${durationMs}ms)`, {
        errorBody: errText,
        deckId: deck.id,
      });
      return false;
    }
    console.log(`[DeckService] ? Successfully saved deck "${deck.name}" (${durationMs}ms)`);
    return true;
  } catch (err) {
    console.error('[DeckService] ? Error saving remote deck:', err);
    return false;
  }
}

/**
 * Delete deck from remote C# API (DELETE /deckbuilder/decks/{id})
 */
export async function deleteRemoteDeck(deckId: string): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/decks/${deckId}` : `/deckbuilder/decks/${deckId}`;
  const headers = getAuthHeaders();
  const start = performance.now();

  console.log(`[DeckService] ??? Deleting deck ${deckId} via ${targetUrl}...`);

  try {
    const res = await fetch(targetUrl, {
      method: 'DELETE',
      headers,
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DeckService] ? Failed to delete deck: HTTP ${res.status} ${res.statusText} (${durationMs}ms)`, {
        errorBody: errText,
        deckId,
      });
      return false;
    }
    console.log(`[DeckService] ? Successfully deleted deck ${deckId} (${durationMs}ms)`);
    return true;
  } catch (err) {
    console.error('[DeckService] ? Error deleting remote deck:', err);
    return false;
  }
}

/**
 * Fetch binders from remote C# API (/deckbuilder/binders)
 */
export async function getRemoteBinders(): Promise<Binder[]> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/binders` : '/deckbuilder/binders';
  const headers = getAuthHeaders();
  const vaultId = headers['X-Vault-Id'];
  const start = performance.now();

  console.groupCollapsed(`[DeckService] ?? Fetching binders from ${targetUrl} [Vault: ${vaultId}]`);
  console.log('[DeckService] Request URL:', targetUrl);
  console.log('[DeckService] Request Headers:', headers);

  try {
    const res = await fetch(targetUrl, {
      headers,
    });
    const durationMs = Math.round(performance.now() - start);

    console.log(`[DeckService] Response status: ${res.status} ${res.statusText} (${durationMs}ms)`);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[DeckService] ?? getRemoteBinders returned HTTP ${res.status}:`, errText);
      console.groupEnd();
      return [];
    }

    const rawText = await res.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[DeckService] ? Failed to parse binder JSON response:', parseErr, { rawTextPreview: rawText.slice(0, 300) });
      console.groupEnd();
      return [];
    }

    if (!Array.isArray(data)) {
      console.warn('[DeckService] ?? getRemoteBinders returned non-array payload:', data);
      console.groupEnd();
      return [];
    }

    console.log(`[DeckService] ? Loaded ${data.length} binder(s) from server (${durationMs}ms):`, data.map((b: any) => ({
      id: b.id,
      name: b.name,
      cardCount: b.cards?.length || 0,
      vaultId: b.vaultId ?? '(none/null)',
      userId: b.userId ?? '(none/null)',
    })));

    if (data.length === 0) {
      console.warn(`[DeckService] ?? 0 binders returned for Vault ID "${vaultId}". Note: If binders in the database were created with a different Vault ID or with NULL Vault ID, backend tenant filtering will exclude them.`);
    }

    console.groupEnd();
    return data;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    console.error(`[DeckService] ? Network/Fetch error in getRemoteBinders (${durationMs}ms):`, err);
    console.groupEnd();
    return [];
  }
}

/**
 * Save/upsert binder to remote C# API (POST /deckbuilder/binders)
 */
export async function saveRemoteBinder(binder: Binder): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/binders` : '/deckbuilder/binders';
  const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
  const start = performance.now();

  console.log(`[DeckService] ?? Saving binder "${binder.name}" (${binder.id}) to ${targetUrl}...`, {
    binderId: binder.id,
    name: binder.name,
    cardCount: binder.cards?.length || 0,
    vaultId: headers['X-Vault-Id'],
  });

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(binder),
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DeckService] ? Failed to save binder: HTTP ${res.status} ${res.statusText} (${durationMs}ms)`, {
        errorBody: errText,
        binderId: binder.id,
      });
      return false;
    }
    console.log(`[DeckService] ? Successfully saved binder "${binder.name}" (${durationMs}ms)`);
    return true;
  } catch (err) {
    console.error('[DeckService] ? Error saving remote binder:', err);
    return false;
  }
}

/**
 * Delete binder from remote C# API (DELETE /deckbuilder/binders/{id})
 */
export async function deleteRemoteBinder(binderId: string): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/binders/${binderId}` : `/deckbuilder/binders/${binderId}`;
  const headers = getAuthHeaders();
  const start = performance.now();

  console.log(`[DeckService] ??? Deleting binder ${binderId} via ${targetUrl}...`);

  try {
    const res = await fetch(targetUrl, {
      method: 'DELETE',
      headers,
    });
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DeckService] ? Failed to delete binder: HTTP ${res.status} ${res.statusText} (${durationMs}ms)`, {
        errorBody: errText,
        binderId,
      });
      return false;
    }
    console.log(`[DeckService] ? Successfully deleted binder ${binderId} (${durationMs}ms)`);
    return true;
  } catch (err) {
    console.error('[DeckService] ? Error deleting remote binder:', err);
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
export class DeckService {
  private static statusListeners: Set<(status: SyncStatus, error?: string) => void> = new Set();
  private static currentStatus: SyncStatus = 'syncing';
  private static deckListeners: Set<(decks: Deck[]) => void> = new Set();
  private static colListeners: Set<(cards: CollectionCard[]) => void> = new Set();
  private static binderListeners: Set<(binders: Binder[]) => void> = new Set();

  private static inMemoryDecks: Deck[] = [];
  private static inMemoryBinders: Binder[] = [];
  private static hasInitialized = false;

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
    console.log(`[DeckService] ?? Notifying ${this.deckListeners.size} deck listener(s) with ${this.inMemoryDecks.length} deck(s).`);
    this.deckListeners.forEach((cb) => cb([...this.inMemoryDecks]));
  }

  private static notifyBinders() {
    console.log(`[DeckService] ?? Notifying ${this.binderListeners.size} binder listener(s) with ${this.inMemoryBinders.length} binder(s).`);
    this.binderListeners.forEach((cb) => cb([...this.inMemoryBinders]));
    const col = this.getCollectionFromBinders(this.inMemoryBinders);
    this.colListeners.forEach((cb) => cb(col));
  }

  /**
   * Fetch all decks and binders from the remote API
   */
  public static async syncWithRemote(): Promise<void> {
    console.log('[DeckService] ?? Starting syncWithRemote()...');
    this.setStatus('syncing');

    try {
      const [remoteDecks, remoteBinders] = await Promise.all([
        getRemoteDecks(),
        getRemoteBinders(),
      ]);

      console.log(`[DeckService] ?? syncWithRemote resolved with ${remoteDecks.length} deck(s) and ${remoteBinders.length} binder(s).`);

      this.inMemoryDecks = remoteDecks;
      this.inMemoryBinders = remoteBinders.length > 0 ? remoteBinders : [DEFAULT_BINDER];

      this.notifyDecks();
      this.notifyBinders();
      this.setStatus('synced');
      console.log('[DeckService] ? syncWithRemote complete. State updated and status set to "synced".');
    } catch (e: any) {
      console.error('[DeckService] ? Error syncing with remote API:', e);
      this.setStatus('offline', e?.message);
    }
  }

  private static initSync() {
    if (this.hasInitialized) return;
    this.hasInitialized = true;
    this.syncWithRemote();
  }

  static subscribeDecks(onUpdate: (decks: Deck[]) => void): Unsubscribe {
    this.deckListeners.add(onUpdate);
    console.log(`[DeckService] ?? Subscribed new deck listener (total: ${this.deckListeners.size}). Initializing with ${this.inMemoryDecks.length} cached deck(s).`);
    onUpdate([...this.inMemoryDecks]);
    this.initSync();

    return () => {
      this.deckListeners.delete(onUpdate);
      console.log(`[DeckService] ?? Unsubscribed deck listener (remaining: ${this.deckListeners.size}).`);
    };
  }

  static subscribeBinders(onUpdate: (binders: Binder[]) => void): Unsubscribe {
    this.binderListeners.add(onUpdate);
    console.log(`[DeckService] ?? Subscribed new binder listener (total: ${this.binderListeners.size}). Initializing with ${this.inMemoryBinders.length} cached binder(s).`);
    onUpdate([...this.inMemoryBinders]);
    this.initSync();

    return () => {
      this.binderListeners.delete(onUpdate);
      console.log(`[DeckService] ?? Unsubscribed binder listener (remaining: ${this.binderListeners.size}).`);
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
    return [...this.inMemoryDecks];
  }

  static getLocalBinders(): Binder[] {
    return [...this.inMemoryBinders];
  }

  static getLocalCollection(): CollectionCard[] {
    return this.getCollectionFromBinders(this.inMemoryBinders);
  }

  /**
   * Save or update a Deck on the remote server
   */
  static async saveDeck(deck: Deck): Promise<void> {
    const updated: Deck = {
      ...deck,
      updatedAt: Date.now(),
    };

    const idx = this.inMemoryDecks.findIndex((d) => d.id === updated.id);
    if (idx >= 0) {
      this.inMemoryDecks[idx] = updated;
    } else {
      this.inMemoryDecks.unshift(updated);
    }
    this.notifyDecks();

    this.setStatus('syncing');
    const ok = await saveRemoteDeck(updated);
    if (ok) {
      this.setStatus('synced');
    } else {
      this.setStatus('offline');
    }
  }

  /**
   * Delete a deck from the remote server
   */
  static async deleteDeck(deckId: string): Promise<void> {
    this.inMemoryDecks = this.inMemoryDecks.filter((d) => d.id !== deckId);
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
  static async refreshCollectionPrices(cards: CollectionCard[]): Promise<CollectionCard[]> {    const scryfallIds = cards.map((c) => c.scryfallId).filter(Boolean);
    if (scryfallIds.length === 0) return cards;

    this.setStatus('syncing');
    const priceMap = await fetchBatchCardPrices(scryfallIds);

    for (const binder of this.inMemoryBinders) {
      if (!binder.cards || binder.cards.length === 0) continue;
      let hasChanges = false;
      const updatedCards = binder.cards.map((item) => {
        const fresh = priceMap.get(item.scryfallId);
        if (fresh) {
          hasChanges = true;
          return {
            ...item,
            currentPriceUsd: fresh.usd !== undefined ? fresh.usd : item.currentPriceUsd,
          };
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
}

/**
 * Backward compatibility alias
 */
export const StorageService = DeckService;
