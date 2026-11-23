@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Open index.html directly to play offline.
  pause
  exit /b 1
)
powershell -NoProfile -WindowStyle Hidden -Command "try { $r = Invoke-WebRequest 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  start "" "http://127.0.0.1:4173/"
  exit /b 0
)
start "" "http://127.0.0.1:4173/"
node server.cjs
pause
