#!/bin/sh
set -e

export PYTHONPATH="/app:${PYTHONPATH}"

echo "Starting ALIBI Backend on port ${PORT:-8000}..."
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
