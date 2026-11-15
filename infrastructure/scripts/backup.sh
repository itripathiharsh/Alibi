#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="${1:-/backups/alibi_backup.dump}"
DB_USER="${POSTGRES_USER:-alibi}"
DB_NAME="${POSTGRES_DB:-alibi}"

mkdir -p "$(dirname "$OUTPUT_FILE")"
echo "Creating PostgreSQL backup for $DB_NAME..."
pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -f "$OUTPUT_FILE"
echo "Backup complete: $OUTPUT_FILE"
