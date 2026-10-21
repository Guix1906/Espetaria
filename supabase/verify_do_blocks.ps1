$ErrorActionPreference = 'Stop'
$file = 'C:\Projetos\Espetaria\Espetaria-main\supabase\setup_complete_idempotent.sql'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$content = [IO.File]::ReadAllText($file, $utf8NoBom)

# Flexible regex counts
$doBeginFlexible = ([regex]::Matches($content, 'DO\s+\$\$\s+BEGIN')).Count
$endDoFlexible = ([regex]::Matches($content, 'END\s+\$\$\s*;')).Count

Write-Host "=== FLEXIBLE REGEX COUNTS ==="
Write-Host "DO $$ BEGIN (flexible): $doBeginFlexible"
Write-Host "END $$; (flexible): $endDoFlexible"
Write-Host ""

# Line-by-line state tracking
$lines = $content -split "`n"
$depth = 0
$maxDepth = 0
$unmatchedEnd = 0
$problemLines = @()

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $trimmed = $line.Trim()

    # Check for DO $$ BEGIN (any position)
    if ($trimmed -match 'DO\s+\$\$\s+BEGIN') {
        $depth++
        if ($depth -gt $maxDepth) { $maxDepth = $depth }
    }

    # Check for END $$; (any position)
    if ($trimmed -match 'END\s+\$\$\s*;') {
        $depth--
        if ($depth -lt 0) {
            $unmatchedEnd++
            $problemLines += "Line $($i+1): UNMATCHED END at depth $depth : $trimmed"
        }
    }
}

Write-Host "=== STATE TRACKING ==="
Write-Host "Max nesting depth: $maxDepth"
Write-Host "Final depth (should be 0): $depth"
Write-Host "Unmatched END count: $unmatchedEnd"
Write-Host ""

if ($problemLines.Count -gt 0) {
    Write-Host "=== PROBLEM LINES (first 20) ==="
    $problemLines | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
}

# Also check: lines with CREATE TYPE not inside DO block
$inDo = $false
$createTypeOutside = 0
$createTypeOutsideLines = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
    $trimmed = $lines[$i].Trim()
    if ($trimmed -match 'DO\s+\$\$\s+BEGIN') { $inDo = $true }
    elseif ($trimmed -match 'END\s+\$\$\s*;') { $inDo = $false }
    elseif ($trimmed -match '^CREATE\s+TYPE\s+' -and -not $inDo) {
        $createTypeOutside++
        $createTypeOutsideLines += "Line $($i+1): $trimmed"
    }
}

Write-Host ""
Write-Host "=== CREATE TYPE CHECK ==="
Write-Host "CREATE TYPE outside DO blocks: $createTypeOutside"
if ($createTypeOutsideLines.Count -gt 0) {
    $createTypeOutsideLines | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
}

# Summary
Write-Host ""
Write-Host "=== SUMMARY ==="
if ($depth -eq 0 -and $unmatchedEnd -eq 0 -and $createTypeOutside -eq 0) {
    Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
} else {
    Write-Host "ISSUES FOUND:" -ForegroundColor Red
    if ($depth -ne 0) { Write-Host "  - Final DO block depth is $depth (not 0)" }
    if ($unmatchedEnd -gt 0) { Write-Host "  - $unmatchedEnd unmatched END `$$; statements" }
    if ($createTypeOutside -gt 0) { Write-Host "  - $createTypeOutside CREATE TYPE outside DO blocks" }
}