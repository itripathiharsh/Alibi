#!/usr/bin/env bash
set -euo pipefail

INPUT_FILE="${1:-/backups/alibi_backup.dump}"
DB_USER="${POSTGRES_USER:-${PGUSER:-alibi}}"
DB_NAME="${POSTGRES_DB:-${PGDATABASE:-alibi}}"
DB_HOST="${POSTGRES_HOST:-${PGHOST:-localhost}}"
DB_PORT="${POSTGRES_PORT:-${PGPORT:-5432}}"

if [ -n "${POSTGRES_PASSWORD:-}" ]; then
    export PGPASSWORD="${POSTGRES_PASSWORD}"
fi

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Backup file $INPUT_FILE not found."
    exit 1
fi

echo "Restoring PostgreSQL database $DB_NAME from $INPUT_FILE at $DB_HOST:$DB_PORT..."
set +e
pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges "$INPUT_FILE"
rc=$?
set -e
if [ "$rc" -gt 1 ]; then
    echo "Error: pg_restore failed with exit code $rc"
    exit "$rc"
fi
echo "Restore complete."

