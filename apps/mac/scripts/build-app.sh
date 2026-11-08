#!/bin/bash
# Builds Orion.app.
#   ./scripts/build-app.sh                 local build, installs to ~/Applications
#   ./scripts/build-app.sh --release N     CI build version 1.0.N into build/, no install
# Signs with "Orion Self-Signed" when that identity exists, otherwise ad-hoc.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="local"; BUILD_NUMBER="0"
if [[ "${1:-}" == "--release" ]]; then MODE="release"; BUILD_NUMBER="${2:?build number required}"; fi
IDENTITY="${ORION_SIGN_IDENTITY:-Orion Self-Signed}"
if ! security find-certificate -c "$IDENTITY" >/dev/null 2>&1; then
  [[ "$MODE" == "release" ]] && { echo "error: signing identity '$IDENTITY' missing" >&2; exit 1; }
  IDENTITY="-"
fi

swift build -c release --product Orion
BIN_DIR="$(swift build -c release --show-bin-path)"
APP="build/Orion.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Frameworks"
cp AppBundle/Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 1.0.$BUILD_NUMBER" "$APP/Contents/Info.plist"
cp "$BIN_DIR/Orion" "$APP/Contents/MacOS/Orion"
# OrionDesignSystem ships fonts + strings in an SPM resource bundle; the
# executable looks it up next to the app, so copy it into Resources.
BUNDLE="$BIN_DIR/OrionDesignSystem_OrionDesignSystem.bundle"
[[ -d "$BUNDLE" ]] || { echo "error: missing $BUNDLE" >&2; exit 1; }
cp -R "$BUNDLE" "$APP/Contents/Resources/"
cp -R "$BIN_DIR/Sparkle.framework" "$APP/Contents/Frameworks/"
install_name_tool -add_rpath "@executable_path/../Frameworks" "$APP/Contents/MacOS/Orion"

# Sign inside-out. Only the outer app gets entitlements: with the hardened runtime
# and a self-signed certificate (no Team ID), dyld refuses to load Sparkle unless
# library validation is disabled.
SPARKLE="$APP/Contents/Frameworks/Sparkle.framework/Versions/B"
sign() { codesign --force --options runtime --timestamp=none --sign "$IDENTITY" "$@"; }
for xpc in "$SPARKLE"/XPCServices/*.xpc; do sign "$xpc"; done
sign "$SPARKLE/Autoupdate"
sign "$SPARKLE/Updater.app"
sign "$APP/Contents/Frameworks/Sparkle.framework"
sign --entitlements AppBundle/Orion.entitlements "$APP"
codesign --verify --strict --deep "$APP"

if [[ "$MODE" == "local" ]]; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/Orion.app"
  cp -R "$APP" "$HOME/Applications/"
  echo "Installed: $HOME/Applications/Orion.app"
else
  echo "Built: $APP (1.0.$BUILD_NUMBER)"
fi
