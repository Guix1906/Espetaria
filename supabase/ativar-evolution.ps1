# Liga o WhatsApp pela Evolution API v2 (envio automatico + webhook de mensagens).
# Usado pelo ATIVAR-EVOLUTION.bat (duplo clique). Textos sem acento de proposito
# (o PowerShell do Windows le .ps1 sem BOM como ANSI).
$ErrorActionPreference = 'Stop'
$projectRef = 'byamgmjeqawznkagouwd'
$evolutionUrl = 'https://evolution-api-ucax.srv2080789.hstgr.cloud'
$instance = 'Ponto'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host ''
Write-Host '=== WhatsApp pela Evolution API ===' -ForegroundColor Cyan
Write-Host "Servidor: $evolutionUrl   Instancia: $instance"
Write-Host 'Cole a API KEY da Evolution (o texto nao aparece na tela) e aperte Enter.'
$secure = Read-Host 'API key' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $key) { throw 'Nenhuma chave informada.' }
$key = $key.Trim()

# Confere a chave antes de gravar
try {
  $state = Invoke-RestMethod -Uri "$evolutionUrl/instance/connectionState/$instance" -Headers @{ apikey = $key } -TimeoutSec 15
  Write-Host ("Conexao da instancia: " + $state.instance.state) -ForegroundColor Green
} catch {
  throw "A Evolution recusou a chave ou nao respondeu: $($_.Exception.Message)"
}

# Senha do webhook: texto aleatorio que so o sistema conhece
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', ''

$secrets = @("EVOLUTION_URL=$evolutionUrl", "EVOLUTION_INSTANCE=$instance", "EVOLUTION_API_KEY=$key", "EVOLUTION_WEBHOOK_TOKEN=$token")
Write-Host ''
$answer = Read-Host 'Usar a Evolution para as mensagens automaticas dos pedidos (no lugar da Z-API)? (S/N)'
if ($answer -match '^[sS]') { $secrets += 'WHATSAPP_PROVIDER=evolution' }

Write-Host 'Gravando as chaves no Supabase...'
npx supabase secrets set @secrets --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel gravar as chaves. Confira se esta logado no Supabase (npx supabase login).' }

Write-Host 'Publicando as funcoes...'
npx supabase functions deploy whatsapp-dispatch --no-verify-jwt --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Falha ao publicar whatsapp-dispatch.' }
npx supabase functions deploy whatsapp-evolution-webhook --no-verify-jwt --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Falha ao publicar whatsapp-evolution-webhook.' }
npx supabase functions deploy whatsapp-status --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Falha ao publicar whatsapp-status.' }

$webhook = "https://$projectRef.supabase.co/functions/v1/whatsapp-evolution-webhook?token=$token"
Set-Clipboard -Value $webhook
Write-Host ''
Write-Host 'Pronto!' -ForegroundColor Green
Write-Host 'A URL do webhook foi COPIADA (Ctrl+V para colar). Na Evolution: instancia Ponto > Webhook:'
Write-Host '  - Enabled: ligado   - URL: cole a URL   - Webhook by Events: desligado'
Write-Host '  - Events: marque MESSAGES_UPSERT   - Salve.'
