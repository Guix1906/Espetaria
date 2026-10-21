$src = 'C:\Projetos\Espetaria\Espetaria-main\supabase\setup_complete_safe.sql'
$dst = 'C:\Projetos\Espetaria\Espetaria-main\supabase\setup_complete_fixed.sql'
$text = [System.IO.File]::ReadAllText($src)

# Remove nested DO $$ BEGIN that appears right before another DO $$ BEGIN
# Pattern: "DO $$ BEGIN\n    DO $$ BEGIN" -> "DO $$ BEGIN"
$text = $text -replace 'DO \$\$ BEGIN\r?\n\s+DO \$\$ BEGIN', 'DO $$ BEGIN'

# Remove orphaned EXCEPTION blocks left from the original file that now sit outside any DO block
# These appear as: "END $$;\nEXCEPTION\n    WHEN duplicate_object THEN null;\nEND $$;"
# After our IF NOT EXISTS wrapper, the EXCEPTION is redundant and syntactically invalid
$text = $text -replace 'END \$\$;\r?\nEXCEPTION\r?\n\s+WHEN duplicate_object THEN null;\r?\nEND \$\$;', 'END $$;'

[System.IO.File]::WriteAllText($dst, $text, (New-Object System.Text.UTF8Encoding $false))
Write-Host "OK $($text.Length)"