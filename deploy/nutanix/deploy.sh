#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/se-deal-workspace}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"

if [[ -z "${REPO_URL}" ]]; then
  echo "Set REPO_URL to your git remote URL."
  echo "Example: REPO_URL=git@github.com:org/se-deal-workspace.git $0"
  exit 1
fi

echo "[1/6] Preparing application directory ${APP_DIR}..."
sudo mkdir -p "${APP_DIR}"
sudo chown -R "${USER}:${USER}" "${APP_DIR}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "[2/6] Cloning repository..."
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
else
  echo "[2/6] Updating existing repository..."
  git -C "${APP_DIR}" fetch origin
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
fi

cd "${APP_DIR}"

echo "[3/6] Preparing environment file..."
if [[ ! -f ".env" ]]; then
  cp .env.example .env
fi

echo "[4/6] Building and starting containers..."
docker compose up --build -d

echo "[5/6] Initializing database..."
docker compose exec se-workspace npm run db:push
docker compose exec se-workspace npm run db:seed

echo "[6/6] Deployment validation..."
curl -fsS "http://127.0.0.1:3000/api/health" | jq .
curl -fsS "http://127.0.0.1:3000/api/connectors" | jq .

echo "Deployment complete. Access app at http://<vm-ip>:3000"
