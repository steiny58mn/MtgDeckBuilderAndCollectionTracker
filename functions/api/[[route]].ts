/**
 * Cloudflare Pages Functions API Router for Turso Database and Scryfall Proxy
 * Enables seamless serverless execution when deployed to Cloudflare Pages.
 */

import { createClient } from "@libsql/client/web";

interface Env {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}

function normalizeTursoUrl(rawUrl?: string): string {
  if (!rawUrl) return "file:local.db";
  let trimmed = rawUrl.trim();
  if (trimmed.endsWith('.turso.io') && !trimmed.includes('://')) {
    trimmed = `libsql://${trimmed}`;
  }
  return trimmed;
}

function maskTursoUrl(url?: string): string {
  if (!url) return 'none';
  if (url.startsWith('file:')) return url;
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

function getDbClient(env: Env) {
  const url = normalizeTursoUrl(env.TURSO_DATABASE_URL);
  const authToken = env.TURSO_AUTH_TOKEN?.trim() || undefined;

  if (!env.TURSO_DATABASE_URL) {
    console.warn('[Cloudflare Function] ⚠️ TURSO_DATABASE_URL is not configured in Cloudflare Environment Variables!');
  }
  if (!env.TURSO_AUTH_TOKEN && url.startsWith('libsql://')) {
    console.warn('[Cloudflare Function] ⚠️ TURSO_AUTH_TOKEN is missing for remote Turso DB!');
  }

  return {
    client: createClient({ url, authToken }),
    url,
    authToken,
    isRemote: url.startsWith('libsql://') || url.startsWith('https://'),
  };
}

let initializedDb = false;
async function ensureTables(client: any) {
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
      // index already exists
    }
  }
  initializedDb = true;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
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
    const { url: dbUrl, authToken, isRemote } = getDbClient(env);
    return jsonResponse({
      status: 'ok',
      backend: 'turso',
      environment: 'cloudflare-pages',
      isCloudConfigured: isRemote && Boolean(authToken),
      databaseUrlMasked: maskTursoUrl(dbUrl),
      hasAuthToken: Boolean(authToken),
      isRemote,
    });
  }

  // 2. GET /api/storage/diagnostics
  if (path === '/api/storage/diagnostics' && request.method === 'GET') {
    const start = Date.now();
    try {
      const { client, url: dbUrl, authToken, isRemote } = getDbClient(env);
      await ensureTables(client);
      await client.execute('SELECT 1 as ping;');
      const latencyMs = Date.now() - start;

      const [dRes, bRes, cRes] = await Promise.all([
        client.execute('SELECT COUNT(*) as cnt FROM turso_decks;'),
        client.execute('SELECT COUNT(*) as cnt FROM turso_binders;'),
        client.execute('SELECT COUNT(*) as cnt FROM turso_collection;'),
      ]);

      return jsonResponse({
        status: 'connected',
        environment: 'cloudflare-pages',
        isRemote,
        databaseUrlMasked: maskTursoUrl(dbUrl),
        hasAuthToken: Boolean(authToken),
        latencyMs,
        counts: {
          decks: Number(dRes.rows[0]?.cnt ?? 0),
          binders: Number(bRes.rows[0]?.cnt ?? 0),
          collection: Number(cRes.rows[0]?.cnt ?? 0),
        },
        error: null,
      });
    } catch (err: any) {
      console.error('[Cloudflare Function Diagnostics Error]:', err);
      return jsonResponse({
        status: 'error',
        environment: 'cloudflare-pages',
        error: err?.message || String(err),
      }, 500);
    }
  }

  // 3. GET /api/storage/:vaultId/all
  const allMatch = path.match(/^\/api\/storage\/([^/]+)\/all\/?$/);
  if (allMatch && request.method === 'GET') {
    const vaultId = allMatch[1];
    const start = Date.now();
    try {
      const { client } = getDbClient(env);
      await ensureTables(client);
      const [decksRes, bindersRes, collectionRes] = await Promise.all([
        client.execute({ sql: 'SELECT data FROM turso_decks WHERE vault_id = ?', args: [vaultId] }),
        client.execute({ sql: 'SELECT data FROM turso_binders WHERE vault_id = ?', args: [vaultId] }),
        client.execute({ sql: 'SELECT data FROM turso_collection WHERE vault_id = ?', args: [vaultId] }),
      ]);

      const decks = decksRes.rows.map((r: any) => JSON.parse(r.data as string));
      const binders = bindersRes.rows.map((r: any) => JSON.parse(r.data as string));
      const collection = collectionRes.rows.map((r: any) => JSON.parse(r.data as string));

      console.log(`[Cloudflare Function] 📥 GET /api/storage/${vaultId}/all -> ${decks.length} decks, ${binders.length} binders (${Date.now() - start}ms)`);
      return jsonResponse({ decks, binders, collection });
    } catch (e: any) {
      console.error(`[Cloudflare Function] ❌ GET all error on vault ${vaultId}:`, e);
      return jsonResponse({ error: e.message || 'Failed to fetch vault data' }, 500);
    }
  }

  // 4. POST / PUT / PATCH /api/storage/:vaultId/:collectionId/:docId
  const docMatch = path.match(/^\/api\/storage\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
  if (docMatch && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
    const [, vaultId, collectionId, docId] = docMatch;
    const start = Date.now();
    try {
      const tableName = `turso_${collectionId}`;
      if (!['turso_decks', 'turso_binders', 'turso_collection'].includes(tableName)) {
        return jsonResponse({ error: 'Invalid collection' }, 400);
      }

      const data = await request.json();
      const { client } = getDbClient(env);
      await ensureTables(client);

      const insertSql = `INSERT INTO ${tableName} (id, vault_id, data, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, vault_id = excluded.vault_id, updated_at = excluded.updated_at`;

      await client.execute({
        sql: insertSql,
        args: [docId, vaultId, JSON.stringify(data), Date.now()],
      });

      console.log(`[Cloudflare Function] 💾 Saved ${collectionId}/${docId} to Vault ${vaultId} in ${Date.now() - start}ms`);
      return jsonResponse({ success: true });
    } catch (e: any) {
      console.error(`[Cloudflare Function] ❌ Write error for ${collectionId}/${docId}:`, e);
      return jsonResponse({ error: e.message || 'Failed to write to Turso' }, 500);
    }
  }

  // 5. DELETE /api/storage/:vaultId/:collectionId/:docId
  if (docMatch && request.method === 'DELETE') {
    const [, vaultId, collectionId, docId] = docMatch;
    const start = Date.now();
    try {
      const tableName = `turso_${collectionId}`;
      if (!['turso_decks', 'turso_binders', 'turso_collection'].includes(tableName)) {
        return jsonResponse({ error: 'Invalid collection' }, 400);
      }

      const { client } = getDbClient(env);
      await ensureTables(client);
      await client.execute({
        sql: `DELETE FROM ${tableName} WHERE id = ? AND vault_id = ?`,
        args: [docId, vaultId],
      });

      console.log(`[Cloudflare Function] 🗑️ Deleted ${collectionId}/${docId} from Vault ${vaultId} in ${Date.now() - start}ms`);
      return jsonResponse({ success: true });
    } catch (e: any) {
      console.error(`[Cloudflare Function] ❌ Delete error for ${collectionId}/${docId}:`, e);
      return jsonResponse({ error: e.message || 'Failed to delete from Turso' }, 500);
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
