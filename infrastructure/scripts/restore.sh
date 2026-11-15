#!/usr/bin/env bash
set -euo pipefail

INPUT_FILE="${1:-/backups/alibi_backup.dump}"
DB_USER="${POSTGRES_USER:-alibi}"
DB_NAME="${POSTGRES_DB:-alibi}"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Backup file $INPUT_FILE not found."
    exit 1
fi

echo "Restoring PostgreSQL database $DB_NAME from $INPUT_FILE..."
pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges "$INPUT_FILE" || true
echo "Restore complete."

