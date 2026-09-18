import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const REMOTE_API_BASE = process.env.API_BASE_URL || 'https://mtgappsapi.azurewebsites.net';

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json({ limit: '10mb' }));

  // Proxy route for mtgappsapi.azurewebsites.net endpoints
  app.use(['/mtgtools', '/deckbuilder'], async (req, res) => {
    try {
      const targetUrl = `${REMOTE_API_BASE}${req.originalUrl || req.url}`;
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'] as string;
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
      });

      const contentType = response.headers.get('content-type') || 'application/json';
      const data = await response.text();

      res.status(response.status);
      res.set('Content-Type', contentType);
      res.send(data);
    } catch (error: any) {
      console.error('Remote API Proxy Error:', error);
      res.status(500).json({ error: 'Failed to proxy request to remote API', details: error.message });
    }
  });

  // Proxy route for EDHREC API
  app.use('/api/edhrec', async (req, res) => {
    try {
      const targetUrl = `https://json.edhrec.com${req.url}`;
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://edhrec.com/',
        },
      });

      // EDHREC S3 / CloudFront returns 403/404 for non-existent commander JSONs (e.g. Lands, non-commanders)
      if (!response.ok) {
        return res.json({
          container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
          status: response.status,
          notFound: true,
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.json({
        container: { json_dict: { card: { num_decks: 0 }, cardlists: [] } },
        error: error.message,
      });
    }
  });

  // Proxy route for Scryfall API
  app.use('/api/scryfall', async (req, res) => {
    try {
      const targetUrl = `https://api.scryfall.com${req.url}`;
      
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'User-Agent': 'MtgDeckBuilderAndCollectionTracker/1.0 (https://github.com/steiny58mn/MtgDeckBuilderAndCollectionTracker)',
          'Accept': 'application/json;q=0.9,*/*;q=0.8',
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
    console.log(`Server running on http://localhost:${PORT} (proxying remote endpoints to ${REMOTE_API_BASE})`);
  });
}

startServer();
