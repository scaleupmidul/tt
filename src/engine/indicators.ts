import { Candle } from '../types/market';

/**
 * Exponential Moving Average (EMA)
 * Multiplier = 2 / (period + 1)
 * Initial value = Simple Moving Average of first 'period' elements
 */
export function calculateEMA(candles: Candle[], period: number): number[] {
  if (candles.length === 0 || period <= 0) return [];
  const result: number[] = new Array(candles.length).fill(0);
  
  if (candles.length < period) {
    // If not enough candles, return simple moving averages
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].close;
      result[i] = sum / (i + 1);
    }
    return result;
  }

  // Initial SMA
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += candles[i].close;
    result[i] = initialSum / (i + 1);
  }
  let currentEma = initialSum / period;
  result[period - 1] = currentEma;

  const multiplier = 2 / (period + 1);

  for (let i = period; i < candles.length; i++) {
    currentEma = (candles[i].close - currentEma) * multiplier + currentEma;
    result[i] = currentEma;
  }

  return result;
}

/**
 * Relative Strength Index (RSI) with Wilder's Smoothed Moving Average
 */
export function calculateRSI(candles: Candle[], period: number = 14): number[] {
  if (candles.length === 0) return [];
  const rsi: number[] = new Array(candles.length).fill(50);
  if (candles.length <= period) return rsi;

  let gains = 0;
  let losses = 0;

  // First period calculations
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    rsi[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - (100 / (1 + rs));
  }

  // Subsequent Wilder smoothing
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }

  return rsi;
}

/**
 * Calculates the slope of EMA over a lookback window.
 * Returns points per bar (e.g. +0.25 pt/bar indicates an upward slope)
 */
export function calculateEMASlope(emaValues: number[], lookback: number = 10): number {
  if (emaValues.length <= lookback || lookback <= 0) return 0;
  const current = emaValues[emaValues.length - 1];
  const past = emaValues[emaValues.length - 1 - lookback];
  return (current - past) / lookback;
}

/**
 * Detects Rejection Candle (Pin Bar / Hammer / Shooting Star)
 * For BUY: Long lower wick (shadow) >= minWickRatio of total range, with close in top portion.
 * For SELL: Long upper wick >= minWickRatio of total range, with close in bottom portion.
 */
export function detectRejectionCandle(
  candle: Candle,
  direction: 'BUY' | 'SELL',
  minWickRatio: number = 0.50
): { isRejection: boolean; wickRatio: number; details: string } {
  const range = candle.high - candle.low;
  if (range <= 0.05) {
    return { isRejection: false, wickRatio: 0, details: 'Candle range too tight' };
  }

  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);
  const upperWick = candle.high - bodyTop;
  const lowerWick = bodyBottom - candle.low;

  if (direction === 'BUY') {
    const lowerWickRatio = lowerWick / range;
    const closesInTopHalf = candle.close >= candle.low + (range * 0.40);
    const isRejection = lowerWickRatio >= minWickRatio && closesInTopHalf;
    return {
      isRejection,
      wickRatio: lowerWickRatio,
      details: `Lower wick ${(lowerWickRatio * 100).toFixed(1)}% of range (req >= ${(minWickRatio * 100).toFixed(0)}%)`
    };
  } else {
    const upperWickRatio = upperWick / range;
    const closesInBottomHalf = candle.close <= candle.high - (range * 0.40);
    const isRejection = upperWickRatio >= minWickRatio && closesInBottomHalf;
    return {
      isRejection,
      wickRatio: upperWickRatio,
      details: `Upper wick ${(upperWickRatio * 100).toFixed(1)}% of range (req >= ${(minWickRatio * 100).toFixed(0)}%)`
    };
  }
}

/**
 * Detects Engulfing Candle pattern
 * For BUY: Prior candle was bearish, current candle is bullish, and current body engulfs prior body
 * For SELL: Prior candle was bullish, current candle is bearish, and current body engulfs prior body
 */
