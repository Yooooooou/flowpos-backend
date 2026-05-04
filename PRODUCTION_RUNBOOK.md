# Production Runbook

## Prerequisites

- A server with Docker and Docker Compose.
- DNS records pointing the POS domain to the server.
- A copied production environment file based on `.env.prod.example`.
- PostgreSQL and Redis volumes backed by durable storage.

## First Deploy

1. Copy `.env.prod.example` to `.env` and replace every placeholder.
2. Set `ENVIRONMENT=production`.
3. Set a random `SECRET_KEY` with at least 32 characters.
4. Set `AUTO_CREATE_TABLES=false`.
5. Set `DOCS_ENABLED=false` unless API docs are intentionally protected elsewhere.
6. Set `BACKEND_CORS_ORIGINS` to the real frontend origin.
7. Update `Caddyfile` with the real domain and HTTPS configuration.
8. Run `docker compose config --quiet`.
9. Run `docker compose build`.
10. Run `docker compose up -d db redis`.
11. Run `docker compose run --rm api alembic upgrade head`.
12. Create the first manager user with an approved one-off admin command or a temporary sealed seed script.
13. Run `docker compose up -d`.

## Smoke Test

Run after every deploy:

```powershell
curl https://pos.example.com/health
curl https://pos.example.com/health/ready
```

Then verify through the UI:

1. Manager can log in.
2. Waiter can create an order.
3. Kitchen can move the order to `in_progress` and `ready`.
4. Waiter can move the order to `served` and `paid`.
5. Receipt job can be queued.
6. Manager analytics loads.

## Backup Before Deploy

```powershell
.\scripts\backup_postgres.ps1
```

Keep the printed backup path with the release notes.

## Rollback

1. Identify the previous rollback commit in `PRODUCTION_READINESS.md`.
2. Deploy the previous image or checkout the previous commit.
3. If the database schema is incompatible, restore the backup captured before deploy:

```powershell
.\scripts\restore_postgres.ps1 -BackupPath .\backups\flowpos-YYYYMMDD-HHMMSS.dump
```

4. Run the smoke test again.

## Post-Deploy Checks

- `docker compose ps`
- `docker compose logs --tail=200 api`
- `/metrics` request counters increase.
- No sustained 5xx logs.
- PostgreSQL disk usage is healthy.
- Print jobs are not stuck in `queued` or `processing`.
