import React from 'react';
import { ConnectorStatus, SetupEvaluation, AlertItem, Candle } from '../types/market';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface OverviewPageProps {
  connectorStatus: ConnectorStatus;
  isMockMode: boolean;
  feedStatus?: 'LIVE' | 'STALE' | 'DISCONNECTED' | 'DEMO';
  buyEval: SetupEvaluation;
  sellEval: SetupEvaluation;
  activeDirection: 'BUY' | 'SELL';
  onSelectDirection: (dir: 'BUY' | 'SELL') => void;
  onNavigate: (tab: any) => void;
  recentAlerts: AlertItem[];
  m5Candles: Candle[];
  h1Candles: Candle[];
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  connectorStatus,
  isMockMode,
  feedStatus = 'DISCONNECTED',
  buyEval,
  sellEval,
  activeDirection,
  onSelectDirection,
  onNavigate,
  recentAlerts,
  m5Candles,
  h1Candles,
}) => {
  const currentEval = activeDirection === 'BUY' ? buyEval : sellEval;
  const lastM5 = m5Candles[m5Candles.length - 1];

  const getStateBadgeStyle = (state: string) => {
    switch (state) {
      case 'SETUP_READY':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60';
      case 'CONFIRMATION_NEEDED':
        return 'bg-orange-950/80 text-orange-400 border-orange-700/60';
      case 'SETUP_FORMING':
        return 'bg-amber-950/80 text-amber-400 border-amber-700/60';
      default:
        return 'bg-slate-800/80 text-slate-400 border-slate-700/60';
    }
  };

  const getStateLabel = (state: string) => {
    switch (state) {
      case 'SETUP_READY':
        return 'State 4: SETUP READY';
      case 'CONFIRMATION_NEEDED':
        return 'State 3: CONFIRMATION NEEDED';
      case 'SETUP_FORMING':
        return 'State 2: SETUP FORMING';
      default:
        return 'State 1: WAITING';
    }
  };

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Top Banner / System Summary */}
      <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-400 font-mono mb-1 font-semibold">
              <span>MANUAL TRADING ASSISTANCE SYSTEM</span>
              <span aria-hidden="true">·</span>
              <span>XAU/USD GOLD</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-100 tracking-tight">
              GEP-5 Setup Formation Cockpit
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mt-1.5 max-w-4xl">
              Deterministic rule detection for Exness Gold trades. This software evaluates setup formation progress and alerts when mandatory entry conditions are met. It never executes live orders.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onSelectDirection('BUY')}
              className={`px-4 py-2 text-sm font-bold rounded border transition-colors ${
                activeDirection === 'BUY'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              BUY Monitor ({buyEval.score}%)
            </button>
            <button
              onClick={() => onSelectDirection('SELL')}
              className={`px-4 py-2 text-sm font-bold rounded border transition-colors ${
                activeDirection === 'SELL'
                  ? 'bg-rose-950 text-rose-300 border-rose-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              SELL Monitor ({sellEval.score}%)
            </button>
            <button
              onClick={() => onNavigate('integrity')}
              className="px-4 py-2 text-sm font-bold rounded border border-amber-500/70 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
            >
              <span>Signal Integrity</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4 Core Vital Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Data Connection Status */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2.5">
          <div className="flex items-center justify-between text-xs sm:text-sm text-slate-400 font-medium">
            <span>Market Data Link</span>
            <button
              onClick={() => onNavigate('diagnostics')}
              className="text-amber-400 hover:underline flex items-center gap-1 text-xs font-semibold"
            >
              Diagnostics <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full ${
                feedStatus === 'LIVE'
                  ? 'bg-emerald-400 animate-pulse'
                  : feedStatus === 'STALE'
                  ? 'bg-amber-400'
                  : feedStatus === 'DEMO'
                  ? 'bg-purple-400'
                  : 'bg-rose-500'
              }`}
            />
            {feedStatus === 'LIVE'
              ? 'LIVE MT5 Connected'
              : feedStatus === 'STALE'
              ? 'Feed Stale (>20s)'
              : feedStatus === 'DEMO'
              ? 'Demo Simulation'
              : 'MT5 Disconnected'}
          </p>
          <div className="text-xs sm:text-sm font-mono text-slate-300 space-y-1 pt-1.5 border-t border-slate-800/80">
            <div>Symbol: <span className="font-bold text-amber-400">{connectorStatus.selectedSymbol || 'XAUUSDm'}</span></div>
            <div>
              {feedStatus === 'LIVE' && connectorStatus.account?.login
                ? `Account #${connectorStatus.account.login} (${connectorStatus.account.server})`
                : feedStatus === 'DEMO'
                ? 'Simulation Sandbox (Demo)'
                : 'Run connector/run_connector.bat'}
            </div>
          </div>
        </div>

        {/* Card 2: H1 Trend Context */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2.5">
          <div className="text-xs sm:text-sm text-slate-400 font-medium">H1 Higher-Timeframe Trend</div>
          <p className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2 font-mono">
            {currentEval.h1Bias === 'BULLISH' ? (
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            ) : currentEval.h1Bias === 'BEARISH' ? (
              <TrendingDown className="w-5 h-5 text-rose-400" />
            ) : (
              <Activity className="w-5 h-5 text-slate-400" />
            )}
            <span
              className={
                currentEval.h1Bias === 'BULLISH'
                  ? 'text-emerald-400'
                  : currentEval.h1Bias === 'BEARISH'
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }
            >
              {currentEval.h1Bias}
            </span>
          </p>
          <div className="text-xs sm:text-sm font-mono text-slate-300 space-y-1 pt-1.5 border-t border-slate-800/80">
            <div>H1 Candles: {h1Candles.length} bars</div>
            <div>Structure: Confirmed Bullish/Bearish</div>
          </div>
        </div>

        {/* Card 3: M5 Baseline & Momentum */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2.5">
          <div className="text-xs sm:text-sm text-slate-400 font-medium">M5 Indicators</div>
          <p className="text-lg sm:text-xl font-bold text-slate-100 font-mono">
            RSI {currentEval.rsi14.toFixed(1)} <span className="text-xs sm:text-sm text-slate-400 font-normal">| Period 14</span>
          </p>
          <div className="text-xs sm:text-sm font-mono text-slate-300 space-y-1 pt-1.5 border-t border-slate-800/80">
            <div>EMA20: <span className="text-cyan-400">${currentEval.ema20.toFixed(2)}</span></div>
            <div>EMA200: <span className="text-amber-400">${currentEval.ema200.toFixed(2)}</span></div>
          </div>
        </div>

        {/* Card 4: Last Candle Freshness */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2.5">
          <div className="text-xs sm:text-sm text-slate-400 font-medium">Last Completed Candle</div>
          <p className="text-lg sm:text-xl font-bold text-slate-100 font-mono">
            ${lastM5?.close.toFixed(2) || '0.00'}
          </p>
          <div className="text-xs sm:text-sm font-mono text-slate-300 space-y-1 pt-1.5 border-t border-slate-800/80">
            <div>Time: {lastM5 ? new Date(lastM5.time * 1000).toISOString().substring(11, 19) + ' UTC' : '--:--'}</div>
            <div>Volume: {lastM5?.tick_volume.toLocaleString() || 0} ticks</div>
          </div>
        </div>
      </div>

      {/* Active Setup State & Progress */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs sm:text-sm font-mono text-slate-400 uppercase tracking-wider font-semibold">
              {activeDirection} SETUP STATUS
            </span>
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              <span className={`text-sm sm:text-base font-bold font-mono px-3.5 py-1.5 rounded border ${getStateBadgeStyle(currentEval.state)}`}>
                {getStateLabel(currentEval.state)}
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 font-mono">
                Rule Completion: {currentEval.score}%
              </span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('monitor')}
            className="flex items-center gap-1.5 text-sm sm:text-base font-bold text-amber-400 hover:text-amber-300 self-start sm:self-auto"
          >
            Open Live Monitor & Chart <ArrowUpRight className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="h-3.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                currentEval.state === 'SETUP_READY'
                  ? 'bg-emerald-500'
                  : currentEval.state === 'CONFIRMATION_NEEDED'
                  ? 'bg-orange-500'
                  : currentEval.state === 'SETUP_FORMING'
                  ? 'bg-amber-400'
                  : 'bg-slate-600'
              }`}
              style={{ width: `${Math.max(5, currentEval.score)}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-xs sm:text-sm text-slate-400 font-medium">
            <span>Score indicates strategy rule satisfaction progress</span>
            <span className="text-amber-400 font-semibold">NOT a win probability metric</span>
          </div>
        </div>

        {/* News Blackout Banner */}
        {currentEval.isNewsBlocked && (
          <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded text-sm text-rose-300 flex items-center gap-2.5 font-mono">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>High-Impact USD News Blackout Window is currently ACTIVE. Setups are blocked from READY status.</span>
          </div>
        )}

        {/* Sideways Chop Banner */}
        {currentEval.isSidewaysChop && (
          <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded text-sm text-amber-300 flex items-center gap-2.5 font-mono">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Market Stagnation / Chop Filter Active (Low volatility compression). Setups paused.</span>
          </div>
        )}

        {/* Missing Conditions Callout */}
        {currentEval.missingConditions.length > 0 ? (
          <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2.5">
            <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              Pending / Missing Mandatory Conditions ({currentEval.missingConditions.length}):
            </span>
            <ul className="text-xs sm:text-sm text-slate-300 space-y-1.5 list-disc list-inside">
              {currentEval.missingConditions.map((mc: string, idx: number) => (
                <li key={idx} className="font-mono">{mc}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="p-5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-sm sm:text-base text-emerald-300 flex items-center gap-2.5 font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>All mandatory entry rules satisfied on completed candle! Review chart manually.</span>
          </div>
        )}
      </div>

      {/* Bottom Section: Recent Analytical Alerts & Risk Disclaimer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Alerts Feed (2 cols) */}
        <div className="lg:col-span-2 p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100">Recent Setup Alerts</h2>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs sm:text-sm text-amber-400 font-semibold hover:underline"
            >
              View Full History
            </button>
          </div>

          {recentAlerts.length === 0 ? (
            <div className="py-8 text-center text-xs sm:text-sm text-slate-400 font-mono">
              No recent alerts yet. Alerts will appear here when setups enter Forming, Confirmation, or Ready states.
            </div>
          ) : (
            <div className="space-y-3">
              {recentAlerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className="p-3.5 bg-slate-950 border border-slate-800/80 rounded flex items-center justify-between text-xs sm:text-sm font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                        alert.direction === 'BUY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {alert.direction}
                    </span>
                    <span className="text-slate-100 font-semibold">{alert.state.replace('_', ' ')}</span>
                    <span className="text-slate-300 font-bold">${alert.entryPrice.toFixed(2)}</span>
                  </div>
                  <span className="text-slate-400 text-xs sm:text-sm">{alert.timestamp.substring(11, 19)} UTC</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Risk & Operational Boundary Card */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            Operational Notice
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            GEP-5 is an analytical decision-support tool. It does not predict future price movements with certainty and does not execute trades.
          </p>
          <div className="pt-2 border-t border-slate-800 text-xs sm:text-sm text-slate-400 space-y-1 font-mono">
            <div>• Manual order execution on Exness only</div>
            <div>• Always verify spread & slippage</div>
            <div>• Respect 1:2 R:R risk guidelines</div>
          </div>
        </div>
      </div>
    </div>
  );
};
