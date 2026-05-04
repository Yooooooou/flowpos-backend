# Production Readiness Tracker

Status values: `todo`, `in_progress`, `blocked`, `review`, `done`.

| Stage | Scope | Status | Rollback point | Verification |
| --- | --- | --- | --- | --- |
| 1 | Production criteria and progress tracker | done | b9f43f9 | Tracker exists and defines done criteria |
| 2 | Safe production config and demo seed separation | done | e88e71f | Unsafe production settings fail fast; tests pass |
| 3 | Auth hardening and access-control tests | done | 0bce1ba | Login abuse is limited; token lifecycle and RBAC tests pass |
| 4 | API and Docker hardening | done | pending | Non-root API image, healthcheck, docs gating, CORS checks |
| 5 | Database migrations, backup, and restore | todo | pending | Clean migrations, backup script, restore runbook |
| 6 | Observability | todo | pending | Structured logs, request ids, metrics, error tracking hooks |
| 7 | Expanded test coverage | todo | pending | Critical business flows and negative paths covered |
| 8 | CI/CD | todo | pending | Automated tests, builds, scans, and deploy gates |
| 9 | Production deploy runbook | todo | pending | Real deploy checklist and smoke test path documented |
| 10 | POS business production features | todo | pending | Shifts, payments, refunds, discounts, reports, device agent protocol |
| 11 | Operator documentation | todo | pending | Runbooks for deploy, backup, restore, incident response, rollback |

## Stage 1 Done Criteria

- Production-readiness work is split into ordered stages.
- Each stage has a concrete verification target.
- Each completed stage is committed separately so the previous state can be restored with Git.

## Stage 2 Done Criteria

- The app refuses to start in production with the default secret key.
- The app refuses to start in production with `AUTO_CREATE_TABLES=true`.
- The app refuses to use SQLite in production unless explicitly allowed for a one-off local smoke test.
- Docker Compose no longer seeds demo data as part of the API startup path.
- Environment examples separate development/demo defaults from production placeholders.
- Tests cover unsafe production configuration.

## Stage 3 Done Criteria

- Login attempts are rate-limited.
- Authentication events are auditable without logging passwords or tokens.
- Access token behavior is tested, including invalid and revoked/rotated flows where implemented.
- RBAC negative paths are covered for users, orders, analytics, and peripherals.

## Stage 4 Done Criteria

- The API container runs as a non-root user.
- Containers expose healthchecks suitable for orchestration.
- API docs can be disabled or restricted in production.
- CORS fails fast in production if localhost/demo origins are configured.
- Security headers are configured at the reverse proxy layer.

## Stage 5 Done Criteria

- Alembic migrations run on a clean PostgreSQL database.
- Production startup does not rely on ORM table auto-creation.
- Backup and restore commands are documented and smoke-tested.
- Core query paths have indexes and constraints that match production usage.

## Stage 6 Done Criteria

- Logs are structured enough for production debugging.
- Every request has a correlation/request id.
- Exceptions are captured with safe context.
- Health/readiness checks cover external dependencies.
- Operational alerts are documented.

## Stage 7 Done Criteria

- Tests use isolated database state.
- Critical positive and negative backend flows are covered.
- Frontend production build is checked.
- WebSocket/Redis behavior has at least a smoke-level integration test.

## Stage 8 Done Criteria

- CI runs backend tests.
- CI runs frontend build/typecheck.
- CI validates Docker Compose configuration.
- CI builds container images.
- CI runs dependency/security scans or documents the selected scanner.

## Stage 9 Done Criteria

- DNS, TLS, secrets, migrations, first-admin creation, health checks, and smoke tests are documented.
- Rollback steps are documented.
- A production smoke test can be performed without reading source code.

## Stage 10 Done Criteria

- Production POS gaps are tracked as product requirements.
- Payments, refunds, discounts, taxes/fees, shifts, reports, and device-agent reliability have implementation tasks.

## Stage 11 Done Criteria

- Operators have runbooks for deploy, backup, restore, incident response, and rollback.
- Development/demo operation is clearly separated from production operation.
