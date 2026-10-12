//+------------------------------------------------------------------+
//|                                     GEP5_Strategy_Engine.mq5     |
//|               GEP-5 Gold Setup Detection System Expert Advisor   |
//|                          Author: GEP-5 Engineering Team          |
//|                                   Version: 1.0.0 (Strict)        |
//+------------------------------------------------------------------+
#property copyright   "GEP-5 Engineering Team"
#property link        "https://gep5.trading"
#property version     "1.00"
#property description "Authoritative GEP-5 Strategy Engine for MetaTrader 5"
#property description "Validates M5 Gold setups, H1 trend alignment, EMA 20/200, RSI 14,"
#property description "closed-candle confirmation, structural SL, and 1:2 Risk-to-Reward."
#property strict

//--- Input Parameters
input group "=== GEP-5 Strategy Parameters ==="
input int      InpEmaFastPeriod       = 20;       // Fast EMA Period (M5)
input int      InpEmaSlowPeriod       = 200;      // Slow EMA Period (M5)
input int      InpRsiPeriod           = 14;       // RSI Period (M5)
input double   InpRsiBullishThreshold = 50.0;     // RSI Bullish Threshold
input double   InpRsiBearishThreshold = 50.0;     // RSI Bearish Threshold
input double   InpRejectionWickRatio  = 0.50;     // Rejection Wick Min Ratio (50%)
input double   InpMinRewardRiskRatio  = 2.00;     // Minimum Target R:R (1:2.0)
input int      InpSwingLookbackBars   = 5;        // Structural Swing Lookback

input group "=== Risk & Execution Filters ==="
input bool     InpSignalOnlyMode      = true;     // Signal-Only Mode (No auto-trading)
input double   InpMaxRiskPercent      = 1.00;     // Maximum Risk per Trade (%)
input int      InpMaxSpreadPoints     = 35;       // Maximum Allowed Spread (points)
input double   InpMaxEntryChaseUSD    = 1.50;     // Max Entry Chasing Distance ($)

input group "=== Data Integration & JSON Export ==="
input bool     InpExportJsonFile      = true;     // Export JSON file to MQL5/Files
input string   InpJsonFileName        = "gep5_live_signal.json"; // Output File Name
input bool     InpSendWebRequest      = false;    // Push via WebRequest (Optional)
input string   InpWebHookUrl          = "http://127.0.0.1:8765/api/ea/signal";

//--- Indicator Handles
int hEma20  = INVALID_HANDLE;
int hEma200 = INVALID_HANDLE;
int hRsi    = INVALID_HANDLE;

//--- Global State
datetime lastEvaluatedBarTime = 0;
string   lastSignalHash       = "";

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   PrintFormat("[GEP-5 EA] Initializing on %s %s...", _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period));

   // Create indicator handles on M5 timeframe
   hEma20 = iMA(_Symbol, PERIOD_M5, InpEmaFastPeriod, 0, MODE_EMA, PRICE_CLOSE);
   if(hEma20 == INVALID_HANDLE)
   {
      Print("[GEP-5 EA ERROR] Failed to create EMA 20 handle");
      return INIT_FAILED;
   }

   hEma200 = iMA(_Symbol, PERIOD_M5, InpEmaSlowPeriod, 0, MODE_EMA, PRICE_CLOSE);
   if(hEma200 == INVALID_HANDLE)
   {
      Print("[GEP-5 EA ERROR] Failed to create EMA 200 handle");
      return INIT_FAILED;
   }

   hRsi = iRSI(_Symbol, PERIOD_M5, InpRsiPeriod, PRICE_CLOSE);
   if(hRsi == INVALID_HANDLE)
   {
      Print("[GEP-5 EA ERROR] Failed to create RSI handle");
      return INIT_FAILED;
   }

   Print("[GEP-5 EA] Handles created successfully. Signal-Only Mode: ", InpSignalOnlyMode ? "ACTIVE" : "DISABLED");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(hEma20 != INVALID_HANDLE)  IndicatorRelease(hEma20);
   if(hEma200 != INVALID_HANDLE) IndicatorRelease(hEma200);
   if(hRsi != INVALID_HANDLE)    IndicatorRelease(hRsi);
   PrintFormat("[GEP-5 EA] Deinitialized. Reason: %d", reason);
}

