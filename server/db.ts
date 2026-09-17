import { createClient, Client } from "@libsql/client";

/**
 * Safely resolves Turso credentials from Cloudflare secrets/environment variables
 * or standard process.env, ensuring tokens and URLs are never hardcoded or stored in plaintext.
 */
export function getTursoConfig(customEnv?: Record<string, any>) {
  const url = 
    customEnv?.TURSO_DATABASE_URL ||
    (typeof process !== 'undefined' && process.env?.TURSO_DATABASE_URL) ||
    (typeof globalThis !== 'undefined' && (globalThis as any)?.TURSO_DATABASE_URL) ||
    "file:local.db";

  const authToken = 
    customEnv?.TURSO_AUTH_TOKEN ||
    (typeof process !== 'undefined' && process.env?.TURSO_AUTH_TOKEN) ||
    (typeof globalThis !== 'undefined' && (globalThis as any)?.TURSO_AUTH_TOKEN) ||
    undefined;

  return { url, authToken };
}

let clientInstance: Client | null = null;
let currentClientUrl: string | null = null;
let currentClientToken: string | null = null;

/**
 * Returns an active Turso client instance.
 * Supports Cloudflare runtime worker/pages context injection as well as Node environments.
 */
export function getDb(customEnv?: Record<string, any>): Client {
  const config = getTursoConfig(customEnv);
  
  if (!clientInstance || currentClientUrl !== config.url || currentClientToken !== (config.authToken || null)) {
    clientInstance = createClient({
      url: config.url,
      authToken: config.authToken,
    });
    currentClientUrl = config.url;
    currentClientToken = config.authToken || null;
  }
  
  return clientInstance;
}

export const db = getDb();

/**
 * Initializes Turso database schemas and indexes, automatically migrating missing columns
 */
export async function initDb(customEnv?: Record<string, any>) {
  const client = getDb(customEnv);
  const tables = ['turso_decks', 'turso_binders', 'turso_collection'];

  for (const table of tables) {
    // 1. Create table if not exists
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        vault_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
    `);

    // 2. Verify and add updated_at column if table was created in an older schema version
    try {
      const info = await client.execute(`PRAGMA table_info(${table})`);
      const hasUpdatedAt = info.rows.some((col: any) => col.name === 'updated_at');
      if (!hasUpdatedAt) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN updated_at INTEGER DEFAULT 0`);
      }
    } catch (err: any) {
      console.warn(`Warning checking/updating column on ${table}:`, err.message || err);
    }

    // 3. Create index for fast vault queries
    try {
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_${table}_vault ON ${table}(vault_id);`);
    } catch (err: any) {
      console.warn(`Warning creating index on ${table}:`, err.message || err);
    }
  }
}
