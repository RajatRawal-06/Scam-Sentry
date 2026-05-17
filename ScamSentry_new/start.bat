@echo off
title Fraud-Sentry Launcher
color 0A

echo ============================================
echo   FRAUD-SENTRY - Starting All Services
echo ============================================
echo.

:: Get the directory of this script
set "ROOT=%~dp0fraudSentry"

echo [1/2] Starting RunAnywhere Inference Server (port 5001)...
start "FraudSentry - Inference Server" cmd /k "cd /d "%ROOT%\inference-server" && echo Inference server starting... && node server.js"

echo [2/2] Waiting 45 seconds for model to load...
timeout /t 45 /nobreak >nul

echo Starting Flask Backend (port 5000)...
start "FraudSentry - Flask Backend" cmd /k "cd /d "%ROOT%\backend" && python app.py"

echo.
echo ============================================
echo   Both servers are starting!
echo ============================================
echo.
echo   Inference Server: http://localhost:5001/health
echo   Flask Dashboard:  http://localhost:5000/dashboard
echo.
echo   Load Chrome Extension from:
echo   %ROOT%\extension
echo.
echo   Press any key to open the dashboard...
pause >nul
start http://localhost:5000/dashboard
