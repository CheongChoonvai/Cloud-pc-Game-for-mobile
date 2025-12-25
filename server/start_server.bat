@echo off
title Cloud Game Server Launcher
echo ==================================================
echo   Cloud Game Server - Easy Launcher
echo ==================================================
echo.

:: Kill any existing processes on our ports
echo Cleaning up old server processes...

:: Find and kill processes on port 8889 (WebRTC)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8889 ^| findstr LISTENING 2^>nul') do (
    echo Killing process on port 8889 (PID: %%a)
    taskkill /PID %%a /F >nul 2>&1
)

:: Find and kill processes on port 8765 (WebSocket)  
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8765 ^| findstr LISTENING 2^>nul') do (
    echo Killing process on port 8765 (PID: %%a)
    taskkill /PID %%a /F >nul 2>&1
)

:: Wait for ports to be fully released (Windows needs time)
echo.
echo Waiting for ports to be released...
timeout /t 3 /nobreak >nul

:: Double-check and wait if ports still in use
:check_ports
set "ports_busy=0"
netstat -ano | findstr ":8889.*LISTENING" >nul 2>&1 && set "ports_busy=1"
netstat -ano | findstr ":8765.*LISTENING" >nul 2>&1 && set "ports_busy=1"

if "%ports_busy%"=="1" (
    echo Ports still in use, waiting...
    timeout /t 2 /nobreak >nul
    goto check_ports
)

echo Ports are free!
echo.
echo Starting server...
echo ==================================================
echo.

:: Start the server
python server_gui.py

:: If server exits, pause so user can see any errors
pause
