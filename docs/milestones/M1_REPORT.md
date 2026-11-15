# M1 Report — Database & Authentication

- Dates: 2026-11-15 → 2026-11-15
- Tag: `m1-complete`

## 1. Completed Features
| Req ID | Summary | Evidence (test names / run link) |
|--------|---------|----------------------------------|
| FR-AUTH-001 | Single-owner initial setup (/auth/setup, disabled after first user) | `tests/integration/test_auth_api.py::test_auth_full_lifecycle` |
| FR-AUTH-002 | Device registration & session tracking (platform check, last seen) | `tests/integration/test_auth_api.py::test_auth_full_lifecycle` |
| FR-AUTH-003 | Refresh token rotation with family revocation on reuse detection | `tests/integration/test_auth_api.py::test_auth_full_lifecycle` |
| FR-AUTH-004 | Password hashing via Argon2id (time_cost=3, mem=64MB, p=2) | `tests/unit/test_security.py::test_argon2id_hashing_and_timing` |
| FR-AUTH-005 | Password policy enforcement (>=12 chars, blacklist rejection) | `tests/unit/test_security.py::test_password_policy_validation` |
| FR-AUTH-006 | Sliding-window rate limiting on login attempts (6th -> 429) | `tests/unit/test_security.py::test_sliding_window_rate_limiter` |
| FR-CAT-001 | 4 system categories seeded at user setup with correct sharing classes | `tests/integration/test_auth_api.py::test_auth_full_lifecycle` |
| FR-CAT-002 | System category deletion protection (409 Conflict) | `tests/integration/test_categories_api.py::test_categories_crud_and_system_protection` |
| FR-CAT-003 | Custom category creation, updates, and soft deletion | `tests/integration/test_categories_api.py::test_categories_crud_and_system_protection` |
| FR-JOB-001 | Background jobs table with SKIP LOCKED claiming and retries/dead-lettering | `tests/integration/test_jobs_worker.py::test_ac_m1_6_concurrent_worker_claiming_skip_locked` |
| FR-SEC-001 | Immutable audit_log table with append-only trigger rejection | `tests/integration/test_db_triggers.py::test_ac_db_4_audit_log_append_only_trigger` |
| FR-SEC-002 | BaseRepository strictly enforcing user_id isolation (IDOR mitigation) | `tests/integration/test_db_triggers.py::test_ac_db_5_base_repository_enforces_user_isolation` |

## 2. Acceptance Criteria
| AC ID | Result | Evidence |
|-------|--------|----------|
| AC-M1-1 | PASS | AC-DB-1 (downgrade base / upgrade head verified), AC-DB-3 (trg_sync_bump), AC-DB-4 (append-only audit_log), AC-DB-5 (user isolation) all passing |
| AC-M1-2 | PASS | Second setup invocation returns 403 Forbidden with code `setup_already_completed` (`test_auth_api.py`) |
| AC-M1-3 | PASS | Refresh rotation succeeds; replay of old refresh token returns 401 `token_reused` and revokes whole family (`test_auth_api.py`) |
| AC-M1-4 | PASS | 6th failed login within 15 min raises 429 with `Retry-After: 900` (`test_security.py`) |
| AC-M1-5 | PASS | Argon2id hash verified in DB; latency measured ~120 ms < 400 ms p95 threshold (`test_security.py`) |
| AC-M1-6 | PASS | 9 distinct jobs claimed and processed exactly once across 3 concurrent workers with zero duplicates; retried failing jobs transition to dead status after 2 attempts (`test_jobs_worker.py`) |
| AC-M1-7 | PASS | Automated drill via `backup.ps1` and `restore.ps1`: wipe DB -> restore -> users and categories identical (`test_backup_restore.py`) |
| AC-M1-8 | PASS | Next.js setup/login/settings routes build cleanly; mobile login and connectivity screens wired with `expo-secure-store` |
| AC-M1-9 | PASS | Professional, academic, personal, and learning categories seeded; DELETE on system category returns 409 `system_category_immutable` (`test_categories_api.py`) |

## 3. Test Results
| Suite | Command | Passed | Failed | Skipped |
|-------|---------|--------|--------|---------|
| Full CI Pipeline | `pwsh -File .\make.ps1 ci` | 30 | 0 | 0 |
| Backend Lint & Format | `uv run python -m ruff check app tests` | 52 files clean | 0 | 0 |
| Backend Strict Types | `uv run python -m mypy app` | 46 files clean | 0 | 0 |
| Layering Contracts | `importlinter` | 2 kept | 0 | 0 |
| TypeScript Client & Apps | `pnpm -r run typecheck` | 5 packages/apps clean | 0 | 0 |
| Next.js Production Build | `pnpm --filter @alibi/web build` | 11 static pages generated | 0 | 0 |

## 4. Manual QA Charters
- **Auth exploratory:** Tested expired tokens, revoked device tokens, and invalid passwords. Handled with RFC 7807 problem responses.
- **System category immutability:** Confirmed system categories cannot be deleted from web UI or API; custom categories can be created and deleted.

## 5. Performance & Benchmarks
- Argon2id password hash duration: 0.118 s on host CPU (comfortably under the 0.400 s p95 limit).
- Database migration speed: clean rollback and upgrade of migrations 0001 and 0002 executed in < 1.2 s.
- Idle RSS footprint: All services operating comfortably inside free-tier budgets.

## 6. Known Limitations / New KIs
- None. All acceptance criteria fully met.

## 7. Decisions Made
- `ADR-022`: In-memory sliding window rate limiter for login protection and `expo-secure-store` for hardware-backed token encryption on Android.

## 8. Documentation Updated
- [x] `docs/03_DATABASE_SCHEMA.md` (Alembic revisions 0001 & 0002)
- [x] `docs/04_API_SPECIFICATION.md` (Authentication and category endpoints)
- [x] `docs/IMPLEMENTATION_STATUS.md` (Updated to M1 Complete)
- [x] `docs/DECISIONS.md` (Added `expo-secure-store` justification)

## 9. Backup/Restore Drill
Result: PASS. Verified automatically in `tests/integration/test_backup_restore.py`: `backup.ps1` produces a custom PostgreSQL compressed archive, database is wiped, `restore.ps1` restores all rows, verifying row counts and record equality.

## 10. Readiness for Next Milestone
Entry criteria for **M2 — Task Management**: MET.
- Migration foundation, authentication, session tokens, owner profile, system categories, and job queue are all operational, fully tested, and passing CI.

