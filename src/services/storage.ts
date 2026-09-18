/**
 * Storage Service for MTG Deck & Collection Manager
 * Client-side high performance storage with external API sync & diagnostics capabilities.
 */

import { Deck, CollectionCard, DeckCard, Binder } from '../types/mtg';
import { fetchBatchCardPrices } from './scryfall';

type Unsubscribe = () => void;

const VAULT_KEY_STORAGE = 'mtg_cloud_vault_id';
const REMOTE_API_URL_STORAGE = 'mtg_remote_api_url';
const LOCAL_DECKS_KEY = 'mtg_local_decks_cache';
const LOCAL_COLLECTION_KEY = 'mtg_local_collection_cache';
const LOCAL_BINDERS_KEY = 'mtg_local_binders_cache';

export const DEFAULT_BINDER: Binder = {
  id: 'binder-main',
  name: 'Main Binder',
  description: 'Primary trade and collection binder',
  createdAt: Date.now() - 86400000 * 7,
  updatedAt: Date.now(),
};

// Generate human-friendly 8-char vault code
export function generateVaultId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MTG-';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  code += '-';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

export function getCurrentVaultId(): string {
  let vaultId = localStorage.getItem(VAULT_KEY_STORAGE);
  if (!vaultId) {
    vaultId = generateVaultId();
    localStorage.setItem(VAULT_KEY_STORAGE, vaultId);
  }
  return vaultId;
}

export function setCurrentVaultId(vaultId: string): void {
  const cleaned = vaultId.trim().toUpperCase();
  if (!cleaned) return;
  localStorage.setItem(VAULT_KEY_STORAGE, cleaned);
}

export function getRemoteApiUrl(): string {
  return localStorage.getItem(REMOTE_API_URL_STORAGE) || '';
}

export function setRemoteApiUrl(url: string): void {
  const cleaned = url.trim().replace(/\/+$/, '');
  if (!cleaned) {
    localStorage.removeItem(REMOTE_API_URL_STORAGE);
  } else {
    localStorage.setItem(REMOTE_API_URL_STORAGE, cleaned);
  }
}

