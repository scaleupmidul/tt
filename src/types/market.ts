export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
}

export type Timeframe = 'M5' | 'H1';

export type SetupDirection = 'BUY' | 'SELL';

export type SetupState = 'WAITING' | 'SETUP_FORMING' | 'CONFIRMATION_NEEDED' | 'SETUP_READY';

export type ConditionStatus = 'PASS' | 'FAIL' | 'WAITING';

export interface StrategyCondition {
  id: string;
  label: string;
  description: string;
  mandatory: boolean;
  status: ConditionStatus; // 'PASS' | 'FAIL' | 'WAITING'
  passed: boolean;
  blocked?: boolean;
  measuredValue?: string | number;
  currentValue?: string | number;
  targetValue?: string | number;
  timeframe: 'M5' | 'H1';
  candleTimestamp?: string;
  explanation: string;
  details?: string;
}

export interface SetupEvaluation {
  direction: SetupDirection;
  state: SetupState;
  score: number; // 0 to 100 rule completion percentage
  ready: boolean;
  finalDecision: 'BUY' | 'SELL' | 'NO_TRADE';
  conditions: StrategyCondition[];
  passedConditions: string[];
  failedConditions: string[];
  waitingConditions: string[];
  missingConditions: string[];
  reasons: string[];
  proposedEntry?: number;
  structuralStop?: number;
  target1to2?: number;
  riskAmountUSD?: number;
  rewardToRiskRatio?: number;
  h1Bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  h1Structure?: {
    pattern: string; // 'Higher Highs & Higher Lows (HH/HL)' or 'Lower Highs & Lower Lows (LH/LL)'
    lastHigh?: number;
    lastLow?: number;
  };
  ema200Slope: number; // in points per bar
  rsi14: number;
  ema20: number;
  ema200: number;
  currentSpreadPoints?: number;
  chaseExceeded?: boolean;
  lastCandleTime: number;
  lastClose: number;
  patternDetected?: string;
  isNewsBlocked?: boolean;
  isSidewaysChop?: boolean;
}

export interface DiagnosticCheck {
  id: string;
  name: string;
  description: string;
  status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL' | 'WARN';
  details?: string;
  errorMessage?: string;
}

export interface SymbolInfo {
  name: string;
  description: string;
  digits: number;
  spread: number;
  visible?: boolean;
  contractSize?: number;
}

export interface AccountInfo {
  login: number;
  maskedLogin: string;
  server: string;
  company: string;
  tradeMode: 'DEMO' | 'REAL';
  currency: string;
  balance: number;
  equity?: number;
  leverage?: number;
  freeMargin?: number;
}

export interface TerminalInfo {
  connected: boolean;
  path?: string;
  name: string;
  build: number;
}

export interface Position {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  openTime: string;
}

export interface ConnectorStatus {
  online: boolean;
  feedStatus: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'DEMO' | 'STALE' | 'LIVE';
  mode: 'REAL_MT5' | 'SYNTHETIC_MOCK';
  port: number;
  selectedSymbol: string;
  lastPing: number;
  latencyMs: number;
  lastTickTime?: string;
  lastUpdateTime?: string;
  terminal?: TerminalInfo;
  account?: AccountInfo;
  availableSymbols: SymbolInfo[];
  lastError?: string;
}

export interface AlertItem {
  id: string;
  timestamp: string;
  symbol: string;
  direction: SetupDirection;
  state: SetupState;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rrRatio: number;
  h1Bias: string;
  rsi: number;
  ema20: number;
  ema200: number;
  pattern: string;
  passedConditionsCount: number;
  totalConditionsCount: number;
}

export interface NewsEvent {
  id: string;
  title: string;
  timeUTC: string;
  blackoutMinutesBefore: number; // default 15 mins (Prompt Section 3)
  blackoutMinutesAfter: number;  // default 15 mins (Prompt Section 3)
  active: boolean;
}

