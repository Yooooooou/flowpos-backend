from uuid import uuid4

from sqlalchemy import select

from app.admin import create_manager, main
from app.db.session import SessionLocal
from app.models import User, UserRole


def test_create_manager_cli_helper_creates_manager_user() -> None:
    username = f"manager-{uuid4()}"
    user_id = create_manager(username, "Production Manager", "strongpass123")

    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        assert user is not None
        assert user.username == username
        assert user.role == UserRole.manager
    finally:
        db.close()


def test_create_manager_rejects_duplicate_username() -> None:
    username = f"duplicate-{uuid4()}"
    create_manager(username, "Production Manager", "strongpass123")

    result = main(["create-manager", "--username", username, "--full-name", "Again", "--password", "strongpass123"])

    assert result == 1
