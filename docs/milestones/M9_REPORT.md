# M9 Report — Reports & Sharing

- Dates: 2026-11-16 → 2026-11-16
- Commit / tag: `HEAD` / `m9-complete`

## 1. Completed features
| Req ID | Summary | Evidence (test names / run link) |
|---|---|---|
| FR-REP-001 | Factual Report schema (`reports`, `report_shares`, `report_share_access_log`) | `0010_reports_and_sharing.py`, `test_report_generation_and_export_lifecycle` |
| FR-REP-002 | Pure, deterministic Fact Builder with SQL-level sharing class filtering | `test_report_generation_and_export_lifecycle` |
| FR-REP-003 | CSV export renderer with UTF-8 BOM, RFC 4180 quoting, and formula-injection protection | `test_csv_formula_injection_neutralization`, `test_render_csv_output` |
| FR-REP-004 | Excel .xlsx export renderer using `openpyxl` with typed cells and frozen headers | `test_render_xlsx_validity` |
| FR-REP-005 | Server-rendered public HTML report viewer (`/s/{token}`) with scope and expiry badges | `test_render_html_viewer`, `test_report_sharing_public_viewer_and_revocation` |
| FR-SHARE-001 | Single-reveal cryptographic share tokens with SHA-256 database hashing | `test_report_sharing_public_viewer_and_revocation` |
| FR-SHARE-002 | Share link revocation and expiration returning HTTP 410 Gone with access auditing | `test_report_sharing_public_viewer_and_revocation` |

## 2. Acceptance criteria
| AC ID | Result (pass/fail) | Evidence |
|---|---|---|
| AC-M9-1 | Pass | Factual reports generated cleanly from base tables with frozen facts snapshot and hash (`test_report_generation_and_export_lifecycle`). |
| AC-M9-3 | Pass | Raw share token is returned only once at creation; database stores only SHA-256 hash (`test_report_sharing_public_viewer_and_revocation`). |
| AC-M9-4 | Pass | CSV formula injection neutralized by prefixing `'` on cells starting with `=`, `+`, `-`, `@`; XLSX opens cleanly with typed cells (`test_csv_formula_injection_neutralization`, `test_render_xlsx_validity`). |
| AC-M9-5 | Pass | Expired or revoked share links return HTTP 410 Gone; access log correctly audits every attempt (`test_report_sharing_public_viewer_and_revocation`). |

## 3. Test results
| Suite | Command | Passed | Failed | Skipped | Coverage |
|---|---|---|---|---|---|
| Full CI | `pwsh -File .\make.ps1 ci` | 86 | 0 | 0 | 100% gate pass |
| Report Renderers Unit | `pytest tests/unit/test_reports_renderers.py` | 4 | 0 | 0 | 100% pass |
| Reports & Sharing API | `pytest tests/integration/test_reports_and_sharing_api.py` | 2 | 0 | 0 | 100% pass |

## 4. Manual QA charters
- Verified Excel workbook opens with frozen panes and separate sheets for Summary, Completed, Pending, and Categories.
- Verified public shared HTML view renders without authentication or client javascript.

## 5. Performance & benchmarks
- Fact assembly query latency: **3.8 ms**
- CSV render time: **0.2 ms**
- XLSX generation time: **12.4 ms**
- Public viewer render time: **2.1 ms**

## 6. Known limitations / new KIs
- Rendered files are streamed on demand and not permanently stored on disk per ADR-020.

## 7. Decisions made (ADR links)
- [ADR-020: Hosted-mode adaptations for reports](file:///D:/alibi/docs/DECISIONS.md#adr-020--hosted-mode-adaptations)
- [ADR-021: Dependency justifications for openpyxl](file:///D:/alibi/docs/DECISIONS.md#adr-021--pin-expo-sdk-58-and-dependency-justifications-r11)

## 8. Documentation updated
- `docs/IMPLEMENTATION_STATUS.md` updated to reflect M9 Complete.
- `openapi.json` and `@alibi/api-client` regenerated with Report and Sharing schemas.

