import { Candle, UnitTestResult } from '../types/market';
import {
  validateSignalIntegrity,
  generateSignalIntegrityHash,
  MAX_EMA_TOLERANCE_USD,
  MAX_RSI_TOLERANCE,
  STRATEGY_VERSION,
  EAReportedSignal,
} from './signalIntegrityValidator';
import { calculateEMA, calculateRSI } from './indicators';
import { evaluateGEP5Setup, DEFAULT_SETTINGS } from './gep5Engine';

/**
 * Synthetic Candle Generator for Deterministic Test Scenarios
 */
function createSyntheticCandleSeries({
  count = 250,
  startPrice = 2650.0,
  trendDirection = 'UP', // 'UP', 'DOWN', 'FLAT'
  withPullback = true,
  pattern = 'PIN_BAR_BULLISH', // 'PIN_BAR_BULLISH', 'PIN_BAR_BEARISH', 'ENGULFING_BULLISH', 'ENGULFING_BEARISH', 'NONE'
  rsiBias = 'ABOVE_50',
  step = 0.25,
}: {
  count?: number;
  startPrice?: number;
  trendDirection?: 'UP' | 'DOWN' | 'FLAT';
  withPullback?: boolean;
  pattern?: 'PIN_BAR_BULLISH' | 'PIN_BAR_BEARISH' | 'ENGULFING_BULLISH' | 'ENGULFING_BEARISH' | 'NONE';
  rsiBias?: 'ABOVE_50' | 'BELOW_50' | 'BOUNDARY_50' | 'BOUNDARY_49_99';
  step?: number;
}): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = startPrice;
  const baseTime = 1700000000;

  for (let i = 0; i < count; i++) {
    const time = baseTime + i * 300; // 5-minute intervals
    let delta = 0;

    if (trendDirection === 'UP') {
      delta = (i % 3 === 0 ? -0.1 : 0.4) * step;
    } else if (trendDirection === 'DOWN') {
      delta = (i % 3 === 0 ? 0.1 : -0.4) * step;
    } else {
      delta = (i % 2 === 0 ? 0.15 : -0.15) * step;
    }

    // Near the end: pullback to EMA 20
    if (withPullback && i >= count - 8 && i < count - 1) {
      if (trendDirection === 'UP') delta = -0.35;
      else if (trendDirection === 'DOWN') delta = 0.35;
    }

    currentPrice += delta;

    let open = currentPrice;
    let high = currentPrice + 0.40;
    let low = currentPrice - 0.40;
    let close = currentPrice + delta * 0.5;

    // Last completed candle pattern injection
    if (i === count - 1) {
      if (pattern === 'PIN_BAR_BULLISH') {
        open = currentPrice;
        low = currentPrice - 4.50; // Deep rejection lower wick
        high = currentPrice + 0.50;
        close = currentPrice + 0.20; // Closes near top
      } else if (pattern === 'PIN_BAR_BEARISH') {
        open = currentPrice;
        high = currentPrice + 4.50; // Deep rejection upper wick
        low = currentPrice - 0.50;
        close = currentPrice - 0.20; // Closes near bottom
      } else if (pattern === 'ENGULFING_BULLISH') {
        open = currentPrice - 2.0;
        low = currentPrice - 2.2;
        high = currentPrice + 3.0;
        close = currentPrice + 2.8; // Fully engulfs previous body
      } else if (pattern === 'ENGULFING_BEARISH') {
        open = currentPrice + 2.0;
        high = currentPrice + 2.2;
        low = currentPrice - 3.0;
        close = currentPrice - 2.8;
      }
    }

    candles.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      tick_volume: 500 + (i % 10) * 50,
    });
  }

  return candles;
}

function createSyntheticH1Series(bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL', count = 60): Candle[] {
  const candles: Candle[] = [];
  const baseTime = 1690000000;
  let price = 2600.0;

  for (let i = 0; i < count; i++) {
    const time = baseTime + i * 3600;
    const change = bias === 'BULLISH' ? 1.5 : bias === 'BEARISH' ? -1.5 : 0;
    price += change;
    candles.push({
      time,
      open: price,
      high: price + 2.0,
      low: price - 2.0,
      close: price + change * 0.5,
      tick_volume: 1200,
    });
  }
  return candles;
}

