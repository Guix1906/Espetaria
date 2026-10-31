@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================================
echo   CONFIGURANDO IMPRESSAO AUTOMATICA INVISIVEL NO WINDOWS
echo ================================================================
echo.

:: 1. Verifica Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
  if not exist "C:\Program Files\nodejs\node.exe" (
    echo [ERRO] O Node.js nao foi encontrado neste computador!
    echo Por favor, instale o Node.js (https://nodejs.org) antes de continuar.
    echo.
    pause
    exit /b 1
  )
)

:: 2. Garante arquivos essenciais caso nao existam
if not exist runner.js (
  echo Baixando runner.js atualizado do GitHub...
  powershell -NoProfile -Command "iwr 'https://raw.githubusercontent.com/Guix1906/Espetaria/main/printer-bridge/runner.js' -OutFile runner.js" >nul 2>&1
)
if not exist updater.js (
  echo Baixando updater.js atualizado do GitHub...
  powershell -NoProfile -Command "iwr 'https://raw.githubusercontent.com/Guix1906/Espetaria/main/printer-bridge/updater.js' -OutFile updater.js" >nul 2>&1
)
if not exist VERIFICAR-STATUS.bat (
  powershell -NoProfile -Command "iwr 'https://raw.githubusercontent.com/Guix1906/Espetaria/main/printer-bridge/VERIFICAR-STATUS.bat' -OutFile VERIFICAR-STATUS.bat" >nul 2>&1
)

:: Cria iniciar-oculto.vbs automaticamente se nao existir
if not exist iniciar-oculto.vbs (
  echo Criando script de inicializacao oculta...
  (
    echo Set fso = CreateObject("Scripting.FileSystemObject"^)
    echo scriptDir = fso.GetParentFolderName(WScript.ScriptFullName^)
    echo Set sh = CreateObject("WScript.Shell"^)
    echo sh.CurrentDirectory = scriptDir
    echo nodeCmd = "node"
    echo If fso.FileExists("C:\Program Files\nodejs\node.exe"^) Then
    echo   nodeCmd = """C:\Program Files\nodejs\node.exe"""
    echo ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe"^) Then
    echo   nodeCmd = """C:\Program Files (x86)\nodejs\node.exe"""
    echo End If
    echo sh.Run "cmd /c " ^& nodeCmd ^& " runner.js >> impressao.log 2>&1", 0, False
  ) > iniciar-oculto.vbs
)

:: 3. Instala dependencias se for a primeira vez
if not exist node_modules (
  echo Instalando dependencias necessarias pela primeira vez, aguarde...
  call npm install --omit=dev
)

:: 4. Cria atalho na pasta Inicializar do Windows
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\Ponto-Impressao-Oculto.lnk"
set "TARGET_VBS=%~dp0iniciar-oculto.vbs"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET_VBS%\"'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Impressao Automatica Loja Espetaria'; $s.Save()"

:: 5. Encerra qualquer instancia anterior para nao duplicar
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*runner.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

:: 6. Inicia agora mesmo em segundo plano (invisivel)
wscript.exe "%TARGET_VBS%"

echo.
echo ================================================================
echo   [SUCESSO] IMPRESSAO AUTOMATICA INVISIVEL CONFIGURADA!
echo ================================================================
echo.
echo  1. O servico ja esta rodando AGORA em segundo plano (invisivel).
echo  2. Toda vez que ligar o computador, ele ligara sozinho.
echo  3. Nao precisa deixar nenhuma janela preta aberta na tela.
echo.
echo ================================================================
pause
