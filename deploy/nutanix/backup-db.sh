#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/se-deal-workspace}"
BACKUP_DIR="${BACKUP_DIR:-/opt/se-deal-workspace/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
SOURCE_DB="${APP_DIR}/dev.db"
TARGET_DB="${BACKUP_DIR}/dev-${STAMP}.db"

mkdir -p "${BACKUP_DIR}"

if [[ ! -f "${SOURCE_DB}" ]]; then
  echo "Database file not found: ${SOURCE_DB}"
  exit 1
fi

cp "${SOURCE_DB}" "${TARGET_DB}"
gzip -f "${TARGET_DB}"

echo "Backup created: ${TARGET_DB}.gz"
