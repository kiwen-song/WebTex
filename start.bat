@echo off
title WebTeX Launcher
echo ========================================
echo   WebTeX - Online LaTeX Editor
echo ========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if dependencies installed
if not exist "node_modules" (
    echo [INFO] Installing server dependencies...
    call npm install
)

if not exist "local-compiler\node_modules" (
    echo [INFO] Installing local compiler dependencies...
    cd local-compiler
    call npm install
    cd ..
)

echo.
echo [INFO] Starting WebTeX Server...
start "WebTeX Server" cmd /k "node server/index.js"

echo [INFO] Starting Local Compiler...
start "WebTeX Compiler" cmd /k "cd local-compiler && node index.js"

:: Wait for servers to start
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   WebTeX is running!
echo   
echo   Editor:   http://localhost:3000
echo   Home:     http://localhost:3000/home
echo   Compiler: http://localhost:8088
echo ========================================
echo.
echo Press any key to open the editor in browser...
pause >nul

start http://localhost:3000/home
