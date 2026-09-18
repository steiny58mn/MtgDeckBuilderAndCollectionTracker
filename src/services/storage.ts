type Unsubscribe = () => void;

import { Deck, CollectionCard, DeckCard, Binder } from '../types/mtg';
import { fetchBatchCardPrices } from './scryfall';
import { 
  getRemoteDecks, 
  saveRemoteDeck, 
  deleteRemoteDeck, 
  getRemoteBinders, 
  saveRemoteBinder, 
  deleteRemoteBinder 
} from './api';

export const DEFAULT_BINDER: Binder = {
  id: 'binder-main',
  name: 'Main Binder',
  description: 'Primary trade and collection binder',
  cards: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

/**
 * Storage Service
 * Directly communicates with the remote C# Web API (mtgappsapi.azurewebsites.net)
 * In-memory state only (no local storage for decks and binders).
 */
export class StorageService {
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
      console.error('[StorageService] Error syncing with remote API:', e);
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
