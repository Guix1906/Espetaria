# Liga o robô e os avisos do WhatsApp na D-API (10/11/2026). Rodar pelo ATIVAR-DAPI.bat.
# Usa curl.exe -4: em alguns PCs o IPv6 até a D-API não conecta (tempo esgotado).
$ErrorActionPreference = 'Stop'
$ref = 'byamgmjeqawznkagouwd'
$env:Path = "C:\Program Files\nodejs;$env:Path"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Dapi([string]$method, [string]$path, [string]$key, [string]$body = '') {
  $tmp = [IO.Path]::GetTempFileName()
  $cargs = @('-4', '-s', '-m', '30', '-o', $tmp, '-w', '%{http_code}', '-X', $method, '-H', "Authorization: $key", '-H', 'Content-Type: application/json')
  if ($body) { $bf = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($bf, $body); $cargs += @('--data-binary', "@$bf") }
  $code = & curl.exe @cargs "https://api.d-api.cloud/api/v1$path"
  $text = Get-Content $tmp -Raw -ErrorAction SilentlyContinue
  Remove-Item $tmp -ErrorAction SilentlyContinue
  if ($bf) { Remove-Item $bf -ErrorAction SilentlyContinue }
  return @{ code = [int]$code; text = $text }
}

Write-Host ''
Write-Host '=== Ligar o WhatsApp na D-API ===' -ForegroundColor Cyan
Write-Host 'No painel da D-API (app.d-api.cloud), copie a API KEY e o ID da SESSAO.'
Write-Host ''
$secure = Read-Host 'Cole a API KEY da D-API (nao aparece na tela)' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
$session = (Read-Host 'Cole o ID da SESSAO').Trim()
if (-not $key -or -not $session) { Write-Host 'Faltou a chave ou a sessao.' -ForegroundColor Red; exit 1 }
$sid = [uri]::EscapeDataString($session)

# Confere a chave e mostra as sessoes da conta (para achar o ID certo)
$list = Dapi 'GET' '/sessions' $key
if ($list.code -eq 401 -or $list.code -eq 403) { Write-Host 'A D-API recusou a CHAVE (copie de novo no painel).' -ForegroundColor Red; exit 1 }
if ($list.code -ne 200) { Write-Host "D-API respondeu $($list.code): $($list.text)" -ForegroundColor Red; exit 1 }
Write-Host 'Chave conferida.' -ForegroundColor Green
$s = Dapi 'GET' "/sessions/$sid" $key
if ($s.code -eq 404) {
  Write-Host "Sessao '$session' nao encontrada. Sessoes desta conta:" -ForegroundColor Red
  Write-Host $list.text
  Write-Host 'Rode de novo e cole o ID exatamente como aparece acima (campo id/sessionId).'
  exit 1
}

$token = -join ((48..57) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
Write-Host 'Gravando no Supabase...'
npx supabase secrets set --project-ref $ref --yes "DAPI_API_KEY=$key" "DAPI_SESSION_ID=$session" "DAPI_WEBHOOK_TOKEN=$token" "WHATSAPP_PROVIDER=dapi" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Falhou ao gravar os segredos.' -ForegroundColor Red; exit 1 }

# Aponta o webhook da sessao para o sistema
$hook = "https://$ref.supabase.co/functions/v1/whatsapp-dapi-webhook?token=$token"
$r1 = Dapi 'POST' "/sessions/$sid/webhook" $key (@{ webhookUrl = $hook } | ConvertTo-Json -Compress)
$events = @{}
foreach ($e in 'messages.received', 'messages.sent', 'connection.status') { $events[$e] = @{ enabled = $true; webhookUrl = $hook } }
$r2 = Dapi 'POST' "/sessions/$sid/webhook-config" $key (@{ enabled = $true; type = 'single'; events = $events } | ConvertTo-Json -Depth 5 -Compress)
Write-Host "Webhook: $($r1.code) / eventos: $($r2.code)"
if ($r2.code -ge 300) { Write-Host 'Aviso: marque no painel da D-API os eventos messages.received, messages.sent e connection.status.' -ForegroundColor Yellow }

Write-Host ''
Write-Host 'PRONTO. Robo e avisos agora saem pela D-API.' -ForegroundColor Green
Write-Host 'Volte na conversa com o Claude e escreva: "rodei, confira".'
