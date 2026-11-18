# Known Issues & Risk Register

IDs: `KI-###` for defects/limitations, `RISK-###` for planning risks. Every S1/S2 fix adds `test_regression_KI_###`.

## Open defects
| ID | Severity | Area | Summary | Found in | Workaround | Owner | Status |
|----|----------|------|---------|----------|-----------|-------|--------|
| KI-001 | S3 (Minor) | Tooling (Windows) | Windows Application Control (os error 4551) blocks unsigned `.venv/Scripts/*.exe` wrappers | M0 | Invoke tools via `python -m <module>` (handled automatically in `make.ps1`) | Agent | Mitigated |
| KI-002 | S3 (Minor) | Build (Web) | Next.js standalone build attempts NTFS symlinks requiring elevated developer mode on Windows | M0 | Guarded with `BUILD_STANDALONE=true` so Windows local dev exports cleanly while Docker builds standalone | Agent | Mitigated |
| KI-003 | S2 (Major) | Assistant (RAG) | Chatbot returned 'no records' fallback due to task status mismatch ('draft'/'active') and missing conversational / priority intent patterns | Post-M12 | Fixed in `intent.py`, `tools.py`, `validator.py`, and `service.py` to route greetings, help, priorities, and tasks with live SQL counts | Agent | Resolved |
| KI-004 | S3 (Minor) | Mobile UI | Reference-led six-tab refresh, safe-area headers, Vault dictation, private-note navigation and redesigned Insights are implemented; emulator/device visual review and accessibility pass remain outstanding | M13 | Review on Android device before marking M13 complete | Agent | In progress |
| KI-005 | S3 (Minor) | Android packaging | The JavaScriptCore Babel post-step tried to parse Hermes output and failed | M13 | Guarded the Babel step to run only for JavaScriptCore; debug and release APK builds now pass | Agent | Resolved |
| KI-006 | S2 (Major) | Mobile authentication | Fresh installs silently attempted a hard-coded owner login, which could expose the server owner's data | M13 review | Removed default-credential login and added public signup, explicit login, and a legacy-session guard; mobile typecheck passed | Agent | Resolved |
| KI-007 | S2 (Major) | Web typecheck | Lucide JSX component types conflicted because Next resolved React 18 ambient types while the web app uses React 19 | M13 | Web `tsconfig.json` now pins module type resolution to the app's React 19 types; removed Next's type-error bypass; `pnpm --filter @alibi/web typecheck` passes | Agent | Resolved |
| KI-008 | S2 (Major) | Account sign-up | Public account registration and multi-account data isolation lacked automated regression coverage | M13 ADR-023 | Signup, duplicate-email, separate workspace, and foreign-record denial are covered by `test_public_signup_isolates_accounts_and_rejects_duplicate_email` | Agent | Resolved |
| KI-009 | S2 (Major) | Public registration | Signup has no email verification and uses a process-local per-IP attempt limiter | M13 ADR-023 | TLS is required in hosted mode; monitor registration abuse and add verification only with a separate approved design | Agent | Accepted limitation |
| KI-010 | S2 (Major) | Organization portal | Organization APIs, consent flow and owner/team-lead web portal are implemented; one API-service regression now covers consent filtering, personal-data exclusion, revocation, and counts beyond the 200-row display cap; invite/role/IDOR/web-E2E coverage remains outstanding | M13 ADR-024 | Do not claim M13 complete until full API/security tests and account-isolation review pass | Agent | In progress |
| KI-011 | S3 (Minor) | Organization portal navigation | Fixed desktop side rail and page content lacked a balanced gutter, making dashboard content appear clipped against the rail | Owner report 2026-11-17 | Header and page now share a sidebar-aware column with consistent inner gutters; desktop rail can still be collapsed/restored; production build and local route smoke check passed | Agent | Resolved |
| KI-012 | S2 (Major) | Mobile startup latency | Startup and several tab loads repeated server auto-discovery probes; signup waited for setup-status before rendering | Owner report 2026-11-18 | Removed discovery from ordinary navigation and setup polling from signup; server selection remains in Settings; mobile typecheck passed | Agent | Resolved |
| KI-013 | S2 (Major) | Hosted backend latency | First request to the free Render host took 64.3 seconds while the instance woke from idle; actual API requests can still wait through a cold start | Owner report 2026-11-18 | App shell and signup render without discovery/setup gates; first data/account request still depends on host wake-up. No paid keep-alive or hosting change is approved | Agent | Open |
| KI-014 | S3 (Minor) | Timer notifications | Android permission/device delivery behavior needs physical-device verification | M13 FR-CAL-009 | Unit/API coverage and Android build; verify permission grant/deny, two-hour delivery, stop cancellation, and relaunch restoration on device | Agent | In progress |
| KI-015 | S2 (Major) | Backend static checks | Ruff, format and strict mypy diagnostics found during the audit have been fixed. The full `make.ps1 check` now passes those stages but stops at import-linter because Windows Application Control blocks the `_rustgrimp` native DLL | M13 audit 2026-11-18 | Run import-linter in CI or an environment that permits its native dependency; the remaining local check limitation is environmental | Agent | Mitigated |
| KI-016 | S2 (Major) | Android offline data | Android task views, capture, status updates, and independent timer history now persist locally and sync through an account-scoped outbox. Full M10 coverage remains incomplete: calendar/Vault/other entities, conflict UI, all S1–S15 scenarios, schema migration tests, and offline cold-start performance have not passed | Whole-app audit 2026-11-18; partial fix ADR-026 | Use online connectivity for unsupported surfaces; do not claim M10 complete until its full exit gate and device QA pass | Agent | In progress |
| KI-017 | S3 (Minor) | Organization lifecycle | Owner leave previously had no transfer path; organization ownership transfer now updates both roles and the owner reference, with a role-safe API and settings flow | Whole-app audit 2026-11-18 | Transfer ownership to an active member before leaving; backend API regression covers transfer and former-owner behavior | Agent | Resolved |

