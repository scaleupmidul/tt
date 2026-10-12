/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Candle, ConnectorStatus, AlertItem, StrategySettings, NewsEvent, SignalIntegrityRecord } from './types/market';
import { connectorService } from './services/connectorClient';
import { alertSoundService } from './services/audioAlerts';
import { evaluateGEP5Setup, DEFAULT_SETTINGS } from './engine/gep5Engine';
import { validateSignalIntegrity } from './engine/signalIntegrityValidator';
import { Navigation, NavTab } from './components/Navigation';
import { OverviewPage } from './components/OverviewPage';
import { LiveSetupMonitor } from './components/LiveSetupMonitor';
import { BacktestingPage } from './components/BacktestingPage';
import { SignalHistoryPage } from './components/SignalHistoryPage';
import { DataConnectionPage } from './components/DataConnectionPage';
import { StrategySettingsPage } from './components/StrategySettingsPage';
import { SignalIntegrityPage } from './components/SignalIntegrityPage';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [activeDirection, setActiveDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [feedStatus, setFeedStatus] = useState<'LIVE' | 'STALE' | 'DISCONNECTED' | 'DEMO'>('DISCONNECTED');
  const [settings, setSettings] = useState<StrategySettings>(DEFAULT_SETTINGS);

  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([
    {
      id: 'news-preset-1',
      title: 'US CPI Inflation Data',
      timeUTC: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      blackoutMinutesBefore: 30,
      blackoutMinutesAfter: 30,
      active: true,
    },
  ]);

  const [connectorStatus, setConnectorStatus] = useState<ConnectorStatus>({
    online: false,
    feedStatus: 'DISCONNECTED',
    mode: 'REAL_MT5',
    port: 8765,
    selectedSymbol: 'XAUUSDm',
    lastPing: 0,
    latencyMs: 0,
    availableSymbols: [
      { name: 'XAUUSDm', description: 'Gold vs US Dollar (Exness Standard)', digits: 2, spread: 22 },
      { name: 'XAUUSD', description: 'Gold vs US Dollar (Exness Raw/Pro)', digits: 2, spread: 12 },
    ],
  });

  const [m5Candles, setM5Candles] = useState<Candle[]>([]);
  const [h1Candles, setH1Candles] = useState<Candle[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [auditHistory, setAuditHistory] = useState<SignalIntegrityRecord[]>([]);
  const lastStateRef = useRef<{ buy: string; sell: string }>({ buy: 'WAITING', sell: 'WAITING' });

  // Display text scale for PC: standard (16px), large (18.5px), xlarge (21px)
  const [textScale, setTextScale] = useState<'standard' | 'large' | 'xlarge'>(() => {
    try {
      const saved = localStorage.getItem('gep5_text_scale');
      if (saved === 'standard' || saved === 'large' || saved === 'xlarge') return saved;
    } catch {
      // fallback
    }
    return 'large';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-text-scale', textScale);
    try {
      localStorage.setItem('gep5_text_scale', textScale);
    } catch {
      // ignore
    }
  }, [textScale]);

  // Initial load: Fetch real MT5 feed regularly every 1.5 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 1500);

    return () => clearInterval(interval);
  }, [settings.emaFastPeriod, settings.emaSlowPeriod]);

  const fetchData = async () => {
    try {
      const feed = await connectorService.getLatestFeed();
      setFeedStatus(feed.status);

      if (feed.status === 'LIVE' || feed.status === 'STALE' || feed.status === 'DEMO') {
        if (feed.candles_m5 && feed.candles_m5.length > 0) {
          setM5Candles(feed.candles_m5);
        }
        if (feed.candles_h1 && feed.candles_h1.length > 0) {
          setH1Candles(feed.candles_h1);
        }

        setConnectorStatus((prev) => ({
          ...prev,
          online: feed.is_live || feed.status === 'DEMO',
          feedStatus: feed.status,
          mode: feed.status === 'DEMO' ? 'SYNTHETIC_MOCK' : 'REAL_MT5',
          selectedSymbol: feed.symbol || prev.selectedSymbol,
          lastPing: feed.last_received_at || Date.now(),
          latencyMs: feed.age_seconds !== null && feed.age_seconds !== undefined ? feed.age_seconds * 1000 : 25,
          terminal: feed.terminal || prev.terminal,
          account: feed.account || prev.account,
        }));
      } else {
        // DISCONNECTED: Do not display fake data
        setM5Candles([]);
        setH1Candles([]);
        setConnectorStatus((prev) => ({
          ...prev,
          online: false,
          feedStatus: 'DISCONNECTED',
          mode: 'REAL_MT5',
          lastError: feed.error_message || 'MT5 disconnected',
        }));
      }
    } catch {
      setFeedStatus('DISCONNECTED');
    }
  };

  const handleToggleDemoMode = () => {
    if (feedStatus === 'DEMO') {
      connectorService.setMode('AUTO');
      fetchData();
    } else {
      connectorService.setMode('DEMO');
      fetchData();
    }
  };

  const handleSelectSymbol = async (symbol: string) => {
    setConnectorStatus((prev) => ({ ...prev, selectedSymbol: symbol }));
    fetchData();
  };

  // Evaluate Strategy Setups
  const buyEval = useMemo(() => {
    return evaluateGEP5Setup(m5Candles, h1Candles, 'BUY', settings, newsEvents);
  }, [m5Candles, h1Candles, settings, newsEvents]);

  const sellEval = useMemo(() => {
    return evaluateGEP5Setup(m5Candles, h1Candles, 'SELL', settings, newsEvents);
  }, [m5Candles, h1Candles, settings, newsEvents]);

  // Dual-Engine Signal Integrity & Fail-Closed Cross-Check
  const currentIntegrityRecord = useMemo(() => {
    const activeEval = activeDirection === 'BUY' ? buyEval : sellEval;
    const lastBar = m5Candles[m5Candles.length - 1];
    const eaPayload = {
      direction: activeDirection,
      decision: (activeEval.finalDecision === activeDirection ? activeDirection : (activeEval.state === 'WAITING' ? 'WAITING' : 'NO_TRADE')) as 'BUY' | 'SELL' | 'NO_TRADE' | 'WAITING',
      ema20: activeEval.ema20,
      ema200: activeEval.ema200,
      rsi14: activeEval.rsi14,
      proposedEntry: activeEval.proposedEntry,
      stopLoss: activeEval.structuralStop,
      takeProfit: activeEval.target1to2,
      closedCandleTime: lastBar?.time,
      spreadPoints: connectorStatus.availableSymbols.find((s) => s.name === connectorStatus.selectedSymbol)?.spread || 22,
    };

    return validateSignalIntegrity(
      connectorStatus.selectedSymbol || 'XAUUSDm',
      activeDirection,
      m5Candles,
      h1Candles,
      feedStatus,
      connectorStatus.latencyMs ? Math.round(connectorStatus.latencyMs / 1000) : null,
      eaPayload,
      settings,
      newsEvents,
      auditHistory
    );
  }, [activeDirection, buyEval, sellEval, m5Candles, h1Candles, feedStatus, connectorStatus, settings, newsEvents, auditHistory]);

  // Keep audit record updated when a new candle closes
  useEffect(() => {
    if (currentIntegrityRecord.candleTime > 0) {
      setAuditHistory((prev) => {
        const exists = prev.some((r) => r.id === currentIntegrityRecord.id);
        if (exists) return prev;
        return [currentIntegrityRecord, ...prev].slice(0, 100);
      });
    }
  }, [currentIntegrityRecord.id, currentIntegrityRecord.candleTime]);


  // Check state transitions and trigger alerts
  useEffect(() => {
    if (m5Candles.length === 0) return;

    // Check BUY state transition
    if (buyEval.state !== lastStateRef.current.buy) {
      if (buyEval.state !== 'WAITING') {
        triggerAlert(buyEval, 'BUY');
      }
      lastStateRef.current.buy = buyEval.state;
    }

    // Check SELL state transition
    if (sellEval.state !== lastStateRef.current.sell) {
      if (sellEval.state !== 'WAITING') {
        triggerAlert(sellEval, 'SELL');
      }
      lastStateRef.current.sell = sellEval.state;
    }
  }, [buyEval.state, sellEval.state, m5Candles.length]);

  const triggerAlert = (evaluation: any, dir: 'BUY' | 'SELL') => {
    alertSoundService.setSoundEnabled(settings.soundAlertsEnabled);
    alertSoundService.setDesktopEnabled(settings.desktopAlertsEnabled);
    alertSoundService.playStateAlert(
      evaluation.state,
      dir,
      connectorStatus.selectedSymbol,
      evaluation.proposedEntry || 0
    );

    const newAlert: AlertItem = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      symbol: connectorStatus.selectedSymbol,
      direction: dir,
      state: evaluation.state,
      entryPrice: evaluation.proposedEntry || 0,
      stopLoss: evaluation.structuralStop || 0,
      takeProfit: evaluation.target1to2 || 0,
      rrRatio: evaluation.rewardToRiskRatio || 2.0,
      h1Bias: evaluation.h1Bias,
      rsi: evaluation.rsi14,
      ema20: evaluation.ema20,
      ema200: evaluation.ema200,
      pattern: evaluation.patternDetected || 'None',
      passedConditionsCount: evaluation.conditions.filter((c: any) => c.passed).length,
      totalConditionsCount: evaluation.conditions.length,
    };

    setAlerts((prev) => [newAlert, ...prev].slice(0, 100));
  };

  const handleRequestNotification = async () => {
    await alertSoundService.requestNotificationPermission();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Navigation */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        connectorStatus={connectorStatus}
        feedStatus={feedStatus}
        onToggleDemoMode={handleToggleDemoMode}
        textScale={textScale}
        onSelectTextScale={setTextScale}
      />

      {/* Main Viewport Container (100% Full Width Edge-to-Edge for PC & Desktop) */}
      <main className="flex-1 w-full px-3 sm:px-5 lg:px-8 py-5 space-y-6">
        {/* Disconnected / Demo System Warning Banner */}
        {feedStatus === 'DISCONNECTED' && (
          <div className="p-4 sm:p-5 bg-rose-950/40 border border-rose-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
              <div>
                <p className="font-bold text-rose-300 text-sm sm:text-base">
                  REAL MT5 TERMINAL DISCONNECTED — NO LIVE MARKET FEED DETECTED
                </p>
                <p className="text-slate-300 mt-0.5 text-xs sm:text-sm">
                  To view live XAUUSDm signals, start the Python connector on your Windows PC: <code className="text-amber-300 font-mono font-semibold bg-slate-900 px-1.5 py-0.5 rounded">python connector/gep5_connector.py</code> (or click run_connector.bat).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setCurrentTab('diagnostics')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded font-semibold text-xs sm:text-sm border border-slate-700 transition-colors"
              >
                Setup Guide
              </button>
              <button
                onClick={handleToggleDemoMode}
                className="px-3.5 py-2 bg-purple-950/90 hover:bg-purple-900 text-purple-200 rounded font-semibold text-xs sm:text-sm border border-purple-700/60 transition-colors"
              >
                Test in Demo Mode
              </button>
            </div>
          </div>
        )}

        {feedStatus === 'DEMO' && (
          <div className="p-4 sm:p-5 bg-purple-950/40 border border-purple-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-purple-400 shrink-0 animate-pulse" />
              <div>
                <p className="font-bold text-purple-300 text-sm sm:text-base">
                  DEMO / SIMULATION MODE ACTIVE — SAMPLE DATA (NOT LIVE MT5 FEED)
                </p>
                <p className="text-slate-300 mt-0.5 text-xs sm:text-sm">
                  You are viewing simulated Gold prices for UI testing. Real Exness account signals are not active.
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleDemoMode}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded font-semibold text-xs sm:text-sm border border-slate-700 transition-colors shrink-0"
            >
              Exit Demo Mode
            </button>
          </div>
        )}

        {feedStatus === 'STALE' && (
          <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-lg flex items-center justify-between gap-3 text-sm text-amber-300">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
              <span className="font-medium">
                MT5 Feed is STALE — Last price update was received &gt;20s ago. Verify that MetaTrader 5 terminal is still active on Windows.
              </span>
            </div>
          </div>
        )}

        {currentTab === 'overview' && (
          <OverviewPage
            connectorStatus={connectorStatus}
            isMockMode={feedStatus === 'DEMO'}
            feedStatus={feedStatus}
            buyEval={buyEval}
            sellEval={sellEval}
            activeDirection={activeDirection}
            onSelectDirection={setActiveDirection}
            onNavigate={setCurrentTab}
            recentAlerts={alerts}
            m5Candles={m5Candles}
            h1Candles={h1Candles}
          />
        )}

        {currentTab === 'monitor' && (
          <LiveSetupMonitor
            buyEval={buyEval}
            sellEval={sellEval}
            activeDirection={activeDirection}
            onSelectDirection={setActiveDirection}
            m5Candles={m5Candles}
            settings={settings}
          />
        )}

        {currentTab === 'integrity' && (
          <SignalIntegrityPage
            currentRecord={currentIntegrityRecord}
            historyRecords={auditHistory}
            connectorStatus={connectorStatus}
            feedStatus={feedStatus}
          />
        )}

        {currentTab === 'backtest' && (
          <BacktestingPage
            m5Candles={m5Candles}
            h1Candles={h1Candles}
            settings={settings}
          />
        )}

        {currentTab === 'history' && (
          <SignalHistoryPage
            alerts={alerts}
            onClearHistory={() => setAlerts([])}
          />
        )}

        {currentTab === 'diagnostics' && (
          <DataConnectionPage
            status={connectorStatus}
            isMockMode={feedStatus === 'DEMO'}
            feedStatus={feedStatus}
            onToggleMockMode={handleToggleDemoMode}
            onRefreshStatus={fetchData}
            onConnect={async () => {
              await connectorService.connect();
              fetchData();
            }}
            onDisconnect={async () => {
              await connectorService.disconnect();
              fetchData();
            }}
            m5Candles={m5Candles}
            h1Candles={h1Candles}
            onSelectSymbol={handleSelectSymbol}
          />
        )}

        {currentTab === 'settings' && (
          <StrategySettingsPage
            settings={settings}
            onUpdateSettings={setSettings}
            onRequestDesktopNotification={handleRequestNotification}
            newsEvents={newsEvents}
            onAddNewsEvent={(ev) => setNewsEvents((prev) => [ev, ...prev])}
            onToggleNewsEvent={(id) => setNewsEvents((prev) => prev.map((e) => e.id === id ? { ...e, active: !e.active } : e))}
            onDeleteNewsEvent={(id) => setNewsEvents((prev) => prev.filter((e) => e.id !== id))}
          />
        )}
      </main>

      {/* Clean Editorial Footer */}
      <footer className="w-full py-4 px-4 sm:px-6 lg:px-8 border-t border-slate-900 bg-slate-950 text-xs sm:text-sm text-slate-400 font-mono flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">GEP-5 Gold Setup Detection System</span>
          <span aria-hidden="true">·</span>
          <span>Manual Trading Assistance Only</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>XAU/USD M5 & H1 Timeframes</span>
          <span>Exness MT5 Architecture</span>
        </div>
      </footer>
    </div>
  );
}
