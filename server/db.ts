import { createClient, Client } from "@libsql/client";

/**
 * Normalizes database URL to ensure proper libsql or https protocol
 */
export function normalizeTursoUrl(rawUrl?: string): string {
  if (!rawUrl) return "file:local.db";
  let trimmed = rawUrl.trim();
  // If user copied url without protocol, default to libsql://
  if (trimmed.endsWith('.turso.io') && !trimmed.includes('://')) {
    trimmed = `libsql://${trimmed}`;
  }
  return trimmed;
}

/**
 * Safely masks a Turso URL for logging/diagnostics without leaking exact credentials
 */
export function maskTursoUrl(url?: string): string {
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

/**
 * Safely resolves Turso credentials from Cloudflare secrets/environment variables
 * or standard process.env, ensuring tokens and URLs are never hardcoded or stored in plaintext.
 */
export function getTursoConfig(customEnv?: Record<string, any>) {
  const rawUrl = 
    customEnv?.TURSO_DATABASE_URL ||
    (typeof process !== 'undefined' && process.env?.TURSO_DATABASE_URL) ||
    (typeof globalThis !== 'undefined' && (globalThis as any)?.TURSO_DATABASE_URL) ||
    undefined;

  const url = normalizeTursoUrl(rawUrl);

  const rawToken = 
    customEnv?.TURSO_AUTH_TOKEN ||
    (typeof process !== 'undefined' && process.env?.TURSO_AUTH_TOKEN) ||
    (typeof globalThis !== 'undefined' && (globalThis as any)?.TURSO_AUTH_TOKEN) ||
    undefined;

  const authToken = rawToken?.trim() || undefined;

  return { 
    url, 
    authToken,
    isRemote: url.startsWith('libsql://') || url.startsWith('https://'),
    isConfigured: Boolean(rawUrl && rawToken)
  };
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
    console.log(`[Turso DB] 🔌 Initializing client -> Target: ${maskTursoUrl(config.url)} (${config.isRemote ? 'Remote Cloud' : 'Local SQLite'})`);
    if (config.isRemote && !config.authToken) {
      console.warn(`[Turso DB] ⚠️ WARNING: Remote Turso URL specified (${maskTursoUrl(config.url)}) but TURSO_AUTH_TOKEN is missing! Requests may fail with 401 Unauthorized.`);
    }
    
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
 * Diagnostics check: queries DB health, validates schemas, and counts records
 */
export async function testDbConnection(customEnv?: Record<string, any>) {
  const config = getTursoConfig(customEnv);
  const client = getDb(customEnv);
  const startTime = Date.now();

  try {
    // 1. Basic query test
    await client.execute("SELECT 1 as ping;");
    const latencyMs = Date.now() - startTime;

    // 2. Count rows in all tables
    let decksCount = 0;
    let bindersCount = 0;
    let collectionCount = 0;

    try {
      const [dRes, bRes, cRes] = await Promise.all([
        client.execute("SELECT COUNT(*) as cnt FROM turso_decks;"),
        client.execute("SELECT COUNT(*) as cnt FROM turso_binders;"),
        client.execute("SELECT COUNT(*) as cnt FROM turso_collection;"),
      ]);
      decksCount = Number(dRes.rows[0]?.cnt ?? 0);
      bindersCount = Number(bRes.rows[0]?.cnt ?? 0);
      collectionCount = Number(cRes.rows[0]?.cnt ?? 0);
    } catch (countErr: any) {
      console.warn("[Turso DB] Count query notice:", countErr.message || countErr);
    }

    return {
      status: 'connected',
      isRemote: config.isRemote,
      databaseUrlMasked: maskTursoUrl(config.url),
      hasAuthToken: Boolean(config.authToken),
      latencyMs,
      counts: {
        decks: decksCount,
        binders: bindersCount,
        collection: collectionCount
      },
      error: null
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    console.error("[Turso DB] ❌ Connection test failed:", err);
    return {
      status: 'error',
      isRemote: config.isRemote,
      databaseUrlMasked: maskTursoUrl(config.url),
      hasAuthToken: Boolean(config.authToken),
      latencyMs,
      counts: { decks: 0, binders: 0, collection: 0 },
      error: err?.message || String(err)
    };
  }
}

/**
 * Initializes Turso database schemas and indexes, automatically migrating missing columns
 */
export async function initDb(customEnv?: Record<string, any>) {
  const config = getTursoConfig(customEnv);
  const client = getDb(customEnv);
  const tables = ['turso_decks', 'turso_binders', 'turso_collection'];

  console.log(`[Turso DB] 🚀 Bootstrapping schema on ${maskTursoUrl(config.url)}...`);

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
      console.warn(`[Turso DB] Warning checking/updating column on ${table}:`, err.message || err);
    }

    // 3. Create index for fast vault queries
    try {
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_${table}_vault ON ${table}(vault_id);`);
    } catch (err: any) {
      console.warn(`[Turso DB] Warning creating index on ${table}:`, err.message || err);
    }
  }
  console.log(`[Turso DB] ✅ Database schemas and indexes verified successfully.`);
}
