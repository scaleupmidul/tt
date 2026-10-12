import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MT5Payload {
  symbol: string;
  tick?: {
    bid: number;
    ask: number;
    spread: number;
    time: number;
    iso_time?: string;
  };
  candles_m5?: any[];
  candles_h1?: any[];
  account?: {
    login?: number;
    server?: string;
    company?: string;
    trade_mode?: number;
    currency?: string;
    balance?: number;
    equity?: number;
    leverage?: number;
  };
  terminal?: {
    connected?: boolean;
    path?: string;
    name?: string;
    build?: number;
  };
  available_symbols?: any[];
  indicators?: {
    ema20?: number;
    ema200?: number;
    ema200_slope?: number;
    rsi14?: number;
  };
  strategy?: {
    buy?: any;
    sell?: any;
  };
  client_timestamp?: string;
  token?: string;
}

// In-memory state store for real MT5 feed
let latestMT5Data: MT5Payload | null = null;
let lastReceivedTimestamp: number = 0;
let userModeOverride: 'AUTO' | 'DEMO' | 'DISCONNECTED' = 'AUTO';

export async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Support JSON payload up to 10MB (for historical candles)
  app.use(express.json({ limit: '10mb' }));

  // CORS headers so local Python connector can push from any origin
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-GEP5-Token');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'GEP-5 Market Data API',
      timestamp: new Date().toISOString(),
    });
  });

  // Connector Push Endpoint: Python backend on Windows pushes MT5 data here
  app.post('/api/connector/push', (req: Request, res: Response) => {
    const data: MT5Payload = req.body;
    if (!data || !data.symbol) {
      return res.status(400).json({ error: 'Missing symbol or invalid MT5 payload' });
    }

    latestMT5Data = data;
    lastReceivedTimestamp = Date.now();
    userModeOverride = 'AUTO';

    return res.json({
      success: true,
      received_at: lastReceivedTimestamp,
      symbol: data.symbol,
      m5_count: data.candles_m5?.length || 0,
      h1_count: data.candles_h1?.length || 0,
      tick: data.tick,
    });
  });

  // Helper to query bound internal connector service via process.env.CONNECTOR_URL
  async function fetchFromInternalConnector(endpoint: string, queryParams?: Record<string, string>) {
    if (!process.env.CONNECTOR_URL) return null;
    try {
      const targetUrl = new URL(endpoint, process.env.CONNECTOR_URL);
      if (queryParams) {
        for (const [key, val] of Object.entries(queryParams)) {
          targetUrl.searchParams.set(key, val);
        }
      }
      const resp = await fetch(targetUrl.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      console.warn(`[Connector Service] Failed to fetch '${endpoint}' from ${process.env.CONNECTOR_URL}:`, err);
      return null;
    }
  }

  // Status Endpoint
  app.get('/api/connector/status', async (req: Request, res: Response) => {
    const now = Date.now();
    const ageSeconds = lastReceivedTimestamp > 0 ? Math.floor((now - lastReceivedTimestamp) / 1000) : null;

    let computedStatus: 'LIVE' | 'STALE' | 'DISCONNECTED' | 'DEMO' = 'DISCONNECTED';

    if (userModeOverride === 'DEMO') {
      computedStatus = 'DEMO';
    } else if (userModeOverride === 'DISCONNECTED') {
      computedStatus = 'DISCONNECTED';
    } else if (lastReceivedTimestamp > 0) {
      if (ageSeconds !== null && ageSeconds <= 20) {
        computedStatus = 'LIVE';
      } else if (ageSeconds !== null && ageSeconds <= 90) {
        computedStatus = 'STALE';
      } else {
        computedStatus = 'DISCONNECTED';
      }
    } else {
      computedStatus = 'DISCONNECTED';
    }

    // If local feed is disconnected, check bound internal connector service
    if (computedStatus === 'DISCONNECTED' && process.env.CONNECTOR_URL && userModeOverride !== 'DEMO') {
      const internalStatus = await fetchFromInternalConnector('status');
      if (internalStatus) {
        return res.json({
          status: internalStatus.connected ? 'LIVE' : 'DISCONNECTED',
          is_live: Boolean(internalStatus.connected),
          last_received_at: Date.now(),
          age_seconds: 0,
          symbol: internalStatus.symbol || latestMT5Data?.symbol || 'XAUUSDm',
          terminal: internalStatus.terminal || latestMT5Data?.terminal || null,
          account: internalStatus.account || latestMT5Data?.account || null,
          has_data: true,
          bound_service: 'connector',
          connector_url: process.env.CONNECTOR_URL ? '[BOUND]' : null,
        });
      }
    }

    res.json({
      status: computedStatus,
      is_live: computedStatus === 'LIVE',
      last_received_at: lastReceivedTimestamp || null,
      age_seconds: ageSeconds,
      symbol: latestMT5Data?.symbol || 'XAUUSDm',
      terminal: latestMT5Data?.terminal || null,
      account: latestMT5Data?.account || null,
      has_data: latestMT5Data !== null,
      connector_binding_configured: Boolean(process.env.CONNECTOR_URL),
    });
  });

  // Latest Feed Data Endpoint: Polled by React frontend
  app.get('/api/connector/latest', async (req: Request, res: Response) => {
    const now = Date.now();
    const ageSeconds = lastReceivedTimestamp > 0 ? Math.floor((now - lastReceivedTimestamp) / 1000) : null;

    let computedStatus: 'LIVE' | 'STALE' | 'DISCONNECTED' | 'DEMO' = 'DISCONNECTED';

    if (userModeOverride === 'DEMO') {
      computedStatus = 'DEMO';
    } else if (userModeOverride === 'DISCONNECTED') {
      computedStatus = 'DISCONNECTED';
    } else if (lastReceivedTimestamp > 0) {
      if (ageSeconds !== null && ageSeconds <= 20) {
        computedStatus = 'LIVE';
      } else if (ageSeconds !== null && ageSeconds <= 90) {
        computedStatus = 'STALE';
      } else {
        computedStatus = 'DISCONNECTED';
      }
    } else {
      computedStatus = 'DISCONNECTED';
    }

    // If local feed is disconnected, query internal connector service binding if available
    if (computedStatus === 'DISCONNECTED' && process.env.CONNECTOR_URL && userModeOverride !== 'DEMO') {
      try {
        const [internalStatus, internalTick, m5Data, h1Data] = await Promise.all([
          fetchFromInternalConnector('status'),
          fetchFromInternalConnector('live'),
          fetchFromInternalConnector('candles', { timeframe: 'M5' }),
          fetchFromInternalConnector('candles', { timeframe: 'H1' }),
        ]);

        if (internalTick && !internalTick.error) {
          return res.json({
            status: internalStatus?.connected ? 'LIVE' : 'STALE',
            is_live: Boolean(internalStatus?.connected),
            last_received_at: Date.now(),
            age_seconds: 0,
            bound_service: 'connector',
            data: {
              symbol: internalStatus?.symbol || 'XAUUSDm',
              tick: internalTick,
              candles_m5: m5Data?.candles || [],
              candles_h1: h1Data?.candles || [],
              account: internalStatus?.account || null,
              terminal: internalStatus?.terminal || null,
            },
          });
        }
      } catch (err) {
        console.warn('[Connector Service] Error retrieving feed from internal service:', err);
      }
    }

    if (computedStatus === 'DISCONNECTED' && userModeOverride !== 'DEMO') {
      return res.json({
        status: 'DISCONNECTED',
        is_live: false,
        message: 'No active MT5 feed received from local connector within the last 90 seconds.',
        last_received_at: lastReceivedTimestamp || null,
        age_seconds: ageSeconds,
        data: null,
      });
    }

    return res.json({
      status: computedStatus,
      is_live: computedStatus === 'LIVE',
      last_received_at: lastReceivedTimestamp,
      age_seconds: ageSeconds,
      data: latestMT5Data,
    });
  });

  // Proxy to internal connector service
  app.all('/api/connector/service/:endpoint', async (req: Request, res: Response) => {
    if (!process.env.CONNECTOR_URL) {
      return res.status(503).json({
        error: 'CONNECTOR_URL service binding is not configured in this environment',
        message: 'Ensure the connector service is bound in vercel.json',
      });
    }

    try {
      const endpoint = req.params.endpoint;
      const targetUrl = new URL(endpoint, process.env.CONNECTOR_URL);
      const urlObj = new URL(req.url, 'http://localhost');
      urlObj.searchParams.forEach((val, key) => targetUrl.searchParams.set(key, val));

      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const backendRes = await fetch(targetUrl.toString(), fetchOptions);
      const data = await backendRes.json().catch(() => ({}));
      return res.status(backendRes.status).json(data);
    } catch (err: any) {
      return res.status(502).json({
        error: 'Failed to communicate with internal connector service',
        details: err?.message,
      });
    }
  });

  // User Mode Switch (e.g. explicitly test DEMO mode or reset)
  app.post('/api/connector/mode', (req: Request, res: Response) => {
    const { mode } = req.body;
    if (mode === 'DEMO' || mode === 'DISCONNECTED' || mode === 'AUTO') {
      userModeOverride = mode;
      return res.json({ success: true, mode: userModeOverride });
    }
    return res.status(400).json({ error: 'Invalid mode' });
  });

  // Explicit Disconnect
  app.post('/api/connector/disconnect', (req: Request, res: Response) => {
    userModeOverride = 'DISCONNECTED';
    latestMT5Data = null;
    lastReceivedTimestamp = 0;
    return res.json({ success: true, status: 'DISCONNECTED', message: 'Feed disconnected' });
  });

  // Explicit Connect / Reconnect
  app.post('/api/connector/connect', (req: Request, res: Response) => {
    userModeOverride = 'AUTO';
    return res.json({ success: true, status: 'AUTO', message: 'Connecting to MT5 feed...' });
  });

  // Download connector scripts directly or zip package
  app.get('/api/connector/download/:file', (req: Request, res: Response) => {
    const filename = req.params.file;
    const allowedFilenames = new Set([
      'gep5_connector.py',
      'test_stage1_connection.py',
      'run_connector.bat',
      'run_stage1_test.bat',
      'requirements.txt',
      'README.md',
      'GEP5_Strategy_Engine.mq5',
      'gep5_mt5_connector.zip',
      'manifest.json',
      'popup.html',
      'popup.js',
      'background.js',
    ]);

    if (!allowedFilenames.has(filename)) {
      return res.status(403).json({ error: 'Forbidden or unrecognized filename' });
    }

    const candidatePaths = [
      path.resolve(__dirname, 'public', 'connector', filename),
      path.resolve(process.cwd(), 'public', 'connector', filename),
      path.resolve(__dirname, 'connector', filename),
      path.resolve(process.cwd(), 'connector', filename),
      path.resolve(__dirname, 'public', 'extension', filename),
      path.resolve(process.cwd(), 'public', 'extension', filename),
      path.resolve(__dirname, 'extension', filename),
      path.resolve(process.cwd(), 'extension', filename),
    ];

    let foundPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (foundPath) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      if (filename.endsWith('.py')) {
        res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
      } else if (filename.endsWith('.bat')) {
        res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
      } else if (filename.endsWith('.zip')) {
        res.setHeader('Content-Type', 'application/zip');
      } else if (filename.endsWith('.mq5')) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      return res.sendFile(foundPath);
    }

    return res.status(404).json({ error: `File '${filename}' not found on server.` });
  });

  // Direct ZIP download route
  app.get('/api/connector/download-zip', (req: Request, res: Response) => {
    const zipPaths = [
      path.resolve(__dirname, 'public', 'connector', 'gep5_mt5_connector.zip'),
      path.resolve(process.cwd(), 'public', 'connector', 'gep5_mt5_connector.zip'),
      path.resolve(__dirname, 'connector', 'gep5_mt5_connector.zip'),
      path.resolve(process.cwd(), 'connector', 'gep5_mt5_connector.zip'),
    ];

    for (const p of zipPaths) {
      if (fs.existsSync(p)) {
        res.setHeader('Content-Disposition', 'attachment; filename="gep5_mt5_connector.zip"');
        res.setHeader('Content-Type', 'application/zip');
        return res.sendFile(p);
      }
    }

    return res.status(404).json({ error: 'Connector ZIP archive not found on server.' });
  });

  // --- VITE MIDDLEWARE / STATIC ASSETS ---
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[GEP-5 Server] Listening on port ${PORT}`);
    console.log(`[GEP-5 Server] MT5 Ingestion API: POST http://0.0.0.0:${PORT}/api/connector/push`);
  });
}

startServer();