//+------------------------------------------------------------------+
//| Determine Higher Timeframe (H1) Directional Trend                |
//+------------------------------------------------------------------+
string GetH1Trend()
{
   MqlRates h1Rates[];
   ArraySetAsSeries(h1Rates, true);
   int copied = CopyRates(_Symbol, PERIOD_H1, 1, 20, h1Rates);
   if(copied < 10) return "NEUTRAL";

   // Deterministic swing analysis on H1
   double h1_close1 = h1Rates[0].close;
   double h1_close5 = h1Rates[4].close;
   double h1_close10 = h1Rates[9].close;

   if(h1_close1 > h1_close5 && h1_close5 > h1_close10) return "BULLISH";
   if(h1_close1 < h1_close5 && h1_close5 < h1_close10) return "BEARISH";
   return "NEUTRAL";
}

//+------------------------------------------------------------------+
//| Detect Pin-Bar Rejection on Closed Bar 1                         |
//+------------------------------------------------------------------+
bool IsRejectionCandle(MqlRates &bar, string dir, double minWickRatio, double &outWickRatio)
{
   double range = bar.high - bar.low;
   if(range <= 0.0001) return false;

   if(dir == "BUY")
   {
      double lowerWick = MathMin(bar.open, bar.close) - bar.low;
      outWickRatio = lowerWick / range;
      return (outWickRatio >= minWickRatio && bar.close >= (bar.low + range * 0.50));
   }
   else if(dir == "SELL")
   {
      double upperWick = bar.high - MathMax(bar.open, bar.close);
      outWickRatio = upperWick / range;
      return (outWickRatio >= minWickRatio && bar.close <= (bar.low + range * 0.50));
   }
   return false;
}

