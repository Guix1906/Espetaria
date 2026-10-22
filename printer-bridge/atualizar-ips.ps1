# Ao ligar o PC: acha cada impressora pelo MAC (não muda) e corrige o IP no .env se o roteador trocou.
$ErrorActionPreference = 'SilentlyContinue'
Set-Location $PSScriptRoot
$printers = @{ 'PRINTER_GRILL' = '50-57-9c-07-ff-59'; 'PRINTER_KITCHEN' = '50-57-9c-07-ff-0b' }
$log = Join-Path $PSScriptRoot 'impressao.log'
function Log($m) { Add-Content $log "$(Get-Date -Format HH:mm:ss) [ips] $m" -Encoding UTF8 }

# Espera a rede (Wi-Fi pode demorar a conectar após o login)
for ($i = 0; $i -lt 30; $i++) {
  $myIp = Get-NetIPAddress -AddressFamily IPv4 | ? { $_.IPAddress -like '192.168.*' -and $_.PrefixOrigin -ne 'WellKnown' } | select -First 1
  if ($myIp) { break }; Start-Sleep 2
}
if (-not $myIp) { Log 'sem rede; mantendo IPs do .env'; exit }
$prefix = ($myIp.IPAddress -split '\.')[0..2] -join '.'

# Procura quem tem a porta 9100 aberta na rede e lê o MAC
$tries = 1..254 | % { $c = New-Object Net.Sockets.TcpClient; [pscustomobject]@{ ip = "$prefix.$_"; c = $c; t = $c.ConnectAsync("$prefix.$_", 9100) } }
Start-Sleep 3
$found = @{}
foreach ($x in $tries | ? { $_.c.Connected }) {
  $mac = (Get-NetNeighbor -IPAddress $x.ip).LinkLayerAddress
  if ($mac) { $found[$mac.ToLower()] = $x.ip }
}
$tries | % { $_.c.Close() }

$envFile = Join-Path $PSScriptRoot '.env'
$text = [IO.File]::ReadAllText($envFile)
foreach ($key in $printers.Keys) {
  $ip = $found[$printers[$key]]
  if (-not $ip) { Log "$key não encontrada na rede (desligada?); mantendo IP atual"; continue }
  $new = "${key}=${ip}:9100"
  if ($text -notmatch "(?m)^$([regex]::Escape($new))\r?$") {
    $text = $text -replace "(?m)^${key}=.*?(?=\r?$)", $new
    Log "$key mudou de IP -> $ip"
  }
}
[IO.File]::WriteAllText($envFile, $text, (New-Object Text.UTF8Encoding $false))
