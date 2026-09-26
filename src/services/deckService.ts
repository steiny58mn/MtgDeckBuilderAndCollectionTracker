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

export interface DiagnosticResult {
  id: string;
  name: string;
  targetUrl: string;
  status: 'pending' | 'success' | 'failed' | 'cors_error' | 'timeout';
  httpStatus?: number;
  statusText?: string;
  durationMs: number;
  errorDetails?: string;
  corsSuspected?: boolean;
  responsePreview?: string;
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
    } else {
      localStorage.setItem(STORAGE_VAULT_KEY, clean);
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
 * Helper to fetch with timeout and CORS analysis
 */
async function fetchWithDebug(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<{ res?: Response; error?: any; durationMs: number; isCors?: boolean }> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const durationMs = Math.round(performance.now() - start);
    return { res, durationMs };
  } catch (err: any) {
    clearTimeout(timer);
    const durationMs = Math.round(performance.now() - start);
    const isCors = 
      err instanceof TypeError && 
      (err.message === 'Failed to fetch' || err.message.includes('NetworkError') || err.message.includes('Load failed'));
    
    return { error: err, durationMs, isCors };
  }
}

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
    console.warn('[API] Health check error:', err);
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
    console.warn('[API] Error fetching Turso status:', err);
    return null;
  }
}

/**
 * Fetch decks from remote C# API (/deckbuilder/decks)
 */
export async function getRemoteDecks(): Promise<Deck[]> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/decks` : '/deckbuilder/decks';
  try {
    const res = await fetch(targetUrl, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      console.warn(`[API] getRemoteDecks returned status ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[API] Error fetching decks:', err);
    return [];
  }
}

/**
 * Save/upsert deck to remote C# API (POST /deckbuilder/decks)
 */
export async function saveRemoteDeck(deck: Deck): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/decks` : '/deckbuilder/decks';
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(deck),
    });
    return res.ok;
  } catch (err) {
    console.error('[API] Error saving remote deck:', err);
    return false;
  }
}

/**
 * Delete deck from remote C# API (DELETE /deckbuilder/decks/{id})
 */
export async function deleteRemoteDeck(deckId: string): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/decks/${deckId}` : `/deckbuilder/decks/${deckId}`;
  try {
    const res = await fetch(targetUrl, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch (err) {
    console.error('[API] Error deleting remote deck:', err);
    return false;
  }
}

/**
 * Fetch binders from remote C# API (/deckbuilder/binders)
 */
export async function getRemoteBinders(): Promise<Binder[]> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/binders` : '/deckbuilder/binders';
  try {
    const res = await fetch(targetUrl, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      console.warn(`[API] getRemoteBinders returned status ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[API] Error fetching binders:', err);
    return [];
  }
}

/**
 * Save/upsert binder to remote C# API (POST /deckbuilder/binders)
 */
