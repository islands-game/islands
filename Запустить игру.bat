@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Нужен Node.js. Скачай его на https://nodejs.org и запусти этот файл снова.
  pause
  exit /b
)
if not exist node_modules (
  echo Первый запуск: устанавливаю нужное, подожди минуту...
  call npm install
)
start "" http://localhost:5173
call npm run dev -- --port 5173 --strictPort
pause
