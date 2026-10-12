@echo off
title GEP-5 Stage 1 Connection Verification Test
color 0B
echo ====================================================================
echo   GEP-5: MetaTrader 5 Data Connection Diagnostic Tool (Stage 1)
echo ====================================================================
echo.
echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in your system PATH.
    echo Please install Python 3.10 or 3.11 64-bit from python.org and check "Add to PATH".
    pause
    exit /b 1
)

echo Checking and installing MetaTrader5 package...
pip install -r requirements.txt
if errorlevel 1 (
    echo [WARNING] Pip install returned a non-zero exit code. Attempting direct test...
)

echo.
echo Running GEP-5 Stage 1 Diagnostic Test...
echo Make sure MetaTrader 5 Desktop Terminal is running and logged in to Exness!
echo.
python test_stage1_connection.py %*

echo.
echo ====================================================================
echo Test execution complete.
echo ====================================================================
pause
