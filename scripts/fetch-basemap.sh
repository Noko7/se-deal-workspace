#!/usr/bin/env bash
set -euo pipefail

# Fetch a self-hosted PMTiles basemap so the Account Map renders roads/labels
# with NO third-party tile requests at runtime. The app serves this single
# static file itself from /public.
#
# Usage:
#   BBOX="-125,24,-66,50" ./scripts/fetch-basemap.sh     # continental US (default)
#   ./scripts/fetch-basemap.sh                            # same default
#
# After running, set in .env:
#   NEXT_PUBLIC_BASEMAP_URL=/basemap.pmtiles
# and restart the dev server. Without this file the app falls back to
# OpenStreetMap raster tiles automatically.

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public"
OUT_FILE="${OUT_DIR}/basemap.pmtiles"
BBOX="${BBOX:--125,24,-66,50}"
SOURCE="${SOURCE:-https://build.protomaps.com/20240801.pmtiles}"

mkdir -p "${OUT_DIR}"

if ! command -v pmtiles >/dev/null 2>&1; then
  cat <<'MSG'
The 'pmtiles' CLI is required to extract a regional basemap.
Install it from https://github.com/protomaps/go-pmtiles/releases
(e.g. download the binary for your platform and put it on your PATH), then re-run.
MSG
  exit 1
fi

echo "Extracting basemap for bbox=${BBOX} from ${SOURCE}"
echo "This downloads only the tiles for the bounding box via HTTP range requests."
pmtiles extract "${SOURCE}" "${OUT_FILE}" --bbox="${BBOX}"

echo "Wrote ${OUT_FILE}"
echo "Now set NEXT_PUBLIC_BASEMAP_URL=/basemap.pmtiles in .env and restart."
