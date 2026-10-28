@echo off
title DMBBHR Launcher
cd /d "C:\Users\User\Documents\ML Cabigas\dmbbhr"

echo Starting DMBBHR servers...
start "DMBBHR Servers" cmd /k "cd /d C:\Users\User\Documents\ML Cabigas\dmbbhr && npm run dev:all"

echo Waiting for DMBBHR to start...

:WAIT
timeout /t 2 /nobreak >nul
curl -s http://localhost:3000/ >nul
if errorlevel 1 goto WAIT

echo Opening DMBBHR in Google Chrome...

start "" chrome.exe http://localhost:3000

exit
