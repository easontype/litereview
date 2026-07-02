@echo off
cd /d %~dp0

echo Starting litereview dev server...
start "litereview dev" cmd /k npm run dev

echo Waiting for server to be ready...
set PORT=

for /l %%i in (1,1,30) do (
    if not defined PORT (
        for %%p in (3000 3001 3002 3003 3004 3005) do (
            if not defined PORT (
                powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://localhost:%%p' -UseBasicParsing -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
                if not errorlevel 1 set PORT=%%p
            )
        )
    )
    if not defined PORT timeout /t 1 /nobreak >nul
)

if defined PORT (
    echo litereview is ready at http://localhost:%PORT%
    start "" "http://localhost:%PORT%"
) else (
    echo Could not detect the server port automatically.
    echo Check the "litereview dev" terminal window for the actual URL.
)
