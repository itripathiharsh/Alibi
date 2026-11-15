-- ALIBI Reference SQL: Estimated vs Actual Comparison
-- Parameters: :user_id (UUID), :start_ts (TIMESTAMPTZ), :end_ts (TIMESTAMPTZ)
-- Reference: docs/10_ANALYTICS_AND_REPORTS.md §2, §4

SELECT
    t.id AS task_id,
    t.title,
    t.estimate_min,
    t.actual_min,
    COALESCE(c.name, 'Uncategorized') AS category_name,
    ROUND((t.actual_min::numeric / NULLIF(t.estimate_min, 0)), 2) AS ratio
FROM tasks t
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.user_id = :user_id
  AND t.deleted_at IS NULL
  AND t.status = 'completed'
  AND t.completed_at >= :start_ts
  AND t.completed_at < :end_ts
  AND t.estimate_min IS NOT NULL
  AND t.actual_min IS NOT NULL
ORDER BY t.completed_at DESC;

