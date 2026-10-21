@echo off
rem Troca a chave do Gemini do robo do WhatsApp (duplo clique)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0trocar-chave-gemini.ps1"
echo.
pause
