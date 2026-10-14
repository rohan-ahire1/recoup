#!/usr/bin/env bash
# Nightly database backup (recoup-backup.timer). Keeps 14 days in ~/backups/recoup.
# Alerts through NTFY_URL if it fails.
set -uo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/recoup}"

if ! out="$(node "$APP_DIR/scripts/backup-db.mjs" "$DATA_DIR" "$BACKUP_DIR" 14 2>&1)"; then
  echo "$out" >&2
  if [ -n "${NTFY_URL:-}" ]; then
    curl -sS --max-time 10 -H "Title: Recoup: backup failed" -H "Priority: high" -H "Tags: warning" -d "${out:0:500}" "$NTFY_URL" >/dev/null || true
  fi
  exit 1
fi
echo "$out"
