import React, { useState } from 'react';
import { AlertItem } from '../types/market';
import { Download, Filter, Copy, Check, ShieldCheck, Clock } from 'lucide-react';

interface SignalHistoryPageProps {
  alerts: AlertItem[];
  onClearHistory: () => void;
}

export const SignalHistoryPage: React.FC<SignalHistoryPageProps> = ({
  alerts,
  onClearHistory,
}) => {
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [filterState, setFilterState] = useState<'ALL' | 'READY' | 'FORMING'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredAlerts = alerts.filter((a) => {
    if (filterDirection !== 'ALL' && a.direction !== filterDirection) return false;
    if (filterState === 'READY' && a.state !== 'SETUP_READY') return false;
    if (filterState === 'FORMING' && a.state === 'SETUP_READY') return false;
    return true;
  });

  const exportCsv = () => {
    if (alerts.length === 0) return;
    const header = 'timestamp,symbol,direction,state,entryPrice,stopLoss,takeProfit,rrRatio,rsi,ema20,ema200\n';
    const rows = alerts
      .map(
        (a) =>
          `"${a.timestamp}","${a.symbol}","${a.direction}","${a.state}",${a.entryPrice},${a.stopLoss},${a.takeProfit},${a.rrRatio},${a.rsi},${a.ema20},${a.ema200}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GEP5_Alert_History_${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
  };

  const copySignal = (a: AlertItem) => {
    const text = `[GEP-5 ANALYTICAL ALERT]
Symbol: ${a.symbol}
Direction: ${a.direction}
State: ${a.state}
Time: ${a.timestamp}
Entry: $${a.entryPrice.toFixed(2)}
Stop Loss: $${a.stopLoss.toFixed(2)}
1:2 TP: $${a.takeProfit.toFixed(2)}
RSI 14: ${a.rsi.toFixed(1)}
EMA20: $${a.ema20.toFixed(2)} | EMA200: $${a.ema200.toFixed(2)}`;
    navigator.clipboard.writeText(text);
    setCopiedId(a.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header */}
      <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-400 font-mono mb-1 font-semibold">
            <span>AUDIT TRAIL & LOG</span>
            <span aria-hidden="true">·</span>
            <span>ALERT ARCHIVE</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-100 tracking-tight">
            Signal History & Analytical Log
          </h1>
          <p className="text-sm sm:text-base text-slate-300 mt-1.5 max-w-4xl">
            Chronological record of all GEP-5 alerts generated during this session. Each entry captures complete technical state, indicator readings, and structural references.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportCsv}
            disabled={alerts.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onClearHistory}
            disabled={alerts.length === 0}
            className="px-4 py-2 text-sm font-bold text-rose-400 hover:text-rose-300 border border-rose-900/50 hover:bg-rose-950/40 rounded transition-colors disabled:opacity-50"
          >
            Clear Log
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 font-medium">Direction:</span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
            {(['ALL', 'BUY', 'SELL'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => setFilterDirection(dir)}
                className={`px-3 py-1 rounded transition-colors ${
                  filterDirection === dir
                    ? 'bg-slate-800 text-slate-100 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>

          <span className="text-slate-400 font-medium ml-2">State:</span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
            {(['ALL', 'READY', 'FORMING'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterState(st)}
                className={`px-3 py-1 rounded transition-colors ${
                  filterState === st
                    ? 'bg-slate-800 text-slate-100 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <span className="text-xs font-mono text-slate-500">
          Showing {filteredAlerts.length} of {alerts.length} signals
        </span>
      </div>

      {/* Signals List */}
      {filteredAlerts.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/50 border border-slate-800 rounded-lg text-xs text-slate-500 font-mono">
          No signal alerts logged yet for current filter criteria.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono ${
                      alert.direction === 'BUY'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {alert.direction}
                  </span>
                  <span className="text-sm font-semibold text-slate-200 font-mono">
                    {alert.symbol}
                  </span>
                  <span
                    className={`text-xs font-mono font-medium px-2 py-0.5 rounded border ${
                      alert.state === 'SETUP_READY'
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                        : 'bg-amber-950/60 text-amber-400 border-amber-800'
                    }`}
                  >
                    {alert.state.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {alert.timestamp}
                  </span>
                  <button
                    onClick={() => copySignal(alert)}
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-200"
                  >
                    {copiedId === alert.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              {/* Data Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-slate-950 rounded border border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[11px]">Entry Reference</span>
                  <span className="font-semibold text-slate-200">${alert.entryPrice.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Structural Stop</span>
                  <span className="font-semibold text-rose-300">${alert.stopLoss.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">1:2 Target (TP)</span>
                  <span className="font-semibold text-emerald-300">${alert.takeProfit.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">RSI 14</span>
                  <span className="text-slate-300">{alert.rsi.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">EMA 20 / 200</span>
                  <span className="text-slate-400">${alert.ema20.toFixed(2)} / ${alert.ema200.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Confirmation: {alert.pattern}</span>
                <span>Rule Satisfaction: {alert.passedConditionsCount} of {alert.totalConditionsCount} rules</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
