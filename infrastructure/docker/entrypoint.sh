#!/bin/sh
set -e

export PYTHONPATH="/app:${PYTHONPATH}"

if [ "${RUN_MIGRATIONS}" = "true" ]; then
    echo "Running database migrations..."
    alembic upgrade head || echo "Migration warning: proceeding with startup"
    echo "Database migrations checked."
fi

echo "Starting Uvicorn on port ${PORT:-8000}..."
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
