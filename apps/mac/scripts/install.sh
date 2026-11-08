#!/bin/bash
# First install of Orion from GitHub Releases. Updates after this are automatic.
set -euo pipefail
EXPECTED_SHA256="BA2B30A562FD5845914F027C523D621CEE144ED493C24092967281C360DEE0B1"
URL="${ORION_ZIP_URL:-https://github.com/NicholasOdunsi/meld/releases/latest/download/Orion.zip}"
INSTALL_DIR="${ORION_INSTALL_DIR:-$HOME/Applications}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "$URL" -o "$WORK/Orion.zip"
ditto -x -k "$WORK/Orion.zip" "$WORK/unzipped"
APP="$WORK/unzipped/Orion.app"
codesign --verify --strict --deep "$APP"
( cd "$WORK" && codesign -d --extract-certificates "$APP" >/dev/null 2>&1 )
ACTUAL="$(openssl x509 -inform DER -in "$WORK/codesign0" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':')"
if [[ "$ACTUAL" != "$EXPECTED_SHA256" ]]; then
  echo "error: Orion.zip is not signed with the Orion certificate — not installing." >&2
  exit 1
fi
mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/Orion.app"
mv "$APP" "$INSTALL_DIR/Orion.app"
[[ -n "${ORION_NO_OPEN:-}" ]] || open "$INSTALL_DIR/Orion.app"
echo "Orion installed."
