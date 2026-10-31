Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = scriptDir

' Verifica o executavel do Node.js
nodeCmd = "node"
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeCmd = """C:\Program Files\nodejs\node.exe"""
ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
  nodeCmd = """C:\Program Files (x86)\nodejs\node.exe"""
End If

' Executa 100% invisivel (parametro 0 = janela oculta)
sh.Run "cmd /c " & nodeCmd & " runner.js >> impressao.log 2>&1", 0, False