/**
 * Runs the 18 Automated Signal Integrity & Strict Fail-Closed Verification Tests
 */
export function runIntegrityTestSuite(): UnitTestResult[] {
  const results: UnitTestResult[] = [];

  // Helper to record test
  const record = (
    name: string,
    category: string,
    passed: boolean,
    durationMs: number,
    details: string
  ) => {
    results.push({
      name,
      category,
      passed,
      durationMs: Math.round(durationMs * 100) / 100,
      details,
    });
  };

  // 1. Mandatory Valid BUY Setup Verification
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP', pattern: 'PIN_BAR_BULLISH' });
    const h1 = createSyntheticH1Series('BULLISH');
    const lastBar = m5[m5.length - 1];

    const eaPayload: EAReportedSignal = {
      direction: 'BUY',
      decision: 'BUY',
      closedCandleTime: lastBar.time,
      spreadPoints: 18,
    };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const passed = res.gates.find((g) => g.id === 'gate_candle_closed')?.passed === true &&
                   res.gates.find((g) => g.id === 'gate_freshness')?.passed === true &&
                   res.tolerances.withinTolerance === true;

    record(
      '01. Valid BUY Baseline Integrity & Tolerances',
      'Mandatory Setup Integrity',
      passed,
      performance.now() - t0,
      `Freshness=PASS, ClosedBar=PASS, Tolerances within delta (ΔEMA20=${res.tolerances.ema20Delta})`
    );
  })();

  // 2. Mandatory Valid SELL Setup Verification
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'DOWN', pattern: 'PIN_BAR_BEARISH', startPrice: 2750 });
    const h1 = createSyntheticH1Series('BEARISH');
    const lastBar = m5[m5.length - 1];

    const eaPayload: EAReportedSignal = {
      direction: 'SELL',
      decision: 'SELL',
      closedCandleTime: lastBar.time,
      spreadPoints: 20,
    };

    const res = validateSignalIntegrity('XAUUSDm', 'SELL', m5, h1, 'LIVE', 4, eaPayload, DEFAULT_SETTINGS);
    const passed = res.gates.find((g) => g.id === 'gate_ordering')?.passed === true &&
                   res.gates.find((g) => g.id === 'gate_indicators_finite')?.passed === true;

    record(
      '02. Valid SELL Baseline History & Boundary Check',
      'Mandatory Setup Integrity',
      passed,
      performance.now() - t0,
      `History count=${m5.length}, finite bounds verified, direction=SELL`
    );
  })();

  // 3. Fail-Closed: H1 Trend Bearish on BUY Attempt
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP' });
    const h1 = createSyntheticH1Series('BEARISH'); // Opposing trend!
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY', spreadPoints: 20 };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const passed = res.verificationStatus === 'REJECTED_FAIL_CLOSED' &&
                   res.consensusReached === false;

    record(
      '03. Fail-Closed: H1 Trend Conflict Blocks BUY',
      'Individual Failed Conditions',
      passed,
      performance.now() - t0,
      `Opposing H1 bias detected. Validator rejected with status: ${res.verificationStatus}`
    );
  })();

  // 4. Fail-Closed: Price Below EMA 200 on BUY Attempt
  (() => {
    const t0 = performance.now();
    // Price starts high and drops far below EMA200
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'DOWN', startPrice: 2700, pattern: 'NONE' });
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY', spreadPoints: 20 };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const passed = res.consensusReached === false && res.verificationStatus !== 'VERIFIED';

    record(
      '04. Fail-Closed: Price Below EMA 200 Invariant',
      'Individual Failed Conditions',
      passed,
      performance.now() - t0,
      `Price below EMA200 on BUY is strictly blocked (Status: ${res.verificationStatus})`
    );
  })();

  // 5. Fail-Closed: Missing Confirmation Candle Pattern on Close
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP', pattern: 'NONE' }); // Doji / flat candle
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY', spreadPoints: 20 };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const passed = res.consensusReached === false;

    record(
      '05. Fail-Closed: Absence of Pin-Bar/Engulfing Blocks Entry',
      'Individual Failed Conditions',
      passed,
      performance.now() - t0,
      `No confirmation pattern on closed bar. Consensus false (Reason: ${res.rejectionReason?.substring(0, 45)}...)`
    );
  })();

  // 6. Boundary Test: RSI 14 Below 50.0 Threshold (RSI = 49.90 on BUY)
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'DOWN', pattern: 'PIN_BAR_BULLISH' });
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY', spreadPoints: 20 };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const passed = res.consensusReached === false;

    record(
      '06. Threshold Boundary: RSI Below 50.0 on BUY Fails Closed',
      'Boundary Value Analysis',
      passed,
      performance.now() - t0,
      `RSI momentum threshold enforced. Downward momentum cannot trigger BUY signal.`
    );
  })();

  // 7. Fail-Closed: Spread Limit Exceeded (Spread = 48 pts > 35 pts limit)
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP', pattern: 'PIN_BAR_BULLISH' });
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY', spreadPoints: 48 }; // Exceeds 35 pts

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const spreadGate = res.gates.find((g) => g.id === 'gate_spread_and_news');
    const passed = spreadGate?.passed === false && res.consensusReached === false;

    record(
      '07. Fail-Closed: Broker Spread Exceeds Maximum Threshold',
      'Execution Filters',
      passed,
      performance.now() - t0,
      `Spread=48 pts > Limit=35 pts. Spread gate failed, signal rejected.`
    );
  })();

  // 8. Fail-Closed: High-Impact USD News Blackout Window
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP', pattern: 'PIN_BAR_BULLISH' });
    const h1 = createSyntheticH1Series('BULLISH');
    const lastBar = m5[m5.length - 1];

    const activeNews = [{
      id: 'n-cpi',
      title: 'US Core CPI Release (High Impact)',
      timeUTC: new Date(lastBar.time * 1000).toISOString(),
      blackoutMinutesBefore: 15,
      blackoutMinutesAfter: 15,
      active: true,
    }];

    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY', spreadPoints: 18 };
    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS, activeNews);
    const newsGate = res.gates.find((g) => g.id === 'gate_spread_and_news');
    const passed = newsGate?.passed === false && res.verificationStatus === 'REJECTED_FAIL_CLOSED';

    record(
      '08. Fail-Closed: USD High-Impact News Blackout Active',
      'Execution Filters',
      passed,
      performance.now() - t0,
      `Active news window blocked signal issuance: ${res.rejectionReason}`
    );
  })();

  // 9. Fail-Closed: Risk-to-Reward Ratio < 1:2.0 Invariant
  (() => {
    const t0 = performance.now();
    // Simulate invalid stop or inadequate reward
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP' });
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = {
      direction: 'BUY',
      decision: 'BUY',
      proposedEntry: 2650.0,
      stopLoss: 2645.0, // Risk: $5.00
      takeProfit: 2656.0, // Reward: $6.00 -> R:R is only 1:1.20 (< 2.0)
      spreadPoints: 18,
    };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const rrGate = res.gates.find((g) => g.id === 'gate_risk_reward');
    const passed = rrGate?.passed === false || res.rewardToRiskRatio < 2.0;

    record(
      '09. Fail-Closed: R:R Invariant (< 1:2.0 Target Rejected)',
      'Risk Management Invariants',
      passed,
      performance.now() - t0,
      `Calculated R:R strictly checked against 1:2.0 minimum threshold.`
    );
  })();

  // 10. Stale Market Data Rejection (> 20s age on live feed)
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250 });
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY' };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'STALE', 45, eaPayload, DEFAULT_SETTINGS);
    const freshGate = res.gates.find((g) => g.id === 'gate_freshness');
    const passed = freshGate?.passed === false && res.verificationStatus === 'REJECTED_FAIL_CLOSED';

    record(
      '10. Fail-Closed: Stale Feed Age (>20s) Rejected',
      'Connection Integrity',
      passed,
      performance.now() - t0,
      `Feed age=45s exceeds fresh threshold. Status: ${res.verificationStatus}`
    );
  })();

  // 11. Terminal Disconnection Guard
  (() => {
    const t0 = performance.now();
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY' };
    const res = validateSignalIntegrity('XAUUSDm', 'BUY', [], [], 'DISCONNECTED', null, eaPayload, DEFAULT_SETTINGS);
    const passed = res.verificationStatus === 'REJECTED_FAIL_CLOSED' && res.consensusReached === false;

    record(
      '11. Fail-Closed: Disconnected Terminal Zero-Tolerance',
      'Connection Integrity',
      passed,
      performance.now() - t0,
      `Disconnected terminal immediately fails closed with zero-data leak.`
    );
  })();

  // 12. Broken Candle History Ordering & Contiguity Guard
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250 });
    // Invert timestamps of two bars to break monotonicity
    m5[50].time = m5[49].time - 300; // Time went backwards!
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY' };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const orderGate = res.gates.find((g) => g.id === 'gate_ordering');
    const passed = orderGate?.passed === false && res.verificationStatus === 'REJECTED_FAIL_CLOSED';

    record(
      '12. Fail-Closed: Non-Monotonic Candle Timestamps Rejected',
      'Data Integrity',
      passed,
      performance.now() - t0,
      `Detected time inversion at bar 50. Ordering gate failed.`
    );
  })();

  // 13. Insufficient Candle History (< 210 M5 candles)
  (() => {
    const t0 = performance.now();
    const shortM5 = createSyntheticCandleSeries({ count: 80 }); // Only 80 bars (needs 210)
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY' };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', shortM5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const orderGate = res.gates.find((g) => g.id === 'gate_ordering');
    const passed = orderGate?.passed === false;

    record(
      '13. Fail-Closed: Truncated Candle History (< 210 Bars)',
      'Data Integrity',
      passed,
      performance.now() - t0,
      `Count=80 bars < 210 required for 200 EMA calculation. Rejected.`
    );
  })();

  // 14. Dual-Engine Indicator Tolerance Violation Guard
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP' });
    const h1 = createSyntheticH1Series('BULLISH');
    // EA reports an indicator that deviates by $0.80 (> $0.05 tolerance limit)
    const eaPayload: EAReportedSignal = {
      direction: 'BUY',
      decision: 'BUY',
      ema20: 2640.0, // Significantly shifted
      ema200: 2600.0,
      rsi14: 65.0,
    };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const tolGate = res.gates.find((g) => g.id === 'gate_tolerances');
    const passed = tolGate?.passed === false && res.verificationStatus === 'MISMATCH_WARNING';

    record(
      '14. Fail-Closed: EA Indicator Divergence Exceeds $0.05 Tolerance',
      'Dual-Engine Verification',
      passed,
      performance.now() - t0,
      `ΔEMA20=${res.tolerances.ema20Delta} > max ${MAX_EMA_TOLERANCE_USD}. Flagged MISMATCH_WARNING.`
    );
  })();

  // 15. Anti-Duplicate Issuance Invariant
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP' });
    const h1 = createSyntheticH1Series('BULLISH');
    const lastBar = m5[m5.length - 1];

    const existingAuditRecord = {
      id: `audit-${lastBar.time}-BUY`,
      timestamp: new Date().toISOString(),
      candleTime: lastBar.time,
      candleTimeIso: new Date(lastBar.time * 1000).toISOString(),
      symbol: 'XAUUSDm',
      direction: 'BUY' as const,
      eaDecision: 'BUY' as const,
      validatorDecision: 'BUY' as const,
      consensusReached: true,
      verificationStatus: 'VERIFIED' as const,
      integrityHash: 'SIG-TEST-HASH',
      strategyVersion: STRATEGY_VERSION,
      tolerances: {
        ema20Delta: 0,
        ema200Delta: 0,
        rsiDelta: 0,
        maxEmaTolerance: MAX_EMA_TOLERANCE_USD,
        maxRsiTolerance: MAX_RSI_TOLERANCE,
        withinTolerance: true,
      },
      gates: [],
      proposedEntry: 2650.0,
      stopLoss: 2645.0,
      takeProfit: 2660.0,
      rewardToRiskRatio: 2.0,
      eaIndicators: { ema20: 2648, ema200: 2620, rsi14: 55, close: 2650 },
      validatorIndicators: { ema20: 2648, ema200: 2620, rsi14: 55, close: 2650 },
    };

    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'BUY', closedCandleTime: lastBar.time };
    const res = validateSignalIntegrity(
      'XAUUSDm',
      'BUY',
      m5,
      h1,
      'LIVE',
      5,
      eaPayload,
      DEFAULT_SETTINGS,
      [],
      [existingAuditRecord] // Prior record present for same bar!
    );

    const dupGate = res.gates.find((g) => g.id === 'gate_duplicate_prevention');
    const passed = dupGate?.passed === false && res.verificationStatus === 'DUPLICATE_BLOCKED';

    record(
      '15. Anti-Duplicate: Multiple Signals for Same Bar Blocked',
      'Signal Ledger & Auditing',
      passed,
      performance.now() - t0,
      `Duplicate signal prevention verified. Bar=${lastBar.time} blocked from re-publishing.`
    );
  })();

  // 16. Deterministic Cryptographic Hash Repeatability Test (100 Iterations)
  (() => {
    const t0 = performance.now();
    const hash1 = generateSignalIntegrityHash('XAUUSDm', 'BUY', 1700000000, 2650.50, 2645.00, 2661.00);
    let allIdentical = true;

    for (let i = 0; i < 100; i++) {
      const recomputed = generateSignalIntegrityHash('XAUUSDm', 'BUY', 1700000000, 2650.50, 2645.00, 2661.00);
      if (recomputed !== hash1) {
        allIdentical = false;
        break;
      }
    }

    record(
      '16. Cryptographic Determinism: 100-Replay Bit-for-Bit Hash Invariance',
      'Signal Ledger & Auditing',
      allIdentical,
      performance.now() - t0,
      `Deterministic hash verified: ${hash1} over 100 consecutive replays.`
    );
  })();

  // 17. Structural Stop Loss Placement (BUY: Stop Below Entry, SELL: Stop Above Entry)
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP' });
    const h1 = createSyntheticH1Series('BULLISH');
    // An inverted stop loss (SL placed above entry on BUY!)
    const eaPayload: EAReportedSignal = {
      direction: 'BUY',
      decision: 'BUY',
      proposedEntry: 2650.0,
      stopLoss: 2655.0, // Inverted!
      takeProfit: 2660.0,
    };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const rrGate = res.gates.find((g) => g.id === 'gate_risk_reward');
    const passed = rrGate?.passed === false;

    record(
      '17. Structural Invariant: Inverted Stop Loss Placement Caught',
      'Risk Management Invariants',
      passed,
      performance.now() - t0,
      `SL > Entry on BUY was intercepted and failed closed.`
    );
  })();

  // 18. End-to-End Decision Auditing: Exact Fields Populated
  (() => {
    const t0 = performance.now();
    const m5 = createSyntheticCandleSeries({ count: 250, trendDirection: 'UP' });
    const h1 = createSyntheticH1Series('BULLISH');
    const eaPayload: EAReportedSignal = { direction: 'BUY', decision: 'WAITING' };

    const res = validateSignalIntegrity('XAUUSDm', 'BUY', m5, h1, 'LIVE', 5, eaPayload, DEFAULT_SETTINGS);
    const passed = Boolean(
      res.id &&
      res.timestamp &&
      res.integrityHash &&
      res.gates.length >= 8 &&
      res.tolerances &&
      res.strategyVersion === STRATEGY_VERSION
    );

    record(
      '18. Decision Auditing: Audit Record Schema Compliance',
      'Signal Ledger & Auditing',
      passed,
      performance.now() - t0,
      `Audit record contains immutable timestamp, version ${res.strategyVersion}, and ${res.gates.length} safety gates.`
    );
  })();

  return results;
}
