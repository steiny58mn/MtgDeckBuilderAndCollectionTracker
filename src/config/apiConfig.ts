/**
 * Centralized API & Backend Configuration
 * Single source of truth for API base URLs, tenant headers, and fetch handling.
 */

// Default URLs
export const DEFAULT_LOCAL_API_URL = 'https://api.frostpointlabs.com';
export const DEFAULT_PROD_API_URL = 'https://api.frostpointlabs.com';

// Storage Keys
export const STORAGE_API_BASE_KEY = 'mtg_custom_api_base_url';
export const STORAGE_VAULT_KEY = 'mtg_cloud_vault_id';
export const STORAGE_AUTH_SESSION_KEY = 'mtg_auth_session';

// Google OAuth Client ID
export const GOOGLE_CLIENT_ID = ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';

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
 * 1. Runtime override in localStorage['mtg_custom_api_base_url'] (cleans up stale localhost:5205 entries)
 * 2. Vite environment variable import.meta.env.VITE_API_BASE_URL
 * 3. Default to production API URL -> https://api.frostpointlabs.com
 */
export function getApiBaseUrl(): string {
  const isLocal = isLocalEnvironment();

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_API_BASE_KEY);
    if (saved !== null && saved.trim() !== '') {
      const cleanSaved = saved.trim().replace(/\/+$/, '');
      // If saved URL points to port 5205 / 7091 or frontend dev hostname or run.app, clear it so it defaults to live API
      if (
        cleanSaved.includes(':5205') ||
        cleanSaved.includes(':7091') ||
        cleanSaved.includes('run.app') ||
        (!isLocal && (cleanSaved.includes('localhost') || cleanSaved.includes('127.0.0.1')))
      ) {
        localStorage.removeItem(STORAGE_API_BASE_KEY);
      } else if (cleanSaved.startsWith('http://') || cleanSaved.startsWith('https://')) {
        return cleanSaved;
      }
    }
  }

  const envUrl = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envUrl) {
    // Safety guard: If an unrunning localhost port was specified, fall back to production API URL
    if (
      envUrl.includes(':5205') ||
      envUrl.includes(':7091') ||
      (!isLocal && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1') || envUrl.includes('run.app')))
    ) {
      return DEFAULT_PROD_API_URL;
    }
    return envUrl.replace(/\/+$/, '');
  }

  return DEFAULT_PROD_API_URL;
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
// Tenant / User Authentication Identifiers
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
 * Get standard headers including user authentication (Bearer token, username, email, userId)
 */
export function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...customHeaders,
  };

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_AUTH_SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (session?.token) {
          headers['Authorization'] = `Bearer ${session.token}`;
        }
        if (session?.user?.username) {
          headers['X-Username'] = session.user.username;
        }
        if (session?.user?.email) {
          headers['X-Email'] = session.user.email;
        }
        if (session?.user?.userId) {
          headers['X-User-Id'] = session.user.userId;
        }
      }
    } catch {
      // ignore json errors
    }
  }

  // Backward compatibility fallback for unauthenticated requests
  if (!headers['X-Username'] && !headers['Authorization']) {
    const vaultId = getVaultId();
    headers['X-Vault-Id'] = vaultId;
  }

  return headers;
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
 * - Automatically injects standard Auth headers (Authorization, X-Username, X-Email, X-User-Id)
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

  // If sending FormData body, ensure Content-Type header is omitted so browser adds boundary
  if (fetchInit.body instanceof FormData) {
    delete (resolvedHeaders as any)['Content-Type'];
    delete (resolvedHeaders as any)['content-type'];
  }

  const primaryUrl = buildApiUrl(path, query);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const searchParams = query ? `?${new URLSearchParams(
    Object.entries(query)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  ).toString()}` : '';
  const prodUrl = `${DEFAULT_PROD_API_URL}${normalizedPath}${searchParams}`;

  try {
    const res = await fetch(primaryUrl, {
      ...fetchInit,
      headers: resolvedHeaders,
    });

    if (!res.ok && (res.status === 404 || res.status === 502 || res.status === 504) && primaryUrl !== prodUrl) {
      console.warn(`[API Config] Primary fetch to ${primaryUrl} returned HTTP ${res.status}; retrying against ${prodUrl}`);
      const retryRes = await fetch(prodUrl, {
        ...fetchInit,
        headers: resolvedHeaders,
      });
      if (retryRes.ok) return retryRes;
    }

    return res;
  } catch (err: any) {
    if (fetchInit?.signal?.aborted) {
      throw err;
    }
    if (primaryUrl !== prodUrl) {
      try {
        console.warn(`[API Config] Primary fetch to ${primaryUrl} failed (${err?.message}); retrying against ${prodUrl}`);
        return await fetch(prodUrl, {
          ...fetchInit,
          headers: resolvedHeaders,
        });
      } catch {
        // continue to dev proxy fallback if applicable
      }
    }

    // If running in local dev, attempt relative Vite dev server proxy as final fallback
    if (isLocalEnvironment() && primaryUrl.startsWith('http')) {
      const fallbackUrl = `${normalizedPath}${searchParams}`;
      try {
        console.warn(`[API Config] Attempting dev proxy fallback to ${fallbackUrl}`);
        return await fetch(fallbackUrl, {
          ...fetchInit,
          headers: resolvedHeaders,
        });
      } catch {
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
