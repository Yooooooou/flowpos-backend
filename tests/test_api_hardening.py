from fastapi.testclient import TestClient

from app import main


def test_docs_can_be_disabled(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "docs_enabled", False)
    app = main.create_app()

    response = TestClient(app).get("/docs")

    assert response.status_code == 404
    monkeypatch.setattr(main.settings, "docs_enabled", True)


def test_health_is_registered_on_created_apps() -> None:
    app = main.create_app()

    response = TestClient(app).get("/health")

    assert response.status_code == 200
