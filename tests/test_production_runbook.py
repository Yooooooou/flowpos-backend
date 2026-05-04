from pathlib import Path


def test_production_runbook_covers_deploy_smoke_and_rollback() -> None:
    runbook = Path("PRODUCTION_RUNBOOK.md").read_text(encoding="utf-8")

    assert "docker compose run --rm api alembic upgrade head" in runbook
    assert "Smoke Test" in runbook
    assert "Rollback" in runbook
    assert "backup_postgres.ps1" in runbook
    assert "restore_postgres.ps1" in runbook
