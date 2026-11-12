# 07 — Personal Learning Engine (PLE)

Highest engineering priority. The PLE is a **data system**, not chatbot memory: events → features → statistical/ML models → patterns with
confidence → profile → recommendations. LLMs only turn engine outputs into sentences.

## 1. Architecture
```
domain events ─► Collector ─► behavior_observations (append-only)
                                   │
           nightly + on-demand jobs ▼
 ┌──────────────┬───────────────┬────────────────┬────────────────┬──────────────────┐
 │ Task         │ Duration      │ Routine        │ Preference     │ Workload         │
 │ Understanding│ Predictor     │ Detector       │ Learner        │ Analyzer         │
 └──────┬───────┴──────┬────────┴───────┬────────┴───────┬────────┴────────┬─────────┘
        └──────────────┴──── learned_patterns / ml_models / task_predictions ┘
                                   ▼
                     Profile Compiler ─► memory_profiles (versioned)
                                   ▼
          consumers: extraction confirm sheet · scheduler · dashboard insights · RAG
```
Code: `backend/app/learning/{collector,features,understanding,duration,routines,preferences,workload,profile,evaluation,maturity}.py`.

## 2. Collector (FR-LEARN-001)
Writes one `behavior_observations` row per signal (synchronously in the same transaction as the domain change):

| observation_type | when | features (examples) |
|---|---|---|
| task_created | capture/create | category, origin, hour_local, weekday, has_deadline, lead_time_h, title_tokens_hash, estimate_user |
| task_started | first in_progress or first timer | delay_from_creation_h, hour_local, weekday |
| task_completed | → completed | actual_min, estimate_final, estimate_ai, estimate_user, completed_hour, on_time, reschedule_count, sessions_count |
| task_cancelled | → cancelled | age_days, category |
| rescheduled | deadline or block moved | delta_h, notice_h (before old deadline), actor, reason |
| priority_changed | | old, new |
| time_session | time entry closed | duration_min, hour_local, weekday, interrupted (stopped < 50% of usual session and resumed same day) |
| prediction_feedback | accept/correct/reject | prediction_type, predicted, actual, confidence |
| proposal_decision | schedule decided | accepted_count, rejected_count, displacement_accepted, horizon |
| user_correction | user edits AI-set field | field, from, to |

Observations are immutable. Corrections create new observations (never edit old ones).

## 3. Maturity levels (FR-LEARN-008)
Computed **per prediction type and per category** nightly by `maturity.py`:

| Level | Name | Duration rule | Classification rule | Behaviour |
|-------|------|---------------|--------------------|-----------|
| L0 | Cold | < 5 completed tasks with actuals in scope | < 20 labelled tasks | Rules only; show user estimate; no "AI estimate" |
| L1 | Statistical | ≥ 5 | ≥ 20 labelled and ≥ 3 classes with ≥ 3 each | Shrinkage means / kNN; confidence capped 0.6 |
| L2 | ML | ≥ 40 overall and model beats L1 baseline on holdout | ≥ 60 labelled, ≥ 5 per class, CV macro-F1 ≥ 0.75 | Trained sklearn model; calibrated confidence |
| L3 | Personalised ML | ≥ 150 and ≥ 60 days history | ≥ 200 | Adds temporal & behavioural features |

Promotion only when the higher level beats the lower one on a time-based holdout (last 20% by date). Demotion if live error degrades > 25% vs holdout for 14 days.
All thresholds live in `learning/config.py` and are reported in `/learning/profile`.

## 4. Task understanding (FR-LEARN-003)
Input: title + description. Steps:
1. Normalise text (lowercase, strip dates/numbers, lemmatise lite via simple suffix rules — no heavy NLP dep).
2. Embed with local fastembed; retrieve top-k=10 similar **completed** tasks (pgvector, same user) with similarity ≥ 0.75.
3. Category: L0 none / L1 weighted vote of neighbours (weight = similarity) / L2 `LogisticRegression` on TF-IDF(1–2 grams) ⊕ embedding, `CalibratedClassifierCV`. Confidence = calibrated probability.
4. Project: only among **active existing** projects; kNN vote; returned only if confidence ≥ 0.7 and project not archived. Never creates.
5. Priority: kNN median of neighbours' final priority + deadline proximity rule; marked "suggested".
6. Dependencies: suggest only when a similar past task consistently had a predecessor of a similar type (≥ 3 occurrences) → shown as suggestion, never auto-linked.
7. Similar tasks: returned (top 3) with their actual durations — the confirm sheet shows them.

