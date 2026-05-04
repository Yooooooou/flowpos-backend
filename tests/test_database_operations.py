from pathlib import Path


def test_database_operations_runbook_exists() -> None:
    runbook = Path("DATABASE_OPERATIONS.md").read_text(encoding="utf-8")

    assert "python -m alembic upgrade head" in runbook
    assert "backup_postgres.ps1" in runbook
    assert "restore_postgres.ps1" in runbook


def test_backup_and_restore_scripts_use_postgres_tools() -> None:
    backup_script = Path("scripts/backup_postgres.ps1").read_text(encoding="utf-8")
    restore_script = Path("scripts/restore_postgres.ps1").read_text(encoding="utf-8")

    assert "pg_dump" in backup_script
    assert "pg_restore" in restore_script
    assert "--clean --if-exists" in restore_script
