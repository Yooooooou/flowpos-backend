#!/bin/sh
set -e

echo "=== Running database migrations ==="
if timeout 20 alembic upgrade head; then
    echo "=== Migrations OK ==="
else
    echo "=== Migrations failed or timed out, starting anyway ==="
fi

echo "=== Starting uvicorn on port ${PORT:-8000} ==="
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
