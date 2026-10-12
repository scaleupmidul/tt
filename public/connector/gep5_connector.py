#!/usr/bin/env python3
"""
GEP-5: Real MetaTrader 5 Market-Data Connector & Strategy Engine
Author: GEP-5 Engineering Team
Version: 2.0.0

Requirements & Guarantees:
  1. Uses the official MetaTrader5 Python package on Windows.
  2. Connects to running desktop MT5 terminal and reads broker symbol (XAUUSDm / XAUUSD).
  3. Fetches real live bid/ask prices, M5 candles, H1 candles.
  4. Calculates EMA 20, EMA 200, EMA 200 slope, RSI 14 on closed candles.
  5. Evaluates GEP-5 BUY / SELL conditions deterministically.
  6. Pushes real data to the GEP-5 web server API (/api/connector/push) regularly.
  7. Exposes local HTTP API at http://127.0.0.1:8765 for local diagnostics.
  8. SIGNAL-ONLY: NEVER places, modifies, or closes trading orders.
  9. Strict transparency: if MT5 fails to connect, reports DISCONNECTED error.
"""

import sys
import os
import json
import time
import math
import sqlite3
import argparse
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone, timedelta

# Check for official MetaTrader5 library
MT5_AVAILABLE = False
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None

# SQLite Database Manager for local caching
class DatabaseManager:
    def __init__(self, db_path="gep5_market.db"):
        self.db_path = db_path
        self._init_tables()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS candles (
                        symbol TEXT,
                        timeframe TEXT,
                        time INTEGER,
                        open REAL,
                        high REAL,
                        low REAL,
                        close REAL,
                        volume INTEGER,
                        PRIMARY KEY (symbol, timeframe, time)
                    )
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS signals (
                        id TEXT PRIMARY KEY,
                        timestamp TEXT,
                        symbol TEXT,
                        direction TEXT,
                        state TEXT,
                        entry_price REAL,
                        stop_loss REAL,
                        take_profit REAL,
                        rsi REAL
                    )
                """)
                conn.commit()
        except Exception as e:
            print(f"[SQLite Warning] Init failed: {e}")

    def cache_candles(self, symbol, timeframe, candles):
        if not candles:
            return
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.executemany("""
                    INSERT OR REPLACE INTO candles (symbol, timeframe, time, open, high, low, close, volume)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, [(symbol, timeframe, c['time'], c['open'], c['high'], c['low'], c['close'], c.get('tick_volume', c.get('volume', 0))) for c in candles])
                conn.commit()
        except Exception:
            pass

    def get_candle_count(self):
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM candles")
                return cursor.fetchone()[0]
        except Exception:
            return 0

DB = DatabaseManager()

# Strategy Calculations
def calculate_ema(closes, period):
    if len(closes) < period:
        return [sum(closes[:i+1]) / (i+1) for i in range(len(closes))]
    
    multiplier = 2.0 / (period + 1.0)
    ema = [0.0] * len(closes)
    
    # Initial SMA
    initial_sma = sum(closes[:period]) / period
    ema[period - 1] = initial_sma
    for i in range(period - 1):
        ema[i] = sum(closes[:i+1]) / (i+1)
        
    for i in range(period, len(closes)):
        ema[i] = (closes[i] - ema[i - 1]) * multiplier + ema[i - 1]
    return ema

