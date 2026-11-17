# 14 — Testing, QA & Acceptance

## 1. Quality principles
1. Nothing is "done" without a passing automated test at the right level (AGENTS R13).
2. Tests use real PostgreSQL (container), never SQLite stand-ins for the backend.
3. External AI is never called in CI; a **recorded fake provider** returns fixtures. Real-model evals run nightly/manually and are reported, not gating (except deterministic grounding metrics, which gate).
4. Mocks are allowed only at process boundaries (HTTP to providers, OS notifications, microphone). Business logic is never mocked in integration tests.
5. Every requirement ID maps to ≥ 1 test (doc 16). CI script `scripts/check_traceability.py` fails if an **M** requirement has no test tagged with its ID.

## 2. Test levels & tools
| Level | Scope | Tools | Location | Gate |
|-------|-------|-------|----------|------|
| Static | lint, types, imports, secrets | ruff, mypy --strict, import-linter, eslint, tsc, gitleaks | — | every PR |
| Unit (backend) | pure functions: formulas, parsers, grounding, conflict rules, CP-SAT builders | pytest, Hypothesis | `backend/tests/unit` | every PR |
| Integration (backend) | service + DB + API | pytest-asyncio, httpx AsyncClient, test Postgres | `backend/tests/integration` | every PR |
| Migration | up/down, data preservation | pytest + alembic | `backend/tests/migrations` | every PR |
| Contract | API vs OpenAPI | Schemathesis | CI job | every PR (smoke), nightly (full) |
| Unit (frontend) | hooks, sync-core, formatters | Vitest (web, packages), Jest + RNTL (mobile) | `apps/*/__tests__`, `packages/*/test` | every PR |
| Component/integration (web) | screens against real API | Playwright component + MSW **only for error-state rendering** | `apps/web/tests` | every PR |
| E2E web | user journeys on full stack | Playwright (Chromium, Firefox, mobile viewport) | `tests/e2e/web` | every PR (smoke), nightly (full) |
| E2E Android | journeys on emulator/device | Maestro | `tests/e2e/mobile` | nightly + release |
| Sync | multi-client scenarios + fuzz | Node harness (sync-core) + pytest server | `tests/sync` | every PR (S1–S14), nightly (fuzz) |
| AI eval | extraction golden, STT WER | pytest markers `ai_eval` | `backend/tests/ai_eval` | deterministic part per PR; LLM part nightly |
| Learning eval | personas, replay | `python -m app.learning.evaluation` | `backend/tests/learning_eval` | per PR (small), nightly (full) |
| RAG eval | retrieval + grounding | pytest `rag_eval` | `backend/tests/rag_eval` | per PR (retrieval), nightly (LLM) |
| Scheduling | property + benchmarks | Hypothesis, bench scripts | `backend/tests/scheduling*` | per PR (property 200 ex), nightly (1,000 + bench) |
| Performance | latency targets (NFR-PERF) | Locust (API), Lighthouse CI, Android profiler manual | `tests/perf` | milestone exit M3, M7, M10, M12 |
| Security | SAST/DAST/deps + security tests | bandit, pip-audit, pnpm audit, ZAP, custom pytest | `backend/tests/security` | per PR (static), M9/M12 (DAST) |
| Accessibility | web a11y | axe-core via Playwright, manual TalkBack | `tests/e2e/web/a11y` | per PR (axe), release (manual) |
| Backup/restore | drill | script + pytest | `tests/ops` | M1 and each milestone exit |
| Manual exploratory | charters (§7) | checklist | `docs/milestones/` | each milestone exit |

## 3. Coverage gates
- Backend overall line coverage ≥ 80%; domain modules (`tasks`, `analytics`, `learning`, `scheduling`, `synchronization`, `sharing`, `reports/facts`) ≥ 90% lines and ≥ 85% branches.
- `packages/sync-core` ≥ 90%.
- Coverage is necessary, not sufficient — acceptance tests below are the real gate.

## 4. Test data policy
- Fixtures built with factory functions (`factory_boy`-style, or plain builders) in `backend/tests/fixtures`.
- Named fixture worlds: `world_small` (30 tasks), `world_rag` (doc 08 §6), `world_mixed_privacy` (all sharing classes), `personas/*` (doc 07 §12).
- Time is frozen (`time-machine`) in tests; user tz explicitly set; at least one suite runs with a non-IST timezone.
- No production code path reads fixtures. CI grep check for fixture module imports in `app/`.

## 5. Defect management
| Severity | Definition | Release impact |
|----------|-----------|----------------|
| S1 Critical | data loss, security/privacy leak, fabricated data shown as fact, app unusable | blocks milestone exit |
| S2 Major | M-requirement broken, wrong metric, sync conflict not surfaced | blocks milestone exit |
| S3 Minor | workaround exists, S-requirement broken, UI defect | allowed with KNOWN_ISSUES entry |
| S4 Trivial | cosmetic | allowed |
Bug template: `docs/templates/BUG_TEMPLATE.md`. Every S1/S2 fix adds a regression test named `test_regression_KI_<id>`.

