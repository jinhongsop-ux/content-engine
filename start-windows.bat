@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\start-windows.ps1"
echo.
echo Content Engine startup window finished. If the app did not open, check the messages above.
pause
