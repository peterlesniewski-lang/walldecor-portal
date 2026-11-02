# Uruchamia zapytania kontrolne A–F (katalog .\sql) na bazie Subiekta GT loginem tylko do odczytu
# i zapisuje wyniki do plików tekstowych. Nie zmienia nic w bazie ani w systemie.
#
# Użycie (PowerShell, w katalogu z tym plikiem):
#   powershell -ExecutionPolicy Bypass -File .\uruchom-A-F.ps1
# Parametry opcjonalne: -Server 'localhost\INSERTGT' -Database 'WD_sp' -User 'portal_reader'
#                       -EnvFile 'C:\PortalArchi\agent-subiekt\.env' -OutRoot 'C:\PortalArchi\sql-wyniki'
#
# Hasło: brane z pliku .env agenta (SUBIEKT_DB_PASSWORD), jeśli istnieje; inaczej skrypt pyta.
# Hasło nie trafia do żadnego pliku wynikowego ani do linii poleceń (zmienna SQLCMDPASSWORD tylko w tym procesie).

param(
    [string]$Server = 'localhost\INSERTGT',
    [string]$Database = 'WD_sp',
    [string]$User = 'portal_reader',
    [string]$EnvFile = 'C:\PortalArchi\agent-subiekt\.env',
    [string]$OutRoot = 'C:\PortalArchi\sql-wyniki'
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sqlDir = Join-Path $here 'sql'
$stamp = Get-Date -Format 'yyyy-MM-dd'
$out = Join-Path $OutRoot "A-F-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null

# --- 1. sqlcmd ---------------------------------------------------------------------------------
$sqlcmd = $null
$cmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
if ($cmd) { $sqlcmd = $cmd.Source }
if (-not $sqlcmd) {
    $roots = @('C:\Program Files\Microsoft SQL Server', 'C:\Program Files (x86)\Microsoft SQL Server', 'C:\Program Files\SqlCmd')
    $found = foreach ($r in $roots) {
        if (Test-Path $r) { Get-ChildItem -Path $r -Recurse -Filter 'SQLCMD.EXE' -ErrorAction SilentlyContinue }
    }
    if ($found) { $sqlcmd = ($found | Sort-Object FullName -Descending | Select-Object -First 1).FullName }
}
if (-not $sqlcmd) {
    Write-Host 'BRAK sqlcmd. Zainstaluj poleceniem:  winget install --id Microsoft.Sqlcmd -e   (albo użyj ścieżki 2 z INSTRUKCJA.md — SSMS).'
    exit 1
}
Write-Host "sqlcmd: $sqlcmd"

# --- 2. hasło ----------------------------------------------------------------------------------
$password = $null
if (Test-Path $EnvFile) {
    $line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*SUBIEKT_DB_PASSWORD\s*=' } | Select-Object -First 1
    if ($line) {
        $password = ($line -replace '^\s*SUBIEKT_DB_PASSWORD\s*=', '').Trim()
        if ($password.Length -ge 2 -and $password.StartsWith('"') -and $password.EndsWith('"')) {
            $password = $password.Substring(1, $password.Length - 2)
        }
        if ($password) { Write-Host "Hasło: z pliku $EnvFile" }
    }
}
if (-not $password) {
    $sec = Read-Host -Prompt "Hasło loginu SQL '$User'" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $password) { Write-Host 'Brak hasła — przerwano.'; exit 1 }
if ($User -ne 'portal_reader') { Write-Host "Dozwolony jest wyłącznie login portal_reader (podano: $User) — przerwano."; exit 1 }
$env:SQLCMDPASSWORD = $password
$exitCode = 0
try {

# --- 3. połączenie: tylko podana instancja (-Server) --------------------------------------------
function Test-Connection-Sql([string]$srv) {
    & $sqlcmd -S $srv -U $User -d $Database -Q 'SET NOCOUNT ON; SELECT 1 AS ok;' -b -l 15 *> $null
    return ($LASTEXITCODE -eq 0)
}
$servers = @($Server)   # bez automatycznego przełączania na inną instancję — zmień -Server jawnie
$srv = $null
foreach ($s in $servers) {
    Write-Host "Próba połączenia: $s ..."
    if (Test-Connection-Sql $s) { $srv = $s; break }
}
if (-not $srv) {
    Write-Host "NIE UDAŁO SIĘ połączyć jako '$User' z bazą '$Database' (próby: $($servers -join ', ')). Sprawdź hasło, nazwę instancji, czy usługa SQL działa."
    $exitCode = 2
    throw 'brak połączenia'
}
Write-Host "Połączono: $srv / $Database jako $User"

# --- 4. zapytania ------------------------------------------------------------------------------
$order = @('00-srodowisko', 'A', 'A2', 'A3', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L')
$summary = @()
foreach ($name in $order) {
    $file = Join-Path $sqlDir "$name.sql"
    if (-not (Test-Path $file)) {
        if ($name -eq 'F') { $summary += "F: pominięte (brak sql\F.sql — uzupełnij F-szablon.sql po wynikach A/A2/A3 albo wpisz w raporcie 'brak KSeF w bazie')" }
        else { $summary += "${name}: BRAK PLIKU $file"; $exitCode = 3 }
        continue
    }
    $outFile = Join-Path $out "$name.txt"
    Write-Host "Zapytanie $name -> $outFile"
    & $sqlcmd -S $srv -U $User -d $Database -i $file -o $outFile -W -w 4000 -s '|' -I -l 30 -t 120 -f 65001 -b 2>&1 | Out-File -FilePath (Join-Path $out "$name.stderr.txt") -Encoding UTF8
    $code = $LASTEXITCODE
    $errFile = Join-Path $out "$name.stderr.txt"
    if ((Test-Path $errFile) -and (Get-Item $errFile).Length -eq 0) { Remove-Item $errFile }
    $lines = 0
    if (Test-Path $outFile) { $lines = (Get-Content $outFile | Measure-Object -Line).Lines }
    $status = if ($code -eq 0) { 'OK' } else { $exitCode = 3; "BŁĄD (kod $code — treść błędu jest w pliku .txt / .stderr.txt)" }
    $summary += "${name}: $status, linii: $lines"
}

# --- 5. podsumowanie i szablon raportu --------------------------------------------------------
$info = @(
    "Data: $stamp",
    "Serwer: $srv",
    "Baza: $Database",
    "Login: $User",
    "sqlcmd: $sqlcmd",
    "Komputer: $env:COMPUTERNAME",
    ''
) + $summary
$info | Set-Content -Path (Join-Path $out 'WYNIK.txt') -Encoding UTF8
foreach ($template in Get-ChildItem -Path $here -Filter 'RAPORT-*-szablon.md') {
    $report = Join-Path $out ($template.Name -replace '-szablon', '')
    if (-not (Test-Path $report)) {
        (Get-Content $template.FullName -Raw) -replace '<<DATA>>', $stamp -replace '<<SERWER>>', $srv -replace '<<BAZA>>', $Database -replace '<<KOMPUTER>>', $env:COMPUTERNAME |
            Set-Content -Path $report -Encoding UTF8
    }
}
Write-Host ''
Write-Host '=== PODSUMOWANIE ==='
$summary | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host "Wyniki: $out"
Write-Host 'Do odesłania: cały katalog powyżej (bez hasła; pliki zawierają numery i kwoty dokumentów, nie zawierają nazw klientów).'
}
catch {
    if ($_.Exception.Message -ne 'brak połączenia') { Write-Host "Błąd skryptu: $($_.Exception.Message)"; if ($exitCode -eq 0) { $exitCode = 4 } }
}
finally {
    $env:SQLCMDPASSWORD = $null
    $password = $null
}
exit $exitCode
