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

# Note: no `set -u` — sourcing nvm.sh references unset vars and would abort.
set -eo pipefail

SERVICE="se-deal-workspace.service"
PORT="${PORT:-3000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Ensuring Node/npm are on PATH"
# When invoked via `npm run deploy`, npm/node are already on PATH. Only reach for
# nvm (which is not strict-mode clean) if they are missing.
if ! command -v npm >/dev/null 2>&1; then
  set +e
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  nvm use --lts >/dev/null 2>&1 || nvm use node >/dev/null 2>&1
  set -e
fi
# Final fallback: prepend the newest installed nvm node bin dir.
if ! command -v npm >/dev/null 2>&1; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && PATH="$NODE_BIN:$PATH"
fi
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm not found on PATH" >&2; exit 1; }

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
