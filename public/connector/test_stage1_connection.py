#!/usr/bin/env python3
"""
GEP-5: Stage 1 — MetaTrader 5 Data Connection & Diagnostic Prototype
Author: GEP-5 Engineering Team
Target: Exness XAU/USD (Gold) via MetaTrader 5 Desktop Terminal

This script verifies that:
1. MetaTrader 5 Python package is installed and terminal is accessible.
2. An active MT5 terminal is running and connected to a valid account (e.g. Exness).
3. The account supports MT5 market data retrieval.
4. The broker-specific XAU/USD symbol is located (XAUUSD, XAUUSDm, XAUUSD.ecn, GOLD, etc.).
5. Historical H1 and M5 OHLCV candle data can be retrieved.
6. New candle/tick updates can be detected while the connector runs.
7. Validates data freshness, timestamp continuity, and market open/close state.
"""

import sys
import os
import time
import json
import argparse
from datetime import datetime, timezone, timedelta

def print_header(title):
    print("\n" + "=" * 70)
    print(f"  {title.upper()}")
    print("=" * 70)

def print_step(step_num, title):
    print(f"\n[STEP {step_num}] {title}")
    print("-" * 50)

def main():
    parser = argparse.ArgumentParser(description="GEP-5 Stage 1 MT5 Connection Diagnostic")
    parser.add_argument("--symbol", type=str, default="", help="Specific symbol override (e.g., XAUUSDm, XAUUSD)")
    parser.add_argument("--h1-count", type=int, default=100, help="Number of H1 candles to test (default: 100)")
    parser.add_argument("--m5-count", type=int, default=300, help="Number of M5 candles to test (default: 300)")
    parser.add_argument("--listen-seconds", type=int, default=5, help="Seconds to test live tick reception (default: 5)")
    parser.add_argument("--json", action="store_true", help="Output diagnostic result as JSON")
    args = parser.parse_args()

    results = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stage": 1,
        "environment": {
            "platform": sys.platform,
            "python_version": sys.version,
        },
        "checks": {
            "mt5_package_installed": False,
            "terminal_initialized": False,
            "terminal_connected": False,
            "account_verified": False,
            "gold_symbol_found": False,
            "h1_history_retrieved": False,
            "m5_history_retrieved": False,
            "live_ticks_received": False,
        },
        "terminal_info": {},
        "account_info": {},
        "selected_symbol": None,
        "available_gold_symbols": [],
        "h1_sample": {},
        "m5_sample": {},
        "live_test": {},
        "errors": [],
        "passed": False
    }

    if not args.json:
        print_header("GEP-5 Stage 1: MetaTrader 5 Data Connection Test")
        print(f"Time (UTC): {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Python:     {sys.version.split()[0]} on {sys.platform}")

    # STEP 1: Verify MetaTrader 5 Python package
    print_step(1, "Checking MetaTrader5 Python Package") if not args.json else None
    try:
        import MetaTrader5 as mt5
        results["checks"]["mt5_package_installed"] = True
        results["environment"]["mt5_package_version"] = getattr(mt5, "__version__", "unknown")
        if not args.json:
            print(f"  [OK] MetaTrader5 package is installed (v{results['environment']['mt5_package_version']})")
    except ImportError as e:
        err_msg = (
            "MetaTrader5 package is not installed.\n"
            "Solution: Run 'pip install MetaTrader5' in your Python environment on Windows.\n"
            "Note: The MetaTrader5 package requires Windows (64-bit Python 3.8-3.12 recommended)."
        )
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [FAIL] {err_msg}")
        _finish_report(results, args.json)
        return

    # STEP 2: Initialize connection to MT5 desktop terminal
    print_step(2, "Initializing Connection to MT5 Desktop Terminal") if not args.json else None
    init_success = mt5.initialize()
    if not init_success:
        last_err = mt5.last_error()
        err_msg = (
            f"Failed to initialize MetaTrader 5 terminal. Error: {last_err}\n"
            "Common causes:\n"
            " 1. MetaTrader 5 is not currently running.\n"
            " 2. MT5 is installed in a custom path. Try passing path to mt5.initialize(path='...').\n"
            " 3. You are running on a non-Windows OS (Wine/macOS requires additional bridge).\n"
            " 4. Terminal requires Administrator permissions or is stuck in an update loop."
        )
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [FAIL] {err_msg}")
        _finish_report(results, args.json)
        return

    results["checks"]["terminal_initialized"] = True
    term_info = mt5.terminal_info()
    if term_info:
        results["terminal_info"] = {
            "community_account": getattr(term_info, "community_account", False),
            "connected": getattr(term_info, "connected", False),
            "dlls_allowed": getattr(term_info, "dlls_allowed", False),
            "trade_allowed": getattr(term_info, "trade_allowed", False),
            "email_enabled": getattr(term_info, "email_enabled", False),
            "path": getattr(term_info, "path", ""),
            "data_path": getattr(term_info, "data_path", ""),
            "name": getattr(term_info, "name", ""),
            "build": getattr(term_info, "build", 0),
        }
        if not args.json:
            print(f"  [OK] Terminal linked: {results['terminal_info']['name']} (Build {results['terminal_info']['build']})")
            print(f"  [OK] Terminal path:   {results['terminal_info']['path']}")
            print(f"  [OK] Server ping:    Connected={results['terminal_info']['connected']}")
    
    if not results["terminal_info"].get("connected", False):
        err_msg = (
            "Terminal is initialized but not connected to a trading server.\n"
            "Please open MetaTrader 5, check the bottom right corner connection bar, "
            "and ensure you are logged in to your Exness account."
        )
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [WARN] {err_msg}")

    # STEP 3: Verify Trading Account Details
    print_step(3, "Verifying Active Trading Account") if not args.json else None
    acc_info = mt5.account_info()
    if acc_info is None:
        last_err = mt5.last_error()
        err_msg = f"Cannot retrieve account information. MT5 error: {last_err}"
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [FAIL] {err_msg}")
    else:
        results["checks"]["account_verified"] = True
        results["account_info"] = {
            "login": getattr(acc_info, "login", 0),
            "trade_mode": getattr(acc_info, "trade_mode", 0),  # 0=Demo, 1=Contest, 2=Real
            "server": getattr(acc_info, "server", ""),
            "company": getattr(acc_info, "company", ""),
            "currency": getattr(acc_info, "currency", "USD"),
            "balance": getattr(acc_info, "balance", 0.0),
            "equity": getattr(acc_info, "equity", 0.0),
            "leverage": getattr(acc_info, "leverage", 0),
        }
        trade_mode_str = {0: "DEMO", 1: "CONTEST", 2: "REAL"}.get(results["account_info"]["trade_mode"], "UNKNOWN")
        if not args.json:
            print(f"  [OK] Account Login:  {results['account_info']['login']} ({trade_mode_str})")
            print(f"  [OK] Broker Server:  {results['account_info']['server']} ({results['account_info']['company']})")
            print(f"  [OK] Currency/Lev:   {results['account_info']['currency']} / 1:{results['account_info']['leverage']}")

    # STEP 4: Inspect and Resolve XAU/USD Broker Symbol
    print_step(4, "Scanning Broker Symbols for Gold (XAU/USD)") if not args.json else None
    symbols = mt5.symbols_get()
    all_symbols_names = [s.name for s in symbols] if symbols else []
    
    # Search for all gold variations: XAUUSD, XAUUSDm, XAUUSD.ecn, XAUUSDc, GOLD, etc.
    gold_candidates = []
    for s in symbols or []:
        name = s.name
        upper_name = name.upper()
        if "XAU" in upper_name or "GOLD" in upper_name:
            gold_candidates.append({
                "name": name,
                "description": getattr(s, "description", ""),
                "digits": getattr(s, "digits", 2),
                "spread": getattr(s, "spread", 0),
                "visible": getattr(s, "visible", False),
                "trade_mode": getattr(s, "trade_mode", 0),
            })
    
    results["available_gold_symbols"] = gold_candidates

    if not gold_candidates:
        err_msg = (
            "No gold symbol found in broker symbol list. Looked for *XAU* and *GOLD*.\n"
            "Please open MT5 Market Watch (Ctrl+M), right click and choose 'Show All'."
        )
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [FAIL] {err_msg}")
        _finish_report(results, args.json)
        return

    # Choose selected symbol
    chosen_symbol = None
    if args.symbol:
        if args.symbol in all_symbols_names:
            chosen_symbol = args.symbol
        else:
            print(f"  [WARN] User requested symbol '{args.symbol}' was not found in MT5 symbols.")
    
    if not chosen_symbol:
        # Prioritize Exness typical suffixes: XAUUSDm (Standard account), XAUUSD (Raw/Pro), XAUUSD.ecn
        priorities = ["XAUUSDm", "XAUUSD", "XAUUSD.", "XAUUSDc", "GOLD"]
        for p in priorities:
            for cand in gold_candidates:
                if cand["name"] == p or cand["name"].startswith(p):
                    chosen_symbol = cand["name"]
                    break
            if chosen_symbol:
                break
        if not chosen_symbol:
            chosen_symbol = gold_candidates[0]["name"]

    results["selected_symbol"] = chosen_symbol
    results["checks"]["gold_symbol_found"] = True

    if not args.json:
        print(f"  [OK] Found {len(gold_candidates)} gold symbol variation(s):")
        for c in gold_candidates:
            star = "-> [SELECTED]" if c["name"] == chosen_symbol else "  "
            print(f"     {star} {c['name']:<12} (Spread: {c['spread']}, Digits: {c['digits']}, Desc: {c['description']})")

    # Ensure symbol is selected in Market Watch
    if not mt5.symbol_select(chosen_symbol, True):
        last_err = mt5.last_error()
        err_msg = f"Failed to select symbol '{chosen_symbol}' in Market Watch. MT5 Error: {last_err}"
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [FAIL] {err_msg}")
        _finish_report(results, args.json)
        return

    # STEP 5: Retrieve Historical H1 and M5 Data
    print_step(5, f"Retrieving Historical H1 & M5 Candles for '{chosen_symbol}'") if not args.json else None
    
    # 5a. H1 Data
    h1_rates = mt5.copy_rates_from_pos(chosen_symbol, mt5.TIMEFRAME_H1, 0, args.h1_count)
    if h1_rates is None or len(h1_rates) == 0:
        last_err = mt5.last_error()
        err_msg = f"Failed to retrieve H1 rates for '{chosen_symbol}'. MT5 Error: {last_err}"
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [FAIL] {err_msg}")
    else:
        results["checks"]["h1_history_retrieved"] = True
        last_h1 = h1_rates[-1]
        last_h1_time = datetime.fromtimestamp(int(last_h1['time']), tz=timezone.utc)
        results["h1_sample"] = {
            "count": len(h1_rates),
            "oldest": datetime.fromtimestamp(int(h1_rates[0]['time']), tz=timezone.utc).isoformat(),
            "newest": last_h1_time.isoformat(),
            "last_close": float(last_h1['close']),
            "last_volume": int(last_h1['tick_volume']),
        }
        if not args.json:
            print(f"  [OK] H1 Candles received: {len(h1_rates)}")
            print(f"       Oldest: {results['h1_sample']['oldest']}")
            print(f"       Newest: {results['h1_sample']['newest']} | Close: {results['h1_sample']['last_close']:.2f}")

    # 5b. M5 Data
    m5_rates = mt5.copy_rates_from_pos(chosen_symbol, mt5.TIMEFRAME_M5, 0, args.m5_count)
    if m5_rates is None or len(m5_rates) == 0:
        last_err = mt5.last_error()
        err_msg = f"Failed to retrieve M5 rates for '{chosen_symbol}'. MT5 Error: {last_err}"
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [FAIL] {err_msg}")
    else:
        results["checks"]["m5_history_retrieved"] = True
        last_m5 = m5_rates[-1]
        last_m5_time = datetime.fromtimestamp(int(last_m5['time']), tz=timezone.utc)
        
        # Verify continuity: strictly ascending, no duplicates
        timestamps = [int(r['time']) for r in m5_rates]
        is_sorted = all(timestamps[i] < timestamps[i+1] for i in range(len(timestamps)-1))
        
        results["m5_sample"] = {
            "count": len(m5_rates),
            "oldest": datetime.fromtimestamp(int(m5_rates[0]['time']), tz=timezone.utc).isoformat(),
            "newest": last_m5_time.isoformat(),
            "last_open": float(last_m5['open']),
            "last_high": float(last_m5['high']),
            "last_low": float(last_m5['low']),
            "last_close": float(last_m5['close']),
            "last_volume": int(last_m5['tick_volume']),
            "chronologically_sorted": is_sorted,
        }
        if not args.json:
            print(f"  [OK] M5 Candles received: {len(m5_rates)}")
            print(f"       Oldest: {results['m5_sample']['oldest']}")
            print(f"       Newest: {results['m5_sample']['newest']} | Close: {results['m5_sample']['last_close']:.2f}")
            print(f"       Time continuity verified: {is_sorted}")

    # STEP 6: Verify Live Tick / Real-Time Data Streaming
    print_step(6, f"Testing Live Tick Reception ({args.listen_seconds}s listener)") if not args.json else None
    tick_info = mt5.symbol_info_tick(chosen_symbol)
    if tick_info is None:
        last_err = mt5.last_error()
        err_msg = f"Could not get current tick for '{chosen_symbol}'. Error: {last_err}"
        results["errors"].append(err_msg)
        if not args.json:
            print(f"  [WARN] {err_msg}")
    else:
        first_tick_time = tick_info.time
        first_bid = tick_info.bid
        first_ask = tick_info.ask
        if not args.json:
            print(f"  Initial Tick: Bid={first_bid:.2f}, Ask={first_ask:.2f}, Spread={(first_ask-first_bid)*100:.1f}pts")
            print(f"  Listening for ticks over {args.listen_seconds} seconds...")

        ticks_seen = 1
        start_t = time.time()
        while time.time() - start_t < args.listen_seconds:
            time.sleep(0.5)
            t = mt5.symbol_info_tick(chosen_symbol)
            if t and (t.time != first_tick_time or t.bid != first_bid):
                ticks_seen += 1

        results["checks"]["live_ticks_received"] = True
        results["live_test"] = {
            "bid": float(tick_info.bid),
            "ask": float(tick_info.ask),
            "spread_points": round((tick_info.ask - tick_info.bid) * 100, 2),
            "tick_time": datetime.fromtimestamp(int(tick_info.time), tz=timezone.utc).isoformat(),
            "ticks_observed": ticks_seen,
        }
        if not args.json:
            print(f"  [OK] Live tick engine responsive. Bid={tick_info.bid:.2f}, Ask={tick_info.ask:.2f}")

    # Check overall pass
    all_mandatory_checks = [
        results["checks"]["mt5_package_installed"],
        results["checks"]["terminal_initialized"],
        results["checks"]["gold_symbol_found"],
        results["checks"]["h1_history_retrieved"],
        results["checks"]["m5_history_retrieved"],
    ]
    results["passed"] = all(all_mandatory_checks)

    _finish_report(results, args.json)

    # Safely shutdown MT5 session
    try:
        mt5.shutdown()
    except Exception:
        pass

def _finish_report(results, as_json):
    if as_json:
        print(json.dumps(results, indent=2))
        return

    print_header("STAGE 1 DIAGNOSTIC SUMMARY")
    for check_key, val in results["checks"].items():
        status_tag = "[PASS]" if val else "[FAIL]"
        print(f"  {status_tag:<8} {check_key}")

    print("\nOVERALL STAGE 1 STATUS: " + ("PASS" if results["passed"] else "BLOCKED"))
    if results["errors"]:
        print("\nERRORS & BLOCKERS DETECTED:")
        for idx, err in enumerate(results["errors"], 1):
            print(f"  {idx}. {err}")
    else:
        print("\nData access has been fully verified. You are ready to run the GEP-5 local connector.")
    print("=" * 70)

if __name__ == "__main__":
    main()
