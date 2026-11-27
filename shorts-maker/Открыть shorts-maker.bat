@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PY=%LOCALAPPDATA%\shorts-maker\venv\Scripts\python.exe"
if not exist "%PY%" (
  echo Сначала установи зависимости — см. README.md, раздел «Установка».
  pause
  exit /b 1
)
"%PY%" main.py ui
if errorlevel 1 pause
