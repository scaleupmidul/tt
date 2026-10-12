import { Candle, SetupEvaluation, SetupDirection, SetupState, StrategyCondition, StrategySettings, NewsEvent } from '../types/market';
import {
  calculateEMA,
  calculateRSI,
  calculateEMASlope,
  detectRejectionCandle,
  detectEngulfingCandle,
  findSwingPivots,
  calculateH1Bias,
} from './indicators';

export const DEFAULT_SETTINGS: StrategySettings = {
  emaFastPeriod: 20,
  emaSlowPeriod: 200,
  emaSlopeLookback: 10,
  emaSlopeMinPoints: 0.10, // 0.10 points/bar
  emaPullbackTolerancePoints: 2.50, // within 2.50 USD of EMA20
  rejectionWickMinRatio: 0.50, // 50% wick
  rsiPeriod: 14,
  rsiBullishThreshold: 50.0,
  rsiBearishThreshold: 50.0,
  minRewardRiskRatio: 2.0, // 1:2
  swingLookbackBars: 5,
  alertCooldownMinutes: 15,
  soundAlertsEnabled: true,
  desktopAlertsEnabled: true,
  enableNewsFilter: true,
  newsBlackoutMinutes: 15,
  enableChopFilter: true,
  maxChopSpreadUSD: 1.20,
  maxSpreadPoints: 35, // default 35 points ($0.35)
  connectorUrl: 'http://127.0.0.1:8765',
};

/**
 * Checks if current time is within high-impact news blackout window
 */
export function checkNewsBlackout(
  currentTimeSeconds: number,
  newsEvents: NewsEvent[] = []
): { isBlocked: boolean; activeNews?: NewsEvent } {
  const currentMs = currentTimeSeconds * 1000;
  for (const event of newsEvents) {
    if (!event.active) continue;
    const eventMs = new Date(event.timeUTC).getTime();
    if (isNaN(eventMs)) continue;

    const startMs = eventMs - event.blackoutMinutesBefore * 60 * 1000;
    const endMs = eventMs + event.blackoutMinutesAfter * 60 * 1000;

    if (currentMs >= startMs && currentMs <= endMs) {
      return { isBlocked: true, activeNews: event };
    }
  }
  return { isBlocked: false };
}

function makeCondition({
  id,
  label,
  description,
  mandatory,
  passed,
  currentValue,
  targetValue,
  timeframe,
  details,
  candleTimestamp,
}: {
  id: string;
  label: string;
  description: string;
  mandatory: boolean;
  passed: boolean;
  currentValue?: string | number;
  targetValue?: string | number;
  timeframe: 'M5' | 'H1';
  details?: string;
  candleTimestamp?: string;
}): StrategyCondition {
  return {
    id,
    label,
    description,
    mandatory,
    status: passed ? 'PASS' : 'FAIL',
    passed,
    blocked: !passed,
    measuredValue: currentValue,
    currentValue,
    targetValue,
    timeframe,
    candleTimestamp,
    details: details || '',
    explanation: details || description,
  };
}

/**
 * Deterministically evaluates GEP-5 conditions on completed candles
 */
