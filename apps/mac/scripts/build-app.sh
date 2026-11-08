#!/bin/bash
# Builds Orion.app for this Mac only (ad-hoc signed, no Apple account)
# and installs it into ~/Applications.
set -euo pipefail

cd "$(dirname "$0")/.."
swift build -c release --product Orion
BIN_DIR="$(swift build -c release --show-bin-path)"
APP="build/Orion.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp AppBundle/Info.plist "$APP/Contents/Info.plist"
cp "$BIN_DIR/Orion" "$APP/Contents/MacOS/Orion"
# OrionDesignSystem ships fonts + strings in an SPM resource bundle; the
# executable looks it up next to the app, so copy it into Resources.
BUNDLE="$BIN_DIR/OrionDesignSystem_OrionDesignSystem.bundle"
if [[ -d "$BUNDLE" ]]; then
  cp -R "$BUNDLE" "$APP/Contents/Resources/"
else
  echo "error: missing $BUNDLE (required for the Orion menu-bar mark)" >&2
  exit 1
fi
codesign --force --deep --sign - "$APP"

mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Orion.app"
cp -R "$APP" "$HOME/Applications/"
echo "Installed: $HOME/Applications/Orion.app"