## 5. Duration predictor (FR-LEARN-004)
Target: `log(actual_min)` (durations are right-skewed). Only tasks with ≥ 1 time entry and status completed; outliers beyond 5× IQR of category excluded from training (kept in data).
- **L0:** `user estimate` or none.
- **L1:** hierarchical shrinkage: `μ = (n_c·mean_c + k·mean_global)/(n_c + k)` with k=5 on log scale, blended with kNN median of similar tasks (weight 0.5 when ≥ 3 neighbours).
  Plus **personal correction factor**: median(actual/estimate_user) per category → "you usually take 1.6× your estimate".
- **L2:** `HistGradientBoostingRegressor` (point, loss=squared_error on log) + quantile models (q=0.1, 0.9) for interval. Features: category, project, title TF-IDF SVD (32 dims) or embedding PCA (16), user estimate (log), has_deadline, lead time, weekday, hour, subtask count, origin, kNN median.
- **L3:** adds rolling 30-day category bias, time-of-day productivity factor.
- Output: `p50, p10, p90, confidence`, where confidence = 1 − normalised interval width, capped by maturity level.
- Final estimate shown to user = user estimate if given; AI estimate shown alongside. Scheduler uses `estimate_final` or, if null, AI p50 (or p75 for deadline-critical tasks).

## 6. Routine detector (FR-LEARN-002)
1. Group completed+created tasks into **activity clusters**: agglomerative clustering on embeddings (cosine distance threshold 0.25) within category; label = medoid title.
2. For each cluster with ≥ 4 occurrences, compute occurrence dates and test periodicities:
   - weekly-by-weekday: fraction of occurrences on modal weekday(s);
   - every-N-days: coefficient of variation of inter-arrival gaps (< 0.35);
   - monthly-by-day: modal day-of-month ±2.
3. **Routine vs burst** rule: routine requires span ≥ 21 days, ≥ 3 distinct periods (weeks/months) covered, and no single 14-day window containing > 60% of occurrences. Otherwise labelled `burst` (not stored as routine).
4. Confidence = Wilson lower bound (95%) of adherence = periods with occurrence / periods elapsed since first, × recency decay `exp(-days_since_last/(3×period))`.
5. Status: `candidate` (conf 0.4–0.7) → `active` (≥ 0.7) → user may `confirm` (and convert to recurrence rule) or `dismiss` (never re-suggested unless 2× more evidence). Unseen for 3 periods → `stale`.

## 7. Preference learner (FR-LEARN-005)
- **Work periods:** for each category, histogram of minutes worked by hour-of-day × weekday from `time_session`; Dirichlet smoothing α=1 per bin; preferred windows = contiguous bins with posterior mass ≥ 1.5× uniform. Sample count = sessions.
- **Session length:** median & IQR of session minutes per category → scheduler `preferred_block_min`.
- **Postponement:** per category, rate of reschedules per task and median notice; flagged "frequently postponed" when rate ≥ 0.5 with n ≥ 10. Stated as observation, never as a trait.
- **Interruptions:** share of sessions marked interrupted per category/hour.
- **Category distribution:** share of time per category per week.
Every output is a `learned_patterns` row with sample_count, confidence (based on n via `1 - 1/sqrt(n+1)` capped by maturity), support observation ids, timestamps (FR-LEARN-007).

