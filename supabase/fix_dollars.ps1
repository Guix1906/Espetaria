$src = 'C:\Users\guigo\OneDrive\Documentos\Espetaria\Espetaria-main\supabase\setup_complete_fixed.sql'
$text = [System.IO.File]::ReadAllText($src)
$broken1 = 'DO $ BEGIN'
$fixed1 = 'DO $$ BEGIN'
$broken2 = 'END $;'
$fixed2 = 'END $$;'
$text = $text.Replace($broken1, $fixed1)
$text = $text.Replace($broken2, $fixed2)
[System.IO.File]::WriteAllText($src, $text, (New-Object System.Text.UTF8Encoding $false))
Write-Host "OK $($text.Length)"