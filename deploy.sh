#!/usr/bin/env bash
#
# Deploy the current working tree to the live app.
#
# The app runs as the systemd unit `se-deal-workspace.service` in production
# mode (`next start`), which serves the prebuilt `.next` directory and does NOT
# hot-reload from source. So "deploying" means: rebuild, then restart the
# service so it loads the new build.
#
# The unit has `Restart=always` and runs as this same user, so we can restart it
# WITHOUT sudo simply by killing its main process and letting systemd respawn it.
#
# Order matters: build FIRST, restart immediately AFTER. Never leave a running
# server pointed at a half-replaced `.next` (that 404s the hashed CSS/JS chunks
# and renders the app unstyled).

set -euo pipefail

SERVICE="se-deal-workspace.service"
PORT="${PORT:-3000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Loading Node (nvm)"
# shellcheck disable=SC1090
. "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
nvm use --lts >/dev/null 2>&1 || true

echo "==> Building production bundle"
npm run build

echo "==> Restarting $SERVICE (kill main process -> systemd Restart=always respawns)"
PID="$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null || echo 0)"
if [ -n "$PID" ] && [ "$PID" != "0" ]; then
  kill "$PID" 2>/dev/null || true
else
  echo "    (no running main PID found; relying on systemd to start it)"
fi

echo "==> Waiting for service to come back up"
for i in $(seq 1 30); do
  sleep 1
  STATE="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
  if [ "$STATE" = "active" ] && curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then
    break
  fi
done

STATE="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
if [ "$STATE" != "active" ]; then
  echo "ERROR: $SERVICE is not active (state: $STATE)" >&2
  exit 1
fi

echo "==> Verifying a built CSS asset is served"
CSS="$(find .next/static -name '*.css' -printf '%f\n' 2>/dev/null | head -1 || true)"
if [ -n "$CSS" ]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/_next/static/chunks/$CSS" || echo 000)"
  echo "    /_next/static/chunks/$CSS -> $CODE"
  if [ "$CODE" != "200" ]; then
    echo "ERROR: CSS asset did not return 200 (got $CODE). Deploy may be broken." >&2
    exit 1
  fi
else
  echo "WARNING: no CSS chunk found in .next/static to verify." >&2
fi

echo "==> Deploy complete. Hard-refresh the app (Cmd/Ctrl+Shift+R) to drop cached HTML."
