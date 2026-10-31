@echo off
chcp 65001 >nul
echo ================================================================
echo   REMOVENDO INICIALIZACAO AUTOMATICA DO WINDOWS
echo ================================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\Ponto-Impressao-Oculto.lnk"

if exist "%SHORTCUT_PATH%" (
  del /f /q "%SHORTCUT_PATH%"
  echo [OK] Atalho da pasta Inicializar removido com sucesso.
) else (
  echo [INFO] O atalho nao estava presente na pasta Inicializar.
)

powershell -NoProfile -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*runner.js*' }; if ($procs) { $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Processo parado (PID: ' $_.ProcessId ')' -ForegroundColor Yellow } }"

echo.
echo Concluido.
pause
