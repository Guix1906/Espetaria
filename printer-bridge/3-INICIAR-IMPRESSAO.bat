@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Impressao automatica - NAO FECHE ESTA JANELA
if not exist node_modules (
  echo Instalando pela primeira vez, aguarde...
  call npm install --omit=dev
)
echo Impressao automatica ligada. Deixe esta janela aberta (pode minimizar).
echo Para desligar, feche a janela.
echo.
node src\index.js
echo.
echo A impressao automatica parou. Veja a mensagem acima.
pause
