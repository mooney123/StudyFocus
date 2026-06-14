@echo off
setlocal EnableDelayedExpansion
title StudyFocus

:: ─────────────────────────────────────────────
::  StudyFocus — Windows one-command start script
::  Usage:  Double-click  OR  run in CMD / PowerShell:
::            start.bat
:: ─────────────────────────────────────────────

echo.
echo  ============================================
echo   StudyFocus - Starting up...
echo  ============================================
echo.

:: ── 0. Check Node.js ────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please download and install Node.js v18 or higher from:
    echo    https://nodejs.org
    echo.
    echo  After installing, close this window and double-click start.bat again.
    echo.
    pause
    exit /b 1
)

:: Check version is >= 18
for /f "tokens=1 delims=v" %%v in ('node -v') do set RAW_VERSION=%%v
for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if !NODE_MAJOR! lss 18 (
    echo  [ERROR] Node.js v18 or higher is required.
    echo  You have: && node -v
    echo.
    echo  Download the latest LTS from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js found: && node -v

:: ── 1. Move to project root ───────────────────────────────────────────────────
cd /d "%~dp0"
echo  [OK] Project folder: %~dp0

:: ── 2. Install server dependencies ───────────────────────────────────────────
if not exist node_modules (
    echo.
    echo  Installing server dependencies...
    call npm install --silent
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo  [OK] Server dependencies installed.
) else (
    echo  [OK] Server dependencies already present.
)

:: ── 3. Install client dependencies ───────────────────────────────────────────
if not exist client\node_modules (
    echo.
    echo  Installing client dependencies (this may take a minute)...
    cd client
    call npm install --silent
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install in client/ failed.
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Client dependencies installed.
) else (
    echo  [OK] Client dependencies already present.
)

:: ── 4. Clear webpack cache ────────────────────────────────────────────────────
if exist client\node_modules\.cache (
    echo  Clearing webpack cache...
    rmdir /s /q client\node_modules\.cache
    echo  [OK] Cache cleared.
)

:: ── 5. Free ports if already in use ─────────────────────────────────────────
call :free_port 3000
call :free_port 3001

:: ── 6. Launch ────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo   StudyFocus is starting!
echo.
echo   Backend API  -^>  http://localhost:3001
echo   React App    -^>  http://localhost:3000
echo.
echo   Press Ctrl+C to stop both servers.
echo  ============================================
echo.

call npm run dev
goto :eof

:: ── Helper: free a TCP port ───────────────────────────────────────────────────
:free_port
set PORT=%1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " 2^>nul') do (
    set PID=%%a
    if defined PID (
        if "!PID!" neq "0" (
            echo  Freeing port %PORT% (PID !PID!)...
            taskkill /F /PID !PID! >nul 2>&1
        )
    )
)
goto :eof
