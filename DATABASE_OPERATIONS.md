# Database Operations

This project uses Alembic migrations as the production schema source of truth. Do not rely on SQLAlchemy table auto-creation in production.

## Migration Checklist

1. Create or review the migration locally.
2. Run the backend test suite.
3. Run the migration against a staging PostgreSQL database.
4. Take a production backup.
5. Run `python -m alembic upgrade head`.
6. Run the production smoke test from `PRODUCTION_RUNBOOK.md`.

## Backup

Create a compressed PostgreSQL dump from the Docker Compose database service:

```powershell
.\scripts\backup_postgres.ps1
```

The script writes a timestamped file under `backups/` and prints the created path.

## Restore

Restore a dump into the Docker Compose database service:

```powershell
.\scripts\restore_postgres.ps1 -BackupPath .\backups\flowpos-YYYYMMDD-HHMMSS.dump
```

The restore command uses `pg_restore --clean --if-exists --no-owner`. Run it only against the intended target database.

## Rollback

Prefer forward-fix migrations for production incidents. If a code rollback is required, use the rollback commit from `PRODUCTION_READINESS.md`, restore a compatible database backup when schema compatibility requires it, and rerun the smoke test.
