#!/bin/sh
set -eu

for argument in "$@"; do
  case "$argument" in
    *00000000-0000-0000-0000-000000000001*)
      printf 'context leaked through argv\n' >&2
      exit 88
      ;;
  esac
done

payload="$(cat)"
case "$payload" in
  *00000000-0000-0000-0000-000000000001*) ;;
  *)
    printf 'context missing from stdin\n' >&2
    exit 89
    ;;
esac

case "${0##*/}" in
  codex)
    printf '%s\n' \
      '{"type":"thread.started","thread_id":"fixture"}' \
      '{"type":"turn.started"}' \
      '{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"Feedback hub\",\"problem\":\"Feedback is fragmented.\"}"}}' \
      '{"type":"turn.completed"}'
    ;;
  claude)
    printf '%s\n' \
      '{"type":"system","subtype":"init","tools":[],"mcp_servers":[]}' \
      '{"type":"assistant","message":{"type":"message","role":"assistant","content":[{"type":"text","text":"complete"}]}}' \
      '{"type":"result","subtype":"success","is_error":false,"result":"{\"title\":\"Feedback hub\",\"problem\":\"Feedback is fragmented.\"}"}'
    ;;
  *)
    printf 'unknown fake provider name\n' >&2
    exit 90
    ;;
esac
