import { createClient } from "@libsql/client/web";

interface Env {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}

function normalizeTursoUrl(rawUrl?: string): string {
  if (!rawUrl) return "file:local.db";
  let trimmed = rawUrl.trim();
  if (trimmed.endsWith('.turso.io') && !trimmed.includes('://')) {
    trimmed = `libsql://${trimmed}`;
  }
  return trimmed;
}

function maskTursoUrl(url?: string): string {
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

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    },
  });
}

export const onRequestGet = async (context: any) => {
  const { env } = context;
  const start = Date.now();
  const rawUrl = normalizeTursoUrl(env.TURSO_DATABASE_URL);
  const authToken = env.TURSO_AUTH_TOKEN?.trim() || undefined;
  const isRemote = rawUrl.startsWith('libsql://') || rawUrl.startsWith('https://');

  try {
    const client = createClient({ url: rawUrl, authToken });
    await client.execute('SELECT 1 as ping;');
    const latencyMs = Date.now() - start;

    const [dRes, bRes, cRes] = await Promise.all([
      client.execute('SELECT COUNT(*) as cnt FROM turso_decks;').catch(() => ({ rows: [{ cnt: 0 }] })),
      client.execute('SELECT COUNT(*) as cnt FROM turso_binders;').catch(() => ({ rows: [{ cnt: 0 }] })),
      client.execute('SELECT COUNT(*) as cnt FROM turso_collection;').catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    return jsonResponse({
      status: 'connected',
      environment: 'cloudflare-pages',
      isRemote,
      databaseUrlMasked: maskTursoUrl(rawUrl),
      hasAuthToken: Boolean(authToken),
      latencyMs,
      counts: {
        decks: Number(dRes.rows[0]?.cnt ?? 0),
        binders: Number(bRes.rows[0]?.cnt ?? 0),
        collection: Number(cRes.rows[0]?.cnt ?? 0),
      },
      error: null,
    });
  } catch (err: any) {
    return jsonResponse({
      status: 'error',
      environment: 'cloudflare-pages',
      error: err?.message || String(err),
    }, 500);
  }
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    },
  });
};
