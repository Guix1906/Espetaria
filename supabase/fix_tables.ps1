$src = 'C:\Projetos\Espetaria\Espetaria-main\supabase\setup_complete_fixed.sql'
$text = [System.IO.File]::ReadAllText($src)
# Add IF NOT EXISTS to all CREATE TABLE statements that lack it
$text = $text -replace 'CREATE TABLE (?!IF NOT EXISTS)', 'CREATE TABLE IF NOT EXISTS '
[System.IO.File]::WriteAllText($src, $text, (New-Object System.Text.UTF8Encoding $false))
Write-Host "OK $($text.Length)"