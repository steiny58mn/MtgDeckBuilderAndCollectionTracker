import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Increase payload limits
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

  console.log(`[Server] 🚀 Server starting on port ${PORT}...`);
  console.log(`[Server] 🌐 Mode: Client-Side Storage with External API / Database Diagnostics`);

  // 1. Health & Server Status Endpoint
  app.get(['/api/health', '/api/status', '/api/functions-check'], (req, res) => {
    const configuredApiUrl = process.env.MTG_API_URL || null;
    res.set('X-Engine', 'Node-Express-Server');
    res.json({
      status: 'online',
      engine: 'Node.js Express Server (Dev/Container)',
      timestamp: new Date().toISOString(),
      urlPath: req.path,
      externalApiConfigured: Boolean(configuredApiUrl),
      configuredApiUrl: configuredApiUrl ? configuredApiUrl.replace(/\/+$/, '') : null,
      storageMode: 'client_local_storage',
      message: 'App is running in lightweight decoupled mode. Data is saved in client local storage, with support for connecting to MtgTools API.',
    });
  });

  // 2. Database & External API Diagnostics / Ping Endpoint
  // Allows testing connection to any target database or API URL (e.g. MtgToolsForMtgNexus or external DB)
  app.get('/api/diagnostics/ping', async (req, res) => {
    const targetUrl = (req.query.url as string) || process.env.MTG_API_URL || '';
    if (!targetUrl) {
      return res.json({
        status: 'standby',
        message: 'No external URL provided to ping. Provide ?url=https://your-api or set MTG_API_URL.',
        latencyMs: 0,
      });
    }

    const start = Date.now();
    try {
      let normalized = targetUrl.trim();
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = `https://${normalized}`;
      }

      console.log(`[Diagnostics] 🔍 Pinging external endpoint: ${normalized}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const pingResponse = await fetch(normalized, {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - start;
      const contentType = pingResponse.headers.get('content-type') || '';
      let responseBody: any = null;

      if (contentType.includes('application/json')) {
        try {
          responseBody = await pingResponse.json();
        } catch {
          responseBody = await pingResponse.text();
        }
      } else {
        const text = await pingResponse.text();
        responseBody = text.slice(0, 300);
      }

      console.log(`[Diagnostics] ✅ Ping to ${normalized} returned HTTP ${pingResponse.status} (${latencyMs}ms)`);
      return res.json({
        status: pingResponse.ok ? 'connected' : 'warning',
        httpStatus: pingResponse.status,
        latencyMs,
        targetUrl: normalized,
        response: responseBody,
      });
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      console.warn(`[Diagnostics] ❌ Ping failed for ${targetUrl}:`, err.message);
      return res.status(502).json({
        status: 'unreachable',
        error: err.name === 'AbortError' ? 'Connection timed out after 10s' : err.message,
        latencyMs,
        targetUrl,
      });
    }
  });

  // 3. Proxy route for Scryfall API to bypass browser CORS / Adblockers
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

  // 4. Proxy route for EDHREC API to prevent browser CORS and 403 blocks
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

  // 5. Vite middleware for development / Static file serving for production
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
