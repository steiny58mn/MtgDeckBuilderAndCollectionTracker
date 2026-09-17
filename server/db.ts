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
 * Initializes Turso database schemas and indexes
 */
export async function initDb(customEnv?: Record<string, any>) {
  const client = getDb(customEnv);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS turso_decks (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
  
  await client.execute(`
    CREATE TABLE IF NOT EXISTS turso_binders (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS turso_collection (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
  
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_decks_vault ON turso_decks(vault_id);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_binders_vault ON turso_binders(vault_id);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_collection_vault ON turso_collection(vault_id);`);
}
