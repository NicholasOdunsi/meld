#!/usr/bin/env bash
set -euo pipefail

MAX_OUTPUT_BYTES=1048576
PINNED_CODEX_VERSION=0.145.0

canonicalize_managed_binary() {
  local candidate="$1"
  local physical_home
  local expected
  local canonical
  local current
  local component

  physical_home="$(cd -P "$HOME" 2>/dev/null && pwd -P)" || return 65
  expected="$physical_home/Library/Application Support/Meld/providers/codex/$PINNED_CODEX_VERSION/bin/codex"
  case "$candidate" in
    "" | "${candidate#/}" | */ | */./* | */../*)
      printf 'Codex binary path must be canonical and absolute\n' >&2
      return 65
      ;;
  esac
  if [ "$candidate" != "$expected" ] || [ ! -f "$candidate" ] ||
    [ ! -x "$candidate" ]; then
    printf 'Codex binary must be the pinned managed executable: %s\n' "$expected" >&2
    return 65
  fi
  current="$physical_home"
  for component in \
    "Library" "Application Support" "Meld" "providers" "codex" \
    "$PINNED_CODEX_VERSION" "bin" "codex"; do
    current="$current/$component"
    if [ -L "$current" ]; then
      printf 'Codex binary path must contain no symlinks: %s\n' "$current" >&2
      return 65
    fi
  done
  canonical="$(cd -P "$(dirname "$candidate")" && pwd -P)/$(basename "$candidate")"
  if [ "$canonical" != "$candidate" ] || [ ! -O "$candidate" ]; then
    printf 'Codex binary must be canonical and owned by the current user\n' >&2
    return 65
  fi
  printf '%s\n' "$canonical"
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

resolve_managed_binary_for_run() {
  local isolated_home="$1"
  local path_value="$2"
  local meld_root
  local managed_bin_dir
  local candidate
  local canonical

  case "$isolated_home" in
    /*/Library/Application\ Support/Meld/spike-codex-home) ;;
    *)
      printf 'HOME must be the dedicated Meld Codex home\n' >&2
      return 65
      ;;
  esac
  canonical="$(cd -P "$isolated_home" 2>/dev/null && pwd -P)" || {
    printf 'cannot resolve the isolated Codex home\n' >&2
    return 65
  }
  if [ "$canonical" != "$isolated_home" ]; then
    printf 'isolated Codex HOME must be canonical and contain no symlinks\n' >&2
    return 65
  fi

  meld_root="${isolated_home%/spike-codex-home}"
  managed_bin_dir="$meld_root/providers/codex/$PINNED_CODEX_VERSION/bin"
  candidate="$managed_bin_dir/codex"
  if [ "$path_value" != "$managed_bin_dir:/usr/bin:/bin" ]; then
    printf 'PATH must contain only the managed Codex bin and system bins\n' >&2
    return 65
  fi
  if [ ! -f "$candidate" ] || [ ! -x "$candidate" ] ||
    [ -L "$candidate" ] || [ ! -O "$candidate" ]; then
    printf 'Codex runner could not resolve the pinned managed executable\n' >&2
    return 65
  fi
  canonical="$(cd -P "$managed_bin_dir" 2>/dev/null && pwd -P)/codex" || {
    printf 'cannot resolve the managed Codex executable\n' >&2
    return 65
  }
  if [ "$canonical" != "$candidate" ] ||
    [ "$(command -v codex 2>/dev/null || true)" != "$candidate" ]; then
    printf 'resolved Codex executable is not the expected managed path\n' >&2
    return 65
  fi

  printf '%s\n' "$candidate"
}

