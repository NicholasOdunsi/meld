#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  printf 'usage: %s <task-dir> <output-path>\n' "$0" >&2
  exit 64
fi

TASK_DIR="$1"
OUTPUT_PATH="$2"

if [ -z "${CODEX_HOME:-}" ]; then
  printf 'Set CODEX_HOME to a connector-specific home authenticated with codex login\n' >&2
  exit 67
fi

if [ "$CODEX_HOME" = "${HOME}/.codex" ]; then
  printf 'refusing the user default CODEX_HOME; use an isolated connector-specific home\n' >&2
  exit 65
fi

if [ ! -f "$TASK_DIR/context.json" ]; then
  printf 'missing context fixture: %s/context.json\n' "$TASK_DIR" >&2
  exit 66
fi

(
  cd "$TASK_DIR"
  exec env -i \
    HOME="$HOME" \
    PATH="$PATH" \
    TMPDIR="${TMPDIR:-/tmp}" \
    LANG="${LANG:-C.UTF-8}" \
    SHELL="${SHELL:-/bin/sh}" \
    USER="${USER:-}" \
    CODEX_HOME="$CODEX_HOME" \
    codex exec \
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
      "$(jq -c . context.json)"
) > "$OUTPUT_PATH"
