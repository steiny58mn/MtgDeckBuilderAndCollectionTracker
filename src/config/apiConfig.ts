/**
 * Centralized API & Backend Configuration
 * Single source of truth for API base URLs, tenant headers, and fetch handling.
 */

// Default URLs
export const DEFAULT_LOCAL_API_URL = 'http://localhost:5205';
export const DEFAULT_PROD_API_URL = 'https://api.frostpointlabs.com';

// Storage Keys
export const STORAGE_API_BASE_KEY = 'mtg_custom_api_base_url';
export const STORAGE_VAULT_KEY = 'mtg_cloud_vault_id';

/**
 * Detect whether code is currently running in a local browser environment (localhost / 127.0.0.1)
 */
export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Resolves the active API Base URL in prioritized order:
 * 1. Runtime override in localStorage['mtg_custom_api_base_url']
 * 2. Vite environment variable import.meta.env.VITE_API_BASE_URL (ignoring localhost URLs when running on remote domains)
 * 3. Localhost browser detection -> http://localhost:5205
 * 4. Production Cloudflare deployment -> '' (relative same-origin proxy via worker.ts) or DEFAULT_PROD_API_URL
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_API_BASE_KEY);
    if (saved !== null && saved.trim() !== '') {
      return saved.trim().replace(/\/+$/, '');
    }
  }

  const isLocal = isLocalEnvironment();
  const envUrl = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.trim();

  if (envUrl) {
    // Safety guard for Cloudflare / remote deployments:
    // If a localhost URL was baked in during a local build, ignore it on remote hostnames.
    if (!isLocal && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return '';
    }
    return envUrl.replace(/\/+$/, '');
  }

  if (isLocal) {
    return DEFAULT_LOCAL_API_URL;
  }

  // In Cloudflare production, relative same-origin '' is handled directly by the
  // Cloudflare Worker edge proxy (worker.ts -> api.frostpointlabs.com)
  return '';
}

/**
 * Set active API Base URL (persisted in localStorage).
 * Set to empty string or null to reset to default.
 */
export function setApiBaseUrl(url: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (!clean) {
    localStorage.removeItem(STORAGE_API_BASE_KEY);
    console.info(`[API Config] 🌐 Custom API Base URL cleared -> using default: "${getApiBaseUrl()}"`);
  } else {
    localStorage.setItem(STORAGE_API_BASE_KEY, clean);
    console.info(`[API Config] 🌐 Custom API Base URL set to: "${clean}"`);
  }
}

/**
 * Reset active API Base URL back to default.
 */
export function resetApiBaseUrl(): void {
  setApiBaseUrl(null);
}

// ============================================================================
// Tenant / Vault Partition Identifiers
// ============================================================================

export function generateRandomVaultId(): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `vault-${rand}`;
}

export function getVaultId(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_VAULT_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
    const newId = generateRandomVaultId();
    localStorage.setItem(STORAGE_VAULT_KEY, newId);
    console.info(`[API Config] 🔑 Initialized new random Vault ID: "${newId}".`);
    return newId;
  }
  return 'vault-default';
}

export function setVaultId(vaultId: string): void {
  if (typeof window !== 'undefined') {
    const clean = vaultId.trim();
    if (!clean) {
      const fresh = generateRandomVaultId();
      localStorage.setItem(STORAGE_VAULT_KEY, fresh);
      console.info(`[API Config] 🔑 Vault ID cleared -> generated fresh Vault ID: "${fresh}".`);
    } else {
      localStorage.setItem(STORAGE_VAULT_KEY, clean);
      console.info(`[API Config] 🔑 Vault ID set to: "${clean}".`);
    }
  }
}

export function resetVaultId(): string {
  const fresh = generateRandomVaultId();
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_VAULT_KEY, fresh);
    console.info(`[API Config] 🔑 Vault ID reset to: "${fresh}".`);
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

// ============================================================================
// Unified API URL & Fetch Resolver
// ============================================================================

/**
 * Build a fully-qualified API URL for an endpoint path and optional query parameters.
 * E.g. buildApiUrl('/mtgtools/getbbcode', { color: 'Izzet', bbCodeType: 3 })
 * -> "http://localhost:5205/mtgtools/getbbcode?color=Izzet&bbCodeType=3" (locally)
 * -> "/mtgtools/getbbcode?color=Izzet&bbCodeType=3" (on Cloudflare via worker.ts proxy)
 */
export function buildApiUrl(
  path: string,
  queryParams?: Record<string, string | number | boolean | null | undefined>
): string {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  let queryString = '';
  if (queryParams) {
    const searchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const qs = searchParams.toString();
    if (qs) queryString = `?${qs}`;
  }

  if (!baseUrl) {
    return `${normalizedPath}${queryString}`;
  }

  return `${baseUrl}${normalizedPath}${queryString}`;
}

export interface ApiFetchOptions extends RequestInit {
  query?: Record<string, string | number | boolean | null | undefined>;
  skipAuth?: boolean;
}

/**
 * Centralized fetch helper for all FrostpointApi backend endpoints.
 * - Resolves target URL using buildApiUrl
 * - Automatically injects standard Auth headers (X-Vault-Id, X-User-Id)
 * - In local development, seamlessly falls back to Vite relative proxy if direct port fails
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { query, skipAuth = false, headers: customHeaders, ...fetchInit } = options;

  const resolvedHeaders = skipAuth
    ? (customHeaders as Record<string, string> || {})
    : getAuthHeaders(
        customHeaders instanceof Headers
          ? Object.fromEntries(customHeaders.entries())
          : (customHeaders as Record<string, string> || {})
      );

  const primaryUrl = buildApiUrl(path, query);

  try {
    return await fetch(primaryUrl, {
      ...fetchInit,
      headers: resolvedHeaders,
    });
  } catch (err: any) {
    // If running in local dev and direct call to localhost:5205 failed (e.g. CORS or network issue),
    // attempt relative Vite dev server proxy as fallback
    if (isLocalEnvironment() && primaryUrl.startsWith('http')) {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const searchParams = query ? `?${new URLSearchParams(
        Object.entries(query)
          .filter(([_, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString()}` : '';
      const fallbackUrl = `${normalizedPath}${searchParams}`;

      try {
        console.warn(`[API Config] Primary fetch to ${primaryUrl} failed; attempting dev proxy fallback to ${fallbackUrl}`);
        return await fetch(fallbackUrl, {
          ...fetchInit,
          headers: resolvedHeaders,
        });
      } catch {
        // rethrow original error
        throw err;
      }
    }
    throw err;
  }
}

// Expose convenience console helpers in browser devtools
if (typeof window !== 'undefined') {
  (window as any).setApiUrl = setApiBaseUrl;
  (window as any).getApiUrl = getApiBaseUrl;
  (window as any).resetApiUrl = resetApiBaseUrl;
}
