from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Flow-POS Backend"
    environment: str = "development"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    refresh_token_expire_minutes: int = 60 * 24 * 30
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 60
    database_url: str = "sqlite:///./flowpos.db"
    redis_url: str | None = None
    auto_create_tables: bool = True
    allow_sqlite_in_production: bool = False
    backend_cors_origins: str = "http://localhost:3000,http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.environment.lower() != "production":
            return self

        if self.secret_key == "change-me-in-production" or len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY must be changed to a strong value in production")
        if self.auto_create_tables:
            raise ValueError("AUTO_CREATE_TABLES must be false in production; use Alembic migrations")
        if self.database_url.startswith("sqlite") and not self.allow_sqlite_in_production:
            raise ValueError("SQLite is not allowed in production unless explicitly enabled")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
