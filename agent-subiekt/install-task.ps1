# Rejestruje w Harmonogramie zadań codzienną synchronizację Subiekt GT → Portal Architekta (20:00).
# Uruchomienie (w katalogu agenta):  powershell -ExecutionPolicy Bypass -File .\install-task.ps1
# Zadanie działa na koncie bieżącego użytkownika, także gdy nikt nie jest zalogowany (wymaga hasła konta),
# bez najwyższych uprawnień. Ponowne uruchomienie skryptu zastępuje istniejące zadanie.
param(
    [string]$Time = '20:00',
    [System.Security.SecureString]$Password
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Portal Archi – sync Subiekt'
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MainJs = Join-Path $AgentDir 'dist\main.js'

$Node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $Node) { throw 'Nie znaleziono node.exe. Zainstaluj Node.js 22 LTS i otwórz nowe okno PowerShell.' }
if (-not (Test-Path $MainJs)) { throw "Brak $MainJs. Najpierw wykonaj: npm ci, a potem npm run build." }
if (-not (Test-Path (Join-Path $AgentDir '.env'))) { throw 'Brak pliku .env w katalogu agenta (skopiuj .env.example jako .env i uzupełnij).' }

$User = "$env:USERDOMAIN\$env:USERNAME"
if (-not $Password) { $Password = Read-Host -AsSecureString "Hasło konta Windows $User (potrzebne, żeby zadanie działało bez zalogowania)" }

$Action = New-ScheduledTaskAction -Execute $Node.Source -Argument "`"$MainJs`"" -WorkingDirectory $AgentDir
$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Hasło jawnym tekstem tylko na czas rejestracji; kopia w pamięci niezarządzanej jest zerowana w finally.
$Bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
try {
    $Plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
    # -Force zastępuje istniejące zadanie w jednym kroku (bez okna, w którym zadania nie ma).
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings `
        -User $User -Password $Plain -RunLevel Limited -Force `
        -Description 'Codzienna synchronizacja dokumentów architektów z Subiekta GT do Portalu Architekta (agent-subiekt).' | Out-Null
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
    $Plain = $null
}

Write-Host "Zarejestrowano zadanie „$TaskName”: codziennie o $Time, konto $User."
Write-Host "Test: Harmonogram zadań → Biblioteka Harmonogramu zadań → „$TaskName” → Uruchom; log w $AgentDir\logs."
