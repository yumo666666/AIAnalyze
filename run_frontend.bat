@echo off
echo Starting Frontend...
cd /d "%~dp0frontend"

rem Read FRONTEND_PORT from .env
set "FRONTEND_PORT=5173"
if exist "%~dp0.env" (
    for /f "usebackq tokens=1,2 delims==" %%A in ("%~dp0.env") do (
        if "%%A"=="FRONTEND_PORT" set "FRONTEND_PORT=%%B"
    )
)

echo Installing dependencies...
call npm install
echo Starting development server on port %FRONTEND_PORT%...
call npm run dev -- -p %FRONTEND_PORT%
pause
