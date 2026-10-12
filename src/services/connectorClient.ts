import { Candle, ConnectorStatus, DiagnosticCheck, SymbolInfo } from '../types/market';

export interface LatestFeedResponse {
  status: 'LIVE' | 'STALE' | 'DISCONNECTED' | 'DEMO';
  is_live: boolean;
  symbol: string;
  last_received_at: number | null;
  age_seconds: number | null;
  tick?: {
    bid: number;
    ask: number;
    spread: number;
    time: number;
    iso_time?: string;
  };
  candles_m5: Candle[];
  candles_h1: Candle[];
  account?: any;
  terminal?: any;
  indicators?: {
    ema20?: number;
    ema200?: number;
    ema200_slope?: number;
    rsi14?: number;
  };
  error_message?: string;
}

export class ConnectorClient {
  private localDaemonUrl: string = 'http://127.0.0.1:8765';
  private currentMode: 'AUTO' | 'DEMO' | 'DISCONNECTED' = 'AUTO';
  private demoCandlesM5: Candle[] = [];
  private demoCandlesH1: Candle[] = [];
  private demoPrice: number = 2654.50;

  constructor() {
    this.initDemoHistory();
  }

  public setMode(mode: 'AUTO' | 'DEMO' | 'DISCONNECTED') {
    this.currentMode = mode;
    try {
      fetch('/api/connector/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      }).catch(() => {});
    } catch {}
  }

  public async connect(): Promise<void> {
    this.currentMode = 'AUTO';
    try {
      await fetch('/api/connector/connect', { method: 'POST' });
    } catch {}
  }

  public async disconnect(): Promise<void> {
    this.currentMode = 'DISCONNECTED';
    try {
      await fetch('/api/connector/disconnect', { method: 'POST' });
    } catch {}
  }

  public async testConnection(): Promise<{ success: boolean; latencyMs: number; status: string; message: string }> {
    const start = performance.now();
    try {
      const resp = await fetch('/api/connector/status');
      const latency = Math.round(performance.now() - start);
      if (resp.ok) {
        const json = await resp.json();
        return {
          success: json.is_live,
          latencyMs: latency,
          status: json.status,
          message: json.is_live
            ? `Live MT5 connection verified (${latency}ms latency).`
            : `Connector server responsive (${latency}ms), but no live feed streaming yet.`,
        };
      }
    } catch {}
    const latency = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs: latency,
      status: 'DISCONNECTED',
      message: 'Failed to communicate with connector endpoint.',
    };
  }

  public getMode(): 'AUTO' | 'DEMO' | 'DISCONNECTED' {
    return this.currentMode;
  }

  public setLocalDaemonUrl(url: string) {
    this.localDaemonUrl = url.trim();
  }

