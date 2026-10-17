@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Configurar impressoras
if not exist node_modules (
  echo Instalando pela primeira vez, aguarde...
  call npm install --omit=dev
)
node src\setup.js
echo.
pause
