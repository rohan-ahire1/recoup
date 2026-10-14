#!/usr/bin/env bash
# Runs the scheduler once (recoup-cron.timer calls it every 15 minutes).
# Needs CRON_SECRET; NTFY_URL is optional and gets an alert if the run fails.
set -uo pipefail

PORT="${PORT:-8793}"
out="$(curl -sS --max-time 600 -w '\n%{http_code}' -X POST -H "Authorization: Bearer ${CRON_SECRET:?CRON_SECRET is not set}" "http://127.0.0.1:$PORT/api/cron/run" 2>&1)"
code="${out##*$'\n'}"
body="${out%$'\n'*}"
echo "$code $body"
if [ "$code" != "200" ]; then
  # The app alerts on its own errors; this covers the app being down or unreachable.
  if [ -n "${NTFY_URL:-}" ]; then
    curl -sS --max-time 10 -H "Title: Recoup: scheduler run failed" -H "Priority: high" -H "Tags: warning" -d "HTTP $code: ${body:0:500}" "$NTFY_URL" >/dev/null || true
  fi
  exit 1
fi
