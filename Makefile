.PHONY: help doctor up down check test migrate openapi client ci bench backup restore

help:
	@echo "ALIBI Makefile targets:"
	@echo "  doctor      Check dev environment tools and versions"
	@echo "  up          Start Docker Compose stack (postgres, api, worker, web)"
	@echo "  down        Stop Docker Compose stack"
	@echo "  check       Run linters and typecheckers (ruff, mypy, eslint, tsc)"
	@echo "  test        Run automated test suites"
	@echo "  migrate     Apply Alembic database migrations"
	@echo "  openapi     Export OpenAPI schema from FastAPI backend"
	@echo "  client      Regenerate TypeScript API client"
	@echo "  ci          Run full local CI pipeline"

doctor:
	@bash infrastructure/scripts/doctor.sh || ./infrastructure/scripts/doctor.ps1

up:
	docker compose up -d

down:
	docker compose down

check:
	cd backend && uv run ruff check app tests && uv run ruff format --check app tests && uv run mypy app
	pnpm -r run lint
	pnpm -r run typecheck

test:
	cd backend && uv run pytest
	pnpm -r run test

migrate:
	cd backend && uv run alembic upgrade head

openapi:
	cd backend && uv run python -m app.main --export-openapi

client:
	pnpm --filter @alibi/api-client run build

ci: check test
