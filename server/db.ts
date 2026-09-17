import { createClient } from "@libsql/client";

const dbUrl = process.env.TURSO_DATABASE_URL || "file:local.db";
const dbAuthToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url: dbUrl,
  authToken: dbAuthToken,
});

export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS turso_decks (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS turso_binders (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS turso_collection (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);
  
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_decks_vault ON turso_decks(vault_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_binders_vault ON turso_binders(vault_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_collection_vault ON turso_collection(vault_id);`);
}
