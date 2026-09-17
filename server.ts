import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, initDb, getTursoConfig } from './server/db.js';

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Need to increase payload limits for large deck objects
  app.use(express.json({ limit: '10mb' }));

  // Initialize Turso DB
  await initDb().catch((err) => {
    console.error('Turso DB Initialization Warning:', err.message || err);
  });

  // Storage Backend Health & Configuration Status Check
  // Note: Never leaks TURSO_AUTH_TOKEN or full credentials to the client.
  app.get('/api/storage/status', (req, res) => {
    const config = getTursoConfig();
    const isCloud = Boolean(config.url && config.url.startsWith('libsql://'));
    res.json({
      status: 'ok',
      backend: 'turso',
      isCloudConfigured: isCloud,
      hasAuthToken: Boolean(config.authToken),
    });
  });

  // Turso API routes
  // 1. GET all data for a vault
  app.get('/api/storage/:vaultId/all', async (req, res) => {
    const { vaultId } = req.params;
    try {
      const [decksRes, bindersRes, collectionRes] = await Promise.all([
        db.execute({ sql: 'SELECT data FROM turso_decks WHERE vault_id = ?', args: [vaultId] }),
        db.execute({ sql: 'SELECT data FROM turso_binders WHERE vault_id = ?', args: [vaultId] }),
        db.execute({ sql: 'SELECT data FROM turso_collection WHERE vault_id = ?', args: [vaultId] }),
      ]);
      
      const decks = decksRes.rows.map(r => JSON.parse(r.data as string));
      const binders = bindersRes.rows.map(r => JSON.parse(r.data as string));
      const collection = collectionRes.rows.map(r => JSON.parse(r.data as string));
      
      res.json({ decks, binders, collection });
    } catch (e: any) {
      console.error('Turso GET all error:', e);
      res.status(500).json({ error: e.message || 'Failed to fetch vault data from Turso' });
    }
  });

  // 2. Write operations
  // Save a document
  app.post('/api/storage/:vaultId/:collectionId/:docId', async (req, res) => {
    const { vaultId, collectionId, docId } = req.params;
    const data = req.body;
    try {
      const tableName = `turso_${collectionId}`;
      if (!['turso_decks', 'turso_binders', 'turso_collection'].includes(tableName)) {
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

      res.json({ success: true });
    } catch (e: any) {
      console.error(`Turso write error on ${collectionId}/${docId}:`, e);
      res.status(500).json({ error: e.message || 'Failed to write to Turso database' });
    }
  });

  // Delete a document
  app.delete('/api/storage/:vaultId/:collectionId/:docId', async (req, res) => {
    const { vaultId, collectionId, docId } = req.params;
    try {
      const tableName = `turso_${collectionId}`;
      if (!['turso_decks', 'turso_binders', 'turso_collection'].includes(tableName)) {
         return res.status(400).json({ error: 'Invalid collection' });
      }
      
      await db.execute({
        sql: `DELETE FROM ${tableName} WHERE id = ? AND vault_id = ?`,
        args: [docId, vaultId]
      });
      res.json({ success: true });
    } catch (e: any) {
      console.error(`Turso delete error on ${collectionId}/${docId}:`, e);
      res.status(500).json({ error: e.message || 'Failed to delete from Turso database' });
    }
  });

  // Proxy route for Scryfall API to bypass browser CORS / Adblockers
  app.use('/api/scryfall', async (req, res) => {
    try {
      // Reconstruct the target URL
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
      console.error('Scryfall Proxy Error:', error);
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
