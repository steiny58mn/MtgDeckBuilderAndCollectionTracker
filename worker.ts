/**
 * Cloudflare Pages Advanced Mode Worker (_worker.js)
 * Placed directly inside the dist/ build output directory so Cloudflare Pages ALWAYS
 * executes serverless API routes even if only the dist/ folder is deployed.
 */

import { createClient, Client } from "@libsql/client/web";

interface Env {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  [key: string]: any;
}

function isPlaceholder(val?: string | null): boolean {
  if (!val) return true;
  const lower = val.toLowerCase().trim();
  return (
    lower.includes('your-database-name') ||
    lower.includes('your-db-name') ||
    lower.includes('your_database_name') ||
    lower.includes('your_db_name') ||
    lower.includes('your-database') ||
    lower.includes('your_database') ||
    lower.includes('your-db') ||
    lower.includes('your_db') ||
    lower.includes('your-org') ||
    lower.includes('example.turso.io') ||
    lower.includes('<your') ||
    lower.includes('[your') ||
    lower.includes('your-turso-auth-token') ||
    lower.includes('your-auth-token') ||
    lower.includes('placeholder')
  );
}

function normalizeTursoUrl(rawUrl?: string): string | null {
  if (!rawUrl || isPlaceholder(rawUrl)) return null;
  let trimmed = rawUrl.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return null;
  
  if (trimmed.endsWith('.turso.io') && !trimmed.includes('://')) {
    trimmed = `libsql://${trimmed}`;
  }
  
  if (trimmed.startsWith('libsql://') || trimmed.startsWith('https://')) {
    trimmed = trimmed.replace(/\/+$/, '');
    return trimmed;
  }
  
  return null;
}