export interface TradingSettings {
  signalOnlyMode: boolean; // default true
  liveTradingEnabled: boolean; // default false
  maxRiskPerTradePercent: number; // default 1.0% (Prompt Section 4)
  maxSpreadPoints: number; // default 35 points ($0.35)
  maxEntryChasingUSD: number; // default $1.50 from confirmation close
  maxDailyLossPercent: number; // default 3.0%
  dailyLossReached: boolean;
  consecutiveLosses: number; // circuit breaker at 2 consecutive full stop losses
  circuitBreakerActive: boolean;
  emergencyKillSwitch: boolean;
  defaultLotSize: number; // e.g. 0.01
  autoLotSizing: boolean; // true = risk 1% calculation
}

export interface StrategySettings {
  emaFastPeriod: number; // default 20
  emaSlowPeriod: number; // default 200
  emaSlopeLookback: number; // default 10 bars
  emaSlopeMinPoints: number; // default 0.10 points per bar
  emaPullbackTolerancePoints: number; // default 2.50 points
  rejectionWickMinRatio: number; // default 0.50 (50% of candle range)
  rsiPeriod: number; // default 14
  rsiBullishThreshold: number; // default 50.0
  rsiBearishThreshold: number; // default 50.0
  minRewardRiskRatio: number; // default 2.0 (1:2)
  swingLookbackBars: number; // default 5 bars
  alertCooldownMinutes: number; // default 15 mins
  soundAlertsEnabled: boolean;
  desktopAlertsEnabled: boolean;
  enableNewsFilter: boolean;
  newsBlackoutMinutes: number; // default 15
  enableChopFilter: boolean;
  maxChopSpreadUSD: number; // default 1.20
  maxSpreadPoints: number; // default 35 points ($0.35)
  connectorUrl: string; // default http://127.0.0.1:8765
}

export interface TradeOrderRequest {
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  entryPrice?: number;
  stopLoss: number;
  takeProfit: number;
  comment?: string;
  riskAmountUSD: number;
  riskPercent: number;
}

export interface TradeOrderResult {
  success: boolean;
  ticket?: number;
  price?: number;
  retcode?: number;
  comment?: string;
  executionMs?: number;
  error?: string;
}

export interface UnitTestResult {
  name: string;
  category: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

export type SignalVerificationStatus = 
  | 'VERIFIED'
  | 'REJECTED_FAIL_CLOSED'
  | 'MISMATCH_WARNING'
  | 'DUPLICATE_BLOCKED'
  | 'WAITING_CANDLE_CLOSE';

export interface GateCheckResult {
  id: string;
  name: string;
  mandatory: boolean;
  passed: boolean;
  details: string;
  measuredValue?: string | number;
  threshold?: string | number;
}

export interface ToleranceMetrics {
  ema20Delta: number;
  ema200Delta: number;
  rsiDelta: number;
  maxEmaTolerance: number;
  maxRsiTolerance: number;
  withinTolerance: boolean;
  mismatchDescription?: string;
}

export interface SignalIntegrityRecord {
  id: string;
  timestamp: string;
  candleTime: number; // Closed candle Unix timestamp
  candleTimeIso: string;
  symbol: string;
  direction: SetupDirection;
  eaDecision: 'BUY' | 'SELL' | 'NO_TRADE' | 'WAITING';
  validatorDecision: 'BUY' | 'SELL' | 'NO_TRADE' | 'WAITING';
  consensusReached: boolean;
  verificationStatus: SignalVerificationStatus;
  integrityHash: string;
  rejectionReason?: string;
  strategyVersion: string;
  tolerances: ToleranceMetrics;
  gates: GateCheckResult[];
  proposedEntry: number;
  stopLoss: number;
  takeProfit: number;
  rewardToRiskRatio: number;
  eaIndicators: {
    ema20: number;
    ema200: number;
    rsi14: number;
    close: number;
  };
  validatorIndicators: {
    ema20: number;
    ema200: number;
    rsi14: number;
    close: number;
  };
}

