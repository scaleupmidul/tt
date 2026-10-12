import React, { useState } from 'react';
import { StrategySettings, NewsEvent } from '../types/market';
import { DEFAULT_SETTINGS } from '../engine/gep5Engine';
import {
  Sliders,
  RotateCcw,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Info,
  Calendar,
  Plus,
  Trash2,
  ShieldAlert,
  Server,
} from 'lucide-react';

interface StrategySettingsPageProps {
  settings: StrategySettings;
  onUpdateSettings: (newSettings: StrategySettings) => void;
  onRequestDesktopNotification: () => void;
  newsEvents: NewsEvent[];
  onAddNewsEvent: (event: NewsEvent) => void;
  onToggleNewsEvent: (id: string) => void;
  onDeleteNewsEvent: (id: string) => void;
}

export const StrategySettingsPage: React.FC<StrategySettingsPageProps> = ({
  settings,
  onUpdateSettings,
  onRequestDesktopNotification,
  newsEvents,
  onAddNewsEvent,
  onToggleNewsEvent,
  onDeleteNewsEvent,
}) => {
  const [newTitle, setNewTitle] = useState('US CPI Release');
  const [newTime, setNewTime] = useState(
    new Date(Date.now() + 3600 * 1000).toISOString().substring(0, 16)
  );
  const [newBefore, setNewBefore] = useState(30);
  const [newAfter, setNewAfter] = useState(30);

  const handleChange = (key: keyof StrategySettings, value: any) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const handleReset = () => {
    onUpdateSettings(DEFAULT_SETTINGS);
  };

  const handleCreateNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;
    const item: NewsEvent = {
      id: `news-${Date.now()}`,
      title: newTitle,
      timeUTC: new Date(newTime).toISOString(),
      blackoutMinutesBefore: newBefore,
      blackoutMinutesAfter: newAfter,
      active: true,
    };
    onAddNewsEvent(item);
  };

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header */}
      <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-400 font-mono mb-1 font-semibold">
            <span>PARAMETER CALIBRATION</span>
            <span aria-hidden="true">·</span>
            <span>STRATEGY ENGINE SPECS</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-100 tracking-tight">
            Strategy Rules & Threshold Calibration
          </h1>
          <p className="text-sm sm:text-base text-slate-300 mt-1.5 max-w-4xl">
            Configure indicator periods, tolerance bounds, news blackout filters, and confirmation criteria. Every parameter is documented with its mathematical formula.
          </p>
        </div>

        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors self-start md:self-auto"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset to Defaults</span>
        </button>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel 1: Moving Averages & Slope Rules */}
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-lg space-y-4">
          <h2 className="text-base font-bold text-slate-100">
            Moving Averages & Slope Rules
          </h2>

          <div className="space-y-4 text-xs font-mono">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Fast EMA (Pullback Target)</span>
                <span className="text-amber-400">Period {settings.emaFastPeriod}</span>
              </div>
              <input
                type="number"
                min="5"
                max="50"
                value={settings.emaFastPeriod}
                onChange={(e) => handleChange('emaFastPeriod', parseInt(e.target.value) || 20)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                Default: 20. Used on M5 to identify trend pullback baseline.
              </span>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Slow EMA (Trend Baseline)</span>
                <span className="text-amber-400">Period {settings.emaSlowPeriod}</span>
              </div>
              <input
                type="number"
                min="50"
                max="500"
                value={settings.emaSlowPeriod}
                onChange={(e) => handleChange('emaSlowPeriod', parseInt(e.target.value) || 200)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                Default: 200. Defines macro directional regime on M5.
              </span>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>EMA 200 Slope Threshold (pts/bar)</span>
                <span className="text-amber-400">+{settings.emaSlopeMinPoints.toFixed(2)} pts</span>
              </div>
              <input
                type="number"
                step="0.02"
                min="0.02"
                max="1.0"
                value={settings.emaSlopeMinPoints}
                onChange={(e) => handleChange('emaSlopeMinPoints', parseFloat(e.target.value) || 0.10)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                Default: 0.10 pts/bar over {settings.emaSlopeLookback} bars. Filters sideways/flat markets.
              </span>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Pullback Tolerance to EMA 20 ($)</span>
                <span className="text-amber-400">${settings.emaPullbackTolerancePoints.toFixed(2)}</span>
              </div>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="10.0"
                value={settings.emaPullbackTolerancePoints}
                onChange={(e) => handleChange('emaPullbackTolerancePoints', parseFloat(e.target.value) || 2.50)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                Default: $2.50. Maximum distance candle low/high can be from EMA20 to qualify as pullback.
              </span>
            </div>

            {/* Chop Filter Toggle */}
            <div className="pt-2 border-t border-slate-800/80">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-slate-200 font-medium font-sans">Sideways / Chop Filter</span>
                  <span className="text-[11px] text-slate-500 font-sans block">
                    Blocks setups during low volatility compression (&lt; ${settings.maxChopSpreadUSD.toFixed(2)})
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableChopFilter}
                  onChange={(e) => handleChange('enableChopFilter', e.target.checked)}
                  className="w-4 h-4 accent-amber-400"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Panel 2: Confirmation & Risk Management */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-4">
          <h2 className="text-sm font-semibold text-slate-200">
            Confirmation & Risk Management
          </h2>

          <div className="space-y-4 text-xs font-mono">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Rejection Candle Wick Ratio</span>
                <span className="text-amber-400">{(settings.rejectionWickMinRatio * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.40"
                max="0.75"
                step="0.05"
                value={settings.rejectionWickMinRatio}
                onChange={(e) => handleChange('rejectionWickMinRatio', parseFloat(e.target.value))}
                className="w-full accent-amber-400"
              />
              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                Default: 50%. The shadow (wick) must comprise at least 50% of total candle range.
              </span>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>RSI 14 Centerline Threshold</span>
                <span className="text-amber-400">Level {settings.rsiBullishThreshold}</span>
              </div>
              <input
                type="number"
                min="40"
                max="60"
                value={settings.rsiBullishThreshold}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 50;
                  handleChange('rsiBullishThreshold', v);
                  handleChange('rsiBearishThreshold', v);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                Default: 50.0. BUY requires RSI &gt;= 50; SELL requires RSI &lt;= 50 on completed candle close.
              </span>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Minimum Reward-to-Risk Target</span>
                <span className="text-amber-400">1:{settings.minRewardRiskRatio}</span>
              </div>
              <input
                type="number"
                step="0.5"
                min="1.0"
                max="5.0"
                value={settings.minRewardRiskRatio}
                onChange={(e) => handleChange('minRewardRiskRatio', parseFloat(e.target.value) || 2.0)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              />
              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                Default: 2.0 (1:2). Target distance is projected as 2x the structural stop distance.
              </span>
            </div>

            {/* Custom Connector URL */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Local Connector URL</span>
                <span className="text-amber-400">Endpoint</span>
              </div>
              <input
                type="text"
                value={settings.connectorUrl}
                onChange={(e) => handleChange('connectorUrl', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono"
              />
              <span className="text-[11px] text-slate-500 font-sans block mt-0.5">
                Default: http://127.0.0.1:8765
              </span>
            </div>

            {/* Alert Controls */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-sans">Synthesized Audio Alerts</span>
                <button
                  onClick={() => handleChange('soundAlertsEnabled', !settings.soundAlertsEnabled)}
                  className={`p-1.5 rounded border transition-colors ${
                    settings.soundAlertsEnabled
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}
                >
                  {settings.soundAlertsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-sans">Browser Desktop Notifications</span>
                <button
                  onClick={() => {
                    onRequestDesktopNotification();
                    handleChange('desktopAlertsEnabled', !settings.desktopAlertsEnabled);
                  }}
                  className={`p-1.5 rounded border transition-colors ${
                    settings.desktopAlertsEnabled
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}
                >
                  {settings.desktopAlertsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: High-Impact USD Economic News Blackout Window (Prompt Section 5) */}
      <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              High-Impact USD News Filter (Prompt Section 5)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Blocks SETUP READY alerts during high-impact US macroeconomic releases (e.g. CPI, Non-Farm Payrolls, FOMC rate decisions).
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer self-start sm:self-auto">
            <span>Filter Active:</span>
            <input
              type="checkbox"
              checked={settings.enableNewsFilter}
              onChange={(e) => handleChange('enableNewsFilter', e.target.checked)}
              className="w-4 h-4 accent-amber-400"
            />
          </label>
        </div>

        {/* Add News Form */}
        <form onSubmit={handleCreateNews} className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-slate-950 rounded border border-slate-800 text-xs font-mono">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Event Name</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. US CPI"
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
              required
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Release Time</label>
            <input
              type="datetime-local"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
              required
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Blackout Window (± mins)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="5"
                max="120"
                value={newBefore}
                onChange={(e) => setNewBefore(parseInt(e.target.value) || 30)}
                className="w-1/2 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                title="Minutes before release"
              />
              <input
                type="number"
                min="5"
                max="120"
                value={newAfter}
                onChange={(e) => setNewAfter(parseInt(e.target.value) || 30)}
                className="w-1/2 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                title="Minutes after release"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 p-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Event</span>
            </button>
          </div>
        </form>

        {/* News List */}
        <div className="space-y-2">
          {newsEvents.length === 0 ? (
            <div className="p-4 bg-slate-950 text-center text-xs text-slate-500 font-mono rounded border border-slate-800/80">
              No news blackout events configured. Add scheduled events above to guard against news volatility.
            </div>
          ) : (
            newsEvents.map((event) => (
              <div
                key={event.id}
                className="p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={event.active}
                    onChange={() => onToggleNewsEvent(event.id)}
                    className="w-3.5 h-3.5 accent-amber-400"
                  />
                  <span className="font-semibold text-slate-200">{event.title}</span>
                  <span className="text-slate-400">
                    {new Date(event.timeUTC).toISOString().replace('T', ' ').substring(0, 16)} UTC
                  </span>
                  <span className="text-amber-400/80 text-[11px]">
                    ±{event.blackoutMinutesBefore}m blackout
                  </span>
                </div>

                <button
                  onClick={() => onDeleteNewsEvent(event.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Remove event"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Rule Clarity Notice */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-lg space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400" />
          Rule Ambiguity Clarifications & Mathematical Formulation
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          In quantitative development, subjective trading jargon must be converted into strict, non-repainting equations. The GEP-5 engine implements the following explicit rules:
        </p>
        <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside font-mono">
          <li>
            <strong className="text-slate-200">Rejection Candle Definition:</strong> Defined as a candle whose lower shadow (for BUY) is &ge; 50% of the total high-low span and whose closing price finishes in the upper 60% of the bar.
          </li>
          <li>
            <strong className="text-slate-200">Pullback Toward EMA 20:</strong> Defined as a candle whose extreme (low for BUY, high for SELL) touches or comes within $2.50 of the EMA 20 line.
          </li>
          <li>
            <strong className="text-slate-200">EMA 200 Slope Rule:</strong> Calculated as <code className="text-amber-300">(EMA200[now] - EMA200[now - 10]) / 10</code>. Must be &ge; +0.10 pts/bar for BUY, and &le; -0.10 pts/bar for SELL.
          </li>
          <li>
            <strong className="text-slate-200">Non-Repainting Execution:</strong> All signals evaluate exclusively on completed bar closes (index -1), ensuring zero repainting after the bar closes.
          </li>
        </ul>
      </div>
    </div>
  );
};
