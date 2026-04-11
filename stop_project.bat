@echo off
setlocal EnableExtensions

call :stop_window "LinkForge Frontend"
call :stop_window "LinkForge Backend"

echo.
echo LinkForge stop command completed.
exit /b 0

:stop_window
set "WINDOW_TITLE=%~1"

taskkill /f /t /im cmd.exe /fi "windowtitle eq %WINDOW_TITLE%" >nul 2>&1
if errorlevel 1 (
  echo [INFO] %WINDOW_TITLE% is not running.
) else (
  echo [OK] %WINDOW_TITLE% stopped.
)

exit /b 0
