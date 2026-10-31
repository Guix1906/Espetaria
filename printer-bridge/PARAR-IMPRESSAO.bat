@echo off
chcp 65001 >nul
echo ================================================================
echo   PARANDO O SERVICO DE IMPRESSAO EM SEGUNDO PLANO
echo ================================================================
echo.
powershell -NoProfile -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*runner.js*' }; if ($procs) { $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Processo encerrado (PID: ' $_.ProcessId ')' -ForegroundColor Yellow } } else { Write-Host 'Nenhum servico em execucao encontrado.' -ForegroundColor Cyan }"
echo.
echo Servico parado.
pause
