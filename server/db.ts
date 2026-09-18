// Local storage helper for server.ts
interface Database {
  execute(query: { sql: string; args?: any[] }): Promise<{ rows: any[] }>;
}

const memoryStore: Record<string, Map<string, { vault_id: string; data: string }>> = {
  turso_decks: new Map(),
  turso_binders: new Map(),
  turso_collection: new Map(),
};

export const db: Database = {
  async execute({ sql, args = [] }) {
    const trimmed = sql.trim();
    
    // Handle SELECT data FROM <table_name> WHERE vault_id = ?
    if (trimmed.startsWith('SELECT')) {
      const match = trimmed.match(/FROM\s+([a-zA-Z0-9_]+)\s+WHERE\s+vault_id\s*=\s*\?/i);
      if (match) {
        const table = match[1];
        const vaultId = args[0];
        const map = memoryStore[table] || new Map();
        const rows: any[] = [];
        for (const val of map.values()) {
          if (val.vault_id === vaultId) {
            rows.push({ data: val.data });
          }
        }
        return { rows };
      }
    }

    // Handle INSERT / UPDATE
    if (trimmed.startsWith('INSERT INTO')) {
      const match = trimmed.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
      if (match) {
        const table = match[1];
        const [id, vaultId, data] = args;
        if (!memoryStore[table]) memoryStore[table] = new Map();
        memoryStore[table].set(id, { vault_id: vaultId, data });
        return { rows: [] };
      }
    }

    // Handle DELETE
    if (trimmed.startsWith('DELETE FROM')) {
      const match = trimmed.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)\s+WHERE\s+id\s*=\s*\?\s+AND\s+vault_id\s*=\s*\?/i);
      if (match) {
        const table = match[1];
        const [id, vaultId] = args;
        const map = memoryStore[table];
        if (map && map.has(id)) {
          const item = map.get(id);
          if (item?.vault_id === vaultId) {
            map.delete(id);
          }
        }
        return { rows: [] };
      }
    }

    return { rows: [] };
  }
};

export async function initDb() {
  // DB initialized
  return Promise.resolve();
}