//+------------------------------------------------------------------+
//| Detect Bullish/Bearish Engulfing on Closed Bar 1 vs Bar 2        |
//+------------------------------------------------------------------+
bool IsEngulfingCandle(MqlRates &curr, MqlRates &prev, string dir)
{
   if(dir == "BUY")
   {
      bool prevBearish = prev.close < prev.open;
      bool currBullish = curr.close > curr.open;
      return (prevBearish && currBullish && curr.close > prev.open && curr.open <= prev.close);
   }
   else if(dir == "SELL")
   {
      bool prevBullish = prev.close > prev.open;
      bool currBearish = curr.close < curr.open;
      return (prevBullish && currBearish && curr.close < prev.open && curr.open >= prev.close);
   }
   return false;
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Strictly evaluate on NEW closed M5 candle to prevent repaint
   datetime currentBarTime = iTime(_Symbol, PERIOD_M5, 0);
   if(currentBarTime == lastEvaluatedBarTime)
   {
      return; // Bar 0 is still in progress; wait for bar close
   }
   lastEvaluatedBarTime = currentBarTime;

   // Read closed candle rates (bar index 1 is last fully completed candle)
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M5, 1, InpSwingLookbackBars + 5, rates);
   if(copied < InpSwingLookbackBars + 2)
   {
      Print("[GEP-5 EA] Insufficient rates available for evaluation");
      return;
   }

   MqlRates closedBar = rates[0]; // Bar 1 in normal index
   MqlRates prevBar   = rates[1]; // Bar 2 in normal index

   // Read Indicators on closed bar (index 1)
   double bufEma20[], bufEma200[], bufRsi[];
   ArraySetAsSeries(bufEma20, true);
   ArraySetAsSeries(bufEma200, true);
   ArraySetAsSeries(bufRsi, true);

   if(CopyBuffer(hEma20, 0, 1, 12, bufEma20) < 12 ||
      CopyBuffer(hEma200, 0, 1, 12, bufEma200) < 12 ||
      CopyBuffer(hRsi, 0, 1, 5, bufRsi) < 2)
   {
      Print("[GEP-5 EA] Failed to copy indicator buffers for closed bar");
      return;
   }

   double ema20 = bufEma20[0];
   double ema200 = bufEma200[0];
   double rsi = bufRsi[0];
   double ema200Slope = (bufEma200[0] - bufEma200[10]) / 10.0;

   // Read live spread
   MqlTick tick;
   SymbolInfoTick(_Symbol, tick);
   int currentSpread = (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);

   // Check spread filter
   bool spreadOk = (currentSpread <= InpMaxSpreadPoints);

   // H1 Trend
   string h1Trend = GetH1Trend();

   // --- Evaluate GEP-5 BUY ---
   bool buyH1Pass       = (h1Trend == "BULLISH");
   bool buyEma200Pass   = (closedBar.close > ema200);
   bool buyPullbackPass = (MathAbs(closedBar.low - ema20) <= 2.50 || (closedBar.low <= ema20 && closedBar.close >= ema20));
   double buyWick = 0;
   bool buyPatternPass  = IsRejectionCandle(closedBar, "BUY", InpRejectionWickRatio, buyWick) || IsEngulfingCandle(closedBar, prevBar, "BUY");
   bool buyRsiPass      = (rsi >= InpRsiBullishThreshold);

   // --- Evaluate GEP-5 SELL ---
   bool sellH1Pass       = (h1Trend == "BEARISH");
   bool sellEma200Pass   = (closedBar.close < ema200);
   bool sellPullbackPass = (MathAbs(closedBar.high - ema20) <= 2.50 || (closedBar.high >= ema20 && closedBar.close <= ema20));
   double sellWick = 0;
   bool sellPatternPass  = IsRejectionCandle(closedBar, "SELL", InpRejectionWickRatio, sellWick) || IsEngulfingCandle(closedBar, prevBar, "SELL");
   bool sellRsiPass      = (rsi <= InpRsiBearishThreshold);

   string finalDecision = "NO_TRADE";
   string signalDir     = "NONE";
   double entryPrice    = closedBar.close;
   double stopLoss      = 0;
   double takeProfit    = 0;

   // Find structural swing high/low of last N bars
   double swingLow = rates[0].low;
   double swingHigh = rates[0].high;
   for(int i = 0; i < InpSwingLookbackBars; i++)
   {
      if(rates[i].low < swingLow)   swingLow = rates[i].low;
      if(rates[i].high > swingHigh) swingHigh = rates[i].high;
   }

   if(spreadOk && buyH1Pass && buyEma200Pass && buyPullbackPass && buyPatternPass && buyRsiPass)
   {
      finalDecision = "BUY";
      signalDir     = "BUY";
      stopLoss      = swingLow - 0.50; // Buffer below swing low
      double risk   = entryPrice - stopLoss;
      takeProfit    = entryPrice + (risk * InpMinRewardRiskRatio);
   }
   else if(spreadOk && sellH1Pass && sellEma200Pass && sellPullbackPass && sellPatternPass && sellRsiPass)
   {
      finalDecision = "SELL";
      signalDir     = "SELL";
      stopLoss      = swingHigh + 0.50; // Buffer above swing high
      double risk   = stopLoss - entryPrice;
      takeProfit    = entryPrice - (risk * InpMinRewardRiskRatio);
   }

   // Format JSON Export
   string json = StringFormat(
      "{\n"
      "  \"strategy\": \"GEP-5\",\n"
      "  \"version\": \"1.0.0-STRICT\",\n"
      "  \"symbol\": \"%s\",\n"
      "  \"closed_bar_time\": %d,\n"
      "  \"closed_bar_iso\": \"%s\",\n"
      "  \"decision\": \"%s\",\n"
      "  \"direction\": \"%s\",\n"
      "  \"spread_points\": %d,\n"
      "  \"indicators\": {\n"
      "    \"close\": %.2f,\n"
      "    \"ema20\": %.2f,\n"
      "    \"ema200\": %.2f,\n"
      "    \"rsi14\": %.2f,\n"
      "    \"ema200_slope\": %.4f\n"
      "  },\n"
      "  \"h1_trend\": \"%s\",\n"
      "  \"trade_levels\": {\n"
      "    \"entry\": %.2f,\n"
      "    \"stop_loss\": %.2f,\n"
      "    \"take_profit\": %.2f,\n"
      "    \"rr_ratio\": %.2f\n"
      "  },\n"
      "  \"signal_only\": %s\n"
      "}",
      _Symbol,
      (int)closedBar.time,
      TimeToString(closedBar.time, TIME_DATE|TIME_SECONDS),
      finalDecision,
      signalDir,
      currentSpread,
      closedBar.close,
      ema20,
      ema200,
      rsi,
      ema200Slope,
      h1Trend,
      entryPrice,
      stopLoss,
      takeProfit,
      InpMinRewardRiskRatio,
      InpSignalOnlyMode ? "true" : "false"
   );

   // Export JSON file if enabled
   if(InpExportJsonFile)
   {
      int fileHandle = FileOpen(InpJsonFileName, FILE_WRITE|FILE_TXT|FILE_ANSI);
      if(fileHandle != INVALID_HANDLE)
      {
         FileWriteString(fileHandle, json);
         FileClose(fileHandle);
      }
   }

   // Log status to MetaTrader 5 terminal
   if(finalDecision != "NO_TRADE")
   {
      PrintFormat("[GEP-5 CONFIRMED SIGNAL] %s @ %.2f | SL: %.2f | TP: %.2f | R:R 1:%.1f | Spread: %d",
         finalDecision, entryPrice, stopLoss, takeProfit, InpMinRewardRiskRatio, currentSpread);
   }
}
//+------------------------------------------------------------------+
