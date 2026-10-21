# Troca a chave do Gemini usada pelo robo de atendimento (whatsapp-bot).
# Usado pelo TROCAR-CHAVE-GEMINI.bat (duplo clique). Textos sem acento de proposito.
$ErrorActionPreference = 'Stop'
$projectRef = 'byamgmjeqawznkagouwd'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host ''
Write-Host '=== Chave do Gemini (robo do WhatsApp) ===' -ForegroundColor Cyan
Write-Host 'Crie a chave em https://aistudio.google.com/apikey e cole aqui (o texto nao aparece).'
$secure = Read-Host 'Chave' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $key) { throw 'Nenhuma chave informada.' }
$key = $key.Trim()

# Confere a chave no Google antes de gravar
# (mesma chamada que o robo faz: uma pergunta curta ao modelo)
$body = '{"contents":[{"role":"user","parts":[{"text":"oi"}]}]}'
try {
  Invoke-WebRequest -Uri 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent' -Method Post `
    -Headers @{ 'x-goog-api-key' = $key } -ContentType 'application/json' -Body $body -TimeoutSec 30 -UseBasicParsing | Out-Null
  Write-Host 'Chave aceita pelo Google.' -ForegroundColor Green
} catch {
  $detail = ''
  try { $detail = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
  Write-Host ''
  Write-Host 'O Google recusou a chave. Motivo enviado pelo Google:' -ForegroundColor Red
  # O Google repete a chave na mensagem: esconde antes de mostrar
  Write-Host ($detail.Replace($key, '***') -replace 'api_key:[A-Za-z0-9._-]+', 'api_key:***')
  throw 'Chave nao gravada.'
}

npx supabase secrets set "GEMINI_API_KEY=$key" --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel gravar a chave. Confira se esta logado no Supabase (npx supabase login).' }

Write-Host ''
Write-Host 'Pronto! O robo ja usa a chave nova. Mande um "oi" de outro celular para testar.' -ForegroundColor Green
