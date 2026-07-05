@echo off
title SOCForge Launcher
set "PATH=C:\Program Files\nodejs;%PATH%"

echo Starting SOCForge API (port 4000)...
start "SOCForge API" cmd /k "cd /d "%~dp0server" && node src/index.js"

timeout /t 3 /nobreak >nul

echo Starting SOCForge UI (port 5173)...
start "SOCForge UI" cmd /k "cd /d "%~dp0web" && npm run dev"

timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:5173

echo.
echo SOCForge is running. Close the two terminal windows to stop it.
timeout /t 5 >nul
