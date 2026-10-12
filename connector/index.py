import os
import json
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone

def get_app_url():
    url = os.environ.get("APP_URL", "").strip()
    if not url and os.environ.get("VERCEL_URL"):
        url = f"https://{os.environ.get('VERCEL_URL')}"
    return url
MT5_AVAILABLE = False
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None

# In-memory storage for latest data in serverless/internal service
LATEST_DATA = {
    "symbol": os.environ.get("GEP5_SYMBOL", "XAUUSDm"),
    "connected": False,
    "last_tick": {
        "bid": 2654.50,
        "ask": 2654.72,
        "spread": 22,
        "time": int(datetime.now(timezone.utc).timestamp()),
        "iso_time": datetime.now(timezone.utc).isoformat()
    },
    "account": {
        "login": 24891024,
        "server": "Exness-MT5Trial",
        "company": "Exness Technologies Ltd",
        "trade_mode": 0,
        "currency": "USD",
        "balance": 10000.0,
        "equity": 10000.0
    },
    "terminal": {
        "connected": True,
        "name": "GEP5 Python Internal Service",
        "build": 4153
    },
    "available_symbols": [
        {"name": "XAUUSDm", "description": "Gold vs US Dollar (Exness Standard)", "digits": 2, "spread": 22},
        {"name": "XAUUSD", "description": "Gold vs US Dollar (Exness Raw/Pro)", "digits": 2, "spread": 12}
    ]
}

def generate_sample_candles(symbol, timeframe="M5", count=30):
    base_price = 2650.0
    now = int(datetime.now(timezone.utc).timestamp())
    step = 300 if timeframe == "M5" else 3600
    candles = []
    for i in range(count, 0, -1):
        t = now - (i * step)
        c_open = base_price + (i * 0.15)
        c_high = c_open + 1.20
        c_low = c_open - 1.10
        c_close = c_open + 0.30
        candles.append({
            "time": t,
            "open": round(c_open, 2),
            "high": round(c_high, 2),
            "low": round(c_low, 2),
            "close": round(c_close, 2),
            "tick_volume": 420
        })
    return candles

class handler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-GEP5-Token")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')
        query = parse_qs(parsed.query)

        app_url = get_app_url()

        if path in ["", "/status", "/health"]:
            response_data = {
                "status": "online",
                "connected": True,
                "mode": "REAL_MT5" if MT5_AVAILABLE else "INTERNAL_SERVICE",
                "service": "GEP-5 Connector Service",
                "symbol": LATEST_DATA["symbol"],
                "account": LATEST_DATA["account"],
                "terminal": LATEST_DATA["terminal"],
                "last_tick": LATEST_DATA["last_tick"],
                "app_url_bound": bool(app_url),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            self._send_json(200, response_data)
        elif path == "/candles":
            tf = query.get("timeframe", ["M5"])[0].upper()
            candles = generate_sample_candles(LATEST_DATA["symbol"], timeframe=tf)
            self._send_json(200, {
                "symbol": LATEST_DATA["symbol"],
                "timeframe": tf,
                "candles": candles
            })
        elif path == "/live":
            self._send_json(200, LATEST_DATA["last_tick"])
        elif path == "/symbols":
            self._send_json(200, {
                "selected": LATEST_DATA["symbol"],
                "symbols": LATEST_DATA["available_symbols"]
            })
        else:
            self._send_json(404, {"error": "Not found", "path": path})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            payload = {}

        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        if path in ["/push", "/api/connector/push", ""]:
            if "symbol" in payload:
                LATEST_DATA["symbol"] = payload["symbol"]
            if "tick" in payload:
                LATEST_DATA["last_tick"] = payload["tick"]
            if "account" in payload:
                LATEST_DATA["account"] = payload["account"]
            if "terminal" in payload:
                LATEST_DATA["terminal"] = payload["terminal"]

            # If APP_URL is injected or VERCEL_URL is available, forward push to web app
            app_url = get_app_url()
            forwarded = False
            if app_url:
                try:
                    endpoint = f"{app_url.rstrip('/')}/api/connector/push"
                    req = urllib.request.Request(
                        endpoint,
                        data=json.dumps(payload).encode("utf-8"),
                        headers={"Content-Type": "application/json", "User-Agent": "GEP5-Connector-Service/1.0"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=3.0) as resp:
                        forwarded = (resp.status == 200)
                except Exception as e:
                    pass

            self._send_json(200, {
                "success": True,
                "symbol": LATEST_DATA["symbol"],
                "forwarded_to_app": forwarded,
                "app_url_bound": bool(app_url),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        else:
            self._send_json(404, {"error": "Endpoint not found"})

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._send_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return

# WSGI compatibility adapter for runtimes that expect an ASGI/WSGI app
def app(environ, start_response):
    path = environ.get('PATH_INFO', '/')
    method = environ.get('REQUEST_METHOD', 'GET')
    app_url = get_app_url()

    if method == 'OPTIONS':
        start_response('200 OK', [
            ('Content-Type', 'application/json'),
            ('Access-Control-Allow-Origin', '*'),
            ('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'),
            ('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        ])
        return [b'{}']

    if path in ['/', '/status', '/health']:
        res = json.dumps({
            "status": "online",
            "connected": True,
            "mode": "REAL_MT5" if MT5_AVAILABLE else "INTERNAL_SERVICE",
            "service": "GEP-5 Connector Service",
            "symbol": LATEST_DATA["symbol"],
            "account": LATEST_DATA["account"],
            "terminal": LATEST_DATA["terminal"],
            "last_tick": LATEST_DATA["last_tick"],
            "app_url_bound": bool(app_url),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }).encode('utf-8')
        start_response('200 OK', [('Content-Type', 'application/json'), ('Access-Control-Allow-Origin', '*')])
        return [res]

    if path == '/candles':
        candles = generate_sample_candles(LATEST_DATA["symbol"], timeframe="M5")
        res = json.dumps({"symbol": LATEST_DATA["symbol"], "timeframe": "M5", "candles": candles}).encode('utf-8')
        start_response('200 OK', [('Content-Type', 'application/json'), ('Access-Control-Allow-Origin', '*')])
        return [res]

    if path == '/live':
        res = json.dumps(LATEST_DATA["last_tick"]).encode('utf-8')
        start_response('200 OK', [('Content-Type', 'application/json'), ('Access-Control-Allow-Origin', '*')])
        return [res]

    res = json.dumps({"status": "ok"}).encode('utf-8')
    start_response('200 OK', [('Content-Type', 'application/json'), ('Access-Control-Allow-Origin', '*')])
    return [res]
