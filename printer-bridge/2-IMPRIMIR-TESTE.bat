@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Imprimir cupom de teste
if not exist node_modules (
  echo Instalando pela primeira vez, aguarde...
  call npm install --omit=dev
)
echo Testando a conexao com cada impressora (nao imprime):
echo.
node src\cli.js check
echo.
echo Agora sera impresso UM cupom de teste em cada impressora configurada.
echo (No modo simulacao, o cupom vira um arquivo na pasta impressoes-simuladas.)
echo.
pause
node src\cli.js test-print ALL
echo.
pause
