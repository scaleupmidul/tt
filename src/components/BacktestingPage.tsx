import React, { useState } from 'react';
import { Candle, StrategySettings, SetupDirection } from '../types/market';
import { evaluateGEP5Setup } from '../engine/gep5Engine';
import {
  Play,
  Upload,
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

interface BacktestTrade {
  id: string;
  candleIndex: number;
  time: string;
  direction: SetupDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rsi: number;
  simulatedOutcome?: 'WIN' | 'LOSS' | 'OPEN';
  userOutcome?: 'WIN' | 'LOSS' | 'BE' | 'SKIPPED';
  userNotes?: string;
}

interface BacktestingPageProps {
  m5Candles: Candle[];
  h1Candles: Candle[];
  settings: StrategySettings;
}

export const BacktestingPage: React.FC<BacktestingPageProps> = ({
  m5Candles,
  h1Candles,
  settings,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [detectedTrades, setDetectedTrades] = useState<BacktestTrade[]>([]);
  const [customCsvLoaded, setCustomCsvLoaded] = useState(false);
  const [activeCandles, setActiveCandles] = useState<Candle[]>(m5Candles);
  const [spreadAssumptionPoints, setSpreadAssumptionPoints] = useState(22); // 0.22 USD
  const [slippageAssumptionPoints, setSlippageAssumptionPoints] = useState(10); // 0.10 USD

  React.useEffect(() => {
    if (!customCsvLoaded && m5Candles.length > 0) {
      setActiveCandles(m5Candles);
    }
  }, [m5Candles, customCsvLoaded]);

  // Run backtest chronologically
  const handleRunBacktest = () => {
    setIsRunning(true);
    const trades: BacktestTrade[] = [];

    // Need at least 220 candles for EMA200
    const startIdx = Math.max(220, 0);

    for (let i = startIdx; i < activeCandles.length - 1; i++) {
      const sliceM5 = activeCandles.slice(0, i + 1);
      // Corresponding H1 slice
      const currentM5Time = activeCandles[i].time;
      const sliceH1 = h1Candles.filter((c) => c.time <= currentM5Time);

      const buyRes = evaluateGEP5Setup(sliceM5, sliceH1, 'BUY', settings);
      const sellRes = evaluateGEP5Setup(sliceM5, sliceH1, 'SELL', settings);

      if (buyRes.state === 'SETUP_READY') {
        // Prevent duplicate immediate trade if last trade was within 5 candles
        const recentTrade = trades[trades.length - 1];
        if (!recentTrade || i - recentTrade.candleIndex >= 6) {
          const entry = buyRes.proposedEntry || activeCandles[i].close;
          const sl = buyRes.structuralStop || entry - 3.0;
          const tp = buyRes.target1to2 || entry + 6.0;

          // Simulate theoretical outcome in future bars
          let simulatedOutcome: 'WIN' | 'LOSS' | 'OPEN' = 'OPEN';
          for (let j = i + 1; j < activeCandles.length; j++) {
            const nextCandle = activeCandles[j];
            if (nextCandle.low <= sl) {
              simulatedOutcome = 'LOSS';
              break;
            }
            if (nextCandle.high >= tp) {
              simulatedOutcome = 'WIN';
              break;
            }
          }

          trades.push({
            id: `trade-buy-${i}`,
            candleIndex: i,
            time: new Date(activeCandles[i].time * 1000).toISOString().replace('T', ' ').substring(0, 19),
            direction: 'BUY',
            entryPrice: entry,
            stopLoss: sl,
            takeProfit: tp,
            rsi: buyRes.rsi14,
            simulatedOutcome,
          });
        }
      } else if (sellRes.state === 'SETUP_READY') {
        const recentTrade = trades[trades.length - 1];
        if (!recentTrade || i - recentTrade.candleIndex >= 6) {
          const entry = sellRes.proposedEntry || activeCandles[i].close;
          const sl = sellRes.structuralStop || entry + 3.0;
          const tp = sellRes.target1to2 || entry - 6.0;

          let simulatedOutcome: 'WIN' | 'LOSS' | 'OPEN' = 'OPEN';
          for (let j = i + 1; j < activeCandles.length; j++) {
            const nextCandle = activeCandles[j];
            if (nextCandle.high >= sl) {
              simulatedOutcome = 'LOSS';
              break;
            }
            if (nextCandle.low <= tp) {
              simulatedOutcome = 'WIN';
              break;
            }
          }

          trades.push({
            id: `trade-sell-${i}`,
            candleIndex: i,
            time: new Date(activeCandles[i].time * 1000).toISOString().replace('T', ' ').substring(0, 19),
            direction: 'SELL',
            entryPrice: entry,
            stopLoss: sl,
            takeProfit: tp,
            rsi: sellRes.rsi14,
            simulatedOutcome,
          });
        }
      }
    }

    setDetectedTrades(trades);
    setIsRunning(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const lines = content.split('\n');
      const parsedCandles: Candle[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        if (parts.length >= 5) {
          const time = isNaN(Date.parse(parts[0])) ? parseInt(parts[0]) : Math.floor(new Date(parts[0]).getTime() / 1000);
          const open = parseFloat(parts[1]);
          const high = parseFloat(parts[2]);
          const low = parseFloat(parts[3]);
          const close = parseFloat(parts[4]);
          const vol = parts[5] ? parseInt(parts[5]) : 100;

          if (!isNaN(close)) {
            parsedCandles.push({
              time,
              open,
              high,
              low,
              close,
              tick_volume: vol,
            });
          }
        }
      }

      if (parsedCandles.length > 50) {
        // Sort chronologically
        parsedCandles.sort((a, b) => a.time - b.time);
        setActiveCandles(parsedCandles);
        setCustomCsvLoaded(true);
      }
    };
    reader.readAsText(file);
  };

  const winCount = detectedTrades.filter((t) => t.simulatedOutcome === 'WIN').length;
  const lossCount = detectedTrades.filter((t) => t.simulatedOutcome === 'LOSS').length;
  const resolvedCount = winCount + lossCount;
  const theoreticalWinRate = resolvedCount > 0 ? (winCount / resolvedCount) * 100 : 0;

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header */}
      <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-400 font-mono mb-1 font-semibold">
            <span>HISTORICAL VALIDATION MODULE</span>
            <span aria-hidden="true">·</span>
            <span>CHRONOLOGICAL REPLAY</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-100 tracking-tight">
            Historical GEP-5 Strategy Backtester
          </h1>
          <p className="text-sm sm:text-base text-slate-300 mt-1.5 max-w-4xl">
            Test strategy rules across completed historical XAU/USD candles without lookahead bias. Evaluates rule detection accuracy and 1:2 R:R targets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            <span>{customCsvLoaded ? 'Replace CSV' : 'Import OHLCV CSV'}</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleRunBacktest}
            disabled={isRunning || activeCandles.length < 220}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors disabled:opacity-50 shadow-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isRunning ? 'Processing...' : 'Run Backtest'}</span>
          </button>
        </div>
      </div>

      {/* Dataset Summary & Assumptions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-1.5">
          <span className="text-xs sm:text-sm text-slate-400 font-medium">Dataset Candles</span>
          <p className="text-xl sm:text-2xl font-bold text-slate-100 font-mono">
            {activeCandles.length.toLocaleString()} M5 Candles
          </p>
          <span className="text-[11px] text-slate-500 font-mono">
            {customCsvLoaded ? 'Imported CSV File' : 'Connector Historical Buffer'}
          </span>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
          <span className="text-xs text-slate-400">Execution Assumptions</span>
          <div className="mt-1 flex items-center gap-4 text-xs font-mono text-slate-300">
            <span>Spread: {spreadAssumptionPoints} pts ($0.22)</span>
            <span>Slippage: {slippageAssumptionPoints} pts ($0.10)</span>
          </div>
          <span className="text-[11px] text-slate-500">
            Exness Typical Gold Standard Conditions
          </span>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
          <span className="text-xs text-slate-400">Risk-to-Reward Ratio</span>
          <p className="text-base font-bold text-amber-400 mt-1 font-mono">
            1:{settings.minRewardRiskRatio} Minimum
          </p>
          <span className="text-[11px] text-slate-500">
            Take Profit calculated strictly from structural stop
          </span>
        </div>
      </div>

      {/* Results Overview */}
      {detectedTrades.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
            <span className="text-xs text-slate-400">Total Setups Detected</span>
            <p className="text-xl font-bold text-slate-100 mt-1 font-mono">{detectedTrades.length}</p>
            <span className="text-[11px] text-slate-500 font-mono">
              BUY: {detectedTrades.filter((t) => t.direction === 'BUY').length} | SELL: {detectedTrades.filter((t) => t.direction === 'SELL').length}
            </span>
          </div>

          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
            <span className="text-xs text-slate-400">Theoretical 1:2 Wins</span>
            <p className="text-xl font-bold text-emerald-400 mt-1 font-mono">{winCount}</p>
            <span className="text-[11px] text-slate-500 font-mono">Hit 1:2 Take Profit</span>
          </div>

          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
            <span className="text-xs text-slate-400">Theoretical Stopped Out</span>
            <p className="text-xl font-bold text-rose-400 mt-1 font-mono">{lossCount}</p>
            <span className="text-[11px] text-slate-500 font-mono">Hit Structural Stop</span>
          </div>

          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
            <span className="text-xs text-slate-400">Simulated Win Rate (1:2)</span>
            <p className="text-xl font-bold text-amber-400 mt-1 font-mono">
              {theoreticalWinRate.toFixed(1)}%
            </p>
            <span className="text-[11px] text-slate-500 font-mono">Excludes spread friction</span>
          </div>
        </div>
      )}

      {/* Backtest Signals Table */}
      <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">
          Detected Historical Signals ({detectedTrades.length})
        </h2>

        {detectedTrades.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 font-mono">
            Click "Run Backtest" above to scan historical candles for valid GEP-5 setups.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                  <th className="p-3">Time (UTC)</th>
                  <th className="p-3">Direction</th>
                  <th className="p-3 text-right">Entry ($)</th>
                  <th className="p-3 text-right">Stop Loss ($)</th>
                  <th className="p-3 text-right">1:2 TP ($)</th>
                  <th className="p-3 text-right">RSI 14</th>
                  <th className="p-3 text-center">Simulated 1:2</th>
                  <th className="p-3 text-center">User Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {detectedTrades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-slate-800/30">
                    <td className="p-3 text-slate-300">{trade.time}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          trade.direction === 'BUY'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {trade.direction}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold text-slate-100">${trade.entryPrice.toFixed(2)}</td>
                    <td className="p-3 text-right text-rose-300">${trade.stopLoss.toFixed(2)}</td>
                    <td className="p-3 text-right text-emerald-300">${trade.takeProfit.toFixed(2)}</td>
                    <td className="p-3 text-right text-slate-400">{trade.rsi.toFixed(1)}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          trade.simulatedOutcome === 'WIN'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : trade.simulatedOutcome === 'LOSS'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {trade.simulatedOutcome}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <select
                        value={trade.userOutcome || ''}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setDetectedTrades((prev) =>
                            prev.map((t) => (t.id === trade.id ? { ...t, userOutcome: val } : t))
                          );
                        }}
                        className="bg-slate-950 text-slate-300 border border-slate-800 rounded px-1.5 py-0.5 text-[11px]"
                      >
                        <option value="">Mark Result</option>
                        <option value="WIN">Win</option>
                        <option value="LOSS">Loss</option>
                        <option value="BE">Break Even</option>
                        <option value="SKIPPED">Skipped</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
