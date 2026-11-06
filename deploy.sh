#!/usr/bin/env bash
#
# Deploy the current working tree to the live app.
#
# Staging runs under pm2 as `se-deal-staging` (see ecosystem.config.js) in
# production mode (`next start`), which serves the prebuilt `.next` directory and
# does NOT hot-reload from source. So "deploying" means: rebuild, then
# `pm2 restart` so the server loads the new build.
#
# Order matters: build FIRST, restart immediately AFTER. Never leave a running
# server pointed at a half-replaced `.next` (that 404s the hashed CSS/JS chunks
# and renders the app unstyled).

# Note: no `set -u` — sourcing nvm.sh references unset vars and would abort.
set -eo pipefail

APP="se-deal-staging"
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

echo "==> Restarting $APP under pm2"
if pm2 describe "$APP" >/dev/null 2>&1; then
  pm2 restart "$APP" --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save >/dev/null

echo "==> Waiting for the server to come back up"
UP=""
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then UP=1; break; fi
done
if [ -z "$UP" ]; then
  echo "ERROR: $APP did not answer on port $PORT. Check: pm2 logs $APP" >&2
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
