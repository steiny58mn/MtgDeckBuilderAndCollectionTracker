/**
 * Cloudflare Worker (_worker.js / worker.ts)
 * Lightweight Edge Proxy for Scryfall & EDHREC APIs, with static asset serving.
 * Backend DB storage has been decoupled to the external MtgTools API.
 */

interface Env {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  [key: string]: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight Handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    };

    // 2. Health & Diagnostics Check
    if (url.pathname === '/api/health' || url.pathname === '/api/functions-check') {
      return new Response(
        JSON.stringify({
          status: 'online',
          engine: 'Cloudflare Worker',
          timestamp: new Date().toISOString(),
          message: 'Frontend edge proxy is active. Data is stored locally or synchronized via external MtgTools API.',
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

    // 3. Scryfall API Proxy (prevents CORS & adblocker issues in browser)
    if (url.pathname.startsWith('/api/scryfall')) {
      const targetPath = url.pathname.replace(/^\/api\/scryfall/, '');
      const targetUrl = `https://api.scryfall.com${targetPath}${url.search}`;

      try {
        const scryfallRes = await fetch(targetUrl, {
          method: request.method,
          headers: {
            'User-Agent': 'MTGCreativeStudio/1.0',
            'Accept': 'application/json',
            ...(request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
          body: request.method === 'POST' ? await request.text() : undefined,
        });

        const data = await scryfallRes.text();
        return new Response(data, {
          status: scryfallRes.status,
          headers: {
            'Content-Type': scryfallRes.headers.get('content-type') || 'application/json',
            'Cache-Control': 'public, max-age=3600',
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

    // 4. EDHREC API Proxy
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

    // 5. Static Assets (SPA fallback)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
