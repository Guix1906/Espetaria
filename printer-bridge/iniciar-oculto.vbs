Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\ponto\printer-bridge"
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File atualizar-ips.ps1", 0, True
sh.Run "cmd /c node src\index.js >> impressao.log 2>&1", 0, False
