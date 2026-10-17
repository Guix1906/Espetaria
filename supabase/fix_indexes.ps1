$src = 'C:\Users\guigo\OneDrive\Documentos\Espetaria\Espetaria-main\supabase\setup_complete_fixed.sql'
$text = [System.IO.File]::ReadAllText($src)
# Add IF NOT EXISTS to all CREATE INDEX and CREATE UNIQUE INDEX statements that lack it
$text = $text -replace 'CREATE INDEX (?!IF NOT EXISTS)', 'CREATE INDEX IF NOT EXISTS '
$text = $text -replace 'CREATE UNIQUE INDEX (?!IF NOT EXISTS)', 'CREATE UNIQUE INDEX IF NOT EXISTS '
[System.IO.File]::WriteAllText($src, $text, (New-Object System.Text.UTF8Encoding $false))
Write-Host "OK $($text.Length)"