-- ALIBI Reference SQL: Consistency Heatmap (≤ 1 Year)
-- Parameters: :user_id (UUID), :start_ts (TIMESTAMPTZ), :end_ts (TIMESTAMPTZ), :tz (TEXT, e.g. 'Asia/Kolkata')
-- Reference: docs/10_ANALYTICS_AND_REPORTS.md §2, §4

WITH daily_completions AS (
    SELECT
        DATE(completed_at AT TIME ZONE :tz) AS activity_date,
        COUNT(*)::integer AS completed_count
    FROM tasks
    WHERE user_id = :user_id
      AND deleted_at IS NULL
      AND status = 'completed'
      AND completed_at >= :start_ts
      AND completed_at < :end_ts
    GROUP BY DATE(completed_at AT TIME ZONE :tz)
),
daily_time AS (
    SELECT
        DATE(started_at AT TIME ZONE :tz) AS activity_date,
        COALESCE(SUM(duration_min), 0)::integer AS minutes_logged
    FROM time_entries
    WHERE user_id = :user_id
      AND started_at >= :start_ts
      AND started_at < :end_ts
    GROUP BY DATE(started_at AT TIME ZONE :tz)
)
SELECT
    COALESCE(c.activity_date, t.activity_date) AS date,
    COALESCE(c.completed_count, 0) AS completed_count,
    COALESCE(t.minutes_logged, 0) AS minutes_logged
FROM daily_completions c
FULL OUTER JOIN daily_time t ON c.activity_date = t.activity_date
ORDER BY date ASC;