function maskTursoUrl(url?: string | null): string {
  if (!url) return 'Not Configured';
  try {
    const parsed = new URL(url.replace(/^libsql:\/\//, 'https://'));
    const host = parsed.hostname;
    const parts = host.split('.');
    if (parts.length > 2) {
      const dbName = parts[0];
      const maskedName = dbName.length > 4 ? `${dbName.slice(0, 3)}***${dbName.slice(-2)}` : `${dbName.slice(0, 2)}***`;
      return `libsql://${maskedName}.${parts.slice(1).join('.')}`;
    }
    return `libsql://${host}`;
  } catch {
    return url.length > 12 ? `${url.slice(0, 8)}...` : url;
  }
}

function findEnvVar(env: Env, keys: string[]): string | undefined {
  if (env && typeof env === 'object') {
    for (const key of keys) {
      if (env[key]) return String(env[key]);
    }
    // Case-insensitive check
    const lowerKeys = keys.map(k => k.toLowerCase());
    for (const [envKey, val] of Object.entries(env)) {
      if (val && lowerKeys.includes(envKey.toLowerCase())) {
        return String(val);
      }
    }
  }
  // Check globalThis
  const g = globalThis as any;
  if (g) {
    for (const key of keys) {
      if (g[key]) return String(g[key]);
    }
    if (g.process && g.process.env) {
      for (const key of keys) {
        if (g.process.env[key]) return String(g.process.env[key]);
      }
    }
  }
  return undefined;
}

function getDbClient(env: Env): { 
  client: Client | null; 
  url: string | null; 
  authToken?: string; 
  isRemote: boolean; 
  isConfigured: boolean;
  tokenLength: number;
  detectedEnvKeys: string[];
  error?: string;
} {
  const rawUrl = findEnvVar(env, ['TURSO_DATABASE_URL', 'TURSO_URL', 'TURSO_DB_URL', 'DATABASE_URL', 'VITE_TURSO_DATABASE_URL']);
  const rawAuthToken = findEnvVar(env, ['TURSO_AUTH_TOKEN', 'TURSO_TOKEN', 'AUTH_TOKEN', 'VITE_TURSO_AUTH_TOKEN']);

  const url = normalizeTursoUrl(rawUrl);
  const authToken = rawAuthToken?.trim()?.replace(/^['"]|['"]$/g, '') || undefined;
  const tokenLength = authToken ? authToken.length : 0;
  const detectedEnvKeys = Object.keys(env || {}).filter(k => k !== 'ASSETS');

  if (!url) {
    const isPlaceholderUrl = isPlaceholder(rawUrl);
    return {
      client: null,
      url: null,
      authToken: undefined,
      isRemote: false,
      isConfigured: false,
      tokenLength,
      detectedEnvKeys,
      error: isPlaceholderUrl
        ? `TURSO_DATABASE_URL is set to a placeholder ("${maskTursoUrl(rawUrl)}"). Please update with your real Turso database URL in Cloudflare Worker Secrets.`
        : `TURSO_DATABASE_URL is not detected in Cloudflare Worker environment variables. (Detected variables: [${detectedEnvKeys.join(', ') || 'none'}])`,
    };
  }

  try {
    const client = createClient({ url, authToken });
    return {
      client,
      url,
      authToken,
      isRemote: true,
      isConfigured: Boolean(url && authToken),
      tokenLength,
      detectedEnvKeys,
    };
  } catch (err: any) {
    return {
      client: null,
      url,
      authToken,
      isRemote: true,
      isConfigured: false,
      tokenLength,
      detectedEnvKeys,
      error: err?.message || 'Failed to initialize Turso client',
    };
  }
}

let initializedDb = false;
async function ensureTables(client: Client) {
  if (initializedDb) return;
  const tables = ['turso_decks', 'turso_binders', 'turso_collection'];
  for (const table of tables) {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        vault_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
    `);
    try {
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_${table}_vault ON ${table}(vault_id);`);
    } catch {
      // Index already exists
    }
  }
  initializedDb = true;
}

function jsonResponse(data: any, status = 200, customHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      'X-Engine': 'Cloudflare-Pages-Worker',
      'X-Functions-Compiled': 'true',
      ...customHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, context: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS Preflight for any API route
    if (request.method === 'OPTIONS' && path.startsWith('/api')) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
          'X-Engine': 'Cloudflare-Pages-Worker',
          'X-Functions-Compiled': 'true',
        },
      });
    }

    // If not an /api route, forward directly to Cloudflare Pages static assets (SPA)
    if (!path.startsWith('/api')) {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return env.ASSETS.fetch(request);
      }
      return new Response('Not Found', { status: 404 });
    }

    // Debug logging
    const rawDbUrl = env.TURSO_DATABASE_URL ? String(env.TURSO_DATABASE_URL).trim() : '';
    const rawToken = env.TURSO_AUTH_TOKEN ? String(env.TURSO_AUTH_TOKEN).trim() : '';
    const allEnvKeys = Object.keys(env || {}).filter(k => k !== 'ASSETS');

    console.log(`[Cloudflare Worker Engine] ⚡ ${request.method} ${path}`);

    // 0. GET /api/functions-check or /api/health
    if ((path === '/api/functions-check' || path === '/api/health') && request.method === 'GET') {
      const dbState = getDbClient(env);
      return jsonResponse({
        functionsCompiled: true,
        engine: 'Cloudflare Pages Worker (_worker.js in dist/)',
        timestamp: new Date().toISOString(),
        urlPath: path,
        environmentVariables: {
          allDetectedKeys: allEnvKeys,
          TURSO_DATABASE_URL: {
            present: Boolean(rawDbUrl),
            masked: maskTursoUrl(rawDbUrl),
            formatValid: Boolean(dbState.url),
          },
          TURSO_AUTH_TOKEN: {
            present: Boolean(rawToken),
            length: rawToken.length,
            looksLikeJWT: rawToken.startsWith('ey'),
          },
        },
        databaseStatus: {
          isConfigured: dbState.isConfigured,
          isRemote: dbState.isRemote,
          error: dbState.error || null,
        },
        troubleshooting: dbState.isConfigured
          ? 'Cloudflare Pages Worker is active and connected to remote Turso database.'
          : 'Worker active! Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Cloudflare Pages Settings -> Environment variables.',
      }, 200, {
        'X-Turso-Url-Present': String(Boolean(rawDbUrl)),
        'X-Turso-Token-Present': String(Boolean(rawToken)),
      });
    }

    // 1. GET /api/storage/status
    if (path === '/api/storage/status' && request.method === 'GET') {
      const dbState = getDbClient(env);
      return jsonResponse({
        status: 'ok',
        backend: 'turso',
        environment: 'cloudflare-pages-worker',
        functionsCompiled: true,
        isCloudConfigured: dbState.isConfigured,
        databaseUrlMasked: maskTursoUrl(dbState.url),
        hasAuthToken: Boolean(dbState.authToken),
        tokenLength: dbState.tokenLength,
        isRemote: dbState.isRemote,
        detectedEnvKeys: allEnvKeys,
        note: dbState.isConfigured 
          ? 'Turso Cloud database connected on Cloudflare Pages' 
          : 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Cloudflare Pages Settings -> Environment variables.',
      });
    }

    // 2. GET /api/storage/diagnostics
    if (path === '/api/storage/diagnostics' && request.method === 'GET') {
      const start = Date.now();
      const dbState = getDbClient(env);

      if (!dbState.client) {
        return jsonResponse({
          status: 'warning',
          environment: 'cloudflare-pages-worker',
          functionsCompiled: true,
          isRemote: false,
          databaseUrlMasked: maskTursoUrl(dbState.url),
          hasAuthToken: Boolean(dbState.authToken),
          tokenLength: dbState.tokenLength,
          latencyMs: Date.now() - start,
          counts: { decks: 0, binders: 0, collection: 0 },
          error: dbState.error || 'TURSO_DATABASE_URL is not configured in Cloudflare Pages environment variables.',
        });
      }

      try {
        await ensureTables(dbState.client);
        await dbState.client.execute('SELECT 1 as ping;');
        const latencyMs = Date.now() - start;

        const [dRes, bRes, cRes] = await Promise.all([
          dbState.client.execute('SELECT COUNT(*) as cnt FROM turso_decks;'),
          dbState.client.execute('SELECT COUNT(*) as cnt FROM turso_binders;'),
          dbState.client.execute('SELECT COUNT(*) as cnt FROM turso_collection;'),
        ]);

        return jsonResponse({
          status: 'connected',
          environment: 'cloudflare-pages-worker',
          functionsCompiled: true,
          isRemote: true,
          databaseUrlMasked: maskTursoUrl(dbState.url),
          hasAuthToken: Boolean(dbState.authToken),
          tokenLength: dbState.tokenLength,
          latencyMs,
          counts: {
            decks: Number(dRes.rows[0]?.cnt ?? 0),
            binders: Number(bRes.rows[0]?.cnt ?? 0),
            collection: Number(cRes.rows[0]?.cnt ?? 0),
          },
          error: null,
        });
      } catch (err: any) {
        return jsonResponse({
          status: 'local_fallback',
          environment: 'cloudflare-pages-worker',
          functionsCompiled: true,
          isRemote: false,
          databaseUrlMasked: maskTursoUrl(dbState.url),
          hasAuthToken: Boolean(dbState.authToken),
          tokenLength: dbState.tokenLength,
          latencyMs: Date.now() - start,
          counts: { decks: 0, binders: 0, collection: 0 },
          error: `Remote Turso connection failed (${err?.message || err}). Verify auth token and database URL permissions in Turso.`,
        });
      }
    }

    // 3. GET /api/storage/:vaultId/all
    const allMatch = path.match(/^\/api\/storage\/([^/]+)\/all\/?$/);
    if (allMatch && request.method === 'GET') {
      const vaultId = allMatch[1];
      const start = Date.now();
      const dbState = getDbClient(env);

      if (!dbState.client) {
        return jsonResponse({
          decks: [],
          binders: [],
          collection: [],
          isCloudConfigured: false,
          note: 'Operating on local browser cache (TURSO_DATABASE_URL not set in Cloudflare).',
        });
      }

      try {
        await ensureTables(dbState.client);
        const [decksRes, bindersRes, collectionRes] = await Promise.all([
          dbState.client.execute({ sql: 'SELECT data FROM turso_decks WHERE vault_id = ?', args: [vaultId] }),
          dbState.client.execute({ sql: 'SELECT data FROM turso_binders WHERE vault_id = ?', args: [vaultId] }),
          dbState.client.execute({ sql: 'SELECT data FROM turso_collection WHERE vault_id = ?', args: [vaultId] }),
        ]);

        const decks = decksRes.rows.map((r: any) => JSON.parse(r.data as string));
        const binders = bindersRes.rows.map((r: any) => JSON.parse(r.data as string));
        const collection = collectionRes.rows.map((r: any) => JSON.parse(r.data as string));

        return jsonResponse({ decks, binders, collection, isCloudConfigured: true });
      } catch (e: any) {
        return jsonResponse({
          decks: [],
          binders: [],
          collection: [],
          isCloudConfigured: false,
          error: e.message || 'Remote database query failed',
        });
      }
    }

    // 4. POST / PUT / PATCH /api/storage/:vaultId/:collectionId/:docId
    const docMatch = path.match(/^\/api\/storage\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
    if (docMatch && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
      const [, vaultId, collectionId, docId] = docMatch;
      const start = Date.now();
      const tableName = `turso_${collectionId}`;
      
      if (!['turso_decks', 'turso_binders', 'turso_collection'].includes(tableName)) {
        return jsonResponse({ error: 'Invalid collection' }, 400);
      }

      const dbState = getDbClient(env);
      if (!dbState.client) {
        console.warn(`[Cloudflare Worker] Write skipped for ${collectionId}/${docId}: TURSO_DATABASE_URL not set in Cloudflare Worker environment variables.`);
        return jsonResponse({ 
          success: false, 
          localOnly: true, 
          error: 'TURSO_DATABASE_URL is not configured in Cloudflare Worker Secrets.',
          troubleshooting: 'Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Cloudflare Dashboard -> Workers & Pages -> deckbuilder -> Settings -> Variables & Secrets.'
        }, 200);
      }

      try {
        const data = await request.json();
        await ensureTables(dbState.client);

        const insertSql = `INSERT INTO ${tableName} (id, vault_id, data, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET data = excluded.data, vault_id = excluded.vault_id, updated_at = excluded.updated_at`;

        await dbState.client.execute({
          sql: insertSql,
          args: [docId, vaultId, JSON.stringify(data), Date.now()],
        });

        console.log(`[Cloudflare Worker] 💾 Saved ${collectionId}/${docId} to Turso Vault ${vaultId} in ${Date.now() - start}ms`);
        return jsonResponse({ success: true, remote: true, table: tableName, vaultId, docId });
      } catch (e: any) {
        console.error(`[Cloudflare Worker] Turso write error for ${collectionId}/${docId}:`, e);
        return jsonResponse({ 
          success: false, 
          error: e.message || 'Remote Turso database write failed',
          details: String(e)
        }, 500);
      }
    }

    // 5. DELETE /api/storage/:vaultId/:collectionId/:docId
    if (docMatch && request.method === 'DELETE') {
      const [, vaultId, collectionId, docId] = docMatch;
      const start = Date.now();
      const tableName = `turso_${collectionId}`;
      
      if (!['turso_decks', 'turso_binders', 'turso_collection'].includes(tableName)) {
        return jsonResponse({ error: 'Invalid collection' }, 400);
      }

      const dbState = getDbClient(env);
      if (!dbState.client) {
        return jsonResponse({ success: true, localOnly: true });
      }

      try {
        await ensureTables(dbState.client);
        await dbState.client.execute({
          sql: `DELETE FROM ${tableName} WHERE id = ? AND vault_id = ?`,
          args: [docId, vaultId],
        });

        return jsonResponse({ success: true });
      } catch (e: any) {
        return jsonResponse({ success: true, warning: e.message });
      }
    }

    // 6. Scryfall API Proxy (/api/scryfall/*)
    if (path.startsWith('/api/scryfall')) {
      const scryfallSubPath = path.replace('/api/scryfall', '');
      const scryfallUrl = `https://api.scryfall.com${scryfallSubPath}${url.search}`;
      try {
        const body = (request.method === 'POST' || request.method === 'PUT') ? await request.text() : undefined;
        const res = await fetch(scryfallUrl, {
          method: request.method,
          headers: {
            'User-Agent': 'MTGCloudflarePagesDeckBuilder/1.0',
            'Accept': 'application/json',
            ...(request.method === 'POST' || request.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
          },
          body,
        });
        const data = await res.text();
        return new Response(data, {
          status: res.status,
          headers: {
            'Content-Type': res.headers.get('content-type') || 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Engine': 'Cloudflare-Pages-Worker',
            'X-Functions-Compiled': 'true',
          },
        });
      } catch (e: any) {
        return jsonResponse({ error: 'Failed to proxy request to Scryfall', details: e.message }, 500);
      }
    }

    // 7. EDHREC API Proxy (/api/edhrec/*)
    if (path.startsWith('/api/edhrec')) {
      const edhrecSubPath = path.replace('/api/edhrec', '');
      const edhrecUrl = `https://json.edhrec.com${edhrecSubPath}${url.search}`;
      try {
        const res = await fetch(edhrecUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://edhrec.com/',
          },
        });

        if (!res.ok) {
          return jsonResponse({
            container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
            status: res.status,
          });
        }

        const data = await res.text();
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Engine': 'Cloudflare-Pages-Worker',
            'X-Functions-Compiled': 'true',
          },
        });
      } catch (e: any) {
        return jsonResponse({
          container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
        });
      }
    }

    return jsonResponse({ error: 'API endpoint not found' }, 404);
  }
};
