@echo off
chcp 65001 >nul
title SnowTime Launcher
echo ======================================
echo   SnowTime - Launch Script
echo ======================================
echo.

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [Error] Node.js not found. Please install Node.js first.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js installed
node --version
echo.

REM Get current directory
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

REM Install server dependencies
if not exist "server\node_modules" (
    echo [1/4] Installing server dependencies...
    cd server
    call npm install
    if errorlevel 1 (
        echo [Error] Failed to install server dependencies
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [1/4] Server dependencies already installed
)

REM Install client dependencies
if not exist "client\node_modules" (
    echo [2/4] Installing client dependencies...
    cd client
    call npm install
    if errorlevel 1 (
        echo [Error] Failed to install client dependencies
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [2/4] Client dependencies already installed
)

echo.
echo [3/4] Starting server...
cd server
start "SnowTime Server" cmd /k "npm start"
cd ..

echo [4/4] Starting client...
cd client
start "SnowTime Client" cmd /k "npm run dev"
cd ..

echo.
echo ======================================
echo   Launch Complete!
echo ======================================
echo.
echo Server: http://localhost:3001
echo Client: http://localhost:3000
echo (Vite dev server proxies /socket.io to 3001)
echo.
echo Please open browser: http://localhost:3000
echo.
pause
