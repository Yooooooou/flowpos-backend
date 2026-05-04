from pathlib import Path


def test_ci_workflow_runs_core_checks() -> None:
    workflow = Path(".github/workflows/ci.yml").read_text(encoding="utf-8")

    assert "python -m pytest -q" in workflow
    assert "python -m alembic upgrade head" in workflow
    assert "npm run build" in workflow
    assert "docker compose config --quiet" in workflow
    assert "pip-audit" in workflow
    assert "npm audit" in workflow
    assert "postgres:" in workflow
    assert "docker build -t flowpos-api:test ." in workflow