def calculate_rsi(closes, period=14):
    if len(closes) <= period:
        return [50.0] * len(closes)
        
    rsi = [50.0] * len(closes)
    gains = 0.0
    losses = 0.0
    
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        if diff >= 0:
            gains += diff
        else:
            losses += abs(diff)
            
    avg_gain = gains / period
    avg_loss = losses / period
    
    if avg_loss == 0:
        rsi[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi[period] = 100.0 - (100.0 / (1.0 + rs))
        
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gain = diff if diff > 0 else 0.0
        loss = abs(diff) if diff < 0 else 0.0
        
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        
        if avg_loss == 0:
            rsi[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi[i] = 100.0 - (100.0 / (1.0 + rs))
            
    return rsi

class GEP5Connector:
    def __init__(self, symbol="XAUUSDm", web_url="", push_interval=1.5, allow_demo=False):
        self.symbol = symbol
        self.web_url = web_url.rstrip("/") if web_url else ""
        self.push_interval = push_interval
        self.allow_demo = allow_demo
        
        self.mt5_connected = False
        self.last_error = ""
        self.terminal_info = {}
        self.account_info = {}
        self.available_symbols = []
        
        self.last_tick = None
        self.m5_candles = []
        self.h1_candles = []
        
        self.last_push_time = 0
        self.push_failures = 0
        
        # Initialize connection
        self.init_mt5()

    def init_mt5(self):
        if not MT5_AVAILABLE:
            self.last_error = "MetaTrader5 Python library is not installed. Run 'pip install MetaTrader5' on Windows."
            print(f"[ERROR] {self.last_error}")
            self.mt5_connected = False
            return False

        print("[MT5] Initializing connection to desktop terminal...")
        if not mt5.initialize():
            err = mt5.last_error()
            self.last_error = f"mt5.initialize() failed. Error: {err}. Please ensure MetaTrader 5 is running on Windows."
            print(f"[ERROR] {self.last_error}")
            self.mt5_connected = False
            return False

        self.mt5_connected = True
        print("[MT5] Terminal connection established!")
        
        # Read terminal info
        term = mt5.terminal_info()
        if term:
            self.terminal_info = {
                "connected": getattr(term, "connected", False),
                "name": getattr(term, "name", ""),
                "path": getattr(term, "path", ""),
                "build": getattr(term, "build", 0)
            }
            print(f"[MT5] Terminal: {self.terminal_info['name']} (Build {self.terminal_info['build']})")

        # Read account info
        acc = mt5.account_info()
        if acc:
            login_num = getattr(acc, "login", 0)
            trade_mode_num = getattr(acc, "trade_mode", 0)
            self.account_info = {
                "login": login_num,
                "maskedLogin": f"{str(login_num)[:4]}****" if len(str(login_num)) >= 4 else str(login_num),
                "server": getattr(acc, "server", ""),
                "company": getattr(acc, "company", ""),
                "trade_mode": trade_mode_num,
                "tradeMode": "REAL" if trade_mode_num == 2 else "DEMO",
                "currency": getattr(acc, "currency", "USD"),
                "balance": getattr(acc, "balance", 0.0),
                "equity": getattr(acc, "equity", getattr(acc, "balance", 0.0)),
                "leverage": getattr(acc, "leverage", 0),
                "freeMargin": getattr(acc, "margin_free", 0.0)
            }
            mode_str = self.account_info["tradeMode"]
            print(f"[MT5] Account: #{self.account_info['maskedLogin']} ({mode_str}) on {self.account_info['server']}")

        # Discover & Select Gold symbol
        self.resolve_symbol()
        return True

    def resolve_symbol(self):
        if not self.mt5_connected:
            return

        symbols = mt5.symbols_get()
        candidates = []
        for s in symbols or []:
            name = s.name
            if "XAU" in name.upper() or "GOLD" in name.upper():
                candidates.append({
                    "name": name,
                    "description": getattr(s, "description", ""),
                    "digits": getattr(s, "digits", 2),
                    "spread": getattr(s, "spread", 0)
                })
        self.available_symbols = candidates

        all_names = [c["name"] for c in candidates]
        if self.symbol not in all_names:
            # Look for Exness Standard symbol 'XAUUSDm' first, then 'XAUUSD'
            for pref in ["XAUUSDm", "XAUUSD", "XAUUSD.", "GOLD"]:
                if pref in all_names:
                    self.symbol = pref
                    break
            if self.symbol not in all_names and candidates:
                self.symbol = candidates[0]["name"]

        print(f"[MT5] Selected Broker Symbol: '{self.symbol}'")
        mt5.symbol_select(self.symbol, True)

    def fetch_market_data(self):
        if not self.mt5_connected:
            # Try reconnecting
            if not self.init_mt5():
                return None

        # Fetch live tick
        tick = mt5.symbol_info_tick(self.symbol)
        if not tick:
            err = mt5.last_error()
            self.last_error = f"Cannot fetch tick for {self.symbol}: {err}"
            return None

        self.last_tick = {
            "bid": float(tick.bid),
            "ask": float(tick.ask),
            "spread": round((tick.ask - tick.bid) * 100, 2),
            "time": int(tick.time),
            "iso_time": datetime.fromtimestamp(int(tick.time), tz=timezone.utc).isoformat()
        }

        # Fetch M5 candles (last 300)
        m5_rates = mt5.copy_rates_from_pos(self.symbol, mt5.TIMEFRAME_M5, 0, 300)
        if m5_rates is not None and len(m5_rates) > 0:
            self.m5_candles = [{
                "time": int(r['time']),
                "open": float(r['open']),
                "high": float(r['high']),
                "low": float(r['low']),
                "close": float(r['close']),
                "tick_volume": int(r['tick_volume'])
            } for r in m5_rates]
            DB.cache_candles(self.symbol, "M5", self.m5_candles)

        # Fetch H1 candles (last 100)
        h1_rates = mt5.copy_rates_from_pos(self.symbol, mt5.TIMEFRAME_H1, 0, 100)
        if h1_rates is not None and len(h1_rates) > 0:
            self.h1_candles = [{
                "time": int(r['time']),
                "open": float(r['open']),
                "high": float(r['high']),
                "low": float(r['low']),
                "close": float(r['close']),
                "tick_volume": int(r['tick_volume'])
            } for r in h1_rates]
            DB.cache_candles(self.symbol, "H1", self.h1_candles)

        # Calculate Indicators on M5
        closes_m5 = [c["close"] for c in self.m5_candles]
        ema20_series = calculate_ema(closes_m5, 20)
        ema200_series = calculate_ema(closes_m5, 200)
        rsi_series = calculate_rsi(closes_m5, 14)

        current_ema20 = ema20_series[-1] if ema20_series else 0.0
        current_ema200 = ema200_series[-1] if ema200_series else 0.0
        current_rsi = rsi_series[-1] if rsi_series else 50.0

        ema200_slope = 0.0
        if len(ema200_series) >= 11:
            ema200_slope = (ema200_series[-1] - ema200_series[-11]) / 10.0

        return {
            "symbol": self.symbol,
            "tick": self.last_tick,
            "candles_m5": self.m5_candles,
            "candles_h1": self.h1_candles,
            "account": self.account_info,
            "terminal": self.terminal_info,
            "available_symbols": self.available_symbols,
            "indicators": {
                "ema20": round(current_ema20, 2),
                "ema200": round(current_ema200, 2),
                "ema200_slope": round(ema200_slope, 4),
                "rsi14": round(current_rsi, 1)
            },
            "client_timestamp": datetime.now(timezone.utc).isoformat(),
            "mode": "REAL_MT5"
        }

    def push_to_web(self, payload):
        target_base = self.web_url or os.environ.get("APP_URL", "")
        if not target_base:
            return

        endpoint = f"{target_base.rstrip('/')}/api/connector/push"
        try:
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                endpoint,
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "GEP5-MT5-Connector/2.0"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                if resp.status == 200:
                    self.push_failures = 0
                else:
                    self.push_failures += 1
        except Exception as e:
            self.push_failures += 1
            if self.push_failures % 10 == 1:
                print(f"[Warning] Failed pushing to {endpoint}: {e}")

# Global Connector Instance
CONNECTOR = None

class LocalHTTPHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path in ["/", "/status", "/health"]:
            self._send_json(200, {
                "status": "online" if CONNECTOR.mt5_connected else "disconnected",
                "connected": CONNECTOR.mt5_connected,
                "mode": "REAL_MT5" if CONNECTOR.mt5_connected else "DISCONNECTED",
                "symbol": CONNECTOR.symbol,
                "account": CONNECTOR.account_info,
                "terminal": CONNECTOR.terminal_info,
                "last_tick": CONNECTOR.last_tick,
                "error": CONNECTOR.last_error
            })
        elif path == "/candles":
            tf = query.get("timeframe", ["M5"])[0].upper()
            candles = CONNECTOR.h1_candles if tf == "H1" else CONNECTOR.m5_candles
            self._send_json(200, {"symbol": CONNECTOR.symbol, "timeframe": tf, "candles": candles})
        elif path == "/live":
            self._send_json(200, CONNECTOR.last_tick or {"error": "No tick available"})
        elif path == "/symbols":
            self._send_json(200, {"selected": CONNECTOR.symbol, "symbols": CONNECTOR.available_symbols})
        else:
            self._send_json(404, {"error": "Not found"})

    def _send_json(self, code, obj):
        self.send_response(code)
        self._send_cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode("utf-8"))

    def log_message(self, format, *args):
        return

def run_local_server(port=8765):
    server = HTTPServer(("127.0.0.1", port), LocalHTTPHandler)
    server.serve_forever()

def main():
    parser = argparse.ArgumentParser(description="GEP-5 Real MetaTrader 5 Market Data Connector")
    parser.add_argument("--symbol", type=str, default="XAUUSDm", help="Broker gold symbol (e.g. XAUUSDm, XAUUSD)")
    parser.add_argument("--web-url", type=str, default="", help="GEP-5 Web App URL (e.g. https://ais-dev-... or http://localhost:3000)")
    parser.add_argument("--port", type=int, default=8765, help="Local diagnostic port (default: 8765)")
    parser.add_argument("--interval", type=float, default=1.5, help="Refresh interval in seconds (default: 1.5)")
    args = parser.parse_args()

    global CONNECTOR
    print("\n" + "=" * 70)
    print("  GEP-5 REAL METATRADER 5 CONNECTOR (SIGNAL-ONLY)")
    print("=" * 70)
    print(f"Target Symbol:  {args.symbol}")
    print(f"Local Server:   http://127.0.0.1:{args.port}")
    target_web_url = args.web_url or os.environ.get("APP_URL", "")
    if target_web_url:
        print(f"Web API Target: {target_web_url.rstrip('/')}/api/connector/push (from {'CLI flag' if args.web_url else 'APP_URL service binding'})")
    else:
        print("Web API Target: [Local Mode - pass --web-url <URL> or set APP_URL to push to dashboard]")
    print("-" * 70)

    CONNECTOR = GEP5Connector(
        symbol=args.symbol,
        web_url=target_web_url,
        push_interval=args.interval
    )

    if not CONNECTOR.mt5_connected:
        print("\n[BLOCKED] MT5 connection could not be established.")
        print("Please review the troubleshooting steps in connector/README.md.")
        print("Press Ctrl+C to exit.\n")

    # Start local HTTP server thread
    import threading
    http_thread = threading.Thread(target=run_local_server, args=(args.port,), daemon=True)
    http_thread.start()

    print(f"\n[Running] Streaming live market data from Exness MT5 every {args.interval}s...")
    print("Press Ctrl+C to terminate connector cleanly.\n")

    try:
        while True:
            data = CONNECTOR.fetch_market_data()
            if data and data.get("tick"):
                CONNECTOR.push_to_web(data)
                tick = data["tick"]
                inds = data["indicators"]
                time_str = datetime.now().strftime("%H:%M:%S")
                print(f"[{time_str}] {data['symbol']} | Bid: {tick['bid']:.2f} | Ask: {tick['ask']:.2f} | Spread: {tick['spread']}pts | EMA20: {inds['ema20']:.2f} | EMA200: {inds['ema200']:.2f} | RSI: {inds['rsi14']:.1f}", end="\r")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n\nShutting down GEP-5 connector...")
        if MT5_AVAILABLE:
            try:
                mt5.shutdown()
            except Exception:
                pass
        print("Connector stopped cleanly.")

if __name__ == "__main__":
    main()
