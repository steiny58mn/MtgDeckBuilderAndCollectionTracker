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

function getDbClient(env: Env) {
  const url = normalizeTursoUrl(env.TURSO_DATABASE_URL);
  const authToken = env.TURSO_AUTH_TOKEN?.trim() || undefined;
  return {
    client: createClient({ url, authToken }),
    url,
    authToken,
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
      // ignore
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

export const onRequestGet = async (context: any) => {
  const { env, params } = context;
  const vaultId = params.vaultId as string;
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

    console.log(`[Cloudflare Function] 📥 GET /api/storage/${vaultId}/all -> ${decks.length} decks (${Date.now() - start}ms)`);
    return jsonResponse({ decks, binders, collection });
  } catch (e: any) {
    console.error(`[Cloudflare Function] ❌ GET all error on vault ${vaultId}:`, e);
    return jsonResponse({ error: e.message || 'Failed to fetch vault data' }, 500);
  }
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    },
  });
};