// Initial Starter Sample Decks
export const SAMPLE_DECKS: Deck[] = [
  {
    id: 'sample-edh-atraxa',
    name: "Atraxa, Praetors' Voice // +1/+1 Counters",
    description: "Proliferate counters and build an unstoppable army of modified creatures.",
    format: 'commander',
    commanderId: 'd0d33d52-3d28-4635-b985-51e126289259',
    commanderName: "Atraxa, Praetors' Voice",
    commanderArtUrl: 'https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg',
    coverCardUrl: 'https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now(),
    tags: ['Commander', 'Proliferate', '+1/+1 Counters'],
    cards: [
      {
        id: 'c-atraxa',
        scryfallId: 'd0d33d52-3d28-4635-b985-51e126289259',
        name: "Atraxa, Praetors' Voice",
        set: '2xm',
        collector_number: '190',
        category: 'commander',
        quantity: 1,
        mana_cost: '{G}{W}{U}{B}',
        cmc: 4,
        type_line: 'Legendary Creature — Phyrexian Angel Horror',
        colors: ['W', 'U', 'B', 'G'],
        color_identity: ['W', 'U', 'B', 'G'],
        rarity: 'mythic',
        imageUrl: 'https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg',
        priceUsd: 14.50,
      },
      {
        id: 'c-sol-ring',
        scryfallId: '4cbc6901-6a4a-4d0a-83ea-7eefa3b35021',
        name: 'Sol Ring',
        set: 'c21',
        collector_number: '263',
        category: 'main',
        quantity: 1,
        mana_cost: '{1}',
        cmc: 1,
        type_line: 'Artifact',
        colors: [],
        color_identity: [],
        rarity: 'uncommon',
        imageUrl: 'https://cards.scryfall.io/normal/front/4/c/4cbc6901-6a4a-4d0a-83ea-7eefa3b35021.jpg',
        priceUsd: 1.85,
      },
      {
        id: 'c-doubling-season',
        scryfallId: '13254504-6330-4888-8a6b-80a5a7518447',
        name: 'Doubling Season',
        set: 'cmm',
        collector_number: '283',
        category: 'main',
        quantity: 1,
        mana_cost: '{4}{G}',
        cmc: 5,
        type_line: 'Enchantment',
        colors: ['G'],
        color_identity: ['G'],
        rarity: 'mythic',
        imageUrl: 'https://cards.scryfall.io/normal/front/1/3/13254504-6330-4888-8a6b-80a5a7518447.jpg',
        priceUsd: 38.25,
      },
      {
        id: 'c-swords-to-plowshares',
        scryfallId: '47d3183a-6767-483d-9232-0bc25f7fb5b6',
        name: 'Swords to Plowshares',
        set: 'dmr',
        collector_number: '31',
        category: 'main',
        quantity: 1,
        mana_cost: '{W}',
        cmc: 1,
        type_line: 'Instant',
        colors: ['W'],
        color_identity: ['W'],
        rarity: 'uncommon',
        imageUrl: 'https://cards.scryfall.io/normal/front/4/7/47d3183a-6767-483d-9232-0bc25f7fb5b6.jpg',
        priceUsd: 1.45,
      },
      {
        id: 'c-counterspell',
        scryfallId: '1920dae4-fb92-4f19-ae4b-eb3276b8dac7',
        name: 'Counterspell',
        set: 'dmr',
        collector_number: '45',
        category: 'main',
        quantity: 1,
        mana_cost: '{U}{U}',
        cmc: 2,
        type_line: 'Instant',
        colors: ['U'],
        color_identity: ['U'],
        rarity: 'uncommon',
        imageUrl: 'https://cards.scryfall.io/normal/front/1/9/1920dae4-fb92-4f19-ae4b-eb3276b8dac7.jpg',
        priceUsd: 1.20,
      },
      {
        id: 'c-cyclonic-rift',
        scryfallId: 'ff08e5ed-f47b-4d8e-8b8b-41675dccef8b',
        name: 'Cyclonic Rift',
        set: 'rtr',
        collector_number: '35',
        category: 'main',
        quantity: 1,
        mana_cost: '{1}{U}',
        cmc: 2,
        type_line: 'Instant',
        colors: ['U'],
        color_identity: ['U'],
        rarity: 'rare',
        imageUrl: 'https://cards.scryfall.io/normal/front/f/f/ff08e5ed-f47b-4d8e-8b8b-41675dccef8b.jpg',
        priceUsd: 32.50,
      },
      {
        id: 'c-rhystic-study',
        scryfallId: 'd6914dba-0d27-4055-ac34-b3ebf5802221',
        name: 'Rhystic Study',
        set: 'jmp',
        collector_number: '169',
        category: 'main',
        quantity: 1,
        mana_cost: '{2}{U}',
        cmc: 3,
        type_line: 'Enchantment',
        colors: ['U'],
        color_identity: ['U'],
        rarity: 'rare',
        imageUrl: 'https://cards.scryfall.io/normal/front/d/6/d6914dba-0d27-4055-ac34-b3ebf5802221.jpg',
        priceUsd: 34.00,
      },
      {
        id: 'c-demonic-tutor',
        scryfallId: '3bdbc231-5316-4abd-9d8d-d87cff2c9847',
        name: 'Demonic Tutor',
        set: 'cmm',
        collector_number: '150',
        category: 'main',
        quantity: 1,
        mana_cost: '{1}{B}',
        cmc: 2,
        type_line: 'Sorcery',
        colors: ['B'],
        color_identity: ['B'],
        rarity: 'rare',
        imageUrl: 'https://cards.scryfall.io/normal/front/3/b/3bdbc231-5316-4abd-9d8d-d87cff2c9847.jpg',
        priceUsd: 36.00,
      },
      {
        id: 'c-command-tower',
        scryfallId: '37b60582-7e04-4e47-8a18-86fa0d14878b',
        name: 'Command Tower',
        set: 'otc',
        collector_number: '280',
        category: 'main',
        quantity: 1,
        mana_cost: '',
        cmc: 0,
        type_line: 'Land',
        colors: [],
        color_identity: [],
        rarity: 'common',
        imageUrl: 'https://cards.scryfall.io/normal/front/3/7/37b60582-7e04-4e47-8a18-86fa0d14878b.jpg',
        priceUsd: 0.25,
      },
      {
        id: 'c-watery-grave',
        scryfallId: '45611c75-01e4-448f-8d96-981881ff1b55',
        name: 'Watery Grave',
        set: 'rvr',
        collector_number: '291',
        category: 'main',
        quantity: 1,
        mana_cost: '',
        cmc: 0,
        type_line: 'Land — Island Swamp',
        colors: [],
        color_identity: ['U', 'B'],
        rarity: 'rare',
        imageUrl: 'https://cards.scryfall.io/normal/front/4/5/45611c75-01e4-448f-8d96-981881ff1b55.jpg',
        priceUsd: 11.80,
      },
    ],
  },
  {
    id: 'sample-modern-burn',
    name: 'Modern Mono-Red Burn',
    description: 'Fast, lethal aggressive direct damage burn deck targeting opponent life total.',
    format: 'modern',
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now(),
    coverCardUrl: 'https://cards.scryfall.io/art_crop/front/f/7/f74a9f31-f49a-4573-b778-831b26857ea2.jpg',
    tags: ['Modern', 'Aggro', 'Burn'],
    cards: [
      {
        id: 'b-lightning-bolt',
        scryfallId: 'f74a9f31-f49a-4573-b778-831b26857ea2',
        name: 'Lightning Bolt',
        set: '2x2',
        collector_number: '117',
        category: 'main',
        quantity: 4,
        mana_cost: '{R}',
        cmc: 1,
        type_line: 'Instant',
        colors: ['R'],
        color_identity: ['R'],
        rarity: 'uncommon',
        imageUrl: 'https://cards.scryfall.io/normal/front/f/7/f74a9f31-f49a-4573-b778-831b26857ea2.jpg',
        priceUsd: 1.50,
      },
      {
        id: 'b-monastery-swiftspear',
        scryfallId: 'd8b9f3b2-0144-4b60-acfa-6316aec89c14',
        name: 'Monastery Swiftspear',
        set: 'bro',
        collector_number: '144',
        category: 'main',
        quantity: 4,
        mana_cost: '{R}',
        cmc: 1,
        type_line: 'Creature — Human Monk',
        colors: ['R'],
        color_identity: ['R'],
        rarity: 'uncommon',
        imageUrl: 'https://cards.scryfall.io/normal/front/d/8/d8b9f3b2-0144-4b60-acfa-6316aec89c14.jpg',
        priceUsd: 0.75,
      },
      {
        id: 'b-lava-spike',
        scryfallId: '79c21c1f-eaa4-454d-a1c7-b41466d0a428',
        name: 'Lava Spike',
        set: 'uma',
        collector_number: '136',
        category: 'main',
        quantity: 4,
        mana_cost: '{R}',
        cmc: 1,
        type_line: 'Sorcery — Arcane',
        colors: ['R'],
        color_identity: ['R'],
        rarity: 'uncommon',
        imageUrl: 'https://cards.scryfall.io/normal/front/7/9/79c21c1f-eaa4-454d-a1c7-b41466d0a428.jpg',
        priceUsd: 2.20,
      },
      {
        id: 'b-mountain',
        scryfallId: '42232ea6-e31d-46a6-9f94-b2ad2416d79b',
        name: 'Mountain',
        set: 'unf',
        collector_number: '243',
        category: 'main',
        quantity: 18,
        mana_cost: '',
        cmc: 0,
        type_line: 'Basic Land — Mountain',
        colors: [],
        color_identity: ['R'],
        rarity: 'common',
        imageUrl: 'https://cards.scryfall.io/normal/front/4/2/42232ea6-e31d-46a6-9f94-b2ad2416d79b.jpg',
        priceUsd: 0.15,
      },
      {
        id: 'b-smash-to-smithereens',
        scryfallId: '655c489f-abbb-45e4-8e7c-8270c655d8b8',
        name: 'Smash to Smithereens',
        set: 'ori',
        collector_number: '163',
        category: 'sideboard',
        quantity: 3,
        mana_cost: '{1}{R}',
        cmc: 2,
        type_line: 'Instant',
        colors: ['R'],
        color_identity: ['R'],
        rarity: 'common',
        imageUrl: 'https://cards.scryfall.io/normal/front/6/5/655c489f-abbb-45e4-8e7c-8270c655d8b8.jpg',
        priceUsd: 0.40,
      }
    ]
  }
];

