#!/usr/bin/env bash
# Deploy the latest main on the server. Run it there, from the app folder:
#   ~/projects/recoup/scripts/deploy.sh
# Pulls, installs, builds, restarts, then checks /api/health. If the new
# version isn't healthy it goes back to the previous commit.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8793}"
export PATH="$HOME/.local/bin:$PATH"
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

before="$(git rev-parse HEAD)"
git fetch --quiet origin main
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
exit 1
