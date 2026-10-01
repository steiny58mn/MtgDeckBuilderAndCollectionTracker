/**
 * Gamechanger Service
 * Centralized service for tracking and querying MTG Gamechangers exclusively
 * from the API responses (POST /deckbuilder/cards/lookup).
 *
 * Checks the IsGameChanger/game_changer property directly from the API/DB.
 */

import { getApiBaseUrl } from '../config/apiConfig';
import { Deck, DeckCard } from '../types/mtg';

const STORAGE_CACHE_KEY = 'mtg_gamechangers_cache_v2';

export class GamechangerService {
  // Map of normalized card name (lowercase) -> boolean (is gamechanger)
  private static cache: Map<string, boolean> = new Map();
  private static isInitialized = false;
  private static listeners: Set<() => void> = new Set();
  private static activeQueries: Map<string, Promise<boolean>> = new Map();

  /**
   * Initialize cache from localStorage
   */
  private static init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'object' && parsed !== null) {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === 'boolean') {
                this.cache.set(k.toLowerCase().trim(), v);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[GamechangerService] Error reading cached gamechangers:', err);
      }
    }
  }

  /**
   * Persist in-memory cache to localStorage
   */
  private static persistCache() {
    if (typeof window === 'undefined') return;
    try {
      const obj: Record<string, boolean> = {};
      this.cache.forEach((val, key) => {
        // Only persist cards that are actually gamechangers to keep storage compact
        if (val) {
          obj[key] = true;
        }
      });
      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(obj));
    } catch (err) {
      console.warn('[GamechangerService] Error persisting cache:', err);
    }
  }

  /**
   * Subscribe to cache updates
   */
  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  }

  /**
   * Normalize a card name for cache lookup
   */
  static normalizeName(name: string): string {
    if (!name) return '';
    return name
      .split(' // ')[0]
      .replace(/\s*[\(\[].*?[\)\]]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Extracts gamechanger boolean status directly from API payload property
   */
  static extractIsGamechanger(raw: any): boolean {
    if (!raw) return false;
    return Boolean(
      raw.isGameChanger === true ||
      raw.isGameChanger === 'true' ||
      raw.IsGameChanger === true ||
      raw.IsGameChanger === 'true' ||
      raw.isGamechanger === true ||
      raw.isGamechanger === 'true' ||
      raw.is_gamechanger === true ||
      raw.is_gamechanger === 'true' ||
      raw.game_changer === true ||
      raw.game_changer === 'true' ||
      raw.is_game_changer === true ||
      raw.is_game_changer === 'true' ||
      raw.gameChanger === true
    );
  }

  /**
   * Check if a card is currently known as a gamechanger in cache or on card object
   */
  static isKnownGamechanger(cardOrName: any): boolean {
    this.init();
    if (!cardOrName) return false;

    // Check direct card properties if passed an object
    if (typeof cardOrName === 'object') {
      if (this.extractIsGamechanger(cardOrName)) {
        const n = this.normalizeName(cardOrName.name || '');
        if (n && !this.cache.has(n)) {
          this.cache.set(n, true);
        }
        return true;
      }
    }

    const nameStr = typeof cardOrName === 'string' ? cardOrName : cardOrName?.name;
    const clean = this.normalizeName(nameStr || '');
    if (!clean) return false;

    return this.cache.get(clean) === true;
  }

  /**
   * Query a single card from API and update cache
   */
  static async queryCardGamechanger(cardName: string): Promise<boolean> {
    this.init();
    const clean = this.normalizeName(cardName);
    if (!clean) return false;

    if (this.activeQueries.has(clean)) {
      return this.activeQueries.get(clean)!;
    }

    const queryPromise = (async () => {
      try {
        const results = await this.queryGamechangersFromApi([cardName]);
        return results.get(clean) ?? this.cache.get(clean) ?? false;
      } finally {
        this.activeQueries.delete(clean);
      }
    })();

    this.activeQueries.set(clean, queryPromise);
    return queryPromise;
  }

  /**
   * Register card gamechanger data directly from any lookup response (e.g. Scryfall/Frostpoint batch lookup)
   */
  static registerCardsFromLookup(
    cardList: Array<any>
  ) {
    this.init();
    if (!cardList || !Array.isArray(cardList) || cardList.length === 0) return;

    let anyChanged = false;
    for (const raw of cardList) {
      if (!raw || !raw.name) continue;
      const clean = this.normalizeName(raw.name);
      const isGc = this.extractIsGamechanger(raw);

      const previous = this.cache.get(clean);
      if (previous !== isGc) {
        this.cache.set(clean, isGc);
        anyChanged = true;
      }
    }

    if (anyChanged) {
      this.persistCache();
      this.notify();
    }
  }

  /**
   * Query gamechanger status for an array of card names directly from API.
   * Uses POST /deckbuilder/cards/lookup.
   */
  static async queryGamechangersFromApi(
    cardNames: string[]
  ): Promise<Map<string, boolean>> {
    this.init();
    const results = new Map<string, boolean>();
    if (!cardNames || cardNames.length === 0) return results;

    // Deduplicate and clean names
    const uniqueRawNames = new Map<string, string>(); // cleanLower -> raw
    for (const raw of cardNames) {
      const clean = this.normalizeName(raw);
      if (clean && !uniqueRawNames.has(clean)) {
        uniqueRawNames.set(clean, raw.split(' // ')[0].replace(/\s*[\(\[].*?[\)\]]/g, '').trim());
      }
    }

    if (uniqueRawNames.size === 0) return results;

    const namesToQuery = Array.from(uniqueRawNames.values());
    const frostpointBase = getApiBaseUrl();
    const chunkSize = 200;
    let anyChanged = false;

    for (let i = 0; i < namesToQuery.length; i += chunkSize) {
      const chunk = namesToQuery.slice(i, i + chunkSize);
      try {
        const res = await fetch(`${frostpointBase}/deckbuilder/cards/lookup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'DeckBuilder/1.0',
          },
          body: JSON.stringify(chunk),
        });

        if (res.ok) {
          const json = await res.json();
          const cardList = json.data && Array.isArray(json.data) ? json.data : [];

          for (const raw of cardList) {
            if (!raw || !raw.name) continue;
            const clean = this.normalizeName(raw.name);
            const isGc = this.extractIsGamechanger(raw);

            results.set(clean, isGc);
            const previous = this.cache.get(clean);
            if (previous !== isGc) {
              this.cache.set(clean, isGc);
              anyChanged = true;
            }
          }
        }
      } catch (err) {
        console.warn('[GamechangerService] Error querying API lookup:', err);
      }
    }

    if (anyChanged) {
      this.persistCache();
      this.notify();
    }

    return results;
  }

  /**
   * Synchronizes an entire Deck with pre-hydrated card metadata in-memory.
   * Returns the updated Deck with accurate game_changer and isGamechanger flags without network calls.
   */
  static async syncDeckGamechangers(
    deck: Deck
  ): Promise<{ deck: Deck; hasChanges: boolean }> {
    this.init();
    if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) {
      return { deck, hasChanges: false };
    }

    let hasChanges = false;
    const updatedCards = deck.cards.map((c) => {
      const clean = this.normalizeName(c.name);
      const cacheVal = this.cache.get(clean);
      const cardVal = this.extractIsGamechanger(c);
      const isGc = cardVal || cacheVal || false;

      if (
        c.game_changer !== isGc ||
        c.isGamechanger !== isGc ||
        (c as any).isGameChanger !== isGc ||
        (c as any).IsGameChanger !== isGc
      ) {
        hasChanges = true;
        return {
          ...c,
          game_changer: isGc,
          is_game_changer: isGc,
          isGamechanger: isGc,
          is_gamechanger: isGc,
          isGameChanger: isGc,
          IsGameChanger: isGc,
        };
      }
      return c;
    });

    if (hasChanges) {
      return {
        deck: {
          ...deck,
          cards: updatedCards,
        },
        hasChanges: true,
      };
    }

    return { deck, hasChanges: false };
  }
}