export const SAMPLE_COLLECTION: CollectionCard[] = [
  {
    id: 'col-black-lotus-30th',
    scryfallId: 'bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd',
    name: 'Black Lotus',
    set: '30a',
    setName: '30th Anniversary Edition',
    collectorNumber: '233',
    quantity: 1,
    isFoil: false,
    condition: 'NM',
    cmc: 0,
    type_line: 'Artifact',
    colors: [],
    rarity: 'rare',
    imageUrl: 'https://cards.scryfall.io/normal/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg',
    acquiredPrice: 850.00,
    currentPriceUsd: 980.00,
    addedAt: Date.now() - 86400000 * 10,
    notes: 'Graded display binder piece',
  },
  {
    id: 'col-sheoldred',
    scryfallId: '359d2907-93ae-4222-8734-4cb032274bfa',
    name: 'Sheoldred, the Apocalypse',
    set: 'dmu',
    setName: 'Dominaria United',
    collectorNumber: '107',
    quantity: 2,
    isFoil: true,
    condition: 'NM',
    cmc: 4,
    mana_cost: '{2}{B}{B}',
    type_line: 'Legendary Creature — Phyrexian Praetor',
    colors: ['B'],
    rarity: 'mythic',
    imageUrl: 'https://cards.scryfall.io/normal/front/3/5/359d2907-93ae-4222-8734-4cb032274bfa.jpg',
    acquiredPrice: 65.00,
    currentPriceUsd: 84.50,
    addedAt: Date.now() - 86400000 * 7,
    notes: 'Playset piece for Modern/Pioneer',
  },
  {
    id: 'col-the-one-ring',
    scryfallId: 'd5806e68-1054-458e-866d-5f4707f68295',
    name: 'The One Ring',
    set: 'ltr',
    setName: 'The Lord of the Rings: Tales of Middle-earth',
    collectorNumber: '246',
    quantity: 1,
    isFoil: false,
    condition: 'NM',
    cmc: 4,
    mana_cost: '{4}',
    type_line: 'Legendary Artifact',
    colors: [],
    rarity: 'mythic',
    imageUrl: 'https://cards.scryfall.io/normal/front/d/5/d5806e68-1054-458e-866d-5f4707f68295.jpg',
    acquiredPrice: 50.00,
    currentPriceUsd: 95.00,
    addedAt: Date.now() - 86400000 * 14,
  },
  {
    id: 'col-ragavan',
    scryfallId: 'a9738cda-adb1-47fb-9f4c-ecd930228c4d',
    name: 'Ragavan, Nimble Pilferer',
    set: 'mh2',
    setName: 'Modern Horizons 2',
    collectorNumber: '138',
    quantity: 4,
    isFoil: false,
    condition: 'NM',
    cmc: 1,
    mana_cost: '{R}',
    type_line: 'Legendary Creature — Monkey Pirate',
    colors: ['R'],
    rarity: 'mythic',
    imageUrl: 'https://cards.scryfall.io/normal/front/a/9/a9738cda-adb1-47fb-9f4c-ecd930228c4d.jpg',
    acquiredPrice: 42.00,
    currentPriceUsd: 48.00,
    addedAt: Date.now() - 86400000 * 20,
    notes: 'Full playset',
  }
];

