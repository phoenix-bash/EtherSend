@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm is not available in PATH.
  echo Install pnpm first, then run this file again.
  pause
  exit /b 1
)

call :start_window "LinkForge Backend" "pnpm --filter @linkforge/backend dev"
call :start_window "LinkForge Frontend" "pnpm --filter @linkforge/frontend dev"

echo.
echo LinkForge startup command completed.
echo - Backend window title : LinkForge Backend
echo - Frontend window title: LinkForge Frontend
echo.
echo Run stop_project.bat to stop both services.
exit /b 0

:start_window
set "WINDOW_TITLE=%~1"
set "LAUNCH_CMD=%~2"

tasklist /v /fi "imagename eq cmd.exe" /fi "windowtitle eq %WINDOW_TITLE%" | find /i "%WINDOW_TITLE%" >nul 2>&1
if not errorlevel 1 (
  echo [INFO] %WINDOW_TITLE% is already running.
  exit /b 0
)

start "%WINDOW_TITLE%" cmd /k "cd /d ""%ROOT%"" & %LAUNCH_CMD%"
echo [OK] %WINDOW_TITLE% started.
exit /b 0