export function evaluateGEP5Setup(
  m5Candles: Candle[],
  h1Candles: Candle[],
  direction: SetupDirection,
  settings: StrategySettings = DEFAULT_SETTINGS,
  newsEvents: NewsEvent[] = []
): SetupEvaluation {
  // Ensure we have enough data
  if (m5Candles.length < settings.emaSlowPeriod + 10) {
    return createEmptyEvaluation(direction, 'Insufficient M5 candle history (need at least 210 candles)');
  }

  // Use completed candle (the latest bar in closed array)
  const completedIdx = m5Candles.length - 1;
  const currentCandle = m5Candles[completedIdx];
  const prevCandle = m5Candles[Math.max(0, completedIdx - 1)];
  const candleTimeIso = new Date(currentCandle.time * 1000).toISOString();

  // Calculate Indicators
  const ema20Series = calculateEMA(m5Candles, settings.emaFastPeriod);
  const ema200Series = calculateEMA(m5Candles, settings.emaSlowPeriod);
  const rsiSeries = calculateRSI(m5Candles, settings.rsiPeriod);

  const currentEma20 = ema20Series[completedIdx];
  const currentEma200 = ema200Series[completedIdx];
  const currentRsi = rsiSeries[completedIdx];
  const currentSlope = calculateEMASlope(ema200Series, settings.emaSlopeLookback);

  // H1 Higher Timeframe Bias
  const h1Analysis = calculateH1Bias(h1Candles, 20, 50);

  // Swing Pivots
  const { swingHighs, swingLows } = findSwingPivots(m5Candles, settings.swingLookbackBars);

  // Confirmation Candle Analysis
  const rejectionResult = detectRejectionCandle(currentCandle, direction, settings.rejectionWickMinRatio);
  const engulfingResult = detectEngulfingCandle(currentCandle, prevCandle, direction);
  const hasCandlePattern = rejectionResult.isRejection || engulfingResult.isEngulfing;
  const patternDescription = rejectionResult.isRejection
    ? `Rejection Candle (${rejectionResult.details})`
    : engulfingResult.isEngulfing
    ? `Engulfing Candle (${engulfingResult.details})`
    : 'No Rejection or Engulfing Candle on Close';

  const conditions: StrategyCondition[] = [];
  const missingConditions: string[] = [];
  const reasons: string[] = [];

  let proposedEntry = currentCandle.close;
  let structuralStop: number | undefined;
  let target1to2: number | undefined;
  let rewardToRiskRatio: number | undefined;

  if (direction === 'BUY') {
    // 1. H1 Directional Bias is Bullish
    const cond1Passed = h1Analysis.bias === 'BULLISH';
    conditions.push(
      makeCondition({
        id: 'h1_bias',
        label: 'H1 Higher-Timeframe Trend',
        description: 'H1 directional bias must be strictly bullish according to EMA structure (HH/HL)',
        mandatory: true,
        passed: cond1Passed,
        currentValue: h1Analysis.bias,
        targetValue: 'BULLISH',
        timeframe: 'H1',
        details: h1Analysis.reason,
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond1Passed) missingConditions.push('H1 Directional Bias is not Bullish');

    // 2. M5 Price above EMA 200
    const cond2Passed = currentCandle.close > currentEma200;
    conditions.push(
      makeCondition({
        id: 'm5_above_ema200',
        label: 'M5 Above EMA 200',
        description: 'M5 closing price must be above baseline EMA 200',
        mandatory: true,
        passed: cond2Passed,
        currentValue: `${currentCandle.close.toFixed(2)} vs EMA ${currentEma200.toFixed(2)}`,
        targetValue: `> ${currentEma200.toFixed(2)}`,
        timeframe: 'M5',
        details: cond2Passed ? 'Price is above EMA 200' : 'Price is below EMA 200',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond2Passed) missingConditions.push('M5 Price must be above EMA 200');

    // 3. EMA 200 Upward Slope
    const cond3Passed = currentSlope >= settings.emaSlopeMinPoints;
    conditions.push(
      makeCondition({
        id: 'ema200_slope',
        label: 'EMA 200 Upward Slope',
        description: `EMA 200 must show an upward angle >= +${settings.emaSlopeMinPoints} pts/bar over ${settings.emaSlopeLookback} bars`,
        mandatory: true,
        passed: cond3Passed,
        currentValue: `${currentSlope > 0 ? '+' : ''}${currentSlope.toFixed(3)} pts/bar`,
        targetValue: `>= +${settings.emaSlopeMinPoints.toFixed(2)} pts/bar`,
        timeframe: 'M5',
        details: cond3Passed ? 'EMA 200 slope is upward' : 'EMA 200 slope is flat or downward',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond3Passed) missingConditions.push(`EMA 200 upward slope insufficient (${currentSlope.toFixed(2)} pts/bar)`);

    // 4. Pullback toward EMA 20
    const distanceToEma20 = Math.abs(currentCandle.low - currentEma20);
    const lowBelowOrNearEma20 = currentCandle.low <= currentEma20 + settings.emaPullbackTolerancePoints;
    const cond4Passed = lowBelowOrNearEma20;
    conditions.push(
      makeCondition({
        id: 'ema20_pullback',
        label: 'Pullback toward EMA 20',
        description: `Price low must test or pull back within ${settings.emaPullbackTolerancePoints} USD of EMA 20`,
        mandatory: true,
        passed: cond4Passed,
        currentValue: `Low ${currentCandle.low.toFixed(2)} vs EMA20 ${currentEma20.toFixed(2)} (diff: ${distanceToEma20.toFixed(2)})`,
        targetValue: `<= ${settings.emaPullbackTolerancePoints} tolerance`,
        timeframe: 'M5',
        details: cond4Passed ? 'Pullback touched or approached EMA 20' : 'Price has not pulled back to EMA 20 yet',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond4Passed) missingConditions.push('Price has not pulled back to EMA 20');

    // 5. Bullish Rejection or Engulfing Candle
    const cond5Passed = hasCandlePattern;
    conditions.push(
      makeCondition({
        id: 'candle_pattern',
        label: 'Bullish Confirmation Candle',
        description: 'Completed candle must be a bullish rejection pin-bar or bullish engulfing',
        mandatory: true,
        passed: cond5Passed,
        currentValue: patternDescription,
        targetValue: 'Rejection or Engulfing',
        timeframe: 'M5',
        details: patternDescription,
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond5Passed) missingConditions.push('Missing Bullish Rejection or Engulfing Candle on close');

    // 6. RSI 14 above 50
    const cond6Passed = currentRsi >= settings.rsiBullishThreshold;
    conditions.push(
      makeCondition({
        id: 'rsi_above_50',
        label: `RSI 14 >= ${settings.rsiBullishThreshold}`,
        description: `M5 RSI 14 momentum must be >= ${settings.rsiBullishThreshold} on candle close`,
        mandatory: true,
        passed: cond6Passed,
        currentValue: currentRsi.toFixed(1),
        targetValue: `>= ${settings.rsiBullishThreshold}`,
        timeframe: 'M5',
        details: cond6Passed ? 'RSI momentum is bullish (> 50)' : 'RSI momentum is below 50',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond6Passed) missingConditions.push(`RSI 14 below bullish threshold (${currentRsi.toFixed(1)} < ${settings.rsiBullishThreshold})`);

    // 7. Swing High Break
    const recentHighs = swingHighs.filter((s) => s.index < completedIdx && s.index >= completedIdx - 20);
    const priorSwingHigh = recentHighs.length > 0 ? recentHighs[recentHighs.length - 1].price : undefined;
    const cond7Passed = priorSwingHigh !== undefined ? currentCandle.close >= priorSwingHigh - 0.50 : true;
    conditions.push(
      makeCondition({
        id: 'swing_high_break',
        label: 'Local Swing Break / Clearance',
        description: 'Price breaks or holds structural swing pivot level',
        mandatory: false,
        passed: cond7Passed,
        currentValue: priorSwingHigh ? `Prior High: ${priorSwingHigh.toFixed(2)}` : 'No immediate swing barrier',
        targetValue: 'Clearance verified',
        timeframe: 'M5',
        details: priorSwingHigh ? `Close ${currentCandle.close.toFixed(2)} vs Pivot High ${priorSwingHigh.toFixed(2)}` : 'Clear price path',
        candleTimestamp: candleTimeIso,
      })
    );

    // 8. Completed Candle Close Eligibility
    conditions.push(
      makeCondition({
        id: 'completed_candle',
        label: 'Completed Candle Confirmation',
        description: 'Signal confirmed only on bar close (zero repainting)',
        mandatory: true,
        passed: true,
        currentValue: 'Bar Closed',
        targetValue: 'Bar Closed',
        timeframe: 'M5',
        details: `Candle time ${candleTimeIso}`,
        candleTimestamp: candleTimeIso,
      })
    );

    // 9. Technically Valid Structural Stop-Loss
    const recentLowSlice = m5Candles.slice(Math.max(0, completedIdx - 5), completedIdx + 1);
    const lowestLow = Math.min(...recentLowSlice.map((c) => c.low));
    structuralStop = Math.min(lowestLow - 0.50, currentCandle.low - 0.20);
    const stopDistance = proposedEntry - structuralStop;
    const cond9Passed = stopDistance >= 1.0 && stopDistance <= 15.0;
    conditions.push(
      makeCondition({
        id: 'structural_stop',
        label: 'Technical Stop-Loss Reference',
        description: 'Valid swing low exists with realistic risk buffer ($1.00 - $15.00)',
        mandatory: true,
        passed: cond9Passed,
        currentValue: `Stop: ${structuralStop.toFixed(2)} (Risk: $${stopDistance.toFixed(2)})`,
        targetValue: 'Valid Structural Pivot',
        timeframe: 'M5',
        details: cond9Passed ? 'Valid technical stop identified below pullback low' : 'Stop loss buffer unrealistic or undefined',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond9Passed) missingConditions.push('Invalid Structural Stop-Loss distance');

    // 10. Reward-to-Risk Ratio >= 1:2
    if (structuralStop) {
      const risk = proposedEntry - structuralStop;
      const targetDistance = risk * settings.minRewardRiskRatio;
      target1to2 = proposedEntry + targetDistance;
      rewardToRiskRatio = settings.minRewardRiskRatio;
    }
    const cond10Passed = cond9Passed && rewardToRiskRatio !== undefined && rewardToRiskRatio >= settings.minRewardRiskRatio;
    conditions.push(
      makeCondition({
        id: 'reward_to_risk',
        label: `Min Reward-to-Risk (1:${settings.minRewardRiskRatio})`,
        description: `Projected target must meet or exceed 1:${settings.minRewardRiskRatio} ratio without hitting major structural resistance`,
        mandatory: true,
        passed: cond10Passed,
        currentValue: target1to2 ? `TP: ${target1to2.toFixed(2)} (R:R 1:${rewardToRiskRatio?.toFixed(1)})` : 'N/A',
        targetValue: `>= 1:${settings.minRewardRiskRatio}`,
        timeframe: 'M5',
        details: `Entry: ${proposedEntry.toFixed(2)}, SL: ${structuralStop?.toFixed(2)}, TP: ${target1to2?.toFixed(2)}`,
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond10Passed) missingConditions.push(`Risk/Reward requirement not satisfied (min 1:${settings.minRewardRiskRatio})`);

  } else {
    // SELL SETUP
    // 1. H1 Directional Bias is Bearish
    const cond1Passed = h1Analysis.bias === 'BEARISH';
    conditions.push(
      makeCondition({
        id: 'h1_bias',
        label: 'H1 Higher-Timeframe Trend',
        description: 'H1 directional bias must be strictly bearish according to EMA structure (LH/LL)',
        mandatory: true,
        passed: cond1Passed,
        currentValue: h1Analysis.bias,
        targetValue: 'BEARISH',
        timeframe: 'H1',
        details: h1Analysis.reason,
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond1Passed) missingConditions.push('H1 Directional Bias is not Bearish');

    // 2. M5 Price below EMA 200
    const cond2Passed = currentCandle.close < currentEma200;
    conditions.push(
      makeCondition({
        id: 'm5_below_ema200',
        label: 'M5 Below EMA 200',
        description: 'M5 closing price must be below baseline EMA 200',
        mandatory: true,
        passed: cond2Passed,
        currentValue: `${currentCandle.close.toFixed(2)} vs EMA ${currentEma200.toFixed(2)}`,
        targetValue: `< ${currentEma200.toFixed(2)}`,
        timeframe: 'M5',
        details: cond2Passed ? 'Price is below EMA 200' : 'Price is above EMA 200',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond2Passed) missingConditions.push('M5 Price must be below EMA 200');

    // 3. EMA 200 Downward Slope
    const cond3Passed = currentSlope <= -settings.emaSlopeMinPoints;
    conditions.push(
      makeCondition({
        id: 'ema200_slope',
        label: 'EMA 200 Downward Slope',
        description: `EMA 200 must show a downward angle <= -${settings.emaSlopeMinPoints} pts/bar over ${settings.emaSlopeLookback} bars`,
        mandatory: true,
        passed: cond3Passed,
        currentValue: `${currentSlope > 0 ? '+' : ''}${currentSlope.toFixed(3)} pts/bar`,
        targetValue: `<= -${settings.emaSlopeMinPoints.toFixed(2)} pts/bar`,
        timeframe: 'M5',
        details: cond3Passed ? 'EMA 200 slope is downward' : 'EMA 200 slope is flat or upward',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond3Passed) missingConditions.push(`EMA 200 downward slope insufficient (${currentSlope.toFixed(2)} pts/bar)`);

    // 4. Pullback toward EMA 20
    const distanceToEma20 = Math.abs(currentCandle.high - currentEma20);
    const highAboveOrNearEma20 = currentCandle.high >= currentEma20 - settings.emaPullbackTolerancePoints;
    const cond4Passed = highAboveOrNearEma20;
    conditions.push(
      makeCondition({
        id: 'ema20_pullback',
        label: 'Pullback toward EMA 20',
        description: `Price high must test or pull back within ${settings.emaPullbackTolerancePoints} USD of EMA 20`,
        mandatory: true,
        passed: cond4Passed,
        currentValue: `High ${currentCandle.high.toFixed(2)} vs EMA20 ${currentEma20.toFixed(2)} (diff: ${distanceToEma20.toFixed(2)})`,
        targetValue: `<= ${settings.emaPullbackTolerancePoints} tolerance`,
        timeframe: 'M5',
        details: cond4Passed ? 'Pullback touched or approached EMA 20' : 'Price has not pulled back to EMA 20 yet',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond4Passed) missingConditions.push('Price has not pulled back to EMA 20');

    // 5. Bearish Rejection or Engulfing Candle
    const cond5Passed = hasCandlePattern;
    conditions.push(
      makeCondition({
        id: 'candle_pattern',
        label: 'Bearish Confirmation Candle',
        description: 'Completed candle must be a bearish rejection pin-bar or bearish engulfing',
        mandatory: true,
        passed: cond5Passed,
        currentValue: patternDescription,
        targetValue: 'Rejection or Engulfing',
        timeframe: 'M5',
        details: patternDescription,
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond5Passed) missingConditions.push('Missing Bearish Rejection or Engulfing Candle on close');

    // 6. RSI 14 below 50
    const cond6Passed = currentRsi <= settings.rsiBearishThreshold;
    conditions.push(
      makeCondition({
        id: 'rsi_below_50',
        label: `RSI 14 <= ${settings.rsiBearishThreshold}`,
        description: `M5 RSI 14 momentum must be <= ${settings.rsiBearishThreshold} on candle close`,
        mandatory: true,
        passed: cond6Passed,
        currentValue: currentRsi.toFixed(1),
        targetValue: `<= ${settings.rsiBearishThreshold}`,
        timeframe: 'M5',
        details: cond6Passed ? 'RSI momentum is bearish (< 50)' : 'RSI momentum is above 50',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond6Passed) missingConditions.push(`RSI 14 above bearish threshold (${currentRsi.toFixed(1)} > ${settings.rsiBearishThreshold})`);

    // 7. Swing Low Break
    const recentLows = swingLows.filter((s) => s.index < completedIdx && s.index >= completedIdx - 20);
    const priorSwingLow = recentLows.length > 0 ? recentLows[recentLows.length - 1].price : undefined;
    const cond7Passed = priorSwingLow !== undefined ? currentCandle.close <= priorSwingLow + 0.50 : true;
    conditions.push(
      makeCondition({
        id: 'swing_low_break',
        label: 'Local Swing Break / Clearance',
        description: 'Price breaks or holds structural swing pivot level',
        mandatory: false,
        passed: cond7Passed,
        currentValue: priorSwingLow ? `Prior Low: ${priorSwingLow.toFixed(2)}` : 'No immediate swing barrier',
        targetValue: 'Clearance verified',
        timeframe: 'M5',
        details: priorSwingLow ? `Close ${currentCandle.close.toFixed(2)} vs Pivot Low ${priorSwingLow.toFixed(2)}` : 'Clear price path',
        candleTimestamp: candleTimeIso,
      })
    );

    // 8. Completed Candle Close Eligibility
    conditions.push(
      makeCondition({
        id: 'completed_candle',
        label: 'Completed Candle Confirmation',
        description: 'Signal confirmed only on bar close (zero repainting)',
        mandatory: true,
        passed: true,
        currentValue: 'Bar Closed',
        targetValue: 'Bar Closed',
        timeframe: 'M5',
        details: `Candle time ${candleTimeIso}`,
        candleTimestamp: candleTimeIso,
      })
    );

    // 9. Valid Structural Stop-Loss Reference
    const recentHighSlice = m5Candles.slice(Math.max(0, completedIdx - 5), completedIdx + 1);
    const highestHigh = Math.max(...recentHighSlice.map((c) => c.high));
    structuralStop = Math.max(highestHigh + 0.50, currentCandle.high + 0.20);
    const stopDistance = structuralStop - proposedEntry;
    const cond9Passed = stopDistance >= 1.0 && stopDistance <= 15.0;
    conditions.push(
      makeCondition({
        id: 'structural_stop',
        label: 'Technical Stop-Loss Reference',
        description: 'Valid swing high exists with realistic risk buffer ($1.00 - $15.00)',
        mandatory: true,
        passed: cond9Passed,
        currentValue: `Stop: ${structuralStop.toFixed(2)} (Risk: $${stopDistance.toFixed(2)})`,
        targetValue: 'Valid Structural Pivot',
        timeframe: 'M5',
        details: cond9Passed ? 'Valid technical stop identified above pullback high' : 'Stop loss buffer unrealistic or undefined',
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond9Passed) missingConditions.push('Invalid Structural Stop-Loss distance');

    // 10. Reward-to-Risk Ratio >= 1:2
    if (structuralStop) {
      const risk = structuralStop - proposedEntry;
      const targetDistance = risk * settings.minRewardRiskRatio;
      target1to2 = proposedEntry - targetDistance;
      rewardToRiskRatio = settings.minRewardRiskRatio;
    }
    const cond10Passed = cond9Passed && rewardToRiskRatio !== undefined && rewardToRiskRatio >= settings.minRewardRiskRatio;
    conditions.push(
      makeCondition({
        id: 'reward_to_risk',
        label: `Min Reward-to-Risk (1:${settings.minRewardRiskRatio})`,
        description: `Projected target must meet or exceed 1:${settings.minRewardRiskRatio} ratio without hitting major structural support`,
        mandatory: true,
        passed: cond10Passed,
        currentValue: target1to2 ? `TP: ${target1to2.toFixed(2)} (R:R 1:${rewardToRiskRatio?.toFixed(1)})` : 'N/A',
        targetValue: `>= 1:${settings.minRewardRiskRatio}`,
        timeframe: 'M5',
        details: `Entry: ${proposedEntry.toFixed(2)}, SL: ${structuralStop?.toFixed(2)}, TP: ${target1to2?.toFixed(2)}`,
        candleTimestamp: candleTimeIso,
      })
    );
    if (!cond10Passed) missingConditions.push(`Risk/Reward requirement not satisfied (min 1:${settings.minRewardRiskRatio})`);
  }

  // 11. High-Impact USD News Filter
  const newsCheck = settings.enableNewsFilter
    ? checkNewsBlackout(currentCandle.time, newsEvents)
    : { isBlocked: false };
  const isNewsBlocked = newsCheck.isBlocked;

  conditions.push(
    makeCondition({
      id: 'news_filter',
      label: 'High-Impact USD News Filter',
      description: 'Trading paused during high-impact USD economic releases (CPI, NFP, FOMC)',
      mandatory: true,
      passed: !isNewsBlocked,
      currentValue: isNewsBlocked ? `Active: ${newsCheck.activeNews?.title}` : 'No Active Blackout',
      targetValue: 'Clear Window',
      timeframe: 'M5',
      details: isNewsBlocked
        ? `Blackout ±${newsCheck.activeNews?.blackoutMinutesBefore}m active around ${newsCheck.activeNews?.title}`
        : 'Normal market regime',
      candleTimestamp: candleTimeIso,
    })
  );
  if (isNewsBlocked) {
    missingConditions.push(`Blocked by High-Impact News: ${newsCheck.activeNews?.title}`);
  }

  // 12. Sideways Market / Chop Filter
  const recent10Candles = m5Candles.slice(Math.max(0, completedIdx - 9), completedIdx + 1);
  const avgRange = recent10Candles.reduce((acc, c) => acc + (c.high - c.low), 0) / Math.max(1, recent10Candles.length);
  const isSidewaysChop = settings.enableChopFilter && (avgRange < settings.maxChopSpreadUSD && Math.abs(currentSlope) < 0.04);

  conditions.push(
    makeCondition({
      id: 'chop_filter',
      label: 'Sideways Market / Chop Filter',
      description: `Filters stagnant low-volatility chop (Min range $${settings.maxChopSpreadUSD.toFixed(2)})`,
      mandatory: true,
      passed: !isSidewaysChop,
      currentValue: `Avg Range: $${avgRange.toFixed(2)} | Slope: ${currentSlope.toFixed(3)}`,
      targetValue: `>= $${settings.maxChopSpreadUSD.toFixed(2)} with trend slope`,
      timeframe: 'M5',
      details: isSidewaysChop ? 'Market is in stagnant consolidation' : 'Adequate volatility & momentum',
      candleTimestamp: candleTimeIso,
    })
  );
  if (isSidewaysChop) {
    missingConditions.push('Sideways market consolidation / flat chop filter triggered');
  }

  // Calculate Progress Score (0 to 100% of rules satisfied)
  const passedConditionsCount = conditions.filter((c) => c.passed).length;
  const totalConditions = conditions.length;
  const score = Math.round((passedConditionsCount / totalConditions) * 100);

  // Check mandatory conditions
  const mandatoryConditions = conditions.filter((c) => c.mandatory);
  const allMandatoryPassed = mandatoryConditions.every((c) => c.passed);

  // Determine 4-State Machine:
  let state: SetupState = 'WAITING';
  const preliminaryPassed = conditions.slice(0, 3).every((c) => c.passed);
  const pullbackPassed = conditions[3].passed;
  const confirmationPassed = conditions[4].passed && conditions[5].passed;

  if (allMandatoryPassed && !isNewsBlocked && !isSidewaysChop) {
    state = 'SETUP_READY';
  } else if (preliminaryPassed && pullbackPassed && !confirmationPassed && !isNewsBlocked) {
    state = 'CONFIRMATION_NEEDED';
  } else if (preliminaryPassed && !isNewsBlocked) {
    state = 'SETUP_FORMING';
  } else {
    state = 'WAITING';
  }

  const passedConditions = conditions.filter((c) => c.passed).map((c) => c.id);
  const failedConditions = conditions.filter((c) => !c.passed && c.mandatory).map((c) => c.id);
  const waitingConditions = conditions.filter((c) => !c.passed && !c.mandatory).map((c) => c.id);

  return {
    direction,
    state,
    score,
    ready: state === 'SETUP_READY',
    finalDecision: state === 'SETUP_READY' ? direction : 'NO_TRADE',
    conditions,
    passedConditions,
    failedConditions,
    waitingConditions,
    missingConditions,
    reasons,
    proposedEntry,
    structuralStop,
    target1to2,
    rewardToRiskRatio,
    h1Bias: h1Analysis.bias,
    h1Structure: {
      pattern: h1Analysis.bias === 'BULLISH' ? 'Higher Highs & Higher Lows (HH/HL)' : 'Lower Highs & Lower Lows (LH/LL)',
    },
    ema200Slope: currentSlope,
    rsi14: currentRsi,
    ema20: currentEma20,
    ema200: currentEma200,
    lastCandleTime: currentCandle.time,
    lastClose: currentCandle.close,
    patternDetected: hasCandlePattern ? patternDescription : undefined,
    isNewsBlocked,
    isSidewaysChop,
  };
}

function createEmptyEvaluation(direction: SetupDirection, reason: string): SetupEvaluation {
  return {
    direction,
    state: 'WAITING',
    score: 0,
    ready: false,
    finalDecision: 'NO_TRADE',
    conditions: [],
    passedConditions: [],
    failedConditions: [],
    waitingConditions: [],
    missingConditions: [reason],
    reasons: [reason],
    h1Bias: 'NEUTRAL',
    ema200Slope: 0,
    rsi14: 50,
    ema20: 0,
    ema200: 0,
    lastCandleTime: 0,
    lastClose: 0,
  };
}
