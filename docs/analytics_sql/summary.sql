-- ALIBI Reference SQL: Period Summary Metrics
-- Parameters: :user_id (UUID), :start_ts (TIMESTAMPTZ), :end_ts (TIMESTAMPTZ), :now_ts (TIMESTAMPTZ)
-- Reference: docs/10_ANALYTICS_AND_REPORTS.md §2

WITH period_tasks AS (
    SELECT
        id,
        user_id,
        title,
        status,
        priority,
        deadline_at,
        completed_at,
        estimate_min,
        actual_min,
        reschedule_count,
        deleted_at
    FROM tasks
    WHERE user_id = :user_id
      AND deleted_at IS NULL
),
completed_in_period AS (
    SELECT *
    FROM period_tasks
    WHERE status = 'completed'
      AND completed_at >= :start_ts
      AND completed_at < :end_ts
),
due_in_period AS (
    SELECT *
    FROM period_tasks
    WHERE deadline_at >= :start_ts
      AND deadline_at < :end_ts
      AND status != 'cancelled'
),
open_at_period_end AS (
    SELECT *
    FROM period_tasks
    WHERE status IN ('pending', 'in_progress')
),
time_spent AS (
    SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (
            LEAST(COALESCE(ended_at, :now_ts), :end_ts) - GREATEST(started_at, :start_ts)
        )) / 60
    ), 0)::integer AS total_time_min
    FROM time_entries
    WHERE user_id = :user_id
      AND started_at < :end_ts
      AND COALESCE(ended_at, :now_ts) > :start_ts
)
SELECT
    (SELECT total_time_min FROM time_spent) AS total_time_min,
    (SELECT COUNT(*) FROM completed_in_period) AS completed_count,
    (SELECT COUNT(*) FROM open_at_period_end) AS pending_count,
    (SELECT COUNT(*) FROM open_at_period_end WHERE deadline_at IS NOT NULL AND deadline_at < LEAST(:now_ts, :end_ts)) AS overdue_count;
