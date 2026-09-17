import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, initDb, getTursoConfig, testDbConnection, maskTursoUrl } from './server/db.js';

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Increase payload limits for large deck objects
  app.use(express.json({ limit: '10mb' }));

  // CORS middleware allowing full REST methods
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Print startup config info
  const initialConfig = getTursoConfig();
  console.log(`[Turso DB] 🚀 Server starting on port ${PORT}...`);
  console.log(`[Turso DB] 🔗 Target Database: ${maskTursoUrl(initialConfig.url)}`);
  console.log(`[Turso DB] 🔑 Auth Token Status: ${initialConfig.authToken ? 'Configured ✅' : 'Not Set ⚠️'}`);
  console.log(`[Turso DB] 🌐 Mode: ${initialConfig.isRemote ? 'Remote Turso Cloud (libsql)' : 'Local SQLite Fallback (local.db)'}`);

  // Initialize Turso DB
  await initDb().catch((err) => {
    console.error('[Turso DB] ❌ DB Initialization Warning:', err.message || err);
  });

  // Storage Backend Health & Configuration Status Check
  app.get('/api/storage/status', (req, res) => {
    const config = getTursoConfig();
    res.json({
      status: 'ok',
      backend: 'turso',
      isCloudConfigured: config.isRemote && Boolean(config.authToken),
      databaseUrlMasked: maskTursoUrl(config.url),
      hasAuthToken: Boolean(config.authToken),
      isRemote: config.isRemote,
    });
  });

  // Comprehensive Diagnostics Endpoint
  app.get('/api/storage/diagnostics', async (req, res) => {
    console.log('[Turso DB Diagnostics] 🔍 Running database health & connectivity check...');
    try {
      const result = await testDbConnection();
      console.log(`[Turso DB Diagnostics] Result: ${result.status} (Latency: ${result.latencyMs}ms, Decks: ${result.counts.decks})`);
      res.json(result);
    } catch (err: any) {
      console.error('[Turso DB Diagnostics] ❌ Failed to run connection test:', err);
      res.status(500).json({
        status: 'error',
        error: err.message || 'Diagnostic query failed',
      });
    }
  });

  // Turso API routes
  // 1. GET all data for a vault
  app.get('/api/storage/:vaultId/all', async (req, res) => {
    const { vaultId } = req.params;
    const start = Date.now();
    try {
      const [decksRes, bindersRes, collectionRes] = await Promise.all([
        db.execute({ sql: 'SELECT data FROM turso_decks WHERE vault_id = ?', args: [vaultId] }),
        db.execute({ sql: 'SELECT data FROM turso_binders WHERE vault_id = ?', args: [vaultId] }),
        db.execute({ sql: 'SELECT data FROM turso_collection WHERE vault_id = ?', args: [vaultId] }),
      ]);
      
      const decks = decksRes.rows.map(r => JSON.parse(r.data as string));
      const binders = bindersRes.rows.map(r => JSON.parse(r.data as string));
      const collection = collectionRes.rows.map(r => JSON.parse(r.data as string));
      
      console.log(`[Turso DB API] 📥 GET /api/storage/${vaultId}/all -> ${decks.length} decks, ${binders.length} binders, ${collection.length} collection items (${Date.now() - start}ms)`);
      res.json({ decks, binders, collection });
    } catch (e: any) {
      console.error(`[Turso DB API] ❌ GET /api/storage/${vaultId}/all error (${Date.now() - start}ms):`, e);
      res.status(500).json({ error: e.message || 'Failed to fetch vault data from Turso' });
    }
  });

  // 2. Write operations
  // Save a document (deck, binder, or card) - supports POST, PUT, and PATCH
  const handleSaveDocument = async (req: express.Request, res: express.Response) => {
    const { vaultId, collectionId, docId } = req.params;
    const data = req.body;
    const start = Date.now();
    try {
      const tableName = `turso_${collectionId}`;
      if (!['turso_decks', 'turso_binders', 'turso_collection'].includes(tableName)) {
         console.warn(`[Turso DB API] ⚠️ Invalid collection requested: ${collectionId}`);
         return res.status(400).json({ error: 'Invalid collection' });
      }
      
      const insertSql = `INSERT INTO ${tableName} (id, vault_id, data, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, vault_id = excluded.vault_id, updated_at = excluded.updated_at`;
      
      try {
        await db.execute({
          sql: insertSql,
          args: [docId, vaultId, JSON.stringify(data), Date.now()]
        });
      } catch (insertError: any) {
        // If the table was missing the updated_at column, run auto-migration and retry
        if (insertError?.message?.includes('no column named updated_at')) {
          await db.execute(`ALTER TABLE ${tableName} ADD COLUMN updated_at INTEGER DEFAULT 0`).catch(() => {});
          await db.execute({
            sql: insertSql,
            args: [docId, vaultId, JSON.stringify(data), Date.now()]
          });
        } else {
          throw insertError;
        }
      }

      const itemName = data?.name || docId;
      console.log(`[Turso DB API] 💾 ${req.method} /api/storage/${vaultId}/${collectionId}/${docId} ("${itemName}") -> Success (${Date.now() - start}ms)`);
      res.json({ success: true });
    } catch (e: any) {
      console.error(`[Turso DB API] ❌ ${req.method} /api/storage/${vaultId}/${collectionId}/${docId} error (${Date.now() - start}ms):`, e);
      res.status(500).json({ error: e.message || 'Failed to write to Turso database' });
    }
  };

  app.post('/api/storage/:vaultId/:collectionId/:docId', handleSaveDocument);
  app.put('/api/storage/:vaultId/:collectionId/:docId', handleSaveDocument);
  app.patch('/api/storage/:vaultId/:collectionId/:docId', handleSaveDocument);

  // Delete a document
  app.delete('/api/storage/:vaultId/:collectionId/:docId', async (req, res) => {
    const { vaultId, collectionId, docId } = req.params;
    const start = Date.now();
    try {
      const tableName = `turso_${collectionId}`;
      if (!['turso_decks', 'turso_binders', 'turso_collection'].includes(tableName)) {
         return res.status(400).json({ error: 'Invalid collection' });
      }
      
      await db.execute({
        sql: `DELETE FROM ${tableName} WHERE id = ? AND vault_id = ?`,
        args: [docId, vaultId]
      });
      console.log(`[Turso DB API] 🗑️ DELETE /api/storage/${vaultId}/${collectionId}/${docId} -> Success (${Date.now() - start}ms)`);
      res.json({ success: true });
    } catch (e: any) {
      console.error(`[Turso DB API] ❌ DELETE /api/storage/${vaultId}/${collectionId}/${docId} error (${Date.now() - start}ms):`, e);
      res.status(500).json({ error: e.message || 'Failed to delete from Turso database' });
    }
  });

  // Proxy route for Scryfall API to bypass browser CORS / Adblockers
  app.use('/api/scryfall', async (req, res) => {
    try {
      const targetUrl = `https://api.scryfall.com${req.url}`;
      
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'User-Agent': 'AIStudioDeckBuilder/1.0',
          'Accept': 'application/json',
          ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {})
        },
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
      });
      const data = await response.text();
      
      res.status(response.status);
      res.set('Content-Type', response.headers.get('content-type') || 'application/json');
      res.send(data);
    } catch (error: any) {
      console.error('[Scryfall Proxy Error]:', error);
      res.status(500).json({ error: 'Failed to proxy request to Scryfall', details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] 🌐 MTG Deck & Collection App running on http://localhost:${PORT}`);
  });
}

startServer();
