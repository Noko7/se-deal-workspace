#!/usr/bin/env bash
#
# Installs a private headless Chrome used by /api/proposal-pdf to render the
# Proposal Builder 2-pager into a real PDF (vector text, no browser print
# headers/footers). No sudo: the Chrome-for-Testing build is unpacked under
# $PDF_CHROME_DIR, and the shared libraries + fonts it needs that this host
# lacks are fetched with `apt-get download` and extracted next to it.
#
# Idempotent; safe to re-run. deploy.sh runs it when the wrapper is missing.

set -eo pipefail

CHROME_VERSION="${CHROME_VERSION:-157.0.8103.38}"
DIR="${PDF_CHROME_DIR:-$HOME/.local/share/pdf-chrome}"
ROOT="$DIR/root"
BIN="$DIR/chrome-headless-shell-linux64/chrome-headless-shell"

LIB_PACKAGES=(
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxrender1 libxi6 libxtst6
  libxext6 libx11-6 libx11-xcb1 libxcb1 libxau6 libxdmcp6 libxkbcommon0
  libgbm1 libdrm2 libwayland-server0 libasound2 libexpat1 libdbus-1-3 libcups2
  libfontconfig1 libfreetype6 fontconfig-config fonts-dejavu-core fonts-liberation
)

mkdir -p "$DIR"

if [ ! -x "$BIN" ] || ! grep -qx "$CHROME_VERSION" "$DIR/VERSION" 2>/dev/null; then
  echo "==> Downloading chrome-headless-shell $CHROME_VERSION"
  rm -rf "$DIR/chrome-headless-shell-linux64"
  curl -fsSL -o "$DIR/chrome.zip" \
    "https://storage.googleapis.com/chrome-for-testing-public/$CHROME_VERSION/linux64/chrome-headless-shell-linux64.zip"
  # No `unzip` on this host; python3's zipfile drops the exec bits, so restore them.
  python3 -c "import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$DIR/chrome.zip" "$DIR"
  rm -f "$DIR/chrome.zip"
  chmod +x "$BIN" "$DIR/chrome-headless-shell-linux64/"*.so* 2>/dev/null || true
  echo "$CHROME_VERSION" > "$DIR/VERSION"
fi

if [ ! -f "$ROOT/.libs-ok" ]; then
  echo "==> Fetching shared libraries and fonts (apt-get download, no sudo)"
  rm -rf "$DIR/debs" "$ROOT"
  mkdir -p "$DIR/debs" "$ROOT"
  (cd "$DIR/debs" && apt-get download "${LIB_PACKAGES[@]}" >/dev/null)
  for deb in "$DIR/debs"/*.deb; do dpkg-deb -x "$deb" "$ROOT"; done
  rm -rf "$DIR/debs"
  touch "$ROOT/.libs-ok"
fi

mkdir -p "$DIR/fc/cache"
cat > "$DIR/fc/fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>$ROOT/usr/share/fonts</dir>
  <cachedir>$DIR/fc/cache</cachedir>
  <include ignore_missing="yes">$ROOT/etc/fonts/conf.d</include>
</fontconfig>
EOF

cat > "$DIR/chrome" <<EOF
#!/usr/bin/env bash
export LD_LIBRARY_PATH="$ROOT/usr/lib/x86_64-linux-gnu:$ROOT/lib/x86_64-linux-gnu\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export FONTCONFIG_FILE="$DIR/fc/fonts.conf"
exec "$BIN" "\$@"
EOF
chmod +x "$DIR/chrome"

missing="$(LD_LIBRARY_PATH="$ROOT/usr/lib/x86_64-linux-gnu:$ROOT/lib/x86_64-linux-gnu" ldd "$BIN" | grep "not found" || true)"
if [ -n "$missing" ]; then
  echo "ERROR: chrome-headless-shell still has unresolved libraries:" >&2
  echo "$missing" >&2
  exit 1
fi

echo "==> $("$DIR/chrome" --version) ready at $DIR/chrome"
