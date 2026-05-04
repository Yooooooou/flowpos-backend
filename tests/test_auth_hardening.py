from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import AuthAuditEvent
from app.routers.auth import _login_failures
from tests.test_api import client, token


def test_login_rate_limits_repeated_failures() -> None:
    _login_failures.clear()

    for _ in range(5):
        response = client.post("/auth/login", json={"username": "rate-limit-user", "password": "bad"})
        assert response.status_code == 401

    limited = client.post("/auth/login", json={"username": "rate-limit-user", "password": "bad"})
    assert limited.status_code == 429


def test_login_writes_safe_audit_events() -> None:
    _login_failures.clear()

    response = client.post("/auth/login", json={"username": "waiter", "password": "waiter123"})
    assert response.status_code == 200, response.text

    db = SessionLocal()
    try:
        event = db.scalar(
            select(AuthAuditEvent)
            .where(AuthAuditEvent.username == "waiter", AuthAuditEvent.event_type == "login.succeeded")
            .order_by(AuthAuditEvent.id.desc())
        )
        assert event is not None
        assert event.user_agent is not None
    finally:
        db.close()


def test_refresh_token_rotates_and_logout_revokes_latest_session() -> None:
    login = client.post("/auth/login", json={"username": "waiter", "password": "waiter123"})
    assert login.status_code == 200, login.text
    first_refresh_token = login.json()["refresh_token"]

    refreshed = client.post("/auth/refresh", json={"refresh_token": first_refresh_token})
    assert refreshed.status_code == 200, refreshed.text
    second_refresh_token = refreshed.json()["refresh_token"]
    assert second_refresh_token != first_refresh_token

    reused = client.post("/auth/refresh", json={"refresh_token": first_refresh_token})
    assert reused.status_code == 401

    logout = client.post("/auth/logout", json={"refresh_token": second_refresh_token})
    assert logout.status_code == 204

    after_logout = client.post("/auth/refresh", json={"refresh_token": second_refresh_token})
    assert after_logout.status_code == 401


def test_waiter_cannot_access_manager_user_list() -> None:
    waiter_token = token("waiter", "waiter123")

    response = client.get("/users", headers={"Authorization": f"Bearer {waiter_token}"})

    assert response.status_code == 403
