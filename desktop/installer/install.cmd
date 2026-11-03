@echo off
rem Double-click helper for the offline release bundle. The online one-liner is
rem in INSTALL.txt and install.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
if errorlevel 1 (
  echo.
  echo Install failed. See the message above.
  pause
)
