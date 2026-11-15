-- ALIBI Reference SQL: Time Distribution by Category
-- Parameters: :user_id (UUID), :start_ts (TIMESTAMPTZ), :end_ts (TIMESTAMPTZ), :now_ts (TIMESTAMPTZ)
-- Reference: docs/10_ANALYTICS_AND_REPORTS.md §2, §4

SELECT
    COALESCE(c.name, 'Uncategorized') AS category_name,
    COALESCE(c.color, '#64748B') AS category_color,
    COALESCE(SUM(
        EXTRACT(EPOCH FROM (
            LEAST(COALESCE(te.ended_at, :now_ts), :end_ts) - GREATEST(te.started_at, :start_ts)
        )) / 60
    ), 0)::integer AS total_min
FROM time_entries te
JOIN tasks t ON te.task_id = t.id
LEFT JOIN categories c ON t.category_id = c.id
WHERE te.user_id = :user_id
  AND te.started_at < :end_ts
  AND COALESCE(te.ended_at, :now_ts) > :start_ts
GROUP BY c.id, c.name, c.color
ORDER BY total_min DESC;
