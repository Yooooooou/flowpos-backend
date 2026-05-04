import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_rejects_default_secret() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(
            environment="production",
            secret_key="change-me-in-production",
            auto_create_tables=False,
            database_url="postgresql+psycopg://user:pass@db:5432/app",
        )


def test_production_rejects_auto_create_tables() -> None:
    with pytest.raises(ValidationError, match="AUTO_CREATE_TABLES"):
        Settings(
            environment="production",
            secret_key="a-production-secret-with-enough-entropy",
            auto_create_tables=True,
            database_url="postgresql+psycopg://user:pass@db:5432/app",
        )


def test_production_rejects_sqlite_by_default() -> None:
    with pytest.raises(ValidationError, match="SQLite"):
        Settings(
            environment="production",
            secret_key="a-production-secret-with-enough-entropy",
            auto_create_tables=False,
            database_url="sqlite:///./flowpos.db",
        )


def test_production_accepts_safe_database_settings() -> None:
    settings = Settings(
        environment="production",
        secret_key="a-production-secret-with-enough-entropy",
        auto_create_tables=False,
        database_url="postgresql+psycopg://user:pass@db:5432/app",
        backend_cors_origins="https://pos.example.com",
    )

    assert settings.environment == "production"


def test_production_rejects_local_cors_origins() -> None:
    with pytest.raises(ValidationError, match="local development origins"):
        Settings(
            environment="production",
            secret_key="a-production-secret-with-enough-entropy",
            auto_create_tables=False,
            database_url="postgresql+psycopg://user:pass@db:5432/app",
            backend_cors_origins="https://pos.example.com,http://localhost:5173",
        )
