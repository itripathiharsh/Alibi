#!/usr/bin/env bash
set -euo pipefail

# ALIBI Restore Drill Script (AC-M2b-4)
CONTAINER="${1:-alibi-postgres}"
DB_USER="${2:-alibi}"
DB_NAME="${3:-alibi}"
DRILL_DB="alibi_drill"

echo "=== Starting ALIBI Restore Drill ==="

echo "Step 1: Measuring pre-backup table row counts..."
TASK_COUNT_PRE=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM tasks WHERE deleted_at IS NULL;" | tr -d '[:space:]')
TIME_COUNT_PRE=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM time_entries;" | tr -d '[:space:]')
echo "Pre-backup Tasks: $TASK_COUNT_PRE, Time Entries: $TIME_COUNT_PRE"

echo "Step 2: Executing pg_dump..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -f /tmp/alibi_drill.dump

echo "Step 3: Creating drill database $DRILL_DB..."
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DRILL_DB;" > /dev/null
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DRILL_DB;" > /dev/null

echo "Step 4: Restoring dump into $DRILL_DB..."
docker exec "$CONTAINER" pg_restore -U "$DB_USER" -d "$DRILL_DB" --no-owner --no-privileges /tmp/alibi_drill.dump
docker exec "$CONTAINER" rm -f /tmp/alibi_drill.dump

echo "Step 5: Verifying restored row counts..."
TASK_COUNT_POST=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DRILL_DB" -t -c "SELECT count(*) FROM tasks WHERE deleted_at IS NULL;" | tr -d '[:space:]')
TIME_COUNT_POST=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DRILL_DB" -t -c "SELECT count(*) FROM time_entries;" | tr -d '[:space:]')
echo "Restored Tasks: $TASK_COUNT_POST, Time Entries: $TIME_COUNT_POST"

if [ "$TASK_COUNT_PRE" != "$TASK_COUNT_POST" ]; then
    echo "FATAL: Task count mismatch (Pre: $TASK_COUNT_PRE, Post: $TASK_COUNT_POST)"
    exit 1
fi
if [ "$TIME_COUNT_PRE" != "$TIME_COUNT_POST" ]; then
    echo "FATAL: Time count mismatch (Pre: $TIME_COUNT_PRE, Post: $TIME_COUNT_POST)"
    exit 1
fi

docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DRILL_DB;" > /dev/null
echo "=== Restore Drill PASSED (AC-M2b-4 Verified) ==="
exit 0
