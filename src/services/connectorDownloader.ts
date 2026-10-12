/**
 * GEP-5 MT5 Connector Downloader Service
 * Provides client-side fail-safe downloads for Windows MetaTrader 5 scripts.
 * Eliminates Chrome "File wasn't available on site" errors by generating
 * native browser Blobs and JSZip archives with zero external network dependencies.
 */

import JSZip from 'jszip';
import { CONNECTOR_FILES, EXTENSION_FILES } from '../data/connectorFileContents';

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py':
      return 'text/x-python;charset=utf-8';
    case 'bat':
    case 'cmd':
      return 'application/x-bat;charset=utf-8';
    case 'mq5':
    case 'mq4':
      return 'text/plain;charset=utf-8';
    case 'txt':
    case 'md':
      return 'text/markdown;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
    case 'zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Triggers a browser download using an in-memory Blob.
 */
function triggerBlobDownload(blob: Blob, filename: string): boolean {
  try {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 2000);
    return true;
  } catch (err) {
    console.error(`[ConnectorDownloader] Blob download error for ${filename}:`, err);
    return false;
  }
}

/**
 * Customizes run_connector.bat with the actual current Web App URL.
 */
function getCustomizedRunBat(rawContent: string, targetWebUrl?: string): string {
  const effectiveUrl = targetWebUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  
  return `@echo off
title GEP-5 Real MetaTrader 5 Market-Data Connector
color 0A
echo ====================================================================
echo   GEP-5: Real MetaTrader 5 Connector (XAU/USD Gold)
echo ====================================================================
echo.
echo Make sure Exness MetaTrader 5 Desktop Terminal is running on Windows!
echo Target broker symbol: XAUUSDm (Standard) or XAUUSD (Pro/Raw)
echo.
echo Target Web App Dashboard: ${effectiveUrl}
echo.

set /p WEB_URL="Enter GEP-5 Web URL (or press ENTER for ${effectiveUrl}): "
if "%WEB_URL%"=="" (
    set WEB_URL=${effectiveUrl}
)

echo.
echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install 64-bit Python 3.8-3.12 from python.org with "Add Python to PATH" enabled.
    pause
    exit /b 1
)

echo.
echo Launching connector with target: %WEB_URL%
echo.
python gep5_connector.py --symbol XAUUSDm --web-url %WEB_URL% %*
pause
`;
}

/**
 * Downloads an individual connector file.
 */
export async function downloadConnectorFile(filename: string, targetWebUrl?: string): Promise<{ success: boolean; filename: string }> {
  try {
    let content = CONNECTOR_FILES[filename];

    if (!content && EXTENSION_FILES[filename]) {
      content = EXTENSION_FILES[filename];
    }

    if (filename === 'run_connector.bat' && content) {
      content = getCustomizedRunBat(content, targetWebUrl);
    }

    if (content) {
      const mime = getMimeType(filename);
      const blob = new Blob([content], { type: mime });
      const ok = triggerBlobDownload(blob, filename);
      return { success: ok, filename };
    }

    // Fallback: try fetching from static /connector/${filename}
    const response = await fetch(`/connector/${filename}`);
    if (response.ok) {
      const blob = await response.blob();
      const ok = triggerBlobDownload(blob, filename);
      return { success: ok, filename };
    }

    // Fallback: try fetching from /api/connector/download/${filename}
    const apiResp = await fetch(`/api/connector/download/${filename}`);
    if (apiResp.ok) {
      const blob = await apiResp.blob();
      const ok = triggerBlobDownload(blob, filename);
      return { success: ok, filename };
    }

    throw new Error(`File '${filename}' is not available in connector package.`);
  } catch (err: any) {
    console.error(`[ConnectorDownloader] Failed to download ${filename}:`, err);
    return { success: false, filename };
  }
}

/**
 * Packages all connector files into a single ZIP archive and downloads it.
 */
