import { createClient, Client, InStatement, ResultSet } from "@libsql/client";

/**
 * Normalizes database URL to ensure proper libsql or https protocol
 */
export function normalizeTursoUrl(rawUrl?: string): string {
  if (!rawUrl) return "file:local.db";
  let trimmed = rawUrl.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return "file:local.db";
  
  // If user copied url without protocol, default to libsql://
  if (trimmed.endsWith('.turso.io') && !trimmed.includes('://')) {
    trimmed = `libsql://${trimmed}`;
  }
  
  // Strip trailing slashes on remote URLs
  if (trimmed.startsWith('libsql://') || trimmed.startsWith('https://')) {
    trimmed = trimmed.replace(/\/+$/, '');
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

  const authToken = rawToken?.trim()?.replace(/^['"]|['"]$/g, '') || undefined;

  return { 
    url, 
    authToken,
    isRemote: url.startsWith('libsql://') || url.startsWith('https://'),
    isConfigured: Boolean(rawUrl && rawToken)
  };
}

let primaryClient: Client | null = null;
let currentClientUrl: string | null = null;
let currentClientToken: string | null = null;

let localFallbackClient: Client | null = null;
let localTablesInitialized = false;
let primaryTablesInitialized = false;
let isFailingOverToLocal = false;
let lastFailoverReason: string | null = null;

function getLocalFallbackClient(): Client {
  if (!localFallbackClient) {
    console.log('[Turso DB] 📁 Initializing local SQLite fallback (file:local.db)...');
    localFallbackClient = createClient({ url: 'file:local.db' });
  }
  return localFallbackClient;
}

export function getDb(customEnv?: Record<string, any>): Client {
  const config = getTursoConfig(customEnv);
  
  if (!primaryClient || currentClientUrl !== config.url || currentClientToken !== (config.authToken || null)) {
    console.log(`[Turso DB] 🔌 Initializing client -> Target: ${maskTursoUrl(config.url)} (${config.isRemote ? 'Remote Cloud' : 'Local SQLite'})`);
    if (config.isRemote && !config.authToken) {
      console.warn(`[Turso DB] ⚠️ WARNING: Remote Turso URL specified (${maskTursoUrl(config.url)}) but TURSO_AUTH_TOKEN is missing! Requests may fail with 401 Unauthorized.`);
    }
    
    primaryClient = createClient({
      url: config.url,
      authToken: config.authToken,
    });
    currentClientUrl = config.url;
    currentClientToken = config.authToken || null;
    primaryTablesInitialized = false;
    isFailingOverToLocal = false;
    lastFailoverReason = null;
  }
  
  return primaryClient;
}

/**
 * Initializes schemas and tables on a target client
 */
async function bootstrapTables(client: Client, label: string) {
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
      const info = await client.execute(`PRAGMA table_info(${table})`);
      const hasUpdatedAt = info.rows.some((col: any) => col.name === 'updated_at');
      if (!hasUpdatedAt) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN updated_at INTEGER DEFAULT 0`);
      }
    } catch {
      // ignore
    }

    try {
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_${table}_vault ON ${table}(vault_id);`);
    } catch {
      // ignore
    }
  }
  console.log(`[Turso DB] ✅ Schemas verified on ${label}.`);
}

/**
 * Executes a SQL statement with automatic failover to local SQLite if remote Turso is 404/401/unreachable
 */
export async function executeResilientSql(
  statement: InStatement,
  customEnv?: Record<string, any>
): Promise<ResultSet> {
  const config = getTursoConfig(customEnv);
  
  // If remote is not configured or already known failing over, use local fallback
  if (!config.isRemote) {
    const local = getLocalFallbackClient();
    if (!localTablesInitialized) {
      await bootstrapTables(local, 'Local SQLite');
      localTablesInitialized = true;
    }
    return await local.execute(statement);
  }

  // Try primary remote client first
  try {
    const client = getDb(customEnv);
    if (!primaryTablesInitialized) {
      await bootstrapTables(client, maskTursoUrl(config.url));
      primaryTablesInitialized = true;
    }
    return await client.execute(statement);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isFatalRemoteError = 
      errMsg.includes('404') || 
      errMsg.includes('401') || 
      errMsg.includes('SERVER_ERROR') || 
      errMsg.includes('UNAUTHORIZED') ||
      errMsg.includes('ENOTFOUND') || 
      errMsg.includes('ECONNREFUSED');

    if (isFatalRemoteError) {
      if (!isFailingOverToLocal) {
        console.warn(`[Turso DB] ⚠️ Remote Turso database (${maskTursoUrl(config.url)}) returned error: ${errMsg}`);
        console.warn(`[Turso DB] 🔄 Automatically failing over to local SQLite database (local.db). Your data will save safely!`);
        isFailingOverToLocal = true;
        lastFailoverReason = errMsg;
      }
      
      const local = getLocalFallbackClient();
      if (!localTablesInitialized) {
        await bootstrapTables(local, 'Local SQLite Fallback');
        localTablesInitialized = true;
      }
      return await local.execute(statement);
    }
    
    throw err;
  }
}

/**
 * Resilient Database Proxy exposing execute()
 */
export const db = {
  execute: (stmt: InStatement) => executeResilientSql(stmt),
};

/**
 * Diagnostics check: queries DB health, validates schemas, and counts records
 */
export async function testDbConnection(customEnv?: Record<string, any>) {
  const config = getTursoConfig(customEnv);
  const startTime = Date.now();

  try {
    const result = await executeResilientSql("SELECT 1 as ping;", customEnv);
    const latencyMs = Date.now() - startTime;

    const [dRes, bRes, cRes] = await Promise.all([
      executeResilientSql("SELECT COUNT(*) as cnt FROM turso_decks;", customEnv).catch(() => ({ rows: [{ cnt: 0 }] })),
      executeResilientSql("SELECT COUNT(*) as cnt FROM turso_binders;", customEnv).catch(() => ({ rows: [{ cnt: 0 }] })),
      executeResilientSql("SELECT COUNT(*) as cnt FROM turso_collection;", customEnv).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    const decksCount = Number(dRes.rows[0]?.cnt ?? 0);
    const bindersCount = Number(bRes.rows[0]?.cnt ?? 0);
    const collectionCount = Number(cRes.rows[0]?.cnt ?? 0);

    return {
      status: isFailingOverToLocal ? 'local_fallback' : 'connected',
      isRemote: config.isRemote && !isFailingOverToLocal,
      databaseUrlMasked: maskTursoUrl(config.url),
      hasAuthToken: Boolean(config.authToken),
      latencyMs,
      counts: {
        decks: decksCount,
        binders: bindersCount,
        collection: collectionCount
      },
      error: isFailingOverToLocal ? `Remote Turso URL returned an error (${lastFailoverReason}). Operating safely on local SQLite storage.` : null,
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
 * Initializes Turso database schemas and indexes
 */
export async function initDb(customEnv?: Record<string, any>) {
  const config = getTursoConfig(customEnv);
  console.log(`[Turso DB] 🚀 Bootstrapping database on ${maskTursoUrl(config.url)}...`);
  try {
    await executeResilientSql("SELECT 1;", customEnv);
    console.log(`[Turso DB] ✅ Database ready and verified.`);
  } catch (err: any) {
    console.warn(`[Turso DB] Initialization note:`, err?.message || err);
  }
}
