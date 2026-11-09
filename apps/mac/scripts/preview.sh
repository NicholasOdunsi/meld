#!/bin/bash
# Try Orion UI changes on this Mac without deploying.
#
#   apps/mac/scripts/preview.sh           build + open "Orion Preview" (and the local site)
#   apps/mac/scripts/preview.sh --web     local site only, for a browser
#   apps/mac/scripts/preview.sh --reset   forget the preview's last page and sign-in first
#
# What it does:
#   1. Runs the website from this checkout at http://127.0.0.1:3107 with the
#      built-in demo data (demo projects, chats, inspiration). No Supabase,
#      no real data, nothing deployed.
#   2. Builds the Mac app from this checkout as a separate app, "Orion Preview"
#      (com.orion.app.preview), pointed at that site. It has no menu-bar Shelf
#      and never updates itself, so your installed Orion is untouched.
#
# Website edits show up live (the page reloads by itself; ⌘R if not).
# Swift edits need this script run again. Ctrl+C (or Conductor's stop) ends both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${ORION_PREVIEW_PORT:-3107}"
SITE="http://127.0.0.1:$PORT"
LOG="$ROOT/.context/orion-preview-web.log"
APP="$ROOT/apps/mac/build/Orion Preview.app"
BUNDLE_ID="com.orion.app.preview"
MODE="app"
case "${1:-}" in
  --web) MODE="web" ;;
  --reset) defaults delete "$BUNDLE_ID" lastPageURL >/dev/null 2>&1 || true ;;
  "") ;;
  *) echo "usage: $0 [--web|--reset]" >&2; exit 2 ;;
esac

# The repo pins Node 22 (.nvmrc).
NODE_BIN="$HOME/.nvm/versions/node/v22.23.2/bin"
[[ -d "$NODE_BIN" ]] && export PATH="$NODE_BIN:$PATH"
mkdir -p "$ROOT/.context"

WEB_PID=""
cleanup() {
  [[ -n "$WEB_PID" ]] && kill "$WEB_PID" >/dev/null 2>&1 || true
  pkill -f "$APP/Contents/MacOS/Orion" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

start_site() {
  local existing
  existing="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [[ -n "$existing" ]]; then
    # Next's server process is named "next-server", so check where it runs from.
    if lsof -a -p "$existing" -d cwd -Fn 2>/dev/null | grep -q "^n$ROOT"; then
      echo "Local site already running at $SITE"
      return
    fi
    echo "error: port $PORT is used by another program or checkout. Set ORION_PREVIEW_PORT." >&2
    exit 1
  fi
  echo "Starting the local site at $SITE (log: .context/orion-preview-web.log)…"
  (
    cd "$ROOT"
    MELD_E2E_DIST_DIR=".next-e2e" \
    MELD_E2E_FAKE_WORKSPACES=true \
    MELD_E2E_FAKE_DISCOVERY=true \
    MELD_E2E_FAKE_DEVICES=true \
    MELD_USER_FLOW_TRIAL_ENABLED=true \
    MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY=preview-placeholder \
    INVITATION_TOKEN_SECRET=preview-placeholder-secret-not-used-for-anything \
    NEXT_PUBLIC_APP_URL="$SITE" \
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=preview-placeholder \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=preview-placeholder \
    exec pnpm --filter web exec next dev --hostname 127.0.0.1 --port "$PORT"
  ) >"$LOG" 2>&1 &
  WEB_PID=$!
  for _ in $(seq 1 90); do
    curl -s -o /dev/null "$SITE/dev/demo-sign-in" && break
    kill -0 "$WEB_PID" 2>/dev/null || { echo "error: the site failed to start; see $LOG" >&2; exit 1; }
    sleep 1
  done
  # Warm the main pages so the first click isn't a long compile.
  curl -s -o /dev/null -c /dev/null "$SITE/dev/demo-sign-in" -L || true
}

build_app() {
  echo "Building Orion Preview…"
  cd "$ROOT/apps/mac"
  swift build --product Orion >/dev/null
  local bin; bin="$(swift build --show-bin-path)"
  local products="$ROOT/apps/mac/.build/out/Products/Debug"
  [[ -x "$products/Orion" ]] || products="$bin"
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Frameworks"
  cp AppBundle/Info.plist "$APP/Contents/Info.plist"
  cp AppBundle/Orion.icns "$APP/Contents/Resources/Orion.icns"
  local plist="$APP/Contents/Info.plist" pb=/usr/libexec/PlistBuddy
  $pb -c "Set :CFBundleIdentifier $BUNDLE_ID" "$plist"
  $pb -c "Set :CFBundleName Orion Preview" "$plist"
  $pb -c "Set :CFBundleDisplayName Orion Preview" "$plist"
  $pb -c "Set :CFBundleShortVersionString 0.0.0-preview" "$plist"
  # Start at the demo sign-in; it sets the demo cookies and opens the demo workspace.
  $pb -c "Delete :OrionBaseURL" "$plist" >/dev/null 2>&1 || true
  $pb -c "Add :OrionBaseURL string $SITE/dev/demo-sign-in" "$plist"
  $pb -c "Add :OrionPreview bool true" "$plist"
  $pb -c "Delete :SUEnableAutomaticChecks" "$plist" >/dev/null 2>&1 || true
  $pb -c "Add :SUEnableAutomaticChecks bool false" "$plist"
  cp "$products/Orion" "$APP/Contents/MacOS/Orion"
  cp -R "$products/OrionDesignSystem_OrionDesignSystem.bundle" "$APP/Contents/Resources/"
  cp -R "$products/Sparkle.framework" "$APP/Contents/Frameworks/"
  install_name_tool -add_rpath "@executable_path/../Frameworks" "$APP/Contents/MacOS/Orion" 2>/dev/null || true
  codesign --force --deep --sign - "$APP" >/dev/null 2>&1
}

start_site
if [[ "$MODE" == "app" ]]; then
  pkill -f "$APP/Contents/MacOS/Orion" >/dev/null 2>&1 || true
  build_app
  open -n "$APP"
  echo "Orion Preview is open. Website edits appear live; run this again after Swift edits."
else
  echo "Open $SITE/dev/demo-sign-in in your browser."
fi
echo "Press Ctrl+C to stop."
if [[ -n "$WEB_PID" ]]; then wait "$WEB_PID"; else while true; do sleep 3600; done; fi
