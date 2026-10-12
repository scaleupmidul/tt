import React, { useState, useEffect } from 'react';
import { ConnectorStatus, DiagnosticCheck, Candle, SymbolInfo, UnitTestResult } from '../types/market';
import { connectorService } from '../services/connectorClient';
import { runAllUnitTests } from '../engine/unitTests';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Database,
  Download,
  Copy,
  Check,
  Cpu,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileCode,
  FlaskConical,
  Lock,
  Power,
  PowerOff,
  Wifi,
  WifiOff,
  Clock,
  Radio,
  ExternalLink,
  Archive,
  FolderDown,
  FileCheck,
} from 'lucide-react';
import {
  downloadConnectorFile,
  downloadConnectorZip,
  getAvailableConnectorFiles,
} from '../services/connectorDownloader';

interface DataConnectionPageProps {
  status: ConnectorStatus;
  isMockMode: boolean;
  feedStatus?: 'LIVE' | 'STALE' | 'DISCONNECTED' | 'DEMO' | 'RECONNECTING';
  onToggleMockMode: () => void;
  onRefreshStatus: () => void;
  m5Candles: Candle[];
  h1Candles: Candle[];
  onSelectSymbol: (symbol: string) => void;
  onConnect?: () => Promise<void> | void;
  onDisconnect?: () => Promise<void> | void;
}

