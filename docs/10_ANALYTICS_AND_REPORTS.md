# 10 — Analytics & Reports

All numbers come from SQL over base tables (the materialized rollup is an optimisation and must equal base-table results — verified by test).
Formulas are versioned (`formula_version`, currently `1`) and served by `/analytics/formula` so the UI explains exactly what it shows.

## 1. Period definitions (user tz, default Asia/Kolkata)
- Day: `[00:00, 24:00)` local. Week: Monday–Sunday. Month: calendar month. Custom: inclusive dates, max 366 days.
- A time entry spanning midnight is split proportionally across days.
- "In period" for tasks:
  - *Due in period*: `deadline_at` within period.
  - *Completed in period*: `completed_at` within period.
  - *Planned in period*: has an accepted work block within period.

## 2. Metrics (formula_version 1)
| Metric | Formula | Insufficient data when |
|--------|---------|------------------------|
| Total time spent | Σ time entry minutes overlapping the period | never (0 is valid) |
| Tasks completed | count completed in period (excl. cancelled) | never |
| Tasks pending | open tasks as of period end created ≤ period end | never |
| Overdue | open tasks with deadline < min(now, period end) | never |
| Completion rate | completed_in_period ∩ (due or planned in period) ÷ (due or planned in period, excl. cancelled) | denominator < 3 |
| On-time rate | completed with deadline where completed_at ≤ deadline_at (deadline at completion time) ÷ completed with deadline | denominator < 3 |
| Efficiency (estimate accuracy ratio) | Σ estimate_final ÷ Σ actual over completed tasks having both; displayed as "You took 1.3× your estimates" | n < 3 |
| Estimate accuracy | share of those tasks with actual within ±25% of estimate_final | n < 3 |
| Category workload | minutes and completed count per category | never |
| Completion timeline | completions per day/hour | never |
| Consistency (heatmap) | per day: minutes logged and completions | never |

Efficiency is shown as a ratio, **not** as a judgement; > 1 or < 1 are both "information".

## 3. Productivity score (FR-DASH-005)
Purpose: summarise *follow-through and planning quality*, not hours.

```
C = weighted completion rate     (weights by priority: P1=2.0, P2=1.5, P3=1.0, P4/none=1.0)
O = on-time rate, where "reasonable reschedules" use the NEW deadline (see §3.1)
A = estimate accuracy (share within ±25%)
score = round(100 × (0.5·C + 0.3·O + 0.2·A))
```
- Components with insufficient data are dropped and remaining weights renormalised; if C is insufficient → score = **null** ("Not enough data").
- **No time term**: logging more hours cannot raise the score (test: doubling all time entries leaves score unchanged).
- Cancelled tasks are excluded from all denominators.
- Daily score uses rolling 7 days ending that day (single days are too noisy); weekly/monthly use the period.

### 3.1 Reasonable rescheduling
A reschedule is *reasonable* if made ≥ 24 h before the then-current deadline, OR the task is completed by its final deadline with ≤ 2 reschedules.
For O, a task with only reasonable reschedules is judged against its **final** deadline; otherwise against its **original** deadline.
Test: task rescheduled once 3 days ahead and completed by new deadline → counts on-time.

## 4. Visualisations (FR-DASH-003)
| Chart | Data endpoint | Type |
|-------|---------------|------|
| Completion chart | series completed/day | bar |
| Productivity trend | series score (rolling 7d) | line, gaps for null |
| Time distribution | minutes by category | donut (web) / bar (mobile) |
| Daily activity timeline | /analytics/timeline | horizontal time bands |
| Consistency heatmap | /analytics/heatmap (≤ 1 year) | calendar heatmap |
| Estimated vs actual | per completed task (scatter) + per category (bar pairs) | scatter/bar |
| Category progress | completed vs open per category | stacked bar |

