Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = scriptDir
sh.Run "cmd /c ""C:\Program Files\nodejs\node.exe"" runner.js >> impressao.log 2>&1", 0, False
