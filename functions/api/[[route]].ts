/**
 * Cloudflare Pages Functions API Router for Turso Database, Scryfall, and EDHREC Proxy
 * Enables seamless serverless execution when deployed to Cloudflare Pages (e.g. mtgdeckbuilder.frostpointlabs.com)
 */

import { createClient, Client } from "@libsql/client/web";

interface Env {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}

function normalizeTursoUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
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

function getDbClient(env: Env): { 
  client: Client | null; 
  url: string | null; 
  authToken?: string; 
  isRemote: boolean; 
  isConfigured: boolean;
  error?: string;
} {
  const url = normalizeTursoUrl(env.TURSO_DATABASE_URL);
  const authToken = env.TURSO_AUTH_TOKEN?.trim()?.replace(/^['"]|['"]$/g, '') || undefined;

  if (!url) {
    return {
      client: null,
      url: null,
      authToken: undefined,
      isRemote: false,
      isConfigured: false,
      error: 'TURSO_DATABASE_URL is not set in Cloudflare Pages Environment Variables.',
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
    };
  } catch (err: any) {
    return {
      client: null,
      url,
      authToken,
      isRemote: true,
      isConfigured: false,
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

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    },
  });
}

interface EventContext<Env, P extends string, Data> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
}

type PagesFunction<Env = unknown, P extends string = string, Data extends Record<string, unknown> = Record<string, unknown>> = (
  context: EventContext<Env, P, Data>
) => Response | Promise<Response>;

async function handleApiRequest(context: EventContext<Env, string, Record<string, unknown>>): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  let path = url.pathname;

  // Normalize path if leading /api is omitted in subrouter
  if (!path.startsWith('/api')) {
    path = `/api${path.startsWith('/') ? path : `/${path}`}`;
  }

  // Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      },
    });
  }

  // 1. GET /api/storage/status
  if (path === '/api/storage/status' && request.method === 'GET') {
    const dbState = getDbClient(env);
    return jsonResponse({
      status: 'ok',
      backend: 'turso',
      environment: 'cloudflare-pages',
      isCloudConfigured: dbState.isConfigured,
      databaseUrlMasked: maskTursoUrl(dbState.url),
      hasAuthToken: Boolean(dbState.authToken),
      isRemote: dbState.isRemote,
      note: dbState.isConfigured 
        ? 'Turso Cloud database connected on Cloudflare Pages Functions' 
        : 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Cloudflare Pages Settings -> Environment variables for live cloud sync.',
    });
  }

  // 2. GET /api/storage/diagnostics
  if (path === '/api/storage/diagnostics' && request.method === 'GET') {
    const start = Date.now();
    const dbState = getDbClient(env);

    if (!dbState.client) {
      return jsonResponse({
        status: 'warning',
        environment: 'cloudflare-pages',
        isRemote: false,
        databaseUrlMasked: maskTursoUrl(dbState.url),
        hasAuthToken: false,
        latencyMs: Date.now() - start,
        counts: { decks: 0, binders: 0, collection: 0 },
        error: dbState.error || 'TURSO_DATABASE_URL is not configured in Cloudflare Pages environment variables. Local browser storage is active.',
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
        environment: 'cloudflare-pages',
        isRemote: true,
        databaseUrlMasked: maskTursoUrl(dbState.url),
        hasAuthToken: Boolean(dbState.authToken),
        latencyMs,
        counts: {
          decks: Number(dRes.rows[0]?.cnt ?? 0),
          binders: Number(bRes.rows[0]?.cnt ?? 0),
          collection: Number(cRes.rows[0]?.cnt ?? 0),
        },
        error: null,
      });
    } catch (err: any) {
      console.warn('[Cloudflare Function Diagnostics Warning]:', err?.message || err);
      return jsonResponse({
        status: 'local_fallback',
        environment: 'cloudflare-pages',
        isRemote: false,
        databaseUrlMasked: maskTursoUrl(dbState.url),
        hasAuthToken: Boolean(dbState.authToken),
        latencyMs: Date.now() - start,
        counts: { decks: 0, binders: 0, collection: 0 },
        error: `Remote Turso connection failed (${err?.message || err}). Browser local storage will be used.`,
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

      console.log(`[Cloudflare Function] 📥 GET /api/storage/${vaultId}/all -> ${decks.length} decks, ${binders.length} binders (${Date.now() - start}ms)`);
      return jsonResponse({ decks, binders, collection, isCloudConfigured: true });
    } catch (e: any) {
      console.warn(`[Cloudflare Function] Notice on GET all for vault ${vaultId}:`, e?.message || e);
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
      // Acknowledge save so client continues seamlessly with local persistence
      return jsonResponse({ success: true, localOnly: true });
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

      console.log(`[Cloudflare Function] 💾 Saved ${collectionId}/${docId} to Vault ${vaultId} in ${Date.now() - start}ms`);
      return jsonResponse({ success: true });
    } catch (e: any) {
      console.warn(`[Cloudflare Function] Write notice for ${collectionId}/${docId}:`, e?.message || e);
      return jsonResponse({ success: true, warning: e.message || 'Remote write failed; saved locally' });
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

      console.log(`[Cloudflare Function] 🗑️ Deleted ${collectionId}/${docId} from Vault ${vaultId} in ${Date.now() - start}ms`);
      return jsonResponse({ success: true });
    } catch (e: any) {
      console.warn(`[Cloudflare Function] Delete notice for ${collectionId}/${docId}:`, e?.message || e);
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
        },
      });
    } catch (e: any) {
      console.error('[Cloudflare Function] Scryfall Proxy Error:', e);
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
        },
      });
    } catch (e: any) {
      console.warn('[Cloudflare Function] EDHREC Proxy Notice:', e);
      return jsonResponse({
        container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
      });
    }
  }

  return jsonResponse({ error: 'Endpoint not found on Cloudflare Pages Function router' }, 404);
}

// Export all Cloudflare Pages method handlers
export const onRequest: PagesFunction<Env> = handleApiRequest;
export const onRequestGet: PagesFunction<Env> = handleApiRequest;
export const onRequestPost: PagesFunction<Env> = handleApiRequest;
export const onRequestPut: PagesFunction<Env> = handleApiRequest;
export const onRequestPatch: PagesFunction<Env> = handleApiRequest;
export const onRequestDelete: PagesFunction<Env> = handleApiRequest;
export const onRequestOptions: PagesFunction<Env> = handleApiRequest;
