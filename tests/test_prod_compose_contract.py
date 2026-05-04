from pathlib import Path


def test_prod_compose_requires_real_secrets_and_env() -> None:
    compose = Path("docker-compose.prod.yml").read_text(encoding="utf-8")

    assert "${POSTGRES_PASSWORD:?" in compose
    assert "ENVIRONMENT: production" in compose
    assert "DOCS_ENABLED: \"false\"" in compose
    assert ".env.example" not in compose
