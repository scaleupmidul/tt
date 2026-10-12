import { Candle, UnitTestResult } from '../types/market';
import {
  calculateEMA,
  calculateRSI,
  calculateEMASlope,
  detectRejectionCandle,
  detectEngulfingCandle,
  findSwingPivots,
  calculateH1Bias,
} from './indicators';
import { evaluateGEP5Setup, checkNewsBlackout, DEFAULT_SETTINGS } from './gep5Engine';

export function runAllUnitTests(): UnitTestResult[] {
  const results: UnitTestResult[] = [];

  // 1. EMA Calculation Test
  (() => {
    const start = performance.now();
    const candles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
      time: i * 300,
      open: 2600 + i,
      high: 2602 + i,
      low: 2599 + i,
      close: 2601 + i,
      tick_volume: 500,
    }));
    const ema20 = calculateEMA(candles, 20);
    const passed = ema20.length === 50 && ema20[49] > 2630 && ema20[49] < 2660;
    results.push({
      name: 'EMA 20 Mathematical Series Convergence',
      category: 'Mathematical Indicators',
      passed,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      details: `EMA 20 final value: ${ema20[49]?.toFixed(2)} (Expected ~2640 on linear trend)`,
    });
  })();

  // 2. RSI 14 Calculation Test
  (() => {
    const start = performance.now();
    const upCandles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
      time: i * 300,
      open: 2600 + i * 2,
      high: 2605 + i * 2,
      low: 2598 + i * 2,
      close: 2602 + i * 2,
      tick_volume: 500,
    }));
    const rsi = calculateRSI(upCandles, 14);
    const lastRsi = rsi[rsi.length - 1];
    const passed = lastRsi > 70 && lastRsi <= 100;
    results.push({
      name: 'RSI 14 Wilder Smoothing & Momentum Bounds',
      category: 'Mathematical Indicators',
      passed,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      details: `RSI value on pure upward candles: ${lastRsi.toFixed(1)} (Expected > 70)`,
    });
  })();

  // 3. Rejection Pin-Bar Detector Test
  (() => {
    const start = performance.now();
    const bullishPinBar: Candle = {
      time: 1000,
      open: 2650.0,
      high: 2651.0,
      low: 2645.0, // 5 USD lower wick
      close: 2650.8, // closes near top
      tick_volume: 1200,
    };
    const res = detectRejectionCandle(bullishPinBar, 'BUY', 0.50);
    results.push({
      name: 'Bullish Rejection Candle (Pin-bar Wick Ratio)',
      category: 'Pattern Recognition',
      passed: res.isRejection && res.wickRatio >= 0.50,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      details: `Calculated wick ratio: ${(res.wickRatio * 100).toFixed(1)}% (Threshold >= 50%)`,
    });
  })();

  // 4. Engulfing Candle Detector Test
  (() => {
    const start = performance.now();
    const prevBearish: Candle = {
      time: 1000,
      open: 2650.0,
      high: 2651.0,
      low: 2647.0,
      close: 2648.0,
      tick_volume: 800,
    };
    const currBullish: Candle = {
      time: 1300,
      open: 2647.5,
      high: 2652.5,
      low: 2647.0,
      close: 2652.0,
      tick_volume: 1500,
    };
    const res = detectEngulfingCandle(currBullish, prevBearish, 'BUY');
    results.push({
      name: 'Bullish Engulfing Candle Formation',
      category: 'Pattern Recognition',
      passed: res.isEngulfing,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      details: res.details,
    });
  })();

  // 5. EMA 200 Slope Test
  (() => {
    const start = performance.now();
    const series = [2600, 2601, 2602, 2603, 2604, 2605, 2606, 2607, 2608, 2609, 2610];
    const slope = calculateEMASlope(series, 10);
    const passed = slope === 1.0;
    results.push({
      name: 'EMA 200 Slope Lookback Metric',
      category: 'Trend Quant',
      passed,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      details: `Slope: +${slope.toFixed(2)} pts/bar (Linear slope verified)`,
    });
  })();

  // 6. Swing Pivot Fractal Test
  (() => {
    const start = performance.now();
    const pivotCandles: Candle[] = [
      { time: 1, open: 2600, high: 2610, low: 2595, close: 2605, tick_volume: 100 },
      { time: 2, open: 2605, high: 2615, low: 2600, close: 2610, tick_volume: 100 },
      { time: 3, open: 2610, high: 2630, low: 2605, close: 2625, tick_volume: 100 }, // Swing high peak
      { time: 4, open: 2625, high: 2618, low: 2602, close: 2612, tick_volume: 100 },
      { time: 5, open: 2612, high: 2611, low: 2598, close: 2603, tick_volume: 100 },
    ];
    const { swingHighs } = findSwingPivots(pivotCandles, 2);
    const passed = swingHighs.length === 1 && swingHighs[0].price === 2630;
    results.push({
      name: 'Fractal Swing High/Low Structural Pivot',
      category: 'Market Structure',
      passed,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      details: `Identified swing high at index 2 @ $${swingHighs[0]?.price}`,
    });
  })();

  // 7. News Blackout Guard Test
  (() => {
    const start = performance.now();
    const eventTime = Math.floor(Date.now() / 1000);
    const newsEvent = {
      id: 'news-1',
      title: 'US CPI Release',
      timeUTC: new Date(eventTime * 1000).toISOString(),
      blackoutMinutesBefore: 30,
      blackoutMinutesAfter: 30,
      active: true,
    };
    const checkInside = checkNewsBlackout(eventTime, [newsEvent]);
    const checkOutside = checkNewsBlackout(eventTime - 45 * 60, [newsEvent]);
    const passed = checkInside.isBlocked && !checkOutside.isBlocked;
    results.push({
      name: 'High-Impact USD News Window Invariant',
      category: 'Risk Management',
      passed,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      details: 'Blocks inside ±30m window, clears outside window',
    });
  })();

  // 8. 4-State Transition Invariant Test
  (() => {
    const start = performance.now();
    // Neutral synthetic data produces WAITING
    const flatM5: Candle[] = Array.from({ length: 230 }, (_, i) => ({
      time: i * 300,
      open: 2650,
      high: 2650.5,
      low: 2649.5,
      close: 2650,
      tick_volume: 500,
    }));
    const flatH1: Candle[] = Array.from({ length: 50 }, (_, i) => ({
      time: i * 3600,
      open: 2650,
      high: 2651,
      low: 2649,
      close: 2650,
      tick_volume: 1000,
    }));
    const evalResult = evaluateGEP5Setup(flatM5, flatH1, 'BUY', DEFAULT_SETTINGS);
    const passed = evalResult.state === 'WAITING' && !evalResult.ready;
    results.push({
      name: 'State Machine Invariant: Flat Market Holds WAITING',
      category: 'State Machine Engine',
      passed,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      details: `State: ${evalResult.state} | Ready: ${evalResult.ready}`,
    });
  })();

  return results;
}
