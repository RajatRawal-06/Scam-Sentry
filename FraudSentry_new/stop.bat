@echo off
echo Stopping all Fraud-Sentry servers...
taskkill /F /IM node.exe /T 2>nul
taskkill /F /IM python.exe /T 2>nul
echo Done. All servers stopped.
pause
