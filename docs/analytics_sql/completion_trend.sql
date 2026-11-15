-- ALIBI Reference SQL: Completion Trend
-- Parameters: :user_id (UUID), :start_ts (TIMESTAMPTZ), :end_ts (TIMESTAMPTZ), :tz (TEXT, e.g. 'Asia/Kolkata')
-- Reference: docs/10_ANALYTICS_AND_REPORTS.md §4

SELECT
    DATE(completed_at AT TIME ZONE :tz) AS date,
    COUNT(*)::integer AS count
FROM tasks
WHERE user_id = :user_id
  AND deleted_at IS NULL
  AND status = 'completed'
  AND completed_at >= :start_ts
  AND completed_at < :end_ts
GROUP BY DATE(completed_at AT TIME ZONE :tz)
ORDER BY date ASC;

