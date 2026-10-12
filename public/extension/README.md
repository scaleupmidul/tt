# GEP-5 Chrome Extension: Live MT5 Signal Monitor

## Overview
This Chrome Extension connects directly to your local **GEP-5 Gold Setup Detection System** backend, displaying the MetaTrader 5 Expert Advisor's verified signals in your browser bar with fail-closed integrity checks and native desktop alerts.

---

## Installation Steps (Load Unpacked in Chrome)

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in the address bar.
3. In the top-right corner, turn on **Developer mode**.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the `extension` folder inside this project directory.
6. The **GEP-5 Gold Setup Monitor** icon will now appear in your browser extensions toolbar! Pin it to your toolbar for instant access.

---

## Features
- **Direct Terminal Integration**: Reads authoritative signals processed by the MT5 Expert Advisor (`GEP5_Strategy_Engine.mq5`).
- **Fail-Closed Verification Gates**: Live status indicators for MT5 connection freshness, closed-candle confirmation, dual-engine indicator tolerances, and 1:2 risk-to-reward invariants.
- **Instant Desktop Notifications**: Triggers native Chrome alerts only when a setup passes 100% of mandatory GEP-5 rules on a confirmed closed bar.
- **Zero Credentials**: Never asks for trading passwords or private broker tokens.
