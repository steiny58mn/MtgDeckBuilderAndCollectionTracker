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

// POST or PUT (Save document)
export const onRequestPost = async (context: any) => handleSave(context);
export const onRequestPut = async (context: any) => handleSave(context);
export const onRequestPatch = async (context: any) => handleSave(context);

async function handleSave(context: any) {
  const { request, env, params } = context;
  const vaultId = params.vaultId as string;
  const collectionId = params.collectionId as string;
  const docId = params.docId as string;

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

    return jsonResponse({ success: true });
  } catch (e: any) {
    console.error(`[Cloudflare Function] Write error for ${collectionId}/${docId}:`, e);
    return jsonResponse({ error: e.message || 'Failed to write to Turso' }, 500);
  }
}

// DELETE (Remove document)
export const onRequestDelete = async (context: any) => {
  const { env, params } = context;
  const vaultId = params.vaultId as string;
  const collectionId = params.collectionId as string;
  const docId = params.docId as string;

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

    return jsonResponse({ success: true });
  } catch (e: any) {
    console.error(`[Cloudflare Function] Delete error for ${collectionId}/${docId}:`, e);
    return jsonResponse({ error: e.message || 'Failed to delete from Turso' }, 500);
  }
};

// OPTIONS (CORS preflight)
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
