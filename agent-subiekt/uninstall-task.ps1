# Usuwa zadanie synchronizacji z Harmonogramu zadań.
# Uruchomienie (w katalogu agenta):  powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1
$ErrorActionPreference = 'Stop'
$TaskName = 'Portal Archi – sync Subiekt'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Usunięto zadanie „$TaskName”."
} else {
    Write-Host "Zadanie „$TaskName” nie istnieje — nic do usunięcia."
}
