import React, { useState, useMemo } from 'react';
import { SetupEvaluation, Candle, StrategySettings } from '../types/market';
import { calculateEMA, calculateRSI } from '../engine/indicators';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Layers,
  Copy,
  Check,
  Info,
  Sliders,
} from 'lucide-react';

interface LiveSetupMonitorProps {
  buyEval: SetupEvaluation;
  sellEval: SetupEvaluation;
  activeDirection: 'BUY' | 'SELL';
  onSelectDirection: (dir: 'BUY' | 'SELL') => void;
  m5Candles: Candle[];
  settings: StrategySettings;
}

export const LiveSetupMonitor: React.FC<LiveSetupMonitorProps> = ({
  buyEval,
  sellEval,
  activeDirection,
  onSelectDirection,
  m5Candles,
  settings,
}) => {
  const currentEval = activeDirection === 'BUY' ? buyEval : sellEval;
  const [copiedAlert, setCopiedAlert] = useState(false);
  const [hoveredCandle, setHoveredCandle] = useState<{ candle: Candle; index: number } | null>(null);

  // Compute EMA series and RSI for charting
  const [barCount, setBarCount] = useState<number>(40);
  const ema20Series = useMemo(() => calculateEMA(m5Candles, settings.emaFastPeriod), [m5Candles, settings.emaFastPeriod]);
  const ema200Series = useMemo(() => calculateEMA(m5Candles, settings.emaSlowPeriod), [m5Candles, settings.emaSlowPeriod]);
  const rsiSeries = useMemo(() => calculateRSI(m5Candles, settings.rsiPeriod), [m5Candles, settings.rsiPeriod]);

  // Chart window: last N candles
  const chartCandles = useMemo(() => m5Candles.slice(-barCount), [m5Candles, barCount]);
  const offsetIdx = m5Candles.length - chartCandles.length;

  // Chart Price Range
  const { minPrice, maxPrice } = useMemo(() => {
    if (chartCandles.length === 0) return { minPrice: 2600, maxPrice: 2700 };
    let min = Infinity;
    let max = -Infinity;
    chartCandles.forEach((c) => {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    });
    // Add small buffer
    const pad = (max - min) * 0.1 || 2.0;
    return { minPrice: min - pad, maxPrice: max + pad };
  }, [chartCandles]);

  const priceToY = (price: number, height: number) => {
    if (maxPrice === minPrice) return height / 2;
    return height - ((price - minPrice) / (maxPrice - minPrice)) * height;
  };

  const copyAlertCard = () => {
    const text = `[GEP-5 ANALYTICAL ALERT]
Direction: ${currentEval.direction} SETUP
State: ${currentEval.state.replace('_', ' ')}
Entry Reference: $${currentEval.proposedEntry?.toFixed(2)}
Structural Stop: $${currentEval.structuralStop?.toFixed(2)}
1:2 Target (TP): $${currentEval.target1to2?.toFixed(2)}
RSI 14: ${currentEval.rsi14.toFixed(1)}
EMA 20: $${currentEval.ema20.toFixed(2)} | EMA 200: $${currentEval.ema200.toFixed(2)}
Rule Completion: ${currentEval.score}%
Note: Analytical alert only. Verify Exness chart manually before trade decision.`;
    navigator.clipboard.writeText(text);
    setCopiedAlert(true);
    setTimeout(() => setCopiedAlert(false), 2500);
  };

  const stateColors = {
    WAITING: {
      bg: 'bg-slate-900',
      border: 'border-slate-700',
      text: 'text-slate-300',
      bar: 'bg-slate-600',
      title: 'State 1: WAITING',
      desc: 'No meaningful setup is forming. Neutral market conditions.',
    },
    SETUP_FORMING: {
      bg: 'bg-amber-950/40',
      border: 'border-amber-600/70',
      text: 'text-amber-400',
      bar: 'bg-amber-400',
      title: 'State 2: SETUP FORMING',
      desc: 'Preliminary conditions satisfied (Trend & Baseline). Begin watching the chart.',
    },
    CONFIRMATION_NEEDED: {
      bg: 'bg-orange-950/50',
      border: 'border-orange-600/80',
      text: 'text-orange-400',
      bar: 'bg-orange-500',
      title: 'State 3: CONFIRMATION NEEDED',
      desc: 'Price pulled back to EMA 20. Waiting for confirmation candle close (Rejection / Engulfing).',
    },
    SETUP_READY: {
      bg: 'bg-emerald-950/60',
      border: 'border-emerald-600',
      text: 'text-emerald-400',
      bar: 'bg-emerald-500',
      title: 'State 4: SETUP READY',
      desc: 'ALL mandatory entry conditions satisfied on completed candle! Review chart manually.',
    },
  }[currentEval.state];

  const chartHeight = 280;
  const chartWidth = 720;
  const candleSpacing = chartWidth / Math.max(1, chartCandles.length);

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Direction Switch & 4-State Hero Indicator */}
      <div className={`p-6 rounded-lg border transition-all ${stateColors.bg} ${stateColors.border}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-lg sm:text-xl font-bold font-mono tracking-tight ${stateColors.text}`}>
                {stateColors.title}
              </span>
              <span className="text-xs sm:text-sm font-mono text-slate-300 font-semibold bg-slate-950/70 px-2 py-0.5 rounded border border-slate-800">
                ({currentEval.direction} Setup Monitor)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 mt-1.5 leading-relaxed">{stateColors.desc}</p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onSelectDirection('BUY')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded border transition-colors ${
                activeDirection === 'BUY'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <ArrowUp className="w-4 h-4" />
              BUY Setup ({buyEval.score}%)
            </button>
            <button
              onClick={() => onSelectDirection('SELL')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded border transition-colors ${
                activeDirection === 'SELL'
                  ? 'bg-rose-950 text-rose-300 border-rose-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <ArrowDown className="w-4 h-4" />
              SELL Setup ({sellEval.score}%)
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5 space-y-2">
          <div className="flex justify-between items-center text-xs sm:text-sm font-mono font-medium">
            <span className="text-slate-200">Rule Completion Progress: <strong className="text-amber-400">{currentEval.score}%</strong></span>
            <span className="text-slate-300">
              {currentEval.conditions.filter((c) => c.passed).length} of {currentEval.conditions.length} Rules Passed
            </span>
          </div>
          <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${stateColors.bar}`}
              style={{ width: `${Math.max(4, currentEval.score)}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 block font-sans">
            Note: Progress represents strategy rule fulfillment, never win probability.
          </span>
        </div>
      </div>

      {/* Candlestick & Technical Chart (Expansive Full-Width View for PC) */}
      <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-mono font-semibold">
            <span className="font-bold text-slate-100 text-sm sm:text-base">XAU/USD M5 Chart</span>
            <span className="text-cyan-400">EMA 20 (${currentEval.ema20.toFixed(2)})</span>
            <span className="text-amber-400">EMA 200 (${currentEval.ema200.toFixed(2)})</span>

            {/* Zoom / Bar Count Selector */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs">
              {[25, 40, 60, 100].map((count) => (
                <button
                  key={count}
                  onClick={() => setBarCount(count)}
                  className={`px-2.5 py-0.5 rounded transition-colors font-medium ${
                    barCount === count
                      ? 'bg-slate-800 text-amber-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {count}b
                </button>
              ))}
            </div>
          </div>
          {hoveredCandle && (
            <div className="text-xs sm:text-sm font-mono text-slate-200 bg-slate-950 px-3 py-1 rounded border border-slate-800 font-medium">
              O: ${hoveredCandle.candle.open.toFixed(2)} | H: ${hoveredCandle.candle.high.toFixed(2)} | L: ${hoveredCandle.candle.low.toFixed(2)} | C: ${hoveredCandle.candle.close.toFixed(2)}
            </div>
          )}
        </div>

        {/* SVG Candle Canvas (Taller height for desktop clarity) */}
        <div className="relative w-full overflow-hidden border border-slate-800/80 rounded bg-slate-950 p-3">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-80 sm:h-96 select-none"
            preserveAspectRatio="none"
          >
            {/* Horizontal Grid lines */}
            {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
              const y = chartHeight * ratio;
              const p = maxPrice - (ratio * (maxPrice - minPrice));
              return (
                <g key={ratio}>
                  <line x1="0" y1={y} x2={chartWidth} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                  <text x="5" y={y - 3} fill="#64748b" fontSize="10" fontFamily="monospace">
                    ${p.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Target 1:2 Line (Green) if exists */}
            {currentEval.target1to2 && (
              <g>
                <line
                  x1="0"
                  y1={priceToY(currentEval.target1to2, chartHeight)}
                  x2={chartWidth}
                  y2={priceToY(currentEval.target1to2, chartHeight)}
                  stroke="#10b981"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={chartWidth - 110}
                  y={priceToY(currentEval.target1to2, chartHeight) - 4}
                  fill="#10b981"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  1:2 TP: ${currentEval.target1to2.toFixed(2)}
                </text>
              </g>
            )}

            {/* Proposed Entry Line (Blue/Cyan) if exists */}
            {currentEval.proposedEntry && (
              <g>
                <line
                  x1="0"
                  y1={priceToY(currentEval.proposedEntry, chartHeight)}
                  x2={chartWidth}
                  y2={priceToY(currentEval.proposedEntry, chartHeight)}
                  stroke="#38bdf8"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={chartWidth - 90}
                  y={priceToY(currentEval.proposedEntry, chartHeight) - 4}
                  fill="#38bdf8"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  Entry: ${currentEval.proposedEntry.toFixed(2)}
                </text>
              </g>
            )}

            {/* Structural Stop Loss Line (Red) if exists */}
            {currentEval.structuralStop && (
              <g>
                <line
                  x1="0"
                  y1={priceToY(currentEval.structuralStop, chartHeight)}
                  x2={chartWidth}
                  y2={priceToY(currentEval.structuralStop, chartHeight)}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={chartWidth - 100}
                  y={priceToY(currentEval.structuralStop, chartHeight) - 4}
                  fill="#ef4444"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  SL: ${currentEval.structuralStop.toFixed(2)}
                </text>
              </g>
            )}

            {/* EMA 200 Polyline (Gold) */}
            <path
              d={chartCandles
                .map((_, i) => {
                  const val = ema200Series[offsetIdx + i];
                  const x = i * candleSpacing + candleSpacing / 2;
                  const y = priceToY(val, chartHeight);
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.5"
            />

            {/* EMA 20 Polyline (Cyan) */}
            <path
              d={chartCandles
                .map((_, i) => {
                  const val = ema200Series[offsetIdx + i];
                  const ema20Val = ema20Series[offsetIdx + i];
                  const x = i * candleSpacing + candleSpacing / 2;
                  const y = priceToY(ema20Val, chartHeight);
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
            />

            {/* Candlesticks */}
            {chartCandles.map((c, i) => {
              const x = i * candleSpacing + candleSpacing / 2;
              const yHigh = priceToY(c.high, chartHeight);
              const yLow = priceToY(c.low, chartHeight);
              const yOpen = priceToY(c.open, chartHeight);
              const yClose = priceToY(c.close, chartHeight);
              const isBullish = c.close >= c.open;
              const color = isBullish ? '#10b981' : '#f43f5e';
              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
              const candleWidth = Math.max(3, candleSpacing * 0.65);

              return (
                <g
                  key={c.time}
                  onMouseEnter={() => setHoveredCandle({ candle: c, index: i })}
                  onMouseLeave={() => setHoveredCandle(null)}
                  className="cursor-crosshair"
                >
                  {/* Wick */}
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1" />
                  {/* Body */}
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* RSI 14 Sub-Chart */}
        <div className="p-3 bg-slate-950 border border-slate-800/80 rounded space-y-1">
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>RSI 14: {currentEval.rsi14.toFixed(1)}</span>
            <span>Threshold: {settings.rsiBullishThreshold}</span>
          </div>
          <div className="relative h-12 w-full">
            <svg viewBox={`0 0 ${chartWidth} 48`} className="w-full h-12" preserveAspectRatio="none">
              <line x1="0" y1="24" x2={chartWidth} y2="24" stroke="#475569" strokeDasharray="2 2" />
              <path
                d={chartCandles
                  .map((_, i) => {
                    const rsi = rsiSeries[offsetIdx + i] || 50;
                    const x = i * candleSpacing + candleSpacing / 2;
                    const y = 48 - (rsi / 100) * 48;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#a855f7"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Setup Conditions Checklist (All 10 Rules) */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-100">
            GEP-5 Rule Evaluation Matrix ({activeDirection})
          </h2>
          {currentEval.state === 'SETUP_READY' && (
            <button
              onClick={copyAlertCard}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded transition-colors shadow-sm self-start sm:self-auto"
            >
              {copiedAlert ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>Copy Ready Signal Card</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-800/80">
          {currentEval.conditions.map((cond, idx) => (
            <div key={cond.id} className="py-3.5 flex items-start gap-4">
              <div className="mt-0.5">
                {cond.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : cond.blocked ? (
                  <XCircle className="w-5 h-5 text-rose-400" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-400" />
                )}
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-mono font-bold text-amber-400">{idx + 1}.</span>
                  <span className="text-sm sm:text-base font-bold text-slate-100">{cond.label}</span>
                  {cond.mandatory && (
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800/80">
                      MANDATORY
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{cond.description}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs sm:text-sm font-mono text-slate-400 pt-1">
                  {cond.currentValue && <span>Current: <strong className="text-slate-100">{cond.currentValue}</strong></span>}
                  {cond.targetValue && <span>Target: <strong className="text-amber-300">{cond.targetValue}</strong></span>}
                  {cond.details && <span className="text-slate-400">({cond.details})</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