export async function saveRemoteBinder(binder: Binder): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/binders` : '/deckbuilder/binders';
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(binder),
    });
    return res.ok;
  } catch (err) {
    console.error('[API] Error saving remote binder:', err);
    return false;
  }
}

/**
 * Delete binder from remote C# API (DELETE /deckbuilder/binders/{id})
 */
export async function deleteRemoteBinder(binderId: string): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/binders/${binderId}` : `/deckbuilder/binders/${binderId}`;
  try {
    const res = await fetch(targetUrl, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch (err) {
    console.error('[API] Error deleting remote binder:', err);
    return false;
  }
}

/**
 * Run a comprehensive suite of connectivity and API diagnostics
 */
export async function runFullDiagnostics(customBaseUrl?: string): Promise<DiagnosticResult[]> {
  const baseUrl = customBaseUrl !== undefined ? customBaseUrl : getApiBaseUrl();
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const vaultId = getVaultId();

  const testConfigs = [
    {
      id: 'health',
      name: 'API Root & Health Check (GET /)',
      url: baseUrl ? `${baseUrl}/` : '/',
      method: 'GET',
    },
    {
      id: 'turso_status',
      name: 'Turso DB Status (GET /mtgtools/turso/status)',
      url: baseUrl ? `${baseUrl}/mtgtools/turso/status` : '/mtgtools/turso/status',
      method: 'GET',
    },
    {
      id: 'deckbuilder_decks',
      name: `Remote Decks Endpoint [Vault: ${vaultId}] (GET /deckbuilder/decks)`,
      url: baseUrl ? `${baseUrl}/deckbuilder/decks` : '/deckbuilder/decks',
      method: 'GET',
    },
    {
      id: 'deckbuilder_binders',
      name: `Remote Binders Endpoint [Vault: ${vaultId}] (GET /deckbuilder/binders)`,
      url: baseUrl ? `${baseUrl}/deckbuilder/binders` : '/deckbuilder/binders',
      method: 'GET',
    },
    {
      id: 'scryfall_direct',
      name: 'Scryfall Direct API (GET https://api.scryfall.com/cards/random)',
      url: 'https://api.scryfall.com/cards/random',
      method: 'GET',
    },
  ];

  console.groupCollapsed(`[API Diagnostics] Running tests against base: "${baseUrl || '(relative proxy)'}" (Origin: ${currentOrigin}, Vault: ${vaultId})`);

  const results: DiagnosticResult[] = [];

  for (const test of testConfigs) {
    const headers = test.id.startsWith('scryfall')
      ? { Accept: 'application/json' }
      : getAuthHeaders();

    const { res, error, durationMs, isCors } = await fetchWithDebug(test.url, {
      method: test.method,
      headers,
    });

    if (error) {
      const isTimeout = error.name === 'AbortError';
      const status: DiagnosticResult['status'] = isTimeout ? 'timeout' : isCors ? 'cors_error' : 'failed';
      const errorMsg = error.message || String(error);

      console.warn(`❌ [Test Failed] ${test.name}`, {
        url: test.url,
        durationMs,
        error: errorMsg,
        isCors,
        isTimeout,
      });

      results.push({
        id: test.id,
        name: test.name,
        targetUrl: test.url,
        status,
        durationMs,
        errorDetails: isCors 
          ? `CORS / Network Error: The browser blocked this request to "${test.url}". Likely missing Access-Control-Allow-Origin / Allow-Headers on ${baseUrl || 'server'}.`
          : isTimeout 
          ? `Request timed out after ${durationMs}ms.`
          : errorMsg,
        corsSuspected: isCors,
      });
    } else if (res) {
      let preview = '';
      try {
        const text = await res.text();
        preview = text.slice(0, 200);
      } catch {
        // ignore preview extraction errors
      }

      const isSuccess = res.ok;
      console.log(`${isSuccess ? '✅' : '⚠️'} [Test Complete] ${test.name}`, {
        url: test.url,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        preview,
      });

      let errorDetails: string | undefined = undefined;
      if (!isSuccess) {
        if (res.status === 429) {
          errorDetails = `Scryfall Rate Limited (HTTP 429)`;
        } else {
          errorDetails = `Server returned HTTP status ${res.status} ${res.statusText}`;
        }
      }

      results.push({
        id: test.id,
        name: test.name,
        targetUrl: test.url,
        status: isSuccess ? 'success' : 'failed',
        httpStatus: res.status,
        statusText: res.statusText,
        durationMs,
        responsePreview: preview,
        errorDetails,
      });
    }
  }

  console.groupEnd();
  return results;
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
    this.deckListeners.forEach((cb) => cb([...this.inMemoryDecks]));
  }

  private static notifyBinders() {
    this.binderListeners.forEach((cb) => cb([...this.inMemoryBinders]));
    const col = this.getCollectionFromBinders(this.inMemoryBinders);
    this.colListeners.forEach((cb) => cb(col));
  }

  /**
   * Fetch all decks and binders from the remote API
   */
  public static async syncWithRemote(): Promise<void> {
    this.setStatus('syncing');

    try {
      const [remoteDecks, remoteBinders] = await Promise.all([
        getRemoteDecks(),
        getRemoteBinders(),
      ]);

      this.inMemoryDecks = remoteDecks;
      this.inMemoryBinders = remoteBinders.length > 0 ? remoteBinders : [DEFAULT_BINDER];

      this.notifyDecks();
      this.notifyBinders();
      this.setStatus('synced');
    } catch (e: any) {
      console.error('[DeckService] Error syncing with remote API:', e);
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
    onUpdate([...this.inMemoryDecks]);
    this.initSync();

    return () => {
      this.deckListeners.delete(onUpdate);
    };
  }

  static subscribeBinders(onUpdate: (binders: Binder[]) => void): Unsubscribe {
    this.binderListeners.add(onUpdate);
    onUpdate([...this.inMemoryBinders]);
    this.initSync();

    return () => {
      this.binderListeners.delete(onUpdate);
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
