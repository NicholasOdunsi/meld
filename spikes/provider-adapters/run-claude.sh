#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  printf 'usage: %s <task-dir> <output-path>\n' "$0" >&2
  exit 64
fi

TASK_DIR="$1"
OUTPUT_PATH="$2"
DENIED_TOOLS="Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,mcp__*"

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
    CLAUDE_CODE_SAFE_MODE=1 \
    claude -p \
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
      "$(jq -c . context.json)"
) > "$OUTPUT_PATH"