## 6. Requirement acceptance tests (summary — full list in doc 16)
| Area | Acceptance criterion (from spec) | Concrete test(s) |
|------|---------------------------------|------------------|
| Task creation | text and voice tasks persist correctly | `test_capture_text_persists_immediately`, `test_capture_voice_end_to_end` (local mode: fixture audio → whisper tiny in CI; hosted: on-device transcript → `/tasks/capture` with origin `voice`), E2E Android capture flows (web has no capture, ADR-020) |
| Classification | category extraction validated | golden set category accuracy (deterministic ML path on persona data) ≥ 0.8 at L2; grounding tests |
| Scheduling | respects deadlines and fixed events | AC-SCH-1..7 |
| Learning | updates from real activity events | AC-PLE-1, observation counts after scripted journeys |
| Prediction | uses history and reports confidence | AC-PLE-2/3, API returns confidence + maturity |
| Dashboard | real DB calculations | AC-AN-1 SQL equivalence |
| Analytics | daily/weekly/monthly/custom filters | parametrised period tests incl. tz edges |
| RAG | answers with supporting records | AC-RAG-1..3 |
| Calendar | displays and updates scheduled tasks | E2E: accept proposal → blocks visible in day/week; move block manually |
| Knowledge | search retrieves relevant records | AC-RAG-6 |
| Reports | correct EOD/periodic | AC-REP-1 |
| PDF | valid downloadable | AC-REP-3 + E2E download |
| Sharing | backend permissions enforced | AC-SEC-5, AC-REP-2, direct API calls bypassing UI |
| Account sign-up | public signup provisions isolated account; duplicate email and signup throttling behave safely | `backend/tests/integration/test_auth_api.py` signup cases; Web and Android signup/login journey |
| Offline | core tasks usable offline | Maestro airplane-mode flow; S1, S7, S13 |
| Sync | no silent data loss | AC-SYNC-1/2 |
| AI gateway | provider failure handled | AC-AI-2 |
| Local mode | core works without cloud | AC-AI-1, AC-DEP-2 full E2E with network egress blocked |
| Hosted mode (ADR-018) | runs within free-tier limits | M2b AC: `/health/ready` over HTTPS, RSS < 400 MB after smoke, backup→restore identical, no AI egress when disabled |

## 7. Manual QA charters (run at each milestone exit for delivered areas; record in milestone report)
1. **Capture speed:** 10 real tasks by voice and text in a noisy and quiet room; count interactions and time; note any wrong field.
2. **Fabrication hunt:** 20 vague inputs ("sometime finish slides", "call him") → verify no deadline/project invented.
3. **Airplane mode day (Android):** start offline in the morning, do a realistic day, reconnect at night → compare with server and web.
4. **Two-device conflict:** phone + web editing same tasks (web: status/reschedule/title/notes only) → conflicts visible and resolvable.
5. **Sharing leak attempt:** create mixed data, share professional report, open link in incognito, inspect HTML/PDF/XLSX, try URL tampering, revoke, retry.
6. **AI outage:** disable network / invalid keys / exhausted free quota mid-use (and stop Ollama in local mode) → app degrades gracefully, messages clear.
7. **Dashboard sanity:** manually count a week's tasks/time from the task list and compare with dashboard.
8. **Accessibility:** TalkBack through capture, complete task, dashboard; keyboard-only web pass.
9. **Restore drill:** backup → destroy volume → restore → app identical.
10. **Sleeping server (hosted):** let the Render service sleep, then open the app, sync, open a share link → no error screens, wait time recorded.

## 8. Milestone entry/exit (generic; specifics in doc 15)
**Entry:** previous milestone tagged; CI green; no open S1/S2; this milestone's docs read; design notes for the milestone written in `docs/milestones/M{N}_PLAN.md` (≤ 1 page: approach, risks, test plan).
**Exit:** all milestone acceptance criteria pass with evidence (command + summary output); coverage gates; manual charters relevant to the milestone; docs updated; IMPLEMENTATION_STATUS updated; milestone report; tag `m{N}-complete`.

## 9. Release (v1.0) criteria
- All M requirements pass; no open S1/S2; S3 ≤ 10 documented.
- 14-day dogfooding with daily use, ≥ 100 tasks, 0 data-loss incidents, sync conflicts all resolvable.
- Full nightly suite green 3 consecutive nights.
- Performance NFRs met on owner hardware and owner's Android device.
- Security: AC-SEC-1..8.
- Restore drill passed within last 7 days.

## 10. Test run evidence format
`docs/templates/TEST_RUN_TEMPLATE.md` — command, commit SHA, environment, counts (passed/failed/skipped), coverage, notable output, link to CI run.