## 8. Workload analyzer (FR-LEARN-006)
Per day for the next 14 days: `capacity = working_hours − fixed_events − buffer(15%)`; `demand = Σ remaining estimates of tasks whose latest feasible schedule falls on/before that day` (EDF backward fill);
`load_ratio = demand/capacity`. Flags: overloaded (> 1.0), tight (0.85–1.0). Historical: typical completed minutes per weekday (median) → realistic capacity (min of configured and p75 of historical worked minutes) — used by scheduler only as a soft target.

## 9. Profile compiler
Nightly + after every 20 new observations: compile active patterns, maturity levels, model versions, correction factors into `memory_profiles.profile` (versioned). Exposed read-only at `/learning/profile`.
RAG may cite profile facts ("you usually work on Professional tasks 10:00–13:00, based on 48 sessions").

## 10. Guardrails (FR-LEARN-010)
- Banned output vocabulary in insights (lint test): lazy, procrastinat*, anxious, depressed, unmotivated, burnout, ADHD, stress* etc. Insights describe behaviour + numbers only.
- No pattern shown with sample_count below its type's minimum (routine 4, work period 10 sessions, postponement 10 tasks, duration 5).
- User can reset all learning (`/learning/reset`) → patterns, models, profiles, predictions deleted; observations kept unless "also delete history" chosen.
- Learning never modifies tasks directly; it produces predictions/proposals.

## 11. Jobs
| Job | Schedule | Notes |
|-----|----------|-------|
| `learning.refresh_patterns` | nightly 02:30 local + debounced on 20 observations | routines, preferences, postponement |
| `learning.train_models` | nightly 03:00 if ≥ 10 new labelled rows | train, evaluate, promote/demote |
| `learning.compile_profile` | after above | |
| `learning.resolve_predictions` | on task completion | fills `actual`, `error` |

## 12. Evaluation (FR-LEARN-011)
`backend/app/learning/evaluation/` + CLI `python -m app.learning.evaluation --dataset <name>`:

| Metric | Definition | Target (on synthetic personas) |
|--------|-----------|-------------------------------|
| Duration MAE (min) & MdAPE | on time-based holdout | L2 beats user-estimate baseline by ≥ 15% MdAPE |
| Interval coverage | share of actuals in [p10,p90] | 70–90% |
| Classification macro-F1 | holdout | ≥ 0.80 at L2 |
| Routine precision / recall | vs persona ground truth | precision ≥ 0.9, recall ≥ 0.7; burst false-positive rate ≤ 5% |
| Preference window accuracy | IoU with ground-truth windows | ≥ 0.6 |
| Calibration | ECE of category confidence | ≤ 0.08 |
| Live acceptance | accepted / (accepted+corrected+rejected) | tracked, no target in CI |

**Synthetic persona generator** (`tests/learning_eval/personas.py`, test-only, never touches prod DB): generates 120 days of tasks for 4 personas
(developer-student, marketer, researcher, chaotic-bursty) with known routines, bursts, duration multipliers, work windows and noise. Seeded, reproducible.
**Historical replay:** owner's own exported data can be replayed chronologically (no leakage: model at time t only sees data < t).

## 13. Acceptance criteria
- AC-PLE-1 Every domain event in §2 creates exactly one observation (integration tests per event).
- AC-PLE-2 With < threshold data, predictions are absent or labelled L0/L1 with capped confidence (tests at boundary counts 4/5, 39/40).
- AC-PLE-3 Synthetic persona targets in §12 met; results committed to `docs/milestones/M5_REPORT.md`.
- AC-PLE-4 Bursty persona produces 0 routines from its burst clusters.
- AC-PLE-5 Patterns carry sample_count, confidence, support, first/last observed, updated_at (schema + API test).
- AC-PLE-6 Dismissed pattern is not re-suggested until evidence doubles.
- AC-PLE-7 Reset removes learned artefacts; predictions revert to L0 behaviour.
- AC-PLE-8 Banned-vocabulary test passes on all insight templates and LLM insight outputs (post-filter).
- AC-PLE-9 Training job is deterministic given seed and data (same metrics on rerun).
- AC-PLE-10 Model artefact load failure → falls back to L1 without request failure.
