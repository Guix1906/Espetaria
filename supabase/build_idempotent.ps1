$ErrorActionPreference = 'Stop'
$migrationsDir = 'C:\Users\guigo\OneDrive\Documentos\Espetaria\Espetaria-main\supabase\migrations'
$outputFile = 'C:\Users\guigo\OneDrive\Documentos\Espetaria\Espetaria-main\supabase\setup_complete_idempotent.sql'
$files = @(
    '00001_initial_schema.sql',
    '00002_stock_atomic_functions.sql',
    '00003_rls_policies.sql',
    '00004_settings_and_print_queue.sql',
    '00005_seed_tables_and_demo.sql',
    '00006_updated_at_and_version.sql',
    '00007_secure_rpc_and_auth.sql',
    '00008_keep_only_admin_profile.sql',
    '00009_delivery_and_print_pipeline.sql',
    '00010_security_hardening.sql',
    '00011_whatsapp_and_delivery_payment.sql',
    '00012_whatsapp_dispatch_auth.sql',
    '00013_print_templates.sql',
    '00014_realtime_catalog.sql',
    '00015_finance_entries.sql',
    '00016_void_tab.sql',
    '00017_audit_rpcs_and_triggers.sql',
    '00018_print_retry_and_security.sql',
    '00019_schema_consistency_and_pii.sql',
    '00020_driver_pay_and_staff_cpf.sql',
    '00021_table_management.sql',
    '00022_delivery_zones_crud.sql'
)

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine('-- ============================================================================')
[void]$sb.AppendLine('-- ESPETARIA SABOR DA CARNE - SETUP COMPLETO IDEMPOTENTE')
[void]$sb.AppendLine('-- Gerado automaticamente em ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
[void]$sb.AppendLine('-- Combina todas as 22 migracoes com verificacoes de existencia')
[void]$sb.AppendLine('-- ============================================================================')
[void]$sb.AppendLine('')

foreach ($file in $files) {
    $path = Join-Path $migrationsDir $file
    if (-not (Test-Path $path)) {
        Write-Warning "Arquivo nao encontrado: $file"
        continue
    }
    $num = $file.Substring(0, 5)
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine('-- ############################################################################')
    [void]$sb.AppendLine("-- # MIGRATION $num")
    [void]$sb.AppendLine('-- ############################################################################')
    [void]$sb.AppendLine('')

    $lines = [IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
    $i = 0
    while ($i -lt $lines.Count) {
        $line = $lines[$i]
        $trimmed = $line.TrimStart()

        # --- CREATE TYPE ... AS ENUM wrapping ---
        # Only wrap if NOT already inside a DO block or function body
        if ($trimmed -match '^CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(') {
            $typeName = $Matches[1]
            # Collect lines until we find );
            $enumLines = @($line)
            $foundClose = $false
            if ($trimmed -match '\)\s*;?\s*$') {
                $foundClose = $true
            } else {
                $j = $i + 1
                while ($j -lt $lines.Count) {
                    $enumLines += $lines[$j]
                    if ($lines[$j].TrimEnd() -match '^\)\s*;?\s*$' -or $lines[$j].Trim() -eq ');') {
                        $foundClose = $true
                        $i = $j
                        break
                    }
                    $j++
                }
                if (-not $foundClose) {
                    foreach ($el in $enumLines) { [void]$sb.AppendLine($el) }
                    $i++
                    continue
                }
            }
            # Build the enum body
            $fullBlock = $enumLines -join "`n"
            $openParen = $fullBlock.IndexOf('(')
            $closeParen = $fullBlock.LastIndexOf(')')
            if ($openParen -ge 0 -and $closeParen -gt $openParen) {
                $enumBody = $fullBlock.Substring($openParen + 1, $closeParen - $openParen - 1).Trim()
                [void]$sb.AppendLine("DO `$`$ BEGIN")
                [void]$sb.AppendLine("    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '$typeName') THEN")
                [void]$sb.AppendLine("        CREATE TYPE $typeName AS ENUM (")
                foreach ($bodyLine in ($enumBody -split "`n")) {
                    [void]$sb.AppendLine("            $($bodyLine.Trim())")
                }
                [void]$sb.AppendLine("        );")
                [void]$sb.AppendLine("    END IF;")
                [void]$sb.AppendLine("END `$`$;")
            } else {
                foreach ($el in $enumLines) { [void]$sb.AppendLine($el) }
            }
            $i++
            continue
        }

        # --- CREATE TABLE -> CREATE TABLE IF NOT EXISTS ---
        if ($trimmed -match '^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)') {
            $newLine = $line -replace '(?i)(CREATE\s+TABLE\s+)', '$1IF NOT EXISTS '
            [void]$sb.AppendLine($newLine)
            $i++
            continue
        }

        # --- CREATE INDEX / CREATE UNIQUE INDEX -> add IF NOT EXISTS ---
        if ($trimmed -match '^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)') {
            $newLine = $line -replace '(?i)(CREATE\s+(?:UNIQUE\s+)?INDEX\s+)', '$1IF NOT EXISTS '
            [void]$sb.AppendLine($newLine)
            $i++
            continue
        }

        # --- ALTER TABLE ... ALTER COLUMN ... TYPE (migration 00019 pattern) ---
        if ($trimmed -match '^ALTER\s+TABLE\s+(\w+)\s+ALTER\s+COLUMN\s+(\w+)\s+TYPE\s+') {
            $tableName = $Matches[1]
            $colName = $Matches[2]
            $typeMatch = $trimmed -match 'TYPE\s+(.+?)(?:\s+USING|$)'
            $targetType = if ($typeMatch) { $Matches[1].Trim().TrimEnd(';') } else { 'unknown' }
            $usingClause = ''
            if ($trimmed -match 'USING\s+(.+?)\s*;?\s*$') {
                $usingClause = " USING $($Matches[1].Trim().TrimEnd(';'))"
            }
            # Extract base type name for comparison (handle schema.type and casts)
            $baseType = $targetType.Split(' ')[0].ToLower().Replace('::','').Replace("'","")
            [void]$sb.AppendLine("DO `$`$ BEGIN")
            [void]$sb.AppendLine("    IF EXISTS (")
            [void]$sb.AppendLine("        SELECT 1 FROM information_schema.columns")
            [void]$sb.AppendLine("        WHERE table_schema = 'public' AND table_name = '$tableName'")
            [void]$sb.AppendLine("          AND column_name = '$colName'")
            [void]$sb.AppendLine("          AND udt_name <> '$baseType'")
            [void]$sb.AppendLine("    ) THEN")
            [void]$sb.AppendLine("        ALTER TABLE $tableName ALTER COLUMN $colName TYPE $targetType$usingClause;")
            [void]$sb.AppendLine("    END IF;")
            [void]$sb.AppendLine("END `$`$;")
            $i++
            continue
        }

        # --- ALTER PUBLICATION (standalone, not already in DO/EXECUTE) ---
        if ($trimmed -match '^ALTER\s+PUBLICATION\s+' -and $trimmed -notmatch 'EXECUTE\s+format') {
            [void]$sb.AppendLine("DO `$`$ BEGIN")
            [void]$sb.AppendLine("    $trimmed")
            [void]$sb.AppendLine("EXCEPTION WHEN OTHERS THEN NULL;")
            [void]$sb.AppendLine("END `$`$;")
            $i++
            continue
        }

        # --- Default: pass through unchanged ---
        [void]$sb.AppendLine($line)
        $i++
    }
}

# Final marker
[void]$sb.AppendLine('')
[void]$sb.AppendLine('-- ============================================================================')
[void]$sb.AppendLine('-- SETUP COMPLETE')
[void]$sb.AppendLine('-- ============================================================================')
[void]$sb.AppendLine("select 'SETUP_COMPLETE_OK' as resultado;")

# Write without BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($outputFile, $sb.ToString(), $utf8NoBom)

Write-Host "Written: $outputFile"
$fi = Get-Item $outputFile
Write-Host "Size: $($fi.Length) bytes"
$content = [IO.File]::ReadAllText($outputFile, $utf8NoBom)
$lineCount = ($content -split "`n").Count
Write-Host "Lines: $lineCount"

# === PROPER VERIFICATION ===
# We need to distinguish DO $$ blocks from function body $$ delimiters.
# Strategy: track state properly. A "DO $$ BEGIN" opens a DO block.
# A function "AS $$" opens a function body. Both close with "$$;" but
# only DO blocks have "BEGIN" right after "DO $$".
#
# For verification, we count:
# - Lines matching "DO $$ BEGIN" (start of DO block)
# - Lines matching "END $$;" that are NOT preceded by function context
#
# Simpler approach: just verify no broken single-$ DO blocks and no
# CREATE TYPE outside DO blocks. The DO/END balance in the generated
# file includes both DO blocks AND function bodies, so raw counting
# will always be off. Instead, verify structural correctness.

$brokenDo = ([regex]::Matches($content, 'DO \$ BEGIN')).Count
$createTypeOutside = 0
$inDoBlock = $false
$inFunctionBody = $false

foreach ($cl in ($content -split "`n")) {
    $ct = $cl.Trim()

    # Track DO $$ BEGIN blocks
    if ($ct -match '^DO\s+\$\$\s+BEGIN') {
        $inDoBlock = $true
    }
    elseif ($ct -match 'END\s+\$\$\s*;' -and $inDoBlock -and -not $inFunctionBody) {
        $inDoBlock = $false
    }

    # Track function bodies (AS $$ ... $$;)
    if ($ct -match '\bAS\s+\$\$' -or $ct -match '\bLANGUAGE\s+\w+\s+.*\$\$') {
        $inFunctionBody = $true
    }
    if ($inFunctionBody -and $ct -match '^\$\$\s*;') {
        $inFunctionBody = $false
    }

    # Check CREATE TYPE outside DO blocks
    if ($ct -match '^CREATE\s+TYPE\s+' -and -not $inDoBlock) {
        $createTypeOutside++
    }
}

# Count actual DO $$ BEGIN occurrences (our generated ones)
$doBeginCount = ([regex]::Matches($content, '(?m)^DO\s+\$\$\s+BEGIN')).Count
# Count END IF; inside our DO blocks (each DO block has exactly one END IF;)
$endIfCount = ([regex]::Matches($content, '(?m)^\s+END IF;')).Count

Write-Host ""
Write-Host "=== VERIFICATION ==="
Write-Host "Broken DO blocks (single dollar): $brokenDo"
Write-Host "Generated DO BEGIN blocks: $doBeginCount"
Write-Host "END IF statements (should match DO blocks): $endIfCount"
Write-Host "CREATE TYPE outside DO blocks: $createTypeOutside"

$allPassed = $true
if ($brokenDo -gt 0) { Write-Warning "FAIL: Found broken DO blocks with single dollar sign!"; $allPassed = $false }
if ($doBeginCount -ne $endIfCount) { Write-Warning "WARNING: DO/END IF mismatch ($doBeginCount vs $endIfCount) - may be OK if some DO blocks use EXCEPTION instead of IF"; $allPassed = $false }
if ($createTypeOutside -gt 0) { Write-Warning "FAIL: Found CREATE TYPE outside DO blocks!"; $allPassed = $false }

# Check file ends correctly
if ($content.TrimEnd().EndsWith("select 'SETUP_COMPLETE_OK' as resultado;")) {
    Write-Host "File ends with SETUP_COMPLETE_OK marker: YES"
} else {
    Write-Warning "FAIL: File does not end with SETUP_COMPLETE_OK marker!"
    $allPassed = $false
}

# Check no BOM
$bytes = [IO.File]::ReadAllBytes($outputFile)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Warning "FAIL: File has BOM!"
    $allPassed = $false
} else {
    Write-Host "No BOM: YES"
}

if ($allPassed) {
    Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
} else {
    Write-Host "SOME CHECKS FAILED - review warnings above" -ForegroundColor Yellow
}