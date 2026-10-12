# GEP-5 Stage 1: MetaTrader 5 Data Connection & Diagnostic Prototype

## Overview
This connector is the local Windows market-data bridge for the **GEP-5 Gold Setup Detection System**. It allows the GEP-5 dashboard to access real-time and historical XAU/USD data from your Exness trading account via desktop MetaTrader 5, without exposing trading credentials or scraping private browser sessions.

---

## Prerequisites
1. **Windows 10 or 11 (64-bit)**
2. **Exness MetaTrader 5 Desktop Terminal** installed and running.
   - Open MT5 and log in to your Exness trading account (Demo or Real).
   - Verify the connection indicator in the bottom-right corner shows green/blue bars.
   - Open the Market Watch window (`Ctrl + M`), right-click anywhere inside it, and select **Show All**.
3. **Python 3.8 to 3.12 (64-bit)**
   - Download from [python.org](https://www.python.org/downloads/).
   - **Crucial**: Ensure the checkbox **"Add python.exe to PATH"** is enabled during installation.

---

## Step 1: Install Python Dependencies
Open PowerShell or Command Prompt, navigate to the `connector` folder, and run:

```bash
cd connector
pip install -r requirements.txt
```

Or manually:
```bash
pip install MetaTrader5
```

---

## Step 2: Run the Stage 1 Diagnostic Test
Run the automated diagnostic tool to inspect and verify terminal access:

```bash
python test_stage1_connection.py
```
Or simply double-click `run_stage1_test.bat`.

### Expected Successful Output:
```text
======================================================================
  GEP-5 STAGE 1: METATRADER 5 DATA CONNECTION TEST
======================================================================
Time (UTC): 2026-10-11 22:30:00
Python:     3.11.8 on win32

[STEP 1] Checking MetaTrader5 Python Package
--------------------------------------------------
  [OK] MetaTrader5 package is installed (v5.0.45)

[STEP 2] Initializing Connection to MT5 Desktop Terminal
--------------------------------------------------
  [OK] Terminal linked: Exness MetaTrader 5 (Build 4153)
  [OK] Terminal path:   C:\Program Files\Exness MetaTrader 5\terminal64.exe
  [OK] Server ping:    Connected=True

[STEP 3] Verifying Active Trading Account
--------------------------------------------------
  [OK] Account Login:  12345678 (REAL)
  [OK] Broker Server:  Exness-MT5Real (Exness Technologies Ltd)
  [OK] Currency/Lev:   USD / 1:2000

[STEP 4] Scanning Broker Symbols for Gold (XAU/USD)
--------------------------------------------------
  [OK] Found 2 gold symbol variation(s):
     -> [SELECTED] XAUUSDm      (Spread: 22, Digits: 2, Desc: Gold vs US Dollar)
        XAUUSD       (Spread: 12, Digits: 2, Desc: Gold vs US Dollar Raw)

[STEP 5] Retrieving Historical H1 & M5 Candles for 'XAUUSDm'
--------------------------------------------------
  [OK] H1 Candles received: 100
       Oldest: 2026-09-28T14:00:00+00:00
       Newest: 2026-10-11T22:00:00+00:00 | Close: 2654.80
  [OK] M5 Candles received: 300
       Oldest: 2026-10-09T08:00:00+00:00
       Newest: 2026-10-11T22:25:00+00:00 | Close: 2654.92
       Time continuity verified: True

[STEP 6] Testing Live Tick Reception (5s listener)
--------------------------------------------------
  Initial Tick: Bid=2654.80, Ask=2655.02, Spread=22.0pts
  Listening for ticks over 5 seconds...
  [OK] Live tick engine responsive. Bid=2654.85, Ask=2655.07

======================================================================
STAGE 1 DIAGNOSTIC SUMMARY
======================================================================
  [PASS]   mt5_package_installed
  [PASS]   terminal_initialized
  [PASS]   terminal_connected
  [PASS]   account_verified
  [PASS]   gold_symbol_found
  [PASS]   h1_history_retrieved
  [PASS]   m5_history_retrieved
  [PASS]   live_ticks_received

OVERALL STAGE 1 STATUS: PASS
Data access has been fully verified. You are ready to run the GEP-5 local connector.
======================================================================
```

---

## Step 3: Run the Live Connector to Feed the Web Dashboard

To stream real market data to the GEP-5 website:

```bash
python gep5_connector.py --symbol XAUUSDm --web-url https://ais-dev-m3s2wwclisuzgbichaupnj-601602119139.asia-east1.run.app
```
*(Or double-click `run_connector.bat` and paste your website URL).*

When running locally on your computer with `localhost:3000`:
```bash
python gep5_connector.py --symbol XAUUSDm --web-url http://localhost:3000
```

The connector will:
1. Connect to your running Exness MT5 desktop terminal.
2. Select and subscribe to the real broker symbol `XAUUSDm`.
3. Fetch live bid/ask prices, spread, and completed M5/H1 candles.
4. Calculate EMA 20, EMA 200, EMA 200 slope, and RSI 14 in real time.
5. Push the live data packet to the web server's `/api/connector/push` API every 1.5 seconds.
6. The web dashboard will switch immediately to **"LIVE MT5: XAUUSDm"** with real prices!

---

## Step 4: Attach the Authoritative MQL5 Expert Advisor (`GEP5_Strategy_Engine.mq5`)

The MT5 Expert Advisor is the **Single Source of Truth** for GEP-5 signal generation.

1. Open MetaTrader 5 on your Windows computer.
2. In MT5, press `F4` (or click **Tools -> MetaQuotes Language Editor**).
3. In MetaEditor, create a new Expert Advisor:
   - Click **New** -> **Expert Advisor (template)**.
   - Or copy `connector/GEP5_Strategy_Engine.mq5` directly into `MQL5/Experts/` folder:
     - In MT5, click **File -> Open Data Folder**.
     - Navigate to `MQL5 -> Experts` and paste `GEP5_Strategy_Engine.mq5`.
4. In MetaEditor, open `GEP5_Strategy_Engine.mq5` and press `F7` (**Compile**).
   - Verify compilation completes with **0 errors, 0 warnings**.
5. Back in the MetaTrader 5 terminal:
   - In the **Navigator** window (`Ctrl + N`), expand **Expert Advisors**.
   - Drag and drop `GEP5_Strategy_Engine` onto an **M5 chart of XAUUSDm**.
   - In the inputs tab, ensure **InpSignalOnlyMode = true** (default is signal-only, no auto-trading).
   - Check **Allow Algo Trading** in Common tab if prompted.
6. The EA will evaluate closed bars at index 1, write `MQL5/Files/gep5_live_signal.json`, and print confirmed signals to the Experts log.

---

## Step 5: Install Chrome Extension (Manifest V3)

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the `extension` folder located in this repository.
6. The GEP-5 toolbar icon will appear with live fail-closed status and instant desktop notifications!

---

## Step 6: Fail-Closed Signal Integrity & Dual-Engine Verification Architecture

Every signal displayed on the dashboard undergoes an 8-point fail-closed audit:
- **Gate 1**: Connection Freshness Guard (Live feed age <= 20s, or explicit DEMO mode).
- **Gate 2**: Candle History & Monotonic Time Ordering Guard (M5 >= 210, H1 >= 20, strictly ascending timestamps).
- **Gate 3**: Indicator Mathematical Bounds Guard (Non-NaN, positive EMAs, RSI in [0, 100]).
- **Gate 4**: Closed-Candle Timing Confirmation (Anchored to completed bar close, preventing repainting).
- **Gate 5**: Dual-Engine Tolerance Cross-Check (ΔEMA <= $0.05, ΔRSI <= 0.20 between EA and validator).
- **Gate 6**: Mandatory GEP-5 Rule Consensus (100% of rules must PASS on closed bar).
- **Gate 7**: Structural Stop Loss & 1:2 Minimum Risk-to-Reward Invariant.
- **Gate 8**: Execution Filters (Spread <= 35 points, no active USD high-impact news blackout).
- **Gate 9**: Anti-Duplicate Cryptographic Invariance (Deterministic hash per closed bar).

If ANY gate fails, the system **fails closed** (NO TRADE) with an explicit, auditable reason.

---

## Common Errors & Troubleshooting

| Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `ImportError: DLL load failed` | 32-bit Python installed or missing VC++ runtime. | Install 64-bit Python 3.10 or 3.11 from python.org, and install [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe). |
| `Failed to initialize MetaTrader 5 terminal: (-10003, ...)` | MetaTrader 5 terminal is not running or path not detected. | Start Exness MT5 before running the script. If installed in a non-standard folder, specify path in script. |
| `Account connected: False` | MT5 is running but not connected to server. | Log in to Exness in MT5: File -> Login to Trade Account. Check account login, password, and server. |
| `No gold symbol found` | Symbols hidden in Market Watch. | In MT5, press `Ctrl + M`, right click in Market Watch, and click **Show All**. |
| `Exness symbol mismatch (e.g. XAUUSD vs XAUUSDm)` | Exness Standard accounts use `XAUUSDm`, Pro uses `XAUUSD`, Cent uses `XAUUSDc`. | The connector auto-detects this. You can also specify `--symbol XAUUSDm`. |
| `Weekend / Market Closed` | Gold market closes Friday 21:00 UTC to Sunday 22:00 UTC. | The connector retrieves the last available historical candles. Live tick listener will observe zero tick delta, which is flagged appropriately. |

