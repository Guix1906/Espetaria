@echo off
rem Liga o WhatsApp pela Evolution API (duplo clique)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ativar-evolution.ps1"
echo.
pause