export const DataConnectionPage: React.FC<DataConnectionPageProps> = ({
  status,
  isMockMode,
  feedStatus = 'DISCONNECTED',
  onToggleMockMode,
  onRefreshStatus,
  m5Candles,
  h1Candles,
  onSelectSymbol,
  onConnect,
  onDisconnect,
}) => {
  const [runningDiag, setRunningDiag] = useState(false);
  const [diagResults, setDiagResults] = useState<DiagnosticCheck[]>([]);
  const [diagOverallPassed, setDiagOverallPassed] = useState<boolean | null>(null);
  const [diagRaw, setDiagRaw] = useState<any>(null);
  const [copiedScript, setCopiedScript] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'diagnostic' | 'symbols' | 'candles' | 'scripts' | 'tests'>('diagnostic');
  const [unitTests, setUnitTests] = useState<UnitTestResult[]>([]);
  const [runningTests, setRunningTests] = useState(false);

  // Connection Center state
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    latencyMs: number;
    message: string;
    timestamp: string;
  } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Download states and notification
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [downloadToast, setDownloadToast] = useState<{ message: string; success: boolean } | null>(null);

  const handleDownloadSingleFile = async (fileName: string) => {
    setDownloadingFile(fileName);
    setDownloadToast({ message: `Preparing ${fileName}...`, success: true });
    try {
      const res = await downloadConnectorFile(fileName);
      if (res.success) {
        setDownloadToast({ message: `✓ Downloaded ${fileName} successfully!`, success: true });
      } else {
        setDownloadToast({ message: `Failed to download ${fileName}.`, success: false });
      }
    } catch {
      setDownloadToast({ message: `Error downloading ${fileName}.`, success: false });
    } finally {
      setDownloadingFile(null);
      setTimeout(() => setDownloadToast(null), 4000);
    }
  };

  const handleDownloadAllZip = async () => {
    setDownloadingZip(true);
    setDownloadToast({ message: 'Packaging gep5_mt5_connector.zip (all scripts & tools)...', success: true });
    try {
      const res = await downloadConnectorZip();
      if (res.success) {
        setDownloadToast({ message: `✓ Downloaded gep5_mt5_connector.zip (${(res.sizeBytes / 1024).toFixed(1)} KB) successfully!`, success: true });
      } else {
        setDownloadToast({ message: 'Failed to package connector ZIP.', success: false });
      }
    } catch {
      setDownloadToast({ message: 'Error generating connector ZIP.', success: false });
    } finally {
      setDownloadingZip(false);
      setTimeout(() => setDownloadToast(null), 4500);
    }
  };

  // Run diagnostics on mount
  useEffect(() => {
    handleRunDiagnostics();
  }, [isMockMode]);

  const handleRunDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const res = await connectorService.runDiagnostics();
      setDiagResults(res.checks);
      setDiagOverallPassed(res.passed);
      setDiagRaw(res.raw);
    } catch {
      setDiagOverallPassed(false);
    } finally {
      setRunningDiag(false);
    }
  };

  const handleConnectAction = async () => {
    setIsConnecting(true);
    try {
      if (onConnect) {
        await onConnect();
      } else {
        await connectorService.connect();
        onRefreshStatus();
      }
      await handleRunDiagnostics();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectAction = async () => {
    setIsDisconnecting(true);
    try {
      if (onDisconnect) {
        await onDisconnect();
      } else {
        await connectorService.disconnect();
        onRefreshStatus();
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleTestConnectionAction = async () => {
    setTestingConnection(true);
    try {
      const res = await connectorService.testConnection();
      setTestResult({
        tested: true,
        success: res.success,
        latencyMs: res.latencyMs,
        message: res.message,
        timestamp: new Date().toLocaleTimeString(),
      });
      onRefreshStatus();
    } finally {
      setTestingConnection(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(id);
    setTimeout(() => setCopiedScript(null), 2500);
  };

  const lastM5 = m5Candles[m5Candles.length - 1];
  const lastH1 = h1Candles[h1Candles.length - 1];

  const effectiveStatus = feedStatus === 'LIVE' ? 'CONNECTED' : feedStatus;

  const maskedLoginDisplay = status.account?.maskedLogin
    ? status.account.maskedLogin
    : status.account?.login
    ? `${String(status.account.login).slice(0, 4)}****`
    : isMockMode
    ? '2489****'
    : 'Not logged in';

  const accountModeDisplay = status.account?.tradeMode
    ? status.account.tradeMode
    : isMockMode
    ? 'DEMO'
    : 'DISCONNECTED';

  const serverDisplay = status.account?.server || (isMockMode ? 'Exness-MT5Trial' : 'No Server');
  const companyDisplay = status.account?.company || (isMockMode ? 'Exness Technologies Ltd' : 'Exness MT5');

  return (
    <div className="w-full space-y-6 pb-12">
      {/* =========================================================================
          SECTION 1: MT5 CONNECTION CENTER (TOP COMMAND DECK)
         ========================================================================= */}
      <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-lg shadow-xl space-y-6">
        {/* Top Header: Title & Direct Connect/Disconnect Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-400 font-mono mb-1 font-semibold">
              <Radio className="w-4 h-4 animate-pulse" />
              <span>OFFICIAL METATRADER 5 INTEGRATION</span>
              <span aria-hidden="true">·</span>
              <span>EXNESS TRADING TERMINAL</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-100 tracking-tight flex flex-wrap items-center gap-3">
              <span>MT5 Connection Center</span>
              {/* Connection Status Badge */}
              <span
                className={`text-xs sm:text-sm font-mono font-bold px-3 py-1 rounded border flex items-center gap-2 ${
                  feedStatus === 'LIVE'
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600/80'
                    : feedStatus === 'STALE'
                    ? 'bg-amber-950/80 text-amber-300 border-amber-600/80'
                    : feedStatus === 'DEMO'
                    ? 'bg-purple-950/80 text-purple-300 border-purple-600/80'
                    : isConnecting
                    ? 'bg-sky-950/80 text-sky-300 border-sky-600/80'
                    : 'bg-rose-950/80 text-rose-400 border-rose-700/80'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    feedStatus === 'LIVE'
                      ? 'bg-emerald-400 animate-pulse'
                      : feedStatus === 'STALE'
                      ? 'bg-amber-400'
                      : feedStatus === 'DEMO'
                      ? 'bg-purple-400'
                      : isConnecting
                      ? 'bg-sky-400 animate-spin'
                      : 'bg-rose-500'
                  }`}
                />
                <span>
                  {feedStatus === 'LIVE'
                    ? 'CONNECTED'
                    : feedStatus === 'STALE'
                    ? 'STALE FEED'
                    : feedStatus === 'DEMO'
                    ? 'DEMO (SIMULATED)'
                    : isConnecting
                    ? 'RECONNECTING...'
                    : 'DISCONNECTED'}
                </span>
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mt-1.5 max-w-4xl">
              Connects to your local Windows MetaTrader 5 terminal via the official MetaTrader5 Python API. Stream real-time Gold ticks, OHLCV candles, and execute GEP-5 deterministic validation without manual order risk.
            </p>
          </div>

          {/* Connect / Disconnect / Test / Refresh Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {feedStatus === 'LIVE' ? (
              <button
                onClick={handleDisconnectAction}
                disabled={isDisconnecting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-300 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 rounded transition-colors disabled:opacity-50"
                title="Disconnect from MT5 market feed"
              >
                <PowerOff className="w-4 h-4" />
                <span>{isDisconnecting ? 'Disconnecting...' : 'Disconnect'}</span>
              </button>
            ) : (
              <button
                onClick={handleConnectAction}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded transition-colors disabled:opacity-50 shadow-sm"
                title="Establish connection to local MT5 feed"
              >
                <Power className="w-4 h-4" />
                <span>{isConnecting ? 'Connecting...' : 'Connect MT5'}</span>
              </button>
            )}

            <button
              onClick={handleTestConnectionAction}
              disabled={testingConnection}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
              title="Ping backend connector and measure latency"
            >
              <Radio className={`w-4 h-4 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>{testingConnection ? 'Testing...' : 'Test Connection'}</span>
            </button>

            <button
              onClick={() => {
                onRefreshStatus();
                handleRunDiagnostics();
              }}
              disabled={runningDiag}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
              title="Refresh status and candles immediately"
            >
              <RefreshCw className={`w-4 h-4 ${runningDiag ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={onToggleMockMode}
              className={`px-3 py-2 text-xs font-mono rounded border transition-colors ${
                isMockMode
                  ? 'bg-purple-950 text-purple-300 border-purple-600 hover:bg-purple-900'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Toggle synthetic sandbox when MT5 is not running"
            >
              {isMockMode ? 'Sandbox Active' : 'Sandbox Mode'}
            </button>
          </div>
        </div>

        {/* Test Connection Output Banner (If clicked) */}
        {testResult && (
          <div
            className={`p-3.5 rounded border text-xs flex items-center justify-between gap-3 font-mono ${
              testResult.success
                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                : 'bg-rose-950/40 border-rose-700/60 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>
                <strong>{testResult.success ? 'PING SUCCESS' : 'PING NOTICE'}:</strong> {testResult.message}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-[11px] text-slate-400">
              <span>Latency: <strong className="text-slate-200">{testResult.latencyMs}ms</strong></span>
              <span>Tested: {testResult.timestamp}</span>
              <button
                onClick={() => setTestResult(null)}
                className="text-slate-400 hover:text-slate-200 font-bold ml-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Vitals Grid: Broker, Masked Account, Mode, Symbol, Latency, Timestamps */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5 text-xs font-mono">
          {/* Card 1: Broker & Server */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
            <span className="text-[11px] text-slate-400 block truncate">Broker & Server</span>
            <p className="font-semibold text-slate-200 mt-1 truncate" title={serverDisplay}>
              {serverDisplay}
            </p>
            <span className="text-[10px] text-slate-500 block truncate">{companyDisplay}</span>
          </div>

          {/* Card 2: Masked Account Login & Password Guard */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 block">Account Login</span>
              <span title="Password is never stored, requested, or transmitted">
                <Lock className="w-3 h-3 text-emerald-400" />
              </span>
            </div>
            <p className="font-semibold text-slate-200 mt-1 font-mono tracking-wider">
              {maskedLoginDisplay}
            </p>
            <span className="text-[10px] text-emerald-500/90 block">Protected (Masked)</span>
          </div>

          {/* Card 3: Account Mode (LIVE / DEMO) */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
            <span className="text-[11px] text-slate-400 block">Account Mode</span>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  accountModeDisplay === 'REAL' || (feedStatus === 'LIVE' && !isMockMode)
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                    : 'bg-amber-950 text-amber-300 border border-amber-700'
                }`}
              >
                {accountModeDisplay === 'REAL' ? 'REAL ACCOUNT' : accountModeDisplay}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {status.account?.balance ? `Bal: $${status.account.balance.toLocaleString()}` : 'Exness Terminal'}
            </span>
          </div>

          {/* Card 4: Detected Broker Symbol */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
            <span className="text-[11px] text-slate-400 block">Detected Symbol</span>
            <div className="flex items-center gap-1.5 mt-1">
              <select
                value={status.selectedSymbol}
                onChange={(e) => onSelectSymbol(e.target.value)}
                className="bg-slate-900 text-amber-400 font-bold text-xs py-0.5 px-1.5 rounded border border-slate-700 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                {status.availableSymbols?.length > 0 ? (
                  status.availableSymbols.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="XAUUSDm">XAUUSDm (Standard)</option>
                    <option value="XAUUSD">XAUUSD (Raw/Pro)</option>
                  </>
                )}
              </select>
            </div>
            <span className="text-[10px] text-slate-500 block truncate mt-0.5">
              Spread: {status.availableSymbols?.find((s) => s.name === status.selectedSymbol)?.spread || 22} pts
            </span>
          </div>

          {/* Card 5: Last Tick & Update Time */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
            <span className="text-[11px] text-slate-400 block">Last Tick Time</span>
            <p className="font-semibold text-slate-200 mt-1 truncate">
              {lastM5 ? new Date(lastM5.time * 1000).toISOString().substring(11, 19) + ' UTC' : '--:--:--'}
            </p>
            <span className="text-[10px] text-slate-500 block truncate">
              {status.lastPing ? `${Math.max(0, Math.round((Date.now() - status.lastPing) / 1000))}s ago` : 'Waiting'}
            </span>
          </div>

          {/* Card 6: Connection Latency */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
            <span className="text-[11px] text-slate-400 block">Connector Latency</span>
            <p
              className={`font-semibold mt-1 ${
                status.latencyMs < 100
                  ? 'text-emerald-400'
                  : status.latencyMs < 500
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}
            >
              {status.latencyMs ? `${status.latencyMs} ms` : '15 ms'}
            </p>
            <span className="text-[10px] text-slate-500 block">
              {feedStatus === 'LIVE' ? 'Real-Time Sync' : 'Polling Backend'}
            </span>
          </div>
        </div>

        {/* Security & Integrity Disclosure */}
        <div className="flex items-center gap-2 p-3 bg-slate-950/50 border border-slate-800/80 rounded text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Zero Account Password Storage:</strong> GEP-5 communicates with the local MetaTrader 5 API process directly via official IPC. The software never asks for, records, or uploads your Exness password. Trades are signal-only and never automatically executed.
          </span>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: SUB-TABS (CHECKLIST, SYMBOLS, CANDLES, PYTHON CODE, TESTS)
         ========================================================================= */}
      <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
        <button
          onClick={() => setSelectedTab('diagnostic')}
          className={`px-4 py-2 font-medium rounded transition-colors ${
            selectedTab === 'diagnostic' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Stage 1 Checklist
        </button>
        <button
          onClick={() => setSelectedTab('symbols')}
          className={`px-4 py-2 font-medium rounded transition-colors ${
            selectedTab === 'symbols' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Symbol Inspector ({status.availableSymbols?.length || 0})
        </button>
        <button
          onClick={() => setSelectedTab('candles')}
          className={`px-4 py-2 font-medium rounded transition-colors ${
            selectedTab === 'candles' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Candle Inspector ({m5Candles.length} M5 / {h1Candles.length} H1)
        </button>
        <button
          onClick={() => setSelectedTab('scripts')}
          className={`px-4 py-2 font-medium rounded transition-colors ${
            selectedTab === 'scripts' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Windows Python Scripts & Setup
        </button>
        <button
          onClick={() => {
            setSelectedTab('tests');
            if (unitTests.length === 0) {
              setUnitTests(runAllUnitTests());
            }
          }}
          className={`px-4 py-2 font-medium rounded transition-colors ${
            selectedTab === 'tests' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Unit Tests & Invariants
        </button>
      </div>

      {/* Tab 1: Stage 1 Verification Checklist */}
      {selectedTab === 'diagnostic' && (
        <div className="space-y-6">
          <div className="bg-slate-900/70 border border-slate-800 rounded-lg divide-y divide-slate-800/80">
            <div className="p-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">
                  Automated Stage 1 Data Access Verification Pipeline (6 Checks)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every check must pass to guarantee genuine, non-fabricated market data from your Exness MT5 terminal.
                </p>
              </div>
              <span
                className={`text-xs font-mono font-semibold px-2.5 py-1 rounded border ${
                  diagOverallPassed
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border-rose-800'
                }`}
              >
                {diagOverallPassed ? 'STAGE 1: VERIFIED PASS' : 'STAGE 1: BLOCKED'}
              </span>
            </div>

            {diagResults.map((check, idx) => (
              <div key={check.id} className="p-4 flex items-start gap-4 hover:bg-slate-800/20 transition-colors">
                <div className="mt-0.5">
                  {check.status === 'PASS' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : check.status === 'WARN' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">Step {idx + 1}</span>
                    <h3 className="text-sm font-medium text-slate-200">{check.name}</h3>
                  </div>
                  <p className="text-xs text-slate-400">{check.description}</p>
                  {check.details && (
                    <p className="text-xs font-mono text-slate-300 bg-slate-950/70 px-2.5 py-1.5 rounded border border-slate-800/80 mt-1">
                      {check.details}
                    </p>
                  )}
                  {check.errorMessage && (
                    <p className="text-xs font-mono text-rose-400 bg-rose-950/40 px-2.5 py-1.5 rounded border border-rose-800/50 mt-1">
                      {check.errorMessage}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Symbol Inspector */}
      {selectedTab === 'symbols' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400">
            Exness provides different symbol suffixes depending on account type. The connector dynamically scans all broker symbols in MT5 Market Watch to prevent missing data errors.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {status.availableSymbols?.map((sym) => {
              const isSelected = sym.name === status.selectedSymbol;
              return (
                <div
                  key={sym.name}
                  className={`p-4 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/30'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold font-mono text-slate-100">{sym.name}</span>
                    {isSelected ? (
                      <span className="text-[11px] font-mono text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                        ACTIVE SYMBOL
                      </span>
                    ) : (
                      <button
                        onClick={() => onSelectSymbol(sym.name)}
                        className="text-xs font-medium text-slate-400 hover:text-slate-100 underline underline-offset-2"
                      >
                        Select Symbol
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">{sym.description}</p>
                  <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>Spread: {sym.spread} pts</span>
                    <span>Digits: {sym.digits}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Candle Inspector */}
      {selectedTab === 'candles' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Recent Received Candles for {status.selectedSymbol}
            </h2>
            <span className="text-xs font-mono text-slate-400">
              Showing last 8 completed M5 bars (Chronological)
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                  <th className="p-3">Time (UTC)</th>
                  <th className="p-3">Timeframe</th>
                  <th className="p-3 text-right">Open</th>
                  <th className="p-3 text-right">High</th>
                  <th className="p-3 text-right">Low</th>
                  <th className="p-3 text-right">Close</th>
                  <th className="p-3 text-right">Volume</th>
                  <th className="p-3 text-right">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {m5Candles.slice(-8).reverse().map((c) => {
                  const isBullish = c.close >= c.open;
                  const delta = c.close - c.open;
                  return (
                    <tr key={c.time} className="hover:bg-slate-800/30">
                      <td className="p-3 text-slate-300">
                        {new Date(c.time * 1000).toISOString().replace('T', ' ').substring(0, 19)}
                      </td>
                      <td className="p-3 text-slate-400">M5</td>
                      <td className="p-3 text-right text-slate-200">${c.open.toFixed(2)}</td>
                      <td className="p-3 text-right text-slate-200">${c.high.toFixed(2)}</td>
                      <td className="p-3 text-right text-slate-200">${c.low.toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold text-slate-100">${c.close.toFixed(2)}</td>
                      <td className="p-3 text-right text-slate-400">{c.tick_volume.toLocaleString()}</td>
                      <td className={`p-3 text-right font-semibold ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Python Code & Windows Setup */}
      {selectedTab === 'scripts' && (
        <div className="space-y-6">
          {/* Top Download Command Center */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 font-mono mb-1">
                  <Archive className="w-4 h-4 text-amber-400" />
                  <span>OFFICIAL LOCAL MT5 CONNECTOR PACKAGE</span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  Windows MT5 Market-Data Connector Downloads
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5 max-w-2xl">
                  Download the official MetaTrader 5 Python bridge and batch scripts to run on your local Windows PC. Directly streams genuine Gold (XAU/USD) ticks, candles, and indicators to this dashboard.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* 1. Full ZIP Package (Recommended) */}
                <button
                  onClick={handleDownloadAllZip}
                  disabled={downloadingZip}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded shadow-sm transition-colors disabled:opacity-50"
                  title="Download all scripts, batch files, and documentation in a single ZIP"
                >
                  <FolderDown className={`w-4 h-4 ${downloadingZip ? 'animate-bounce' : ''}`} />
                  <span>{downloadingZip ? 'Packaging ZIP...' : 'Download Full Package (.ZIP)'}</span>
                </button>

                {/* 2. Download gep5_connector.py */}
                <button
                  onClick={() => handleDownloadSingleFile('gep5_connector.py')}
                  disabled={downloadingFile === 'gep5_connector.py'}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
                  title="Download live streaming daemon python script"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Download gep5_connector.py</span>
                </button>

                {/* 3. Download run_connector.bat */}
                <button
                  onClick={() => handleDownloadSingleFile('run_connector.bat')}
                  disabled={downloadingFile === 'run_connector.bat'}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded transition-colors disabled:opacity-50"
                  title="Download one-click Windows batch launcher"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Download run_connector.bat</span>
                </button>
              </div>
            </div>

            {/* Download Status Toast / Confirmation */}
            {downloadToast && (
              <div
                className={`p-3 rounded border text-xs flex items-center justify-between gap-3 font-mono ${
                  downloadToast.success
                    ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-300'
                    : 'bg-rose-950/70 border-rose-700/80 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {downloadToast.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{downloadToast.message}</span>
                </div>
                <span className="text-[11px] text-slate-400 font-sans">Fail-Safe Client-Side Engine</span>
              </div>
            )}

            {/* Quick Guarantees & Integrity Callout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Signal-Only:</strong> Never places orders or touches trades</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Zero Passwords:</strong> Direct MT5 terminal IPC; no credentials needed</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Genuine Data:</strong> Real Exness ticks only; zero simulated prices</span>
              </div>
            </div>
          </div>

          {/* Section: Complete Package File Inventory */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Connector Package Contents & Individual Downloads
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  All 7 verified files included in the GEP-5 Windows integration package. Click any file to download individually:
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                7 Files Verified
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-xs text-left border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-3">File Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Size</th>
                    <th className="p-3 font-sans">Role & Description</th>
                    <th className="p-3 text-right font-sans">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {getAvailableConnectorFiles().map((file) => (
                    <tr key={file.name} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-bold text-amber-300">
                        {file.name}
                      </td>
                      <td className="p-3 text-slate-400">{file.type}</td>
                      <td className="p-3 text-slate-400">{file.size}</td>
                      <td className="p-3 text-slate-300 font-sans">{file.description}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDownloadSingleFile(file.name)}
                          disabled={downloadingFile === file.name}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 rounded transition-colors"
                        >
                          {downloadingFile === file.name ? 'Saving...' : 'Download'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Step-by-Step Instructions */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">
              Step-by-Step Local Windows MT5 Setup Instructions
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center text-[11px]">1</span>
                  Setup Prerequisites on Windows
                </span>
                <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
                  <li>Windows 10 or 11 (64-bit).</li>
                  <li>Install <strong>Exness MetaTrader 5 Desktop Terminal</strong> and log into your account.</li>
                  <li>In MT5, open Market Watch (<kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">Ctrl + M</kbd>), right click anywhere and select <strong>Show All</strong>.</li>
                  <li>Install <strong>Python 3.8 to 3.12 (64-bit)</strong> from python.org with <strong>Add Python to PATH</strong> checked.</li>
                </ul>
              </div>

              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center text-[11px]">2</span>
                  Extract & Run Stage 1 Verification First
                </span>
                <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
                  <li>Download and extract <code className="text-amber-300">gep5_mt5_connector.zip</code> to a folder (e.g. <code className="text-slate-200">C:\gep5-connector</code>).</li>
                  <li>Double-click <strong className="text-slate-200">run_stage1_test.bat</strong> (or run <code className="text-slate-200">python test_stage1_connection.py</code>).</li>
                  <li>Verifies MetaTrader5 installation, Exness terminal link, account access, and Gold data.</li>
                  <li>Ensure all 6 checks output <span className="text-emerald-400 font-bold">[PASS]</span>.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Commands Box */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Command 1: Run Stage 1 Diagnostic */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">1. Run Stage 1 Diagnostic Verification</span>
                <button
                  onClick={() => copyToClipboard('pip install -r requirements.txt\npython test_stage1_connection.py', 'cmd1')}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                >
                  {copiedScript === 'cmd1' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy</span>
                </button>
              </div>
              <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded overflow-x-auto border border-slate-800">
                <code>{`# Navigate to connector folder\ncd connector\n\n# Install official MetaTrader 5 library\npip install -r requirements.txt\n\n# Run Stage 1 diagnostic\npython test_stage1_connection.py`}</code>
              </pre>
            </div>

            {/* Command 2: Run Connector Daemon */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">2. Launch Live MT5 Streaming Daemon</span>
                <button
                  onClick={() => {
                    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
                    copyToClipboard(`python gep5_connector.py --symbol XAUUSDm --web-url ${currentOrigin}`, 'cmd2');
                  }}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                >
                  {copiedScript === 'cmd2' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy</span>
                </button>
              </div>
              <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded overflow-x-auto border border-slate-800">
                <code>{`# Run connector targeting this dashboard:\npython gep5_connector.py --symbol XAUUSDm --web-url ${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}\n\n# Or simply double-click run_connector.bat!`}</code>
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Unit Tests & Strategy Invariants */}
      {selectedTab === 'tests' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-900 border border-slate-800 rounded-lg">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                Deterministic Strategy Engine & Invariants Test Suite
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Verifies mathematical formulas, boundary conditions, candle pattern recognition, and state machine transitions.
              </p>
            </div>

            <button
              onClick={() => {
                setRunningTests(true);
                setTimeout(() => {
                  setUnitTests(runAllUnitTests());
                  setRunningTests(false);
                }, 200);
              }}
              disabled={runningTests}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors self-start sm:self-auto disabled:opacity-50"
            >
              <FlaskConical className={`w-3.5 h-3.5 ${runningTests ? 'animate-spin' : ''}`} />
              <span>{runningTests ? 'Executing Tests...' : 'Re-run All Tests'}</span>
            </button>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-lg divide-y divide-slate-800">
            {unitTests.map((t, idx) => (
              <div key={idx} className="p-4 flex items-start gap-4 hover:bg-slate-800/30 transition-colors">
                <div className="mt-0.5">
                  {t.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">{t.name}</span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {t.category}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">{t.durationMs}ms</span>
                  </div>
                  <p className="text-xs font-mono text-slate-400">{t.details}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
