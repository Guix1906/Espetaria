# Ativa o robô de atendimento do WhatsApp (Edge Function whatsapp-bot).
# Usado pelo ATIVAR-ROBO-WHATSAPP.bat (duplo clique).
$ErrorActionPreference = 'Stop'
$projectRef = 'byamgmjeqawznkagouwd'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host ''
Write-Host '=== Robô de atendimento do WhatsApp ===' -ForegroundColor Cyan
Write-Host 'Cole a chave da API do Gemini (começa com AIza ou AQ.) e aperte Enter.'
Write-Host 'Se a chave já foi cadastrada antes, só aperte Enter para manter a atual.'
$secure = Read-Host 'Chave' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

# Senha do webhook: texto aleatório que só a Z-API e o Supabase conhecem
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', ''

$secrets = @("WHATSAPP_BOT_TOKEN=$token")
if ($key) {
  $key = $key.Trim()
  if (-not ($key.StartsWith('AIza') -or $key.StartsWith('AQ.'))) { Write-Host 'Atenção: a chave do Gemini normalmente começa com AIza ou AQ.' -ForegroundColor Yellow }
  $secrets += "GEMINI_API_KEY=$key"
}

Write-Host ''
Write-Host 'Gravando as chaves no Supabase...'
npx supabase secrets set @secrets --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível gravar as chaves. Confira se está logado no Supabase (npx supabase login).' }

Write-Host 'Publicando o robô...'
npx supabase functions deploy whatsapp-bot --no-verify-jwt --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível publicar o robô.' }

$url = "https://$projectRef.supabase.co/functions/v1/whatsapp-bot?token=$token"
Set-Clipboard -Value $url
Write-Host ''
Write-Host 'Pronto! O endereço do webhook já foi copiado (Ctrl+V para colar):' -ForegroundColor Green
Write-Host $url
Write-Host ''
Write-Host 'Agora, no painel da Z-API, em Webhooks:'
Write-Host '  1. Cole o endereço no campo "Ao receber" e salve.'
Write-Host '  2. Ligue "Notificar as enviadas por mim também".'
Write-Host 'Depois, no sistema, em Configurações > WhatsApp, escolha "Só números de teste".'
Write-Host 'Cada vez que este arquivo roda, a senha muda: cole o endereço novo na Z-API.'
