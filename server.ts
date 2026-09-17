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
  if (initialConfig.isPlaceholder) {
    console.log(`[Turso DB] ℹ️ Placeholder credentials detected ("${initialConfig.rawPlaceholderUrl}").`);
    console.log(`[Turso DB] 🌐 Mode: Local SQLite Storage (file:local.db)`);
  } else {
    console.log(`[Turso DB] 🔗 Target Database: ${maskTursoUrl(initialConfig.url)}`);
    console.log(`[Turso DB] 🔑 Auth Token Status: ${initialConfig.authToken ? 'Configured ✅' : 'Not Set ⚠️'}`);
    console.log(`[Turso DB] 🌐 Mode: ${initialConfig.isRemote ? 'Remote Turso Cloud (libsql)' : 'Local SQLite Storage (local.db)'}`);
  }

  // Initialize Turso DB
  await initDb().catch((err) => {
    console.info('[Turso DB] DB Initialization Notice:', err.message || err);
  });

  // Functions compilation & diagnostics inspection check
  app.get(['/api/functions-check', '/api/health'], (req, res) => {
    const config = getTursoConfig();
    res.set('X-Engine', 'Node-Express-Server');
    res.set('X-Functions-Compiled', 'true');
    res.json({
      functionsCompiled: true,
      engine: 'Node.js Express Server (Dev/Container)',
      timestamp: new Date().toISOString(),
      urlPath: req.path,
      environmentVariables: {
        allDetectedKeys: Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('LC_')),
        TURSO_DATABASE_URL: {
          present: Boolean(process.env.TURSO_DATABASE_URL),
          isPlaceholder: config.isPlaceholder,
          masked: maskTursoUrl(config.rawPlaceholderUrl || config.url),
          formatValid: Boolean(config.url),
        },
        TURSO_AUTH_TOKEN: {
          present: Boolean(process.env.TURSO_AUTH_TOKEN),
          isPlaceholder: config.isPlaceholder,
          length: process.env.TURSO_AUTH_TOKEN ? process.env.TURSO_AUTH_TOKEN.trim().length : 0,
          looksLikeJWT: Boolean(process.env.TURSO_AUTH_TOKEN?.trim().startsWith('ey')),
        },
      },
      databaseStatus: {
        isConfigured: config.isRemote && Boolean(config.authToken) && !config.isPlaceholder,
        isRemote: config.isRemote,
        isPlaceholder: config.isPlaceholder,
      },
      troubleshooting: config.isPlaceholder
        ? 'Example placeholder credentials detected ("your-database-name"). Storing data safely in local SQLite mode until custom credentials are provided.'
        : config.isRemote && Boolean(config.authToken)
        ? 'Backend is connected to remote Turso database.'
        : 'Running in local SQLite mode.',
    });
  });

  // Storage Backend Health & Configuration Status Check
  app.get('/api/storage/status', (req, res) => {
    const config = getTursoConfig();
    res.json({
      status: 'ok',
      backend: 'turso',
      isCloudConfigured: config.isRemote && Boolean(config.authToken) && !config.isPlaceholder,
      databaseUrlMasked: maskTursoUrl(config.rawPlaceholderUrl || config.url),
      hasAuthToken: Boolean(config.authToken),
      isRemote: config.isRemote,
      isPlaceholder: config.isPlaceholder,
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
      const dbConfig = getTursoConfig();
      res.json({ success: true, remote: dbConfig.isRemote, table: tableName, vaultId, docId });
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
          'User-Agent': 'MTGCreativeStudio/1.0',
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

  // Proxy route for EDHREC API to prevent browser CORS and 403 blocks
  app.use('/api/edhrec', async (req, res) => {
    try {
      const targetUrl = `https://json.edhrec.com${req.url}`;
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://edhrec.com/',
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).json({
          container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
          status: response.status,
          message: 'EDHREC data not available for this card',
        });
      }

      const data = await response.text();
      res.status(200);
      res.set('Content-Type', 'application/json');
      res.send(data);
    } catch (error: any) {
      console.warn('[EDHREC Proxy Notice]:', error?.message || error);
      res.status(200).json({
        container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
        error: error.message,
      });
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
