# Production Dockerfile for ALIBI backend (API and Worker)
# Implements M0 Task 10, ADR-018, and ADR-020 (minimal size, robust uv execution, hosted mode)

FROM python:3.12-slim-bookworm

WORKDIR /app

# Install uv from official binary
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Set environment
ENV UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH="/app" \
    ALIBI_MODE=hosted

# Copy dependency files
COPY backend/pyproject.toml backend/uv.lock /app/

# Install dependencies into /app/.venv
RUN uv sync --frozen --no-dev

# Copy application code and migrations
COPY backend/app /app/app
COPY backend/migrations /app/migrations
COPY backend/alembic.ini /app/alembic.ini

# Expose default port
EXPOSE 8000

# Start server using uv run uvicorn with dynamic $PORT support
CMD ["sh", "-c", "uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

