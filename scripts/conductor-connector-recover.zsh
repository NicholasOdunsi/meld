#!/bin/zsh
set -euo pipefail

readonly label="com.meld.agent"
readonly user_domain="gui/$(id -u)"
readonly service_target="$user_domain/$label"
readonly plist="$HOME/Library/LaunchAgents/$label.plist"

if launchctl print "$service_target" >/dev/null 2>&1; then
  print "Meld connector LaunchAgent is already loaded."
  exit 0
fi

if [[ ! -f "$plist" ]]; then
  print -u2 "Meld connector is not installed. Pair this Mac once from the Meld browser setup."
  exit 1
fi

launchctl bootstrap "$user_domain" "$plist"
launchctl print "$service_target" >/dev/null
print "Meld connector LaunchAgent loaded."
