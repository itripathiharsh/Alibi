-- ALIBI Reference SQL: Productivity Score Formula v1 Components
-- Parameters: :user_id (UUID), :start_ts (TIMESTAMPTZ), :end_ts (TIMESTAMPTZ)
-- Reference: docs/10_ANALYTICS_AND_REPORTS.md §3

WITH candidate_tasks AS (
    SELECT
        t.id,
        t.priority,
        t.status,
        t.deadline_at,
        t.completed_at,
        t.estimate_min,
        t.actual_min,
        t.reschedule_count,
        CASE
            WHEN t.priority = 'p1' THEN 2.0
            WHEN t.priority = 'p2' THEN 1.5
            WHEN t.priority = 'p3' THEN 1.0
            ELSE 1.0
        END AS priority_weight,
        CASE
            WHEN t.status = 'completed' AND t.completed_at >= :start_ts AND t.completed_at < :end_ts THEN 1
            ELSE 0
        END AS is_completed_in_period,
        CASE
            WHEN t.deadline_at >= :start_ts AND t.deadline_at < :end_ts THEN 1
            ELSE 0
        END AS is_due_in_period
    FROM tasks t
    WHERE t.user_id = :user_id
      AND t.deleted_at IS NULL
      AND t.status != 'cancelled'
),
completion_component AS (
    SELECT
        COUNT(*) AS total_due_or_completed,
        SUM(priority_weight * is_completed_in_period) AS weighted_completed,
        SUM(priority_weight) AS weighted_total
    FROM candidate_tasks
    WHERE is_due_in_period = 1 OR is_completed_in_period = 1
),
on_time_component AS (
    SELECT
        COUNT(*) AS total_completed_with_deadline,
        COUNT(CASE WHEN completed_at <= deadline_at THEN 1 END) AS on_time_count
    FROM candidate_tasks
    WHERE is_completed_in_period = 1
      AND deadline_at IS NOT NULL
),
accuracy_component AS (
    SELECT
        COUNT(*) AS total_with_both,
        COUNT(CASE WHEN actual_min BETWEEN (0.75 * estimate_min) AND (1.25 * estimate_min) THEN 1 END) AS accurate_count
    FROM candidate_tasks
    WHERE is_completed_in_period = 1
      AND estimate_min IS NOT NULL
      AND actual_min IS NOT NULL
)
SELECT
    c.total_due_or_completed,
    c.weighted_completed,
    c.weighted_total,
    o.total_completed_with_deadline,
    o.on_time_count,
    a.total_with_both,
    a.accurate_count
FROM completion_component c
CROSS JOIN on_time_component o
CROSS JOIN accuracy_component a;
