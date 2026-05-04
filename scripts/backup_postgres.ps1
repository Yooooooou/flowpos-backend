param(
    [string]$ComposeProject = "flowpos_backend",
    [string]$Service = "db",
    [string]$Database = "flowpos",
    [string]$User = "flowpos",
    [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $OutputDirectory "$Database-$timestamp.dump"

docker compose -p $ComposeProject exec -T $Service pg_dump -U $User -d $Database -F c | Set-Content -Encoding Byte -Path $backupPath

Write-Output $backupPath
