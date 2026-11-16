# Multi-stage production Dockerfile for ALIBI backend (API and Worker)
# Implements M0 Task 10, ADR-018, and ADR-020 (minimal size, non-root user, multi-stage)

# Stage 1: Build virtual environment using uv
FROM ghcr.io/astral-sh/uv:latest AS uv-installer

FROM python:3.12-slim-bookworm AS builder
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Copy uv binary
COPY --from=uv-installer /uv /uvx /bin/

# Copy dependency specifications
COPY backend/pyproject.toml backend/uv.lock* /app/

# Install dependencies (frozen, without dev tools, without project code)
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code
COPY backend/app /app/app
COPY backend/pyproject.toml /app/pyproject.toml

# Install project into virtualenv
RUN uv sync --frozen --no-dev

# Stage 2: Minimal runtime image
FROM python:3.12-slim-bookworm AS runner
WORKDIR /app

# Security: non-root user and group
RUN groupadd -g 1000 alibi && \
    useradd -u 1000 -g alibi -s /bin/sh -m alibi

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app:$PYTHONPATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ALIBI_MODE=hosted

# Copy virtualenv and code from builder
COPY --from=builder --chown=alibi:alibi /app/.venv /app/.venv
COPY --from=builder --chown=alibi:alibi /app/app /app/app
COPY --from=builder --chown=alibi:alibi /app/pyproject.toml /app/pyproject.toml
COPY --chown=alibi:alibi backend/migrations /app/migrations
COPY --chown=alibi:alibi backend/alembic.ini /app/alembic.ini
COPY --chown=alibi:alibi infrastructure/docker/entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

USER alibi

EXPOSE 8000

# Default command runs the entrypoint script
CMD ["/bin/sh", "/app/entrypoint.sh"]
