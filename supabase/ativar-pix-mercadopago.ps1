# Ativa o PIX automatico do delivery (Edge Function pix-mercadopago).
# Usado pelo ATIVAR-PIX-MERCADOPAGO.bat (duplo clique). Textos sem acento de proposito
# (o PowerShell do Windows le .ps1 sem BOM como ANSI).
$ErrorActionPreference = 'Stop'
$projectRef = 'byamgmjeqawznkagouwd'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host ''
Write-Host '=== PIX automatico (Mercado Pago) ===' -ForegroundColor Cyan
Write-Host 'No Mercado Pago: Seu negocio > Configuracoes > Gestao e administracao > Credenciais'
Write-Host '(ou mercadopago.com.br/developers > Suas integracoes > Credenciais de producao).'
Write-Host 'Cole o "Access Token" de PRODUCAO (comeca com APP_USR-) e aperte Enter.'
$secure = Read-Host 'Access Token' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $key) { throw 'Nenhuma chave informada.' }
$key = $key.Trim()
if (-not $key.StartsWith('APP_USR-')) { Write-Host 'Atencao: o Access Token de producao normalmente comeca com APP_USR-' -ForegroundColor Yellow }

# Senha do aviso de pagamento: texto aleatorio que so o sistema conhece
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', ''

Write-Host ''
Write-Host 'Gravando as chaves no Supabase...'
npx supabase secrets set "MP_ACCESS_TOKEN=$key" "PIX_WEBHOOK_TOKEN=$token" --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel gravar as chaves. Confira se esta logado no Supabase (npx supabase login).' }

Write-Host 'Publicando a funcao do PIX...'
npx supabase functions deploy pix-mercadopago --no-verify-jwt --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel publicar a funcao do PIX.' }

Write-Host ''
Write-Host 'Pronto! O PIX automatico esta instalado.' -ForegroundColor Green
Write-Host 'Agora, no sistema: Configuracoes > PIX > ligue "PIX automatico no delivery".'
Write-Host 'Faca um pedido de teste de valor baixo pelo cardapio e pague o PIX para conferir.'
