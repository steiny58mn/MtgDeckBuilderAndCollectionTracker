/**
 * MTG Apps API Service Client
 * Connects to Magic: The Gathering C# Web API Backend at mtgappsapi.azurewebsites.net
 */

export const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL as string) || 'https://mtgappsapi.azurewebsites.net';

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

/**
 * Check backend service health and available endpoints
 */
export async function getApiHealth(): Promise<ApiHealthResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('API health check error:', err);
    return null;
  }
}

/**
 * Fetch list of valid deck color combinations from backend
 */
export async function getDeckColors(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/mtgtools/deckcolors`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Error fetching deck colors from backend:', err);
    // Standard MTG 32 color combinations fallback
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
  try {
    const res = await fetch(`${API_BASE_URL}/mtgtools/turso/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Error fetching Turso status:', err);
    return null;
  }
}

/**
 * Fetch decks from deck builder endpoint
 */
export async function getRemoteDecks(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/deckbuilder/decks`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('Error fetching decks from backend:', err);
    return [];
  }
}

/**
 * Fetch card collection from deck builder endpoint
 */
export async function getRemoteCollection(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/deckbuilder/collection`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('Error fetching collection from backend:', err);
    return [];
  }
}

/**
 * Parse MTGO Game Log using backend parser
 */
export async function parseMtgoGameLog(file: File | Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, 'gamelog.txt');

  const res = await fetch(`${API_BASE_URL}/mtgtools/parsemtgolog`, {
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
  const formData = new FormData();
  formData.append('file', file, 'decks.txt');

  const res = await fetch(`${API_BASE_URL}/mtgtools/comparefiles`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Failed to compare deck files (HTTP ${res.status})`);
  }
  return await res.json();
}