// Local cache helpers
function loadLocalDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(LOCAL_DECKS_KEY);
    if (raw) {
      const parsed: Deck[] = JSON.parse(raw);
      return parsed.filter((d) => !d.id.startsWith('sample-'));
    }
  } catch (e) {
    console.error('Error loading local decks:', e);
  }
  return [];
}

function saveLocalDecks(decks: Deck[]) {
  localStorage.setItem(LOCAL_DECKS_KEY, JSON.stringify(decks));
}

function loadLocalCollection(): CollectionCard[] {
  try {
    const raw = localStorage.getItem(LOCAL_COLLECTION_KEY);
    if (raw) {
      const parsed: CollectionCard[] = JSON.parse(raw);
      return parsed.filter((c) => !c.id.startsWith('col-sample-'));
    }
  } catch (e) {
    console.error('Error loading local collection:', e);
  }
  return [];
}

function saveLocalCollection(cards: CollectionCard[]) {
  localStorage.setItem(LOCAL_COLLECTION_KEY, JSON.stringify(cards));
}

function loadLocalBinders(): Binder[] {
  try {
    const raw = localStorage.getItem(LOCAL_BINDERS_KEY);
    if (raw !== null) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading local binders:', e);
  }
  return [DEFAULT_BINDER];
}

function saveLocalBinders(binders: Binder[]) {
  localStorage.setItem(LOCAL_BINDERS_KEY, JSON.stringify(binders));
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'local' | 'error';

/**
 * Storage Service: Client-side local storage engine with external database diagnostics
 */
export class StorageService {
  private static statusListeners: Set<(status: SyncStatus, error?: string) => void> = new Set();
  private static currentStatus: SyncStatus = 'local';
  private static deckListeners: Set<(decks: Deck[]) => void> = new Set();
  private static colListeners: Set<(cards: CollectionCard[]) => void> = new Set();
  private static binderListeners: Set<(binders: Binder[]) => void> = new Set();

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

  public static getLocalDecks(): Deck[] {
    return loadLocalDecks();
  }

  public static getLocalCollection(): CollectionCard[] {
    return loadLocalCollection();
  }

  public static getLocalBinders(): Binder[] {
    return loadLocalBinders();
  }

  /**
   * Diagnostic: Test connection to an external database / API endpoint
   */
  public static async testConnection(targetUrl?: string): Promise<{
    status: 'connected' | 'warning' | 'unreachable' | 'local_only';
    latencyMs: number;
    httpStatus?: number;
    targetUrl: string;
    details?: any;
    error?: string;
  }> {
    const url = targetUrl?.trim() || getRemoteApiUrl();
    if (!url) {
      return {
        status: 'local_only',
        latencyMs: 0,
        targetUrl: 'Local Browser Storage',
        details: 'No remote API or database URL specified. Operating in client-side storage mode.',
      };
    }

    const start = Date.now();
    try {
      // Use local server proxy ping if available to avoid browser CORS issues
      const pingUrl = `/api/diagnostics/ping?url=${encodeURIComponent(url)}`;
      const res = await fetch(pingUrl);
      const data = await res.json();
      return {
        status: data.status === 'connected' ? 'connected' : data.status === 'warning' ? 'warning' : 'unreachable',
        latencyMs: data.latencyMs ?? (Date.now() - start),
        httpStatus: data.httpStatus,
        targetUrl: url,
        details: data.response,
        error: data.error,
      };
    } catch {
      // Direct fetch fallback in case running in purely static mode
      try {
        const directRes = await fetch(url, { method: 'GET', mode: 'cors' });
        const latencyMs = Date.now() - start;
        return {
          status: directRes.ok ? 'connected' : 'warning',
          latencyMs,
          httpStatus: directRes.status,
          targetUrl: url,
        };
      } catch (err: any) {
        return {
          status: 'unreachable',
          latencyMs: Date.now() - start,
          targetUrl: url,
          error: err.message || 'Failed to establish connection to target endpoint',
        };
      }
    }
  }

  /**
   * Get storage stats & diagnostics
   */
  public static getStorageDiagnostics() {
    const decks = loadLocalDecks();
    const binders = loadLocalBinders();
    const collection = loadLocalCollection();
    const vaultId = getCurrentVaultId();
    const remoteApi = getRemoteApiUrl();

    let storageBytes = 0;
    try {
      storageBytes = (localStorage.getItem(LOCAL_DECKS_KEY)?.length || 0) +
                     (localStorage.getItem(LOCAL_BINDERS_KEY)?.length || 0) +
                     (localStorage.getItem(LOCAL_COLLECTION_KEY)?.length || 0);
    } catch {
      // ignore
    }

    return {
      vaultId,
      remoteApiUrl: remoteApi || 'None (Local Mode)',
      counts: {
        decks: decks.length,
        binders: binders.length,
        collectionCards: collection.length,
      },
      approxSizeBytes: storageBytes,
      status: this.currentStatus,
    };
  }

  /**
   * Export all data for the current vault as a JSON string
   */
  public static exportVaultJson(): string {
    const data = {
      vaultId: getCurrentVaultId(),
      exportedAt: new Date().toISOString(),
      decks: loadLocalDecks(),
      binders: loadLocalBinders(),
      collection: loadLocalCollection(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import data into the current vault from a JSON backup
   */
  public static importVaultJson(jsonString: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.decks)) {
        saveLocalDecks(data.decks);
        this.deckListeners.forEach((cb) => cb(data.decks));
      }
      if (Array.isArray(data.binders)) {
        saveLocalBinders(data.binders);
        this.binderListeners.forEach((cb) => cb(data.binders));
      }
      if (Array.isArray(data.collection)) {
        saveLocalCollection(data.collection);
        this.colListeners.forEach((cb) => cb(data.collection));
      }
      if (data.vaultId) {
        setCurrentVaultId(data.vaultId);
      }
      this.setStatus('local');
      return { success: true, message: 'Vault data restored successfully!' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Invalid JSON format' };
    }
  }

  static subscribeDecks(onUpdate: (decks: Deck[]) => void): Unsubscribe {
    this.deckListeners.add(onUpdate);
    const localDecks = loadLocalDecks();
    onUpdate(localDecks);
    return () => {
      this.deckListeners.delete(onUpdate);
    };
  }

  static subscribeCollection(onUpdate: (cards: CollectionCard[]) => void): Unsubscribe {
    this.colListeners.add(onUpdate);
    const localCol = loadLocalCollection();
    onUpdate(localCol);
    return () => {
      this.colListeners.delete(onUpdate);
    };
  }

  static subscribeBinders(onUpdate: (binders: Binder[]) => void): Unsubscribe {
    this.binderListeners.add(onUpdate);
    const localBinders = loadLocalBinders();
    onUpdate(localBinders);
    return () => {
      this.binderListeners.delete(onUpdate);
    };
  }

  /**
   * Save or update a Binder
   */
  static async saveBinder(binder: Binder): Promise<void> {
    const updated: Binder = {
      ...binder,
      updatedAt: Date.now(),
    };

    const local = loadLocalBinders();
    const idx = local.findIndex((b) => b.id === updated.id);
    if (idx >= 0) {
      local[idx] = updated;
    } else {
      local.unshift(updated);
    }
    saveLocalBinders(local);
    this.binderListeners.forEach((cb) => cb(local));
    this.setStatus('local');
  }

  /**
   * Create a new Binder
   */
  static async createBinder(name: string, description?: string): Promise<Binder> {
    const newBinder: Binder = {
      id: `binder-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: name.trim(),
      description: description?.trim() || '',
      cardCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.saveBinder(newBinder);
    return newBinder;
  }

  /**
   * Delete a binder
   */
  static async deleteBinder(binderId: string): Promise<void> {
    const local = loadLocalBinders().filter((b) => b.id !== binderId);
    saveLocalBinders(local);
    this.binderListeners.forEach((cb) => cb(local));
    this.setStatus('local');
  }

  /**
   * Save or update a Deck
   */
  static async saveDeck(deck: Deck): Promise<void> {
    const updated: Deck = {
      ...deck,
      updatedAt: Date.now(),
    };

    const local = loadLocalDecks();
    const idx = local.findIndex((d) => d.id === updated.id);
    if (idx >= 0) {
      local[idx] = updated;
    } else {
      local.unshift(updated);
    }
    saveLocalDecks(local);
    this.deckListeners.forEach((cb) => cb(local));
    this.setStatus('local');
  }

  /**
   * Delete a deck
   */
  static async deleteDeck(deckId: string): Promise<void> {
    const local = loadLocalDecks().filter((d) => d.id !== deckId);
    saveLocalDecks(local);
    this.deckListeners.forEach((cb) => cb(local));
    this.setStatus('local');
  }

  /**
   * Add or update a card in collection
   */
  static async saveCollectionCard(card: CollectionCard): Promise<void> {
    const local = loadLocalCollection();
    const idx = local.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      local[idx] = card;
    } else {
      local.unshift(card);
    }
    saveLocalCollection(local);
    this.colListeners.forEach((cb) => cb(local));
    this.setStatus('local');
  }

  /**
   * Remove a card from collection
   */
  static async deleteCollectionCard(cardId: string): Promise<void> {
    const local = loadLocalCollection().filter((c) => c.id !== cardId);
    saveLocalCollection(local);
    this.colListeners.forEach((cb) => cb(local));
    this.setStatus('local');
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
    this.setStatus('local');
    return updatedDeck;
  }

  /**
   * Real-time refresh prices for all cards in collection
   */
  static async refreshCollectionPrices(cards: CollectionCard[]): Promise<CollectionCard[]> {
    const scryfallIds = cards.map((c) => c.scryfallId).filter(Boolean);
    if (scryfallIds.length === 0) return cards;

    this.setStatus('syncing');
    const priceMap = await fetchBatchCardPrices(scryfallIds);

    const updatedList: CollectionCard[] = [];
    for (const item of cards) {
      const fresh = priceMap.get(item.scryfallId);
      const updatedItem: CollectionCard = {
        ...item,
        currentPriceUsd: fresh?.usd !== undefined ? fresh.usd : item.currentPriceUsd,
      };
      updatedList.push(updatedItem);
      await this.saveCollectionCard(updatedItem);
    }

    this.setStatus('local');
    return updatedList;
  }
}

// Developer console helpers attached to window
if (typeof window !== 'undefined') {
  (window as any).StorageService = StorageService;
  (window as any).testConnection = async (url?: string) => {
    console.log('%c[Database / API Diagnostics]', 'color: #38bdf8; font-size: 14px; font-weight: bold;');
    const res = await StorageService.testConnection(url);
    console.log('Diagnostics Result:', res);
    return res;
  };
  (window as any).testDbConnection = (window as any).testConnection;
  (window as any).getStorageDiagnostics = () => {
    const diag = StorageService.getStorageDiagnostics();
    console.table(diag.counts);
    console.log('Diagnostics:', diag);
    return diag;
  };
}
