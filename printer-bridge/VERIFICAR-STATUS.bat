@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================================
echo   STATUS DA IMPRESSAO AUTOMATICA
echo ================================================================
echo.
powershell -NoProfile -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*runner.js*' }; if ($procs) { Write-Host '>>> O SERVICO ESTA ATIVO E RODANDO EM SEGUNDO PLANO (INVISIVEL)!' -ForegroundColor Green } else { Write-Host '>>> O servico NAO esta rodando no momento.' -ForegroundColor Red }"
echo.
echo --- Ultimas 15 linhas do log de impressao (impressao.log): ---
if exist impressao.log (
  powershell -NoProfile -Command "Get-Content impressao.log -Tail 15"
) else (
  echo Arquivo impressao.log ainda nao gerado.
)
echo.
echo ================================================================
pause
