import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, initDb } from './server/db.js';

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Need to increase payload limits for large deck objects
  app.use(express.json({ limit: '10mb' }));

  // Initialize Turso DB
  await initDb().catch(console.error);

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
      console.error(e);
      res.status(500).json({ error: e.message });
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
      
      await db.execute({
        sql: `INSERT INTO ${tableName} (id, vault_id, data) VALUES (?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET data = excluded.data, vault_id = excluded.vault_id`,
        args: [docId, vaultId, JSON.stringify(data)]
      });
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
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
      console.error(e);
      res.status(500).json({ error: e.message });
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
