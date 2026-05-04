param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,
    [string]$ComposeProject = "flowpos_backend",
    [string]$Service = "db",
    [string]$Database = "flowpos",
    [string]$User = "flowpos"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupPath)) {
    throw "Backup file not found: $BackupPath"
}

Get-Content -Encoding Byte -Path $BackupPath | docker compose -p $ComposeProject exec -T $Service pg_restore -U $User -d $Database --clean --if-exists --no-owner

Write-Output "Restored $BackupPath into $Database"
