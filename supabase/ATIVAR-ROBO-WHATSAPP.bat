@echo off
rem Ativa o robo de atendimento do WhatsApp (duplo clique)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ativar-robo-whatsapp.ps1"
echo.
pause
