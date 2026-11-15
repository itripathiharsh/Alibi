#!/usr/bin/env bash
set -euo pipefail

# ALIBI Production Container Entrypoint
# In hosted mode or when RUN_MIGRATIONS=true, execute database migrations before startup

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "Running database migrations (alembic upgrade head)..."
    alembic upgrade head
    echo "Database migrations complete."
fi

# Run uvicorn server
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

