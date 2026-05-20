#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/dev-<timestamp>.db.gz"
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/se-deal-workspace}"
BACKUP_FILE="$1"
TARGET_DB="${APP_DIR}/dev.db"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "Stopping app..."
cd "${APP_DIR}"
docker compose down

echo "Restoring database..."
gunzip -c "${BACKUP_FILE}" > "${TARGET_DB}"

echo "Starting app..."
docker compose up -d

echo "Restore complete."
