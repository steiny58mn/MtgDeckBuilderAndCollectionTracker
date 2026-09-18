import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Target API backend for local dev proxy (default to localhost:5205 for local C# debugging, or azure)
  const API_TARGET = env.VITE_API_BASE_URL || env.API_BASE_URL || 'http://localhost:5205';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5173,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/mtgtools': {
          target: API_TARGET,
          changeOrigin: true,
          secure: false,
        },
        '/deckbuilder': {
          target: API_TARGET,
          changeOrigin: true,
          secure: false,
        },
        '/api/edhrec': {
          target: 'https://json.edhrec.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/edhrec/, ''),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        },
        '/api/scryfall': {
          target: 'https://api.scryfall.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/scryfall/, ''),
          headers: {
            'User-Agent': 'MtgDeckBuilderAndCollectionTracker/1.0',
          },
        },
      },
    },
  };
});