## 5. Reports (FR-REP)
### 5.1 Fact builder (pure, deterministic)
`reports/facts.py::build_facts(user, period, include_classes) -> ReportFacts` (Pydantic). Contents (FR-REP-002):
`period`, `generated_at`, `scope`, `summary{completed, pending, overdue, time_min, completion_rate, on_time_rate}`,
`completed[] {title, category, project, completed_at, actual_min}`, `pending[]`, `overdue[]`, `projects[] {name, time_min, completed}`,
`time_by_category`, `deliverables[] {title, task, link?}`, `achievements[]` (rule-based: completed P1/P2 tasks, deliverables, milestones of projects marked done),
`notes[]` (completion notes & work logs in scope, truncated 500 chars), `next_priorities[]` (top 5 open by deadline/priority — rule-based; AI may reorder only with reason, not add).
Scope filter is applied **inside SQL** (`category.sharing_class IN (:classes)`); items without category are treated as `personal` (excluded from professional scope) — conservative default.

### 5.2 Narrative (FR-REP-004)
Optional `REPORT_NARRATIVE` from facts JSON only. Validator: all numbers ⊂ numbers in facts; all task/project names ⊂ names in facts; length ≤ 180 words; banned vocabulary from doc 07 §10.
Failure → template narrative (deterministic sentences).

### 5.3 Renderers
- **PDF** (ReportLab Platypus): A4, header (ALIBI · report type · period · scope badge "Professional only"), summary tiles table, sections, page numbers, generated-at footer. Fonts embedded (Inter TTF bundled; licence OFL). Must open in Chrome PDF viewer, Acrobat Reader, Android default viewer.
- **XLSX** (openpyxl): sheets Summary, Completed, Pending, Overdue, Time by category, Deliverables; typed cells (dates as dates, minutes as numbers), frozen header row.
- **CSV**: one file per section zipped, or single `completed.csv` for EOD; UTF-8 with BOM (Excel-friendly), RFC 4180 quoting; formula-injection protection (prefix `'` for cells starting with = + - @).

**Hosted mode (ADR-020):** rendered files are not stored. The frozen `facts` JSON is the stored artefact, and PDF/XLSX/CSV are rendered on demand and streamed (same renderers, same deterministic output for the same facts). ReportLab/openpyxl are imported lazily (memory budget).

### 5.4 Snapshot semantics
Report facts are frozen at generation; later edits don't change an existing report (re-generate creates a new one). Shared links show `shared_facts` (re-filtered at share time with the share's scope).

## 6. Sharing (FR-SHARE) — see also doc 12
Token: 32 random bytes base64url; DB stores SHA-256. URL `https://<host>/s/<token>`. Viewer is server-rendered HTML (no app JS, no auth), shows scope banner and expiry.
Access logs every hit (hashed IP/UA). Expired/revoked → 410 page without content. Owner sees history + access counts.
Hosted: the viewer may hit a sleeping server (~1 min cold start). The recipient's link must not fail; document the expected wait in the share message.

## 7. Tests
- Formula unit tests with hand-computed fixtures for every metric (including boundary: midnight-spanning entries, tz edges at 18:30Z = 00:00 IST, DST irrelevant for IST but test with `Europe/London` user too).
- Property: score ∈ [0,100] or null; invariant to scaling time entries; cancelled tasks don't change score.
- Rollup equality test: `mv_daily_task_stats` aggregates == base-table aggregates on random datasets.
- Report: facts snapshot tests (JSON golden), scope test ensuring zero personal/academic items in professional report (seeded mixed data), PDF validity (`pypdf` opens, page count > 0, text contains period), XLSX opens with openpyxl and typed cells, CSV injection test.
- Narrative validator rejects fabricated number/name (stubbed LLM).

## 8. Acceptance criteria
- AC-AN-1 Every dashboard number reproducible by a documented SQL in `docs/analytics_sql/` (written during M3) on a fixture DB — test compares API vs SQL.
- AC-AN-2 Score never rewards hours and never penalises reasonable reschedules (tests in §7).
- AC-AN-3 Insufficient data shown as such, never as 0%.
- AC-REP-1 EOD/weekly/monthly/custom facts correct on fixture DB (golden files).
- AC-REP-2 Professional-scope report and its share contain 0 personal/academic/uncategorised items (backend test, not UI).
- AC-REP-3 PDF/XLSX/CSV valid and contain the same totals.
- AC-REP-4 Narrative contains no number/name absent from facts (validator tests + 50 stubbed adversarial outputs).
