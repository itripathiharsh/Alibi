# ALIBI Operations Runbook (v0 - Milestone M2b)

This document is the standard operating manual for deploying, monitoring, rotating secrets, and restoring ALIBI in hosted mode (₹0 stack: Render + Neon + Vercel + GitHub Actions).

---

## 1. System Overview & Runtime Modes

ALIBI supports dual runtime modes via the `ALIBI_MODE` environment variable:
- **`local`**: Standalone API process, independent background worker process, PostgreSQL in local Docker compose.
- **`hosted`**: Unified API + Worker process inside a single 512 MB Render container, Neon PostgreSQL with connection pooling, and Vercel web proxy.

---

## 2. Hosted Deployment Procedure

### 2.1 Backend on Render
1. Connect GitHub repository to Render as a Web Service.
2. Select Docker runtime (`infrastructure/docker/backend.Dockerfile`).
3. Set the region to `Singapore` (nearest India).
4. Configure environment variables in the Render Dashboard from `infrastructure/hosted/.env.hosted.example`:
   - `ALIBI_MODE`: `hosted`
   - `ALIBI_ENV`: `cloud`
   - `DATABASE_URL`: `postgresql+asyncpg://...` (from Neon pooled connection string)
   - `ALIBI_SECRET_KEY`: 32+ character high-entropy key
   - `ALIBI_ENCRYPTION_KEY`: 32+ character high-entropy key
   - `DB_POOL_SIZE`: `5`
   - `DB_MAX_OVERFLOW`: `2`
   - `RUN_MIGRATIONS`: `true`
5. Deploy service. The entrypoint will execute `alembic upgrade head` before serving traffic on port 8000.
6. Verify deployment by visiting `https://<render-subdomain>.onrender.com/health/ready`. It must return `{"status":"ok","database":"connected"}`.

### 2.2 Database on Neon
1. Create Neon project on AWS `ap-southeast-1` (Singapore).
2. Extensions `pgvector` and `pg_trgm` are installed automatically via Alembic migration `0001_initial_schema.py`.
3. Use the **Pooled Connection String** (port 5432 or 6543) to support scale-to-zero without connection exhaustion.

### 2.3 Web Dashboard on Vercel
1. Import `apps/web` repository to Vercel Hobby.
2. Set Environment Variable `BACKEND_INTERNAL_URL` = `https://<render-subdomain>.onrender.com`.
3. Vercel automatically proxies `/api/*` and `/health/*` to the Render backend, providing same-origin cookie protection.

---

## 3. Health Checks & Monitoring

| Endpoint | Method | Purpose | Normal Response |
|---|---|---|---|
| `/health/live` | GET | Liveness probe (does not wake sleeping DB) | `{"status":"ok"}` (200) |
| `/health/ready` | GET | Readiness probe (verifies database connectivity) | `{"status":"ok","database":"connected"}` (200) |
| `/api/v1/meta/ping` | GET | API ping and timestamp check | `{"message":"pong"}` (200) |

---

## 4. Rollback Procedure

If a faulty release is deployed to production:
1. **Container Rollback**: In Render Dashboard, go to **Deploys** and click **Rollback** to the last known green commit tag.
2. **Database Rollback (if schema change failed)**:
   - Identify the previous migration revision:
     ```bash
     alembic history
     alembic downgrade <target_revision>
     ```
   - If data corruption occurred, perform a point-in-time restore from the latest encrypted backup (see §5).

---

## 5. Encrypted Backup & Restore Procedure

### 5.1 Automated Nightly Backup
The GitHub Actions workflow `.github/workflows/backup.yml` triggers nightly at 02:00 AM IST:
1. Executes `pg_dump` with custom binary format (`-F c`).
2. Encrypts the archive using `age -r <AGE_PUBLIC_KEY>`.
3. Uploads encrypted `.dump.age` artifact with 90-day retention.

