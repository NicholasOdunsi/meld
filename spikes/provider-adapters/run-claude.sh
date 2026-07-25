#!/usr/bin/env bash
set -euo pipefail

MAX_OUTPUT_BYTES=1048576
PINNED_CLAUDE_VERSION=2.1.219

canonicalize_managed_binary() {
  local candidate="$1"
  local physical_home
  local expected
  local canonical
  local current
  local component

  physical_home="$(cd -P "$HOME" 2>/dev/null && pwd -P)" || return 65
  expected="$physical_home/Library/Application Support/Meld/providers/claude/$PINNED_CLAUDE_VERSION/bin/claude"
  if [ -z "$candidate" ] || [ "${candidate#/}" = "$candidate" ]; then
    printf 'Claude binary path must be canonical and absolute\n' >&2
    return 65
  fi
  case "$candidate" in
    */ | */./* | */../*)
      printf 'Claude binary path must not contain aliases or dot segments\n' >&2
      return 65
      ;;
  esac
  if [ "$candidate" != "$expected" ] || [ ! -f "$candidate" ] ||
    [ ! -x "$candidate" ]; then
    printf 'Claude binary must be the pinned managed executable: %s\n' "$expected" >&2
    return 65
  fi
  current="$physical_home"
  for component in \
    "Library" "Application Support" "Meld" "providers" "claude" \
    "$PINNED_CLAUDE_VERSION" "bin" "claude"; do
    current="$current/$component"
    if [ -L "$current" ]; then
      printf 'Claude binary path must contain no symlinks: %s\n' "$current" >&2
      return 65
    fi
  done
  canonical="$(cd -P "$(dirname "$candidate")" && pwd -P)/$(basename "$candidate")"
  if [ "$canonical" != "$candidate" ] || [ ! -O "$candidate" ]; then
    printf 'Claude binary must be canonical and owned by the current user\n' >&2
    return 65
  fi
  printf '%s\n' "$canonical"
}

check_managed_policy() {
  local root_prefix="${1:-}"
  local managed_root="$root_prefix/Library/Application Support/ClaudeCode"
  local managed_preferences="$root_prefix/Library/Managed Preferences"
  local file

  for file in \
    "$managed_root/managed-settings.json" \
    "$managed_root/managed-mcp.json" \
    "$managed_preferences/com.anthropic.claudecode.plist" \
    "$managed_preferences/${USER:-}/com.anthropic.claudecode.plist"; do
    if [ -e "$file" ] || [ -L "$file" ]; then
      printf 'Claude managed policy is present: %s\n' "$file" >&2
      return 68
    fi
  done
  if [ -d "$managed_root/managed-settings.d" ]; then
    for file in "$managed_root/managed-settings.d/"*.json; do
      if [ -e "$file" ] || [ -L "$file" ]; then
        printf 'Claude managed policy drop-in is present: %s\n' "$file" >&2
        return 68
      fi
    done
  fi
  if [ -z "$root_prefix" ] &&
    /usr/bin/defaults read com.anthropic.claudecode >/dev/null 2>&1; then
    printf 'Claude MDM managed preferences domain is present\n' >&2
    return 68
  fi
}

cap_stdout() {
  /usr/bin/perl -e '
    my $max = shift @ARGV;
    my $total = 0;
    while (1) {
      my $read = sysread(STDIN, my $buffer, 8192);
      exit 74 unless defined $read;
      last if $read == 0;
      if ($total + $read > $max) {
        my $remaining = $max - $total;
        print substr($buffer, 0, $remaining) if $remaining > 0;
        exit 75;
      }
      print $buffer;
      $total += $read;
    }
  ' "$MAX_OUTPUT_BYTES"
}

if [ "${1:-}" = "--validate-binary" ]; then
  if [ "$#" -ne 2 ]; then
    printf 'usage: %s --validate-binary <claude-binary>\n' "$0" >&2
    exit 64
  fi
  canonicalize_managed_binary "$2"
  exit $?
fi

if [ "${1:-}" = "--check-managed-policy" ]; then
  if [ "$#" -ne 2 ]; then
    printf 'usage: %s --check-managed-policy <test-root>\n' "$0" >&2
    exit 64
  fi
  check_managed_policy "$2"
  exit $?
fi

if [ "$#" -ne 2 ]; then
  printf 'usage: %s <task-dir> <output-path>\n' "$0" >&2
  exit 64
fi

TASK_DIR="$1"
OUTPUT_PATH="$2"
DENIED_TOOLS="Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,mcp__*"

check_managed_policy "" || exit $?
if [ -z "${MELD_CLAUDE_BIN:-}" ]; then
  printf 'Set MELD_CLAUDE_BIN to the pinned managed Claude executable\n' >&2
  exit 67
fi
MELD_CLAUDE_BIN="$(canonicalize_managed_binary "$MELD_CLAUDE_BIN")" || exit $?

if [ ! -f "$TASK_DIR/context.json" ]; then
  printf 'missing context fixture: %s/context.json\n' "$TASK_DIR" >&2
  exit 66
fi

(
  cd "$TASK_DIR"
  set +e
  env -i \
    HOME="$HOME" \
    PATH="$PATH" \
    TMPDIR="${TMPDIR:-/tmp}" \
    LANG="${LANG:-C.UTF-8}" \
    SHELL="${SHELL:-/bin/sh}" \
    USER="${USER:-}" \
    CLAUDE_CODE_SAFE_MODE=1 \
    "$MELD_CLAUDE_BIN" -p \
      --output-format stream-json \
      --verbose \
      --permission-mode plan \
      --max-turns 1 \
      --no-session-persistence \
      --disable-slash-commands \
      --safe-mode \
      --setting-sources "" \
      --tools "" \
      --disallowedTools "$DENIED_TOOLS" \
      --strict-mcp-config \
      < context.json |
    cap_stdout > "$OUTPUT_PATH"
  pipeline_status=("${PIPESTATUS[@]}")
  provider_status="${pipeline_status[0]}"
  cap_status="${pipeline_status[1]}"
  set -e
  if [ "$cap_status" -ne 0 ]; then
    exit "$cap_status"
  fi
  exit "$provider_status"
)
