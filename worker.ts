/**
 * Cloudflare Worker (_worker.js / worker.ts)
 * Edge Proxy for Scryfall, EDHREC, and MtgApps API (mtgappsapi.azurewebsites.net).
 */

export interface Env {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  API_BASE_URL?: string;
  API_URL?: string;
  BACKEND_URL?: string;
  [key: string]: any;
}

export const DEFAULT_API_BASE = 'https://mtgappsapi.azurewebsites.net';

/**
 * Resolve target backend base URL from environment variables or optional header override
 */
export function getBackendBaseUrl(env: Env, request?: Request): string {
  const headerOverride = request?.headers.get('x-api-target') || request?.headers.get('x-api-base-url');
  if (headerOverride) {
    return headerOverride.trim().replace(/\/+$/, '');
  }

  const envUrl = env.API_BASE_URL || env.API_URL || env.BACKEND_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  return DEFAULT_API_BASE;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const apiTarget = getBackendBaseUrl(env, request);

    // 1. CORS Preflight Handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Vault-Id, X-User-Id, X-Api-Target, X-Api-Base-Url',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Vault-Id, X-User-Id, X-Api-Target, X-Api-Base-Url',
    };

    // 2. Health & Diagnostics Check
    if (url.pathname === '/api/health' || url.pathname === '/api/functions-check') {
      return new Response(
        JSON.stringify({
          status: 'online',
          engine: 'Cloudflare Worker Edge Proxy',
          timestamp: new Date().toISOString(),
          remoteApiBase: apiTarget,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Engine': 'Cloudflare-Worker',
            ...corsHeaders,
          },
        }
      );
    }

    // 3. Remote MtgTools & DeckBuilder API Proxy
    if (url.pathname.startsWith('/mtgtools') || url.pathname.startsWith('/deckbuilder')) {
      const targetUrl = `${apiTarget}${url.pathname}${url.search}`;

      try {
        const headers: Record<string, string> = {
          'Accept': 'application/json',
        };
        const contentType = request.headers.get('content-type');
        if (contentType) headers['Content-Type'] = contentType;
        const vaultId = request.headers.get('x-vault-id');
        if (vaultId) headers['X-Vault-Id'] = vaultId;
        const userId = request.headers.get('x-user-id');
        if (userId) headers['X-User-Id'] = userId;
        const auth = request.headers.get('authorization');
        if (auth) headers['Authorization'] = auth;

        const remoteRes = await fetch(targetUrl, {
          method: request.method,
          headers,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
        });

        const data = await remoteRes.text();
        return new Response(data, {
          status: remoteRes.status,
          headers: {
            'Content-Type': remoteRes.headers.get('content-type') || 'application/json',
            ...corsHeaders,
          },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: `Failed to proxy request to API at ${apiTarget}`, details: err.message }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }
    }

    // 4. Scryfall API Proxy (with proper User-Agent & caching)
    if (url.pathname.startsWith('/api/scryfall')) {
      const targetPath = url.pathname.replace(/^\/api\/scryfall/, '');
      const targetUrl = `https://api.scryfall.com${targetPath}${url.search}`;

      try {
        const scryfallRes = await fetch(targetUrl, {
          method: request.method,
          headers: {
            'User-Agent': 'MtgDeckBuilderAndCollectionTracker/1.0 (https://github.com/steiny58mn/MtgDeckBuilderAndCollectionTracker)',
            'Accept': 'application/json;q=0.9,*/*;q=0.8',
            ...(request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
          body: request.method === 'POST' ? await request.text() : undefined,
        });

        const data = await scryfallRes.text();
        return new Response(data, {
          status: scryfallRes.status,
          headers: {
            'Content-Type': scryfallRes.headers.get('content-type') || 'application/json',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            ...corsHeaders,
          },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Scryfall proxy error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // 5. EDHREC API Proxy
    if (url.pathname.startsWith('/api/edhrec')) {
      const targetPath = url.pathname.replace(/^\/api\/edhrec/, '');
      const targetUrl = `https://json.edhrec.com${targetPath}${url.search}`;

      try {
        const edhrecRes = await fetch(targetUrl, {
          method: request.method,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://edhrec.com/',
          },
        });

        if (!edhrecRes.ok) {
          return new Response(
            JSON.stringify({
              container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
              status: edhrecRes.status,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            }
          );
        }

        const data = await edhrecRes.text();
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=7200',
            ...corsHeaders,
          },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
            error: err.message,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }
    }

    // 6. Static Assets (SPA fallback)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
