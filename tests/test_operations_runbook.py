from pathlib import Path


def test_operations_runbook_covers_daily_ops_incidents_and_sensitive_data() -> None:
    runbook = Path("OPERATIONS_RUNBOOK.md").read_text(encoding="utf-8")

    assert "Daily Checks" in runbook
    assert "Incident Checklist" in runbook
    assert "Rollback" in runbook
    assert "backup_postgres.ps1" in runbook
    assert "restore_postgres.ps1" in runbook
    assert "Sensitive Data Rules" in runbook
