/**
 * MTG Apps API Service Client & Diagnostics Suite
 * Connects to Magic: The Gathering C# Web API Backend at mtgappsapi.azurewebsites.net
 */

const STORAGE_API_BASE_KEY = 'mtg_custom_api_base_url';

export const DEFAULT_API_BASE_URL = 
  ((import.meta as any).env?.VITE_API_BASE_URL as string) || 'https://mtgappsapi.azurewebsites.net';

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
    const res = await fetch(targetUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[API] Health check error:', err);
    return null;
  }
}

/**
 * Fetch list of valid deck color combinations from backend
 */
export async function getDeckColors(): Promise<string[]> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/mtgtools/deckcolors` : '/mtgtools/deckcolors';
  try {
    const res = await fetch(targetUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[API] Error fetching deck colors:', err);
    return [
      'Colorless', 'White', 'Blue', 'Black', 'Red', 'Green',
      'Azorius', 'Dimir', 'Rakdos', 'Gruul', 'Selesnya',
      'Orzhov', 'Izzet', 'Golgari', 'Boros', 'Simic',
      'Esper', 'Grixis', 'Jund', 'Naya', 'Bant',
      'Abzan', 'Jeskai', 'Sultai', 'Mardu', 'Temur',
      'WUBR', 'UBRG', 'WBRG', 'WURG', 'WUBG', 'WUBRG'
    ];
  }
}

/**
 * Check Turso database connection status on backend
 */
export async function getTursoStatus(): Promise<TursoStatusResponse | null> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/mtgtools/turso/status` : '/mtgtools/turso/status';
  try {
    const res = await fetch(targetUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[API] Error fetching Turso status:', err);
    return null;
  }
}

/**
 * Fetch decks from deck builder endpoint
 */
export async function getRemoteDecks(): Promise<any[]> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/decks` : '/deckbuilder/decks';
  try {
    const res = await fetch(targetUrl);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[API] Error fetching decks:', err);
    return [];
  }
}

/**
 * Fetch card collection from deck builder endpoint
 */
export async function getRemoteCollection(): Promise<any[]> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/deckbuilder/collection` : '/deckbuilder/collection';
  try {
    const res = await fetch(targetUrl);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[API] Error fetching collection:', err);
    return [];
  }
}

/**
 * Parse MTGO Game Log using backend parser
 */
export async function parseMtgoGameLog(file: File | Blob): Promise<string> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/mtgtools/parsemtgolog` : '/mtgtools/parsemtgolog';
  const formData = new FormData();
  formData.append('file', file, 'gamelog.txt');

  const res = await fetch(targetUrl, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Failed to parse MTGO log (HTTP ${res.status})`);
  }
  return await res.text();
}

/**
 * Compare two deck files using backend comparator
 */
export async function compareDeckFiles(file: File | Blob): Promise<any> {
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/mtgtools/comparefiles` : '/mtgtools/comparefiles';
  const formData = new FormData();
  formData.append('file', file, 'decks.txt');

  const res = await fetch(targetUrl, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Failed to compare deck files (HTTP ${res.status})`);
  }
  return await res.json();
}

/**
 * Run a comprehensive suite of connectivity and API diagnostics
 */
export async function runFullDiagnostics(customBaseUrl?: string): Promise<DiagnosticResult[]> {
  const baseUrl = customBaseUrl !== undefined ? customBaseUrl : getApiBaseUrl();
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  const testConfigs = [
    {
      id: 'health',
      name: 'API Root & Health Check',
      url: baseUrl ? `${baseUrl}/` : '/',
      method: 'GET',
    },
    {
      id: 'turso_status',
      name: 'Turso DB Status (/mtgtools/turso/status)',
      url: baseUrl ? `${baseUrl}/mtgtools/turso/status` : '/mtgtools/turso/status',
      method: 'GET',
    },
    {
      id: 'deck_colors',
      name: 'Deck Colors Endpoint (/mtgtools/deckcolors)',
      url: baseUrl ? `${baseUrl}/mtgtools/deckcolors` : '/mtgtools/deckcolors',
      method: 'GET',
    },
    {
      id: 'deckbuilder_decks',
      name: 'Remote Decks Endpoint (/deckbuilder/decks)',
      url: baseUrl ? `${baseUrl}/deckbuilder/decks` : '/deckbuilder/decks',
      method: 'GET',
    },
    {
      id: 'deckbuilder_col',
      name: 'Remote Collection Endpoint (/deckbuilder/collection)',
      url: baseUrl ? `${baseUrl}/deckbuilder/collection` : '/deckbuilder/collection',
      method: 'GET',
    },
    {
      id: 'local_storage',
      name: 'Turso Local Vault Sync (/api/storage/test/all)',
      url: '/api/storage/TEST-VAULT/all',
      method: 'GET',
    },
    {
      id: 'scryfall_proxy',
      name: 'Scryfall Proxy (/api/scryfall/cards/random)',
      url: '/api/scryfall/cards/random',
      method: 'GET',
    },
    {
      id: 'edhrec_proxy',
      name: 'EDHREC Proxy (/api/edhrec/pages/commanders/atraxa-praetors-voice.json)',
      url: '/api/edhrec/pages/commanders/atraxa-praetors-voice.json',
      method: 'GET',
    },
  ];

  console.groupCollapsed(`[API Diagnostics] Running tests against base: "${baseUrl || '(relative proxy)'}" (Origin: ${currentOrigin})`);

  const results: DiagnosticResult[] = [];

  for (const test of testConfigs) {
    const { res, error, durationMs, isCors } = await fetchWithDebug(test.url, {
      method: test.method,
      headers: { Accept: 'application/json' },
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
          ? `CORS / Network Error: The browser blocked this request to "${test.url}". Likely missing Access-Control-Allow-Origin header on ${baseUrl || 'server'}.`
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

      results.push({
        id: test.id,
        name: test.name,
        targetUrl: test.url,
        status: isSuccess ? 'success' : 'failed',
        httpStatus: res.status,
        statusText: res.statusText,
        durationMs,
        responsePreview: preview,
        errorDetails: !isSuccess ? `Server returned HTTP status ${res.status} ${res.statusText}` : undefined,
      });
    }
  }

  console.groupEnd();
  return results;
}
