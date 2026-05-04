# Operations Runbook

## Daily Checks

```powershell
docker compose ps
docker compose logs --tail=100 api
curl https://pos.example.com/health
curl https://pos.example.com/health/ready
```

Check:

- API and frontend containers are healthy.
- PostgreSQL and Redis containers are healthy.
- No repeated 5xx errors appear in API logs.
- `/metrics` request counters are increasing.
- Print jobs are not stuck in `queued` or `processing`.

## Backup Schedule

- Run a database backup before every deploy.
- Run at least one automated daily database backup.
- Periodically restore a backup into a non-production environment to verify it is usable.

Manual command:

```powershell
.\scripts\backup_postgres.ps1
```

## Restore Procedure

1. Confirm the target environment.
2. Stop API traffic if restoring production.
3. Restore the selected backup:

```powershell
.\scripts\restore_postgres.ps1 -BackupPath .\backups\flowpos-YYYYMMDD-HHMMSS.dump
```

4. Start the stack.
5. Run the smoke test from `PRODUCTION_RUNBOOK.md`.

## Incident Checklist

1. Check `/health` and `/health/ready`.
2. Check `docker compose ps`.
3. Inspect API logs with `docker compose logs --tail=200 api`.
4. Check PostgreSQL disk space and connectivity.
5. Check Redis connectivity if real-time updates are failing.
6. Check stuck print jobs if receipts are failing.
7. Decide whether to rollback, forward-fix, or restore from backup.

## Rollback

Use `PRODUCTION_READINESS.md` to find rollback commits for completed stages. For application-only rollback, deploy the previous image or checkout the previous commit. For schema-incompatible rollback, restore the backup captured before deploy.

## First Manager User

Do not run the demo seed in production. Create the first manager through an approved one-off command, record who approved it, then rotate temporary credentials immediately.

## Sensitive Data Rules

- Never paste passwords, access tokens, refresh tokens, or full `.env` files into tickets or chat.
- Redact `Authorization` headers from logs.
- Treat database backups as sensitive production data.
