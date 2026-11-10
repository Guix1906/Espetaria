# Liga o robô e os avisos do WhatsApp na D-API (10/11/2026). Rodar pelo ATIVAR-DAPI.bat.
$ErrorActionPreference = 'Stop'
$ref = 'byamgmjeqawznkagouwd'
$env:Path = "C:\Program Files\nodejs;$env:Path"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '=== Ligar o WhatsApp na D-API ===' -ForegroundColor Cyan
Write-Host 'No painel da D-API (d-api.cloud), copie a API KEY e o ID da SESSAO.'
Write-Host ''
$secure = Read-Host 'Cole a API KEY da D-API (nao aparece na tela)' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
$session = (Read-Host 'Cole o ID da SESSAO').Trim()
if (-not $key -or -not $session) { Write-Host 'Faltou a chave ou a sessao.' -ForegroundColor Red; exit 1 }

# Confere a chave antes de gravar
try {
  $s = Invoke-RestMethod -Uri "https://api.d-api.cloud/api/v1/sessions/$([uri]::EscapeDataString($session))" -Headers @{ Authorization = $key } -TimeoutSec 20
  Write-Host 'Chave e sessao conferidas na D-API.' -ForegroundColor Green
} catch {
  Write-Host "A D-API recusou a chave ou a sessao: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$token = -join ((48..57) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
Write-Host 'Gravando no Supabase...'
npx supabase secrets set --project-ref $ref --yes "DAPI_API_KEY=$key" "DAPI_SESSION_ID=$session" "DAPI_WEBHOOK_TOKEN=$token" "WHATSAPP_PROVIDER=dapi" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Falhou ao gravar os segredos.' -ForegroundColor Red; exit 1 }

# Aponta o webhook da sessao para o sistema
$hook = "https://$ref.supabase.co/functions/v1/whatsapp-dapi-webhook?token=$token"
$sid = [uri]::EscapeDataString($session)
$h = @{ Authorization = $key; 'Content-Type' = 'application/json' }
Invoke-RestMethod -Method Post -Uri "https://api.d-api.cloud/api/v1/sessions/$sid/webhook" -Headers $h -Body (@{ webhookUrl = $hook } | ConvertTo-Json) | Out-Null
$events = @{}
foreach ($e in 'messages.received', 'messages.sent', 'connection.status') { $events[$e] = @{ enabled = $true; webhookUrl = $hook } }
try {
  Invoke-RestMethod -Method Post -Uri "https://api.d-api.cloud/api/v1/sessions/$sid/webhook-config" -Headers $h -Body (@{ enabled = $true; type = 'single'; events = $events } | ConvertTo-Json -Depth 5) | Out-Null
} catch { Write-Host "Aviso: configurar eventos falhou ($($_.Exception.Message)). Marque no painel da D-API: messages.received, messages.sent, connection.status." -ForegroundColor Yellow }

Write-Host ''
Write-Host 'PRONTO. Robo e avisos agora saem pela D-API.' -ForegroundColor Green
Write-Host 'Se o celular ainda nao estiver ligado: Configuracoes > WhatsApp > ler o QR Code.'
Write-Host 'Volte na conversa com o Claude e escreva: "rodei, confira".'