export function detectEngulfingCandle(
  curr: Candle,
  prev: Candle,
  direction: 'BUY' | 'SELL'
): { isEngulfing: boolean; details: string } {
  const prevBullish = prev.close > prev.open;
  const prevBearish = prev.close < prev.open;
  const currBullish = curr.close > curr.open;
  const currBearish = curr.close < curr.open;

  if (direction === 'BUY') {
    const isEngulfing = currBullish && (
      (curr.open <= prev.close && curr.close >= prev.open) ||
      (curr.close > prev.high && curr.open <= prev.low)
    );
    return {
      isEngulfing,
      details: isEngulfing
        ? `Bullish candle engulfed prior bearish candle [O:${curr.open} C:${curr.close} vs prev C:${prev.close} O:${prev.open}]`
        : 'No bullish engulfing structure'
    };
  } else {
    const isEngulfing = currBearish && (
      (curr.open >= prev.close && curr.close <= prev.open) ||
      (curr.close < prev.low && curr.open >= prev.high)
    );
    return {
      isEngulfing,
      details: isEngulfing
        ? `Bearish candle engulfed prior bullish candle [O:${curr.open} C:${curr.close} vs prev C:${prev.close} O:${prev.open}]`
        : 'No bearish engulfing structure'
    };
  }
}

/**
 * Identifies swing pivots (fractals) using configurable bar lookback
 */
export function findSwingPivots(candles: Candle[], lookback: number = 3): {
  swingHighs: { index: number; price: number; time: number }[];
  swingLows: { index: number; price: number; time: number }[];
} {
  const swingHighs: { index: number; price: number; time: number }[] = [];
  const swingLows: { index: number; price: number; time: number }[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= currentHigh || candles[i + j].high > currentHigh) {
        isHigh = false;
      }
      if (candles[i - j].low <= currentLow || candles[i + j].low < currentLow) {
        isLow = false;
      }
    }

    if (isHigh) {
      swingHighs.push({ index: i, price: currentHigh, time: candles[i].time });
    }
    if (isLow) {
      swingLows.push({ index: i, price: currentLow, time: candles[i].time });
    }
  }

  return { swingHighs, swingLows };
}

/**
 * Determines H1 higher-timeframe directional bias based on EMA structure and price action
 */
export function calculateH1Bias(
  h1Candles: Candle[],
  emaFastPeriod: number = 20,
  emaSlowPeriod: number = 50
): {
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  reason: string;
  fastEMA: number;
  slowEMA: number;
} {
  if (h1Candles.length < 30) {
    return { bias: 'NEUTRAL', reason: 'Insufficient H1 candle history', fastEMA: 0, slowEMA: 0 };
  }

  const emaFast = calculateEMA(h1Candles, emaFastPeriod);
  const emaSlow = calculateEMA(h1Candles, emaSlowPeriod);

  const lastIdx = h1Candles.length - 1;
  const currentClose = h1Candles[lastIdx].close;
  const fast = emaFast[lastIdx];
  const slow = emaSlow[lastIdx];

  // Strong bullish: Price above fast EMA, fast EMA above slow EMA
  if (currentClose > fast && fast >= slow) {
    return {
      bias: 'BULLISH',
      reason: `H1 Close (${currentClose.toFixed(2)}) > EMA${emaFastPeriod} (${fast.toFixed(2)}) > EMA${emaSlowPeriod} (${slow.toFixed(2)})`,
      fastEMA: fast,
      slowEMA: slow
    };
  }

  // Strong bearish: Price below fast EMA, fast EMA below slow EMA
  if (currentClose < fast && fast <= slow) {
    return {
      bias: 'BEARISH',
      reason: `H1 Close (${currentClose.toFixed(2)}) < EMA${emaFastPeriod} (${fast.toFixed(2)}) < EMA${emaSlowPeriod} (${slow.toFixed(2)})`,
      fastEMA: fast,
      slowEMA: slow
    };
  }

  // Moderately bullish
  if (currentClose > fast) {
    return {
      bias: 'BULLISH',
      reason: `H1 Price (${currentClose.toFixed(2)}) is trading above EMA${emaFastPeriod} (${fast.toFixed(2)})`,
      fastEMA: fast,
      slowEMA: slow
    };
  }

  if (currentClose < fast) {
    return {
      bias: 'BEARISH',
      reason: `H1 Price (${currentClose.toFixed(2)}) is trading below EMA${emaFastPeriod} (${fast.toFixed(2)})`,
      fastEMA: fast,
      slowEMA: slow
    };
  }

  return {
    bias: 'NEUTRAL',
    reason: `H1 Price oscillating around EMAs (${currentClose.toFixed(2)})`,
    fastEMA: fast,
    slowEMA: slow
  };
}
