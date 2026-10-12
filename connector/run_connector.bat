@echo off
title GEP-5 Real MetaTrader 5 Market-Data Connector
color 0A
echo ====================================================================
echo   GEP-5: Real MetaTrader 5 Connector (XAU/USD Gold)
echo ====================================================================
echo.
echo Make sure Exness MetaTrader 5 Desktop Terminal is running on Windows!
echo Target broker symbol: XAUUSDm (or XAUUSD)
echo.

set /p WEB_URL="Enter GEP-5 Web URL (or press ENTER for local http://localhost:3000): "
if "%WEB_URL%"=="" (
    set WEB_URL=http://localhost:3000
)

echo.
echo Launching connector with target: %WEB_URL%
echo.
python gep5_connector.py --symbol XAUUSDm --web-url %WEB_URL% %*
pause