export async function downloadConnectorZip(targetWebUrl?: string): Promise<{ success: boolean; sizeBytes: number }> {
  try {
    const zip = new JSZip();

    // Add main connector scripts
    for (const [filename, content] of Object.entries(CONNECTOR_FILES)) {
      if (filename === 'run_connector.bat') {
        zip.file(filename, getCustomizedRunBat(content, targetWebUrl));
      } else {
        zip.file(filename, content);
      }
    }

    // Add chrome extension folder
    const extFolder = zip.folder('extension');
    if (extFolder) {
      for (const [filename, content] of Object.entries(EXTENSION_FILES)) {
        extFolder.file(filename, content);
      }
    }

    // Add a quickstart helper guide
    const quickstart = `# GEP-5 Local Windows MT5 Connector Quickstart

1. Extract this entire ZIP to a local folder (e.g. C:\\gep5-connector\\).
2. Open MetaTrader 5 on Windows and log in to your Exness account (Demo or Real).
3. Ensure Market Watch (Ctrl + M) has symbols visible: right click -> "Show All".
4. First time verification:
   Double-click "run_stage1_test.bat" to verify your MT5 connection & Gold candle feed.
5. Launch live streaming:
   Double-click "run_connector.bat" and press Enter.
   Data will immediately stream live to your GEP-5 web dashboard!

Signal-Only Guarantee:
- The connector is 100% signal-only and never places, modifies, or closes orders.
- Zero password storage: communication is direct via the official MetaTrader5 Python API.
`;
    zip.file('QUICKSTART.txt', quickstart);

    // Generate zip blob
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const ok = triggerBlobDownload(zipBlob, 'gep5_mt5_connector.zip');
    return { success: ok, sizeBytes: zipBlob.size };
  } catch (err) {
    console.error('[ConnectorDownloader] Failed to generate connector ZIP:', err);
    
    // Fallback: Try downloading prebuilt static ZIP
    try {
      const resp = await fetch('/connector/gep5_mt5_connector.zip');
      if (resp.ok) {
        const blob = await resp.blob();
        const ok = triggerBlobDownload(blob, 'gep5_mt5_connector.zip');
        return { success: ok, sizeBytes: blob.size };
      }
    } catch {
      // ignore
    }

    return { success: false, sizeBytes: 0 };
  }
}

/**
 * Returns package file manifests for the UI.
 */
export function getAvailableConnectorFiles() {
  return [
    {
      name: 'gep5_connector.py',
      label: 'MT5 Live Connector Daemon',
      description: 'Official MetaTrader5 Python daemon streaming live XAU/USD ticks, M5/H1 candles, and indicators.',
      size: `${Math.round((CONNECTOR_FILES['gep5_connector.py']?.length || 18724) / 1024)} KB`,
      type: 'Python 3',
      recommended: true,
    },
    {
      name: 'run_connector.bat',
      label: 'One-Click Connector Launcher',
      description: 'Windows batch file that launches the connector with your web app URL pre-configured.',
      size: `${Math.round((CONNECTOR_FILES['run_connector.bat']?.length || 692) / 1024) || 1} KB`,
      type: 'Batch Script',
      recommended: true,
    },
    {
      name: 'test_stage1_connection.py',
      label: 'Stage 1 Diagnostic Test Script',
      description: 'Automated 6-point verification test ensuring MT5 terminal link, Exness account, and Gold data.',
      size: `${Math.round((CONNECTOR_FILES['test_stage1_connection.py']?.length || 16643) / 1024)} KB`,
      type: 'Python 3',
      recommended: false,
    },
    {
      name: 'run_stage1_test.bat',
      label: 'One-Click Stage 1 Diagnostic',
      description: 'Installs requirements and executes the Stage 1 diagnostic with a single double-click.',
      size: `${Math.round((CONNECTOR_FILES['run_stage1_test.bat']?.length || 1120) / 1024) || 1} KB`,
      type: 'Batch Script',
      recommended: false,
    },
    {
      name: 'requirements.txt',
      label: 'Python Dependencies',
      description: 'Specifies MetaTrader5>=5.0.45 for Windows installation via pip.',
      size: '< 1 KB',
      type: 'Pip Requirements',
      recommended: false,
    },
    {
      name: 'GEP5_Strategy_Engine.mq5',
      label: 'MQL5 Expert Advisor Engine',
      description: 'Authoritative MT5 Strategy Engine script for MetaEditor (compiles to GEP5_Strategy_Engine.ex5).',
      size: `${Math.round((CONNECTOR_FILES['GEP5_Strategy_Engine.mq5']?.length || 12360) / 1024)} KB`,
      type: 'MQL5 Code',
      recommended: false,
    },
    {
      name: 'README.md',
      label: 'Connector Documentation & Setup',
      description: 'Complete step-by-step Windows setup guide, terminal settings, and troubleshooting table.',
      size: `${Math.round((CONNECTOR_FILES['README.md']?.length || 8987) / 1024)} KB`,
      type: 'Markdown',
      recommended: false,
    },
  ];
}