canonicalize_codex_home() {
  local candidate="$1"
  local physical_home
  local expected
  local default_home
  local canonical
  local current
  local component

  if [ -z "$candidate" ] || [ "${candidate#/}" = "$candidate" ]; then
    printf 'CODEX_HOME must be an absolute path\n' >&2
    return 65
  fi
  case "$candidate" in
    */ | */./* | */../*)
      printf 'CODEX_HOME must not contain aliases, dot segments, or a trailing slash\n' >&2
      return 65
      ;;
  esac

  physical_home="$(cd -P "$HOME" 2>/dev/null && pwd -P)" || {
    printf 'cannot resolve the physical user home\n' >&2
    return 65
  }
  expected="$physical_home/Library/Application Support/Meld/spike-codex-home"
  default_home="$physical_home/.codex"

  if [ "$candidate" != "$expected" ]; then
    printf 'CODEX_HOME must be the dedicated Meld location: %s\n' "$expected" >&2
    return 65
  fi
  if [ ! -d "$candidate" ]; then
    printf 'CODEX_HOME does not exist: %s\n' "$candidate" >&2
    return 65
  fi

  current="$physical_home"
  for component in "Library" "Application Support" "Meld" "spike-codex-home"; do
    current="$current/$component"
    if [ -L "$current" ] || [ ! -d "$current" ]; then
      printf 'CODEX_HOME must have no symlink components: %s\n' "$current" >&2
      return 65
    fi
  done
  if [ ! -O "$physical_home/Library/Application Support/Meld" ] ||
    [ ! -O "$candidate" ]; then
    printf 'CODEX_HOME and its Meld parent must be owned by the current user\n' >&2
    return 65
  fi

  canonical="$(cd -P "$candidate" 2>/dev/null && pwd -P)" || {
    printf 'cannot resolve CODEX_HOME\n' >&2
    return 65
  }
  if [ "$canonical" != "$candidate" ]; then
    printf 'CODEX_HOME must already be a canonical physical path\n' >&2
    return 65
  fi
  if [ -d "$default_home" ]; then
    default_home="$(cd -P "$default_home" 2>/dev/null && pwd -P)" || return 65
  fi
  if [ "$canonical" = "$default_home" ]; then
    printf 'CODEX_HOME must not resolve to the user default ~/.codex\n' >&2
    return 65
  fi

  printf '%s\n' "$canonical"
}

if [ "${1:-}" = "--validate-home" ]; then
  if [ "$#" -ne 2 ]; then
    printf 'usage: %s --validate-home <codex-home>\n' "$0" >&2
    exit 64
  fi
  canonicalize_codex_home "$2"
  exit $?
fi

if [ "${1:-}" = "--validate-binary" ]; then
  if [ "$#" -ne 2 ]; then
    printf 'usage: %s --validate-binary <codex-binary>\n' "$0" >&2
    exit 64
  fi
  canonicalize_managed_binary "$2"
  exit $?
fi

if [ "$#" -ne 2 ]; then
  printf 'usage: %s <task-dir> <output-path>\n' "$0" >&2
  exit 64
fi

TASK_DIR="$1"
OUTPUT_PATH="$2"

if [ -z "${HOME:-}" ] || [ -z "${PATH:-}" ] || [ -z "${TMPDIR:-}" ]; then
  printf 'Codex runner requires an isolated HOME, managed PATH, and task TMPDIR\n' >&2
  exit 67
fi
ISOLATED_HOME="$HOME"
TASK_TMP="$TMPDIR"
MANAGED_CODEX_BIN="$(resolve_managed_binary_for_run "$ISOLATED_HOME" "$PATH")" ||
  exit $?

if [ ! -f "$TASK_DIR/context.json" ]; then
  printf 'missing context fixture: %s/context.json\n' "$TASK_DIR" >&2
  exit 66
fi

(
  cd "$TASK_DIR"
  set +e
  env -i \
    HOME="$ISOLATED_HOME" \
    PATH="$PATH" \
    TMPDIR="$TASK_TMP" \
    LANG="C.UTF-8" \
    LC_ALL="C.UTF-8" \
    "$MANAGED_CODEX_BIN" exec \
      --json \
      --color never \
      --sandbox read-only \
      --skip-git-repo-check \
      --ephemeral \
      --ignore-user-config \
      --ignore-rules \
      --strict-config \
      --config 'approval_policy="never"' \
      --config 'features.shell_tool=false' \
      --config 'agents.enabled=false' \
      --config 'web_search="disabled"' \
      --config 'mcp_servers={}' \
      - \
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