## Risk register (planning)
| ID | Risk | Likelihood | Impact | Mitigation | Trigger to re-evaluate |
|----|------|-----------|--------|------------|------------------------|
| RISK-001 | Local LLM too slow on owner hardware | Medium | Medium | Rules-first extraction, async refine, smaller models, optional cloud | M4 benchmark p95 > targets |
| RISK-002 | Free AI tiers change/disappear | High | Low | Local default, fallback chains, cooldowns, no hard dependency | Provider 429/403 spikes |
| RISK-003 | No viable permanent free cloud | High | **High** (owner has no always-on PC, ADR-018) | Render + Neon chosen; plain Docker + Postgres exit path; fallbacks in doc 13 §7 | Any provider terms change |
| RISK-004 | Sync conflicts / data loss | Medium | High | Field-level versions, op idempotency, 15-scenario matrix, fuzzing | Any vanished write in tests |
| RISK-005 | Too little personal data for ML | High | Medium | Maturity levels, persona-based eval, honest "not enough data" | M12 dogfooding |
| RISK-006 | Android background limits delay reminders/sync | Medium | Medium | Exact alarms where allowed, sync on foreground, documented behaviour | M8 device QA |
| RISK-007 | Speech accuracy for accent/code-mixed speech | Medium | Medium | Model size from benchmark, editable transcript, owner clip eval | WER > 15% |
| RISK-008 | Scope creep (Notion-like vault, teams) | Medium | High | Non-negotiable constraint #9, out-of-scope list in doc 01 | Any new feature request → ADR |
| RISK-009 | Android signing key loss | Low | High | Backup key offline, documented in runbook | — |
| RISK-010 | Expo native module churn | Medium | Medium | Pin Expo SDK per release; upgrade as a dedicated task with full E2E | SDK upgrade |
| RISK-011 | Render/Neon/Vercel free tiers change or end | High | High | Re-verify at M2b/M11; nightly encrypted backups; Supabase DB fallback; host-agnostic Docker image | Provider email / pricing page change |
| RISK-012 | Hosted image exceeds 512 MB RAM (OR-Tools, sklearn, ReportLab, fastembed) | Medium | High | Lazy imports; RSS gate < 400 MB from M2b; heavy jobs in GitHub Actions; fastembed only if it fits | RSS > 400 MB in any smoke test |
| RISK-013 | ~1 min cold start while Android is online-only (M2b–M10) | High | Medium | No client-side probe duplication; shell renders before data; an always-on host/keep-warm approach needs a separately approved hosting decision | First request > 30 seconds (observed 64.3 s, KI-013) |
| RISK-014 | GitHub Actions free minutes (private repo) used up by CI + nightly jobs | Medium | Medium | Path filters, caching, mobile build only on tags, `make ci` locally; minutes estimated in M2b report | > 70% of monthly minutes used |
| RISK-015 | Task data held by third parties (Neon/Render) | Certain | Medium | Owner-accepted (ADR-018); provider encryption at rest; AI off by default; encrypted backups; keys encrypted in DB | Any provider breach notice |
| RISK-016 | Losing the `age` private key makes backups unreadable | Low | High | Owner keeps two offline copies (USB + paper/password manager); restore drill each milestone | — |

## Accepted limitations (v1)
- Individual self-service accounts; no team features. Signup has no email verification and rate limiting is per API process (ADR-023).
- iOS not supported.
- Google Calendar sync not included (optional one-way import only if time permits).
- Web offline is read + limited writes (Android is the offline-first client).
