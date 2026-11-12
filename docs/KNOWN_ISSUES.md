# Known Issues & Risk Register

IDs: `KI-###` for defects/limitations, `RISK-###` for planning risks. Every S1/S2 fix adds `test_regression_KI_###`.

## Open defects
| ID | Severity | Area | Summary | Found in | Workaround | Owner | Status |
|----|----------|------|---------|----------|-----------|-------|--------|
| — | | | none yet | | | | |

## Risk register (planning)
| ID | Risk | Likelihood | Impact | Mitigation | Trigger to re-evaluate |
|----|------|-----------|--------|------------|------------------------|
| RISK-001 | Local LLM too slow on owner hardware | Medium | Medium | Rules-first extraction, async refine, smaller models, optional cloud | M4 benchmark p95 > targets |
| RISK-002 | Free AI tiers change/disappear | High | Low | Local default, fallback chains, cooldowns, no hard dependency | Provider 429/403 spikes |
| RISK-003 | No viable permanent free cloud | High | Low | Local + Tailscale is first-class (config A) | M11 evaluation |
| RISK-004 | Sync conflicts / data loss | Medium | High | Field-level versions, op idempotency, 15-scenario matrix, fuzzing | Any vanished write in tests |
| RISK-005 | Too little personal data for ML | High | Medium | Maturity levels, persona-based eval, honest "not enough data" | M12 dogfooding |
| RISK-006 | Android background limits delay reminders/sync | Medium | Medium | Exact alarms where allowed, sync on foreground, documented behaviour | M8 device QA |
| RISK-007 | Speech accuracy for accent/code-mixed speech | Medium | Medium | Model size from benchmark, editable transcript, owner clip eval | WER > 15% |
| RISK-008 | Scope creep (Notion-like vault, teams) | Medium | High | Non-negotiable constraint #9, out-of-scope list in doc 01 | Any new feature request → ADR |
| RISK-009 | Android signing key loss | Low | High | Backup key offline, documented in runbook | — |
| RISK-010 | Expo native module churn | Medium | Medium | Pin Expo SDK per release; upgrade as a dedicated task with full E2E | SDK upgrade |

## Accepted limitations (v1)
- Single owner account; no team features.
- iOS not supported.
- Google Calendar sync not included (optional one-way import only if time permits).
- Web offline is read + limited writes (Android is the offline-first client).