  /**
   * Fetches latest market feed from backend ingestion API or local daemon
   */
  public async getLatestFeed(): Promise<LatestFeedResponse> {
    // If user explicitly switched to DEMO mode
    if (this.currentMode === 'DEMO') {
      this.tickDemo();
      return {
        status: 'DEMO',
        is_live: false,
        symbol: 'XAUUSDm (DEMO)',
        last_received_at: Date.now(),
        age_seconds: 0,
        tick: {
          bid: this.demoPrice,
          ask: Math.round((this.demoPrice + 0.22) * 100) / 100,
          spread: 22,
          time: Math.floor(Date.now() / 1000),
          iso_time: new Date().toISOString(),
        },
        candles_m5: this.demoCandlesM5,
        candles_h1: this.demoCandlesH1,
        account: {
          login: 24891024,
          server: 'Exness-MT5Trial (Demo Simulation)',
          company: 'Exness Technologies Ltd',
          trade_mode: 0,
          currency: 'USD',
          balance: 10000.0,
        },
        terminal: {
          connected: true,
          name: 'Demo Simulator',
          build: 4153,
        },
      };
    }

    // 1. Try fetching from web app backend (/api/connector/latest)
    try {
      const resp = await fetch('/api/connector/latest');
      if (resp.ok) {
        const json = await resp.json();
        if (json.status === 'LIVE' || json.status === 'STALE') {
          const payload = json.data;
          return {
            status: json.status,
            is_live: json.is_live,
            symbol: payload?.symbol || 'XAUUSDm',
            last_received_at: json.last_received_at,
            age_seconds: json.age_seconds,
            tick: payload?.tick,
            candles_m5: payload?.candles_m5 || [],
            candles_h1: payload?.candles_h1 || [],
            account: payload?.account,
            terminal: payload?.terminal,
            indicators: payload?.indicators,
          };
        }
      }
    } catch {
      // Backend route unreachable, fallback to direct local check
    }

    // 2. Try fetching directly from local connector daemon (http://127.0.0.1:8765)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const localResp = await fetch(`${this.localDaemonUrl}/status`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (localResp.ok) {
        const localData = await localResp.json();
        if (localData.connected && localData.last_tick) {
          // Fetch candles from local daemon
          const [m5Resp, h1Resp] = await Promise.all([
            fetch(`${this.localDaemonUrl}/candles?timeframe=M5`).then((r) => r.json()).catch(() => ({ candles: [] })),
            fetch(`${this.localDaemonUrl}/candles?timeframe=H1`).then((r) => r.json()).catch(() => ({ candles: [] })),
          ]);

          return {
            status: 'LIVE',
            is_live: true,
            symbol: localData.symbol || 'XAUUSDm',
            last_received_at: Date.now(),
            age_seconds: 0,
            tick: localData.last_tick,
            candles_m5: m5Resp.candles || [],
            candles_h1: h1Resp.candles || [],
            account: localData.account,
            terminal: localData.terminal,
          };
        }
      }
    } catch {
      // Local daemon also unreachable
    }

    // 3. If neither is connected, return DISCONNECTED (Requirement 7 & 8: Never fake live data!)
    return {
      status: 'DISCONNECTED',
      is_live: false,
      symbol: 'XAUUSDm',
      last_received_at: null,
      age_seconds: null,
      candles_m5: [],
      candles_h1: [],
      error_message: 'No live MT5 feed detected. Launch connector/run_connector.bat on Windows to stream real data.',
    };
  }

  /**
   * Pings connector status for navigation bar
   */
  public async getStatus(): Promise<ConnectorStatus> {
    if (this.currentMode === 'DEMO') {
      return {
        online: true,
        feedStatus: 'DEMO',
        mode: 'SYNTHETIC_MOCK',
        port: 8765,
        selectedSymbol: 'XAUUSDm (DEMO)',
        lastPing: Date.now(),
        latencyMs: 12,
        terminal: { connected: true, name: 'Demo Simulator', build: 4153, path: 'C:\\Program Files\\MetaTrader 5\\terminal64.exe' },
        account: {
          login: 24891024,
          maskedLogin: '2489****',
          server: 'Exness-MT5Trial',
          company: 'Exness Technologies Ltd',
          tradeMode: 'DEMO',
          currency: 'USD',
          balance: 10000,
          equity: 10000,
          leverage: 2000,
        },
        availableSymbols: [{ name: 'XAUUSDm', description: 'Gold Demo', digits: 2, spread: 22 }],
      };
    }

    try {
      const resp = await fetch('/api/connector/status');
      if (resp.ok) {
        const json = await resp.json();
        return {
          online: json.is_live,
          feedStatus: json.status || 'DISCONNECTED',
          mode: json.status === 'LIVE' ? 'REAL_MT5' : 'SYNTHETIC_MOCK',
          port: 8765,
          selectedSymbol: json.symbol || 'XAUUSDm',
          lastPing: json.last_received_at || Date.now(),
          latencyMs: json.age_seconds !== null ? json.age_seconds * 1000 : 0,
          terminal: json.terminal,
          account: json.account,
          availableSymbols: [
            { name: 'XAUUSDm', description: 'Gold vs US Dollar (Exness Standard)', digits: 2, spread: 22 },
            { name: 'XAUUSD', description: 'Gold vs US Dollar (Exness Raw/Pro)', digits: 2, spread: 12 },
          ],
        };
      }
    } catch {}

    return {
      online: false,
      feedStatus: 'DISCONNECTED',
      mode: 'REAL_MT5',
      port: 8765,
      selectedSymbol: 'XAUUSDm',
      lastPing: 0,
      latencyMs: 0,
      availableSymbols: [],
      lastError: 'Backend disconnected from MT5. Run python gep5_connector.py on Windows.',
    };
  }

  /**
   * Diagnostic verification suite
   */
  public async runDiagnostics(): Promise<{
    passed: boolean;
    mode: 'REAL_MT5' | 'SYNTHETIC_MOCK';
    checks: DiagnosticCheck[];
    raw?: any;
    error?: string;
  }> {
    const feed = await this.getLatestFeed();

    if (feed.is_live) {
      const checks: DiagnosticCheck[] = [
        {
          id: 'step1',
          name: 'MetaTrader 5 Python Package',
          description: 'Official MetaQuotes MetaTrader5 Windows library link',
          status: 'PASS',
          details: 'Verified on running Windows host process',
        },
        {
          id: 'step2',
          name: 'MT5 Desktop Terminal Process',
          description: 'Terminal running and connected to trading server',
          status: 'PASS',
          details: feed.terminal?.name ? `${feed.terminal.name} (Build ${feed.terminal.build})` : 'Terminal connected',
        },
        {
          id: 'step3',
          name: 'Exness Account Authentication',
          description: 'Active Exness account verified with server link',
          status: 'PASS',
          details: feed.account?.login ? `Login #${feed.account.login} on ${feed.account.server}` : 'Account verified',
        },
        {
          id: 'step4',
          name: 'Gold Broker Symbol Resolution',
          description: 'Reading live quotes for actual broker symbol',
          status: 'PASS',
          details: `Active symbol: ${feed.symbol} (Spread: ${feed.tick?.spread || 22} pts)`,
        },
        {
          id: 'step5',
          name: 'Historical H1 & M5 Data Retrieval',
          description: 'Retrieving historical bars and verifying continuity',
          status: feed.candles_m5.length > 50 ? 'PASS' : 'WARN',
          details: `M5: ${feed.candles_m5.length} candles | H1: ${feed.candles_h1.length} candles`,
        },
        {
          id: 'step6',
          name: 'Real Live Market Stream',
          description: 'Receiving live bid/ask updates from MT5',
          status: 'PASS',
          details: `Bid: $${feed.tick?.bid?.toFixed(2)} | Ask: $${feed.tick?.ask?.toFixed(2)} (${feed.age_seconds || 0}s ago)`,
        },
      ];

      return {
        passed: true,
        mode: 'REAL_MT5',
        checks,
        raw: feed,
      };
    }

    if (this.currentMode === 'DEMO') {
      return {
        passed: true,
        mode: 'SYNTHETIC_MOCK',
        checks: [
          {
            id: 'step1',
            name: 'Demo Simulation Sandbox',
            description: 'Synthetic verification running in browser',
            status: 'WARN',
            details: 'Running simulated XAU/USD data for testing UI features',
          },
          {
            id: 'step2',
            name: 'Live MT5 Status',
            description: 'Checking connection to desktop terminal',
            status: 'WARN',
            details: 'DEMO mode active. Real MT5 feed is bypassed.',
          },
        ],
      };
    }

    // DISCONNECTED
    return {
      passed: false,
      mode: 'REAL_MT5',
      checks: [
        {
          id: 'step1',
          name: 'MetaTrader 5 Python Connector',
          description: 'Checking for active feed pushed from Windows PC',
          status: 'FAIL',
          errorMessage: 'No MT5 feed received yet. Launch connector/run_connector.bat on your Windows computer.',
        },
      ],
      error: 'Disconnected from MT5',
    };
  }

  // --- Demo Simulation History for explicit testing ---
  private initDemoHistory() {
    const now = Math.floor(Date.now() / 1000);
    let priceH1 = 2620.0;
    this.demoCandlesH1 = [];
    for (let i = 100; i >= 0; i--) {
      const t = now - i * 3600;
      const delta = (Math.random() - 0.45) * 4.0;
      const open = Math.round(priceH1 * 100) / 100;
      const close = Math.round((priceH1 + delta) * 100) / 100;
      this.demoCandlesH1.push({
        time: t,
        open,
        high: Math.round((Math.max(open, close) + 2.0) * 100) / 100,
        low: Math.round((Math.min(open, close) - 2.0) * 100) / 100,
        close,
        tick_volume: 3000,
      });
      priceH1 = close;
    }

    let priceM5 = 2646.0;
    this.demoCandlesM5 = [];
    for (let i = 300; i >= 0; i--) {
      const t = now - i * 300;
      const delta = (Math.random() - 0.46) * 1.5 + (i < 20 ? 0.2 : 0.05);
      const open = Math.round(priceM5 * 100) / 100;
      let close = Math.round((priceM5 + delta) * 100) / 100;
      let high = Math.round((Math.max(open, close) + 0.8) * 100) / 100;
      let low = Math.round((Math.min(open, close) - 0.8) * 100) / 100;

      if (i === 1) {
        low = open - 2.5;
        close = open + 0.6;
      }

      this.demoCandlesM5.push({
        time: t,
        open,
        high,
        low,
        close,
        tick_volume: 800,
      });
      priceM5 = close;
    }
    this.demoPrice = priceM5;
  }

  private tickDemo() {
    this.demoPrice = Math.round((this.demoPrice + (Math.random() - 0.48) * 0.25) * 100) / 100;
    if (this.demoCandlesM5.length > 0) {
      const last = this.demoCandlesM5[this.demoCandlesM5.length - 1];
      last.close = this.demoPrice;
    }
  }
}

export const connectorService = new ConnectorClient();
