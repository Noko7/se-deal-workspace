#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-127.0.0.1}"
PORT="${2:-3000}"
BASE_URL="http://${HOST}:${PORT}"

echo "Validating ${BASE_URL} ..."

echo "-> Health endpoint"
curl -fsS "${BASE_URL}/api/health" | jq .

echo "-> Connector status endpoint"
curl -fsS "${BASE_URL}/api/connectors" | jq .

echo "-> Container status"
docker compose ps

echo "-> Recent app logs"
docker compose logs --tail=50 se-workspace

echo "Validation complete."
