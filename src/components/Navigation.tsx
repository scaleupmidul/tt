import React from 'react';
import { ConnectorStatus } from '../types/market';
import { Activity, ShieldCheck, Wifi, WifiOff } from 'lucide-react';

export type NavTab = 'overview' | 'monitor' | 'integrity' | 'backtest' | 'history' | 'diagnostics' | 'settings';

export interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  connectorStatus: ConnectorStatus;
  feedStatus: 'LIVE' | 'STALE' | 'DISCONNECTED' | 'DEMO';
  onToggleDemoMode: () => void;
  textScale?: 'standard' | 'large' | 'xlarge';
  onSelectTextScale?: (scale: 'standard' | 'large' | 'xlarge') => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  connectorStatus,
  feedStatus,
  onToggleDemoMode,
  textScale = 'large',
  onSelectTextScale,
}) => {
  return (
    <header className="sticky top-0 z-50 w-full flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-3.5 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3.5 shrink-0">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('overview');
          }}
          className="text-lg font-bold tracking-tight text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
        >
          GEP-5 <span className="text-slate-100 font-bold">Gold System</span>
        </a>
        <span className="hidden sm:inline-block text-xs font-mono font-semibold text-amber-400/90 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 tracking-wider">
          {connectorStatus.selectedSymbol || 'XAUUSDm'}
        </span>
      </div>

      {/* Zone 2: Single-line Nav Links (Larger, crisp fonts for PC) */}
      <nav className="hidden xl:flex items-center gap-6 text-sm font-semibold text-slate-300">
        <button
          onClick={() => onSelectTab('overview')}
          className={`transition-colors whitespace-nowrap py-1 ${
            currentTab === 'overview' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-slate-100'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => onSelectTab('monitor')}
          className={`transition-colors whitespace-nowrap py-1 ${
            currentTab === 'monitor' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-slate-100'
          }`}
        >
          Live Monitor
        </button>
        <button
          onClick={() => onSelectTab('integrity')}
          className={`transition-colors whitespace-nowrap py-1 flex items-center gap-1.5 ${
            currentTab === 'integrity' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Signal Integrity
        </button>
        <button
          onClick={() => onSelectTab('backtest')}
          className={`transition-colors whitespace-nowrap py-1 ${
            currentTab === 'backtest' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-slate-100'
          }`}
        >
          Backtesting
        </button>
        <button
          onClick={() => onSelectTab('history')}
          className={`transition-colors whitespace-nowrap py-1 ${
            currentTab === 'history' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-slate-100'
          }`}
        >
          Signal History
        </button>
        <button
          onClick={() => onSelectTab('diagnostics')}
          className={`transition-colors whitespace-nowrap py-1 ${
            currentTab === 'diagnostics' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-slate-100'
          }`}
        >
          MT5 Connection Center
        </button>
        <button
          onClick={() => onSelectTab('settings')}
          className={`transition-colors whitespace-nowrap py-1 ${
            currentTab === 'settings' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-slate-100'
          }`}
        >
          Strategy Rules
        </button>
      </nav>

      {/* Zone 3: PC Controls: Text Scale Switcher + Connector Status */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Quick Text Size Switcher for PC / Desktop Legibility */}
        {onSelectTextScale && (
          <div className="hidden sm:flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5 text-xs font-mono">
            <span className="text-slate-400 px-1.5 font-medium">Text:</span>
            <button
              onClick={() => onSelectTextScale('standard')}
              className={`px-2 py-1 rounded font-semibold transition-colors ${
                textScale === 'standard'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Standard Text (16px)"
            >
              Std
            </button>
            <button
              onClick={() => onSelectTextScale('large')}
              className={`px-2 py-1 rounded font-semibold transition-colors ${
                textScale === 'large'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Large Text for PC (18.5px - Recommended)"
            >
              Large
            </button>
            <button
              onClick={() => onSelectTextScale('xlarge')}
              className={`px-2 py-1 rounded font-semibold transition-colors ${
                textScale === 'xlarge'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Extra Large Text for Big PC Monitors (21px)"
            >
              XL
            </button>
          </div>
        )}

        <button
          onClick={() => onSelectTab('diagnostics')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-mono font-bold rounded border transition-colors whitespace-nowrap ${
            feedStatus === 'LIVE'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-600 hover:bg-emerald-900/60'
              : feedStatus === 'STALE'
              ? 'bg-amber-950 text-amber-300 border-amber-600 hover:bg-amber-900/50'
              : feedStatus === 'DEMO'
              ? 'bg-purple-950 text-purple-300 border-purple-600 hover:bg-purple-900/50'
              : 'bg-rose-950 text-rose-300 border-rose-600 hover:bg-rose-900/50'
          }`}
          title="Click to view MT5 diagnostics and connection details"
        >
          {feedStatus === 'LIVE' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE MT5: {connectorStatus.selectedSymbol || 'XAUUSDm'}</span>
            </>
          ) : feedStatus === 'STALE' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>FEED STALE</span>
            </>
          ) : feedStatus === 'DEMO' ? (
            <>
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>DEMO MODE</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-rose-400" />
              <span>MT5 DISCONNECTED</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