### 5.2 Restore Drill Execution
To verify backup integrity or restore to a fresh database:
```powershell
# PowerShell (Windows)
pwsh -File .\infrastructure\scripts\restore_drill.ps1

# Bash (Linux/macOS)
./infrastructure/scripts/restore_drill.sh
```
The drill validates that:
- `tasks` row counts match exactly pre- and post-restore.
- `time_entries` row counts match exactly pre- and post-restore.
- All primary keys, foreign keys, and indexes are intact.

---

## 6. Secret Rotation Procedure

### 6.1 Database Password Rotation
1. Generate new password in Neon console.
2. Update `DATABASE_URL` in Render environment settings.
3. Render automatically triggers zero-downtime rolling restart.

### 6.2 Application Secret Key Rotation
1. Generate new 32-byte hex key: `openssl rand -hex 32`.
2. Update `ALIBI_SECRET_KEY` in Render environment settings.
3. *Note*: Users will be required to re-authenticate on their devices as existing JWT signatures will be invalidated.

---

## 7. Provider Exit & Migration Procedure

In accordance with ADR-018 and the Zero-Lockin constraint:

### 7.1 Database Migration (Neon → Supabase / Self-Hosted Postgres)
1. Dump complete database using custom format:
   ```bash
   pg_dump -h <neon_host> -U <user> -d <dbname> -F c -f alibi_migration.dump
   ```
2. Restore to target Postgres 16 instance with `pgvector`:
   ```bash
   pg_restore -h <target_host> -U <user> -d <target_db> --no-owner --no-privileges alibi_migration.dump
   ```
3. Update `DATABASE_URL` in backend environment and verify table row counts using `restore_drill`.

### 7.2 Backend Migration (Render → Railway / Fly.io / Docker Host)
1. The backend is packaged as a standard OCI container via `infrastructure/docker/backend.Dockerfile`.
2. Set `ALIBI_MODE=hosted` and inject existing environment variables.
3. Service starts identically across any standard container platform without code changes.

### 7.3 Web Dashboard Migration (Vercel → Cloudflare Pages / Node.js)
1. The web application builds as a standalone Node.js server via `infrastructure/docker/web.Dockerfile`.
2. Can be run directly on any Node.js 22+ runtime or containerized behind standard Nginx reverse proxy.



## 8. Running backend tests on the Windows dev machine (no Docker)

Windows Application Control blocks the venv's `python.exe`, and Docker Desktop currently cannot start (KI-030). Backend checks run inside WSL Ubuntu instead; everything lives in the WSL distro on D:.

One-time setup (already done on 2026-11-22):
- Python tooling: `~/uvtool` (uv) and `~/alibi-backend-venv` (`UV_PROJECT_ENVIRONMENT=$HOME/alibi-backend-venv uv sync --frozen`).
- Database: PostgreSQL 16 + pgvector from conda-forge via micromamba in `~/mamba/root/envs/pgtest`, data in `~/pgtest-data`, port **5434**, role/db `alibi_test` (same as CI).

Each session (in WSL):
```bash
E=$HOME/mamba/root/envs/pgtest/bin
$E/pg_ctl -D ~/pgtest-data -o "-p 5434 -k /tmp" -l ~/pgtest.log -w start
cd /mnt/d/alibi/backend && V=$HOME/alibi-backend-venv/bin
export DATABASE_URL=postgresql+asyncpg://alibi_test:change-me-test@localhost:5434/alibi_test ALIBI_MODE=local
$V/alembic upgrade head
$V/ruff check app tests && $V/ruff format --check app tests && $V/mypy app && $V/lint-imports
$V/python -m pytest tests -p no:cacheprovider -q
$E/pg_ctl -D ~/pgtest-data stop
```
Expected: everything passes except `test_backup_restore` (needs PowerShell). A test that fails with 401 `invalid_token` is the WSL clock step in KI-030; re-run it.

Never point tests at a database without pgvector and never edit applied migrations to make one work (AGENTS.md §6).
