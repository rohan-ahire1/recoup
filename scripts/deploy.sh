#!/usr/bin/env bash
# Deploy the latest main on the server. Run it there, from the app folder:
#   ~/projects/recoup/scripts/deploy.sh
# Backs up every database, pulls, installs, builds, restarts, then checks
# /api/health. If the new version isn't healthy it goes back to the previous
# commit and prints where the pre-deploy backup is (it never restores it).
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8793}"
export PATH="$HOME/.local/bin:$PATH"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/recoup}"
PRE_DEPLOY_DIR="$BACKUP_DIR/pre-deploy"
KEEP_PRE_DEPLOY=10
cd "$APP_DIR"

healthy() {
  for _ in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

build_and_restart() {
  npm ci --no-audit --no-fund
  npm run build
  sudo systemctl restart recoup
}

# Keep the newest $KEEP_PRE_DEPLOY pre-deploy backups.
prune_pre_deploy() {
  find "$PRE_DEPLOY_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -rn | tail -n +$((KEEP_PRE_DEPLOY + 1)) | cut -d' ' -f2- \
    | while IFS= read -r old; do rm -rf -- "$old"; done
}

before="$(git rev-parse HEAD)"
git fetch --quiet origin main

# Migrations only go forward, so copy every database before the new code runs.
backup="$PRE_DEPLOY_DIR/$(git rev-parse --short "$before")-$(date -u +%Y%m%dT%H%M%SZ)"
if ! node "$APP_DIR/scripts/backup-db.mjs" "$DATA_DIR" "$backup"; then
  rm -rf -- "$backup"
  echo "Pre-deploy backup failed; not deploying. The running app is untouched." >&2
  exit 1
fi
prune_pre_deploy

git reset --quiet --hard origin/main
after="$(git rev-parse HEAD)"
echo "Deploying $(git log -1 --format='%h %s')"

build_and_restart
if healthy; then
  echo "Healthy. $(git rev-parse --short "$before") -> $(git rev-parse --short "$after")"
  exit 0
fi

echo "Not healthy after restart; going back to $(git rev-parse --short "$before")" >&2
sudo journalctl -u recoup -n 30 --no-pager >&2 || true
git reset --quiet --hard "$before"
build_and_restart
healthy && echo "Rolled back." >&2
echo "Databases were backed up before this deploy to $backup" >&2
echo "Migrations are not undone. Restore that copy by hand if the data needs it." >&2
exit 1
