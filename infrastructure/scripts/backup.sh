#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="${1:-/backups/alibi_backup.dump}"
DB_USER="${POSTGRES_USER:-${PGUSER:-alibi}}"
DB_NAME="${POSTGRES_DB:-${PGDATABASE:-alibi}}"
DB_HOST="${POSTGRES_HOST:-${PGHOST:-localhost}}"
DB_PORT="${POSTGRES_PORT:-${PGPORT:-5432}}"

if [ -n "${POSTGRES_PASSWORD:-}" ]; then
    export PGPASSWORD="${POSTGRES_PASSWORD}"
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"
echo "Creating PostgreSQL backup for $DB_NAME from $DB_HOST:$DB_PORT..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$OUTPUT_FILE"
echo "Backup complete: $OUTPUT_FILE"

