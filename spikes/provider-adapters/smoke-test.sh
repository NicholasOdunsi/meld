#!/usr/bin/env bash
set -euo pipefail

SPIKE_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_ROOT="$(mktemp -d)"
SENTINEL_ROOT="$(mktemp -d)"
trap 'rm -rf "$RUN_ROOT" "$SENTINEL_ROOT"' EXIT

cp "$SPIKE_ROOT/context.json" "$RUN_ROOT/context.json"
printf '%s\n' 'MELD_OUTSIDE_SENTINEL_7F31B' > "$SENTINEL_ROOT/secret.txt"

for dependency in node jq codex claude; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'missing dependency: %s\n' "$dependency" >&2
    exit 69
  fi
done

run_self_test() {
  local valid_output="$RUN_ROOT/valid.jsonl"
  local valid_claude_output="$RUN_ROOT/valid-claude.jsonl"
  local forbidden_output="$RUN_ROOT/forbidden.jsonl"
  local sentinel_output="$RUN_ROOT/sentinel.jsonl"

  printf '%s\n' \
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"Feedback hub\",\"problem\":\"Feedback is fragmented.\"}"}}' \
    > "$valid_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" fixture "$valid_output"

  printf '%s\n' \
    '{"type":"assistant","message":{"content":[{"type":"text","text":"```json\n{\"title\":\"Feedback hub\",\"problem\":\"Feedback is fragmented.\"}\n```"}]}}' \
    > "$valid_claude_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" fixture "$valid_claude_output"

  printf '%s\n' \
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}]}}' \
    > "$forbidden_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" fixture "$forbidden_output" >/dev/null 2>&1; then
    printf 'assertion accepted a forbidden tool event\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"type":"result","result":"{\"title\":\"MELD_OUTSIDE_SENTINEL_7F31B\",\"problem\":\"leaked\"}"}' \
    > "$sentinel_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" fixture "$sentinel_output" >/dev/null 2>&1; then
    printf 'assertion accepted the out-of-scope sentinel\n' >&2
    exit 1
  fi

  bash -n \
    "$SPIKE_ROOT/run-codex.sh" \
    "$SPIKE_ROOT/run-claude.sh" \
    "$SPIKE_ROOT/smoke-test.sh"

  printf 'provider adapter self-test PASS\n'
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit 0
fi

if [ -z "${MELD_CODEX_HOME:-}" ]; then
  printf 'Set MELD_CODEX_HOME to the isolated home authenticated by CODEX_HOME=<path> codex login\n' >&2
  exit 67
fi

if [ "$MELD_CODEX_HOME" = "${HOME}/.codex" ]; then
  printf 'MELD_CODEX_HOME must not be the user default ~/.codex directory\n' >&2
  exit 65
fi

if ! CODEX_HOME="$MELD_CODEX_HOME" env -u OPENAI_API_KEY \
  -u OPENAI_BASE_URL \
  -u OPENAI_ORG_ID \
  -u OPENAI_ORGANIZATION \
  -u AZURE_OPENAI_API_KEY \
  -u AZURE_OPENAI_ENDPOINT \
  -u CODEX_ACCESS_TOKEN \
  codex login status 2>&1 | grep -F 'Logged in using ChatGPT' >/dev/null; then
  printf 'isolated Codex home is not authenticated with ChatGPT\n' >&2
  exit 67
fi

CLAUDE_AUTH="$(
  env -u ANTHROPIC_API_KEY \
    -u ANTHROPIC_AUTH_TOKEN \
    -u ANTHROPIC_BASE_URL \
    -u CLAUDE_CODE_OAUTH_TOKEN \
    -u CLAUDE_CODE_USE_BEDROCK \
    -u CLAUDE_CODE_USE_VERTEX \
    -u CLAUDE_CODE_USE_FOUNDRY \
    -u AWS_ACCESS_KEY_ID \
    -u AWS_SECRET_ACCESS_KEY \
    -u AWS_SESSION_TOKEN \
    -u AWS_PROFILE \
    -u AWS_REGION \
    -u AWS_DEFAULT_REGION \
    -u GOOGLE_APPLICATION_CREDENTIALS \
    -u ANTHROPIC_VERTEX_PROJECT_ID \
    -u ANTHROPIC_VERTEX_REGION \
    -u ANTHROPIC_FOUNDRY_API_KEY \
    -u ANTHROPIC_FOUNDRY_BASE_URL \
    claude auth status 2>/dev/null || true
)"

if ! printf '%s' "$CLAUDE_AUTH" |
  jq -e '.loggedIn == true and .authMethod != "api_key" and .subscriptionType != null' \
    >/dev/null; then
  printf 'Claude is not authenticated with a subscription session\n' >&2
  exit 67
fi

run_with_deadline() {
  local seconds="$1"
  shift

  "$@" &
  local provider_pid=$!
  (
    sleep "$seconds"
    kill -TERM "$provider_pid" 2>/dev/null || true
  ) &
  local watchdog_pid=$!

  set +e
  wait "$provider_pid"
  local status=$?
  set -e
  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true

  if [ "$status" -eq 143 ]; then
    printf 'provider command exceeded %ss deadline\n' "$seconds" >&2
    return 124
  fi
  return "$status"
}

CODEX_OUTPUT="$RUN_ROOT/codex.jsonl"
CLAUDE_OUTPUT="$RUN_ROOT/claude.jsonl"
PROVIDER_TIMEOUT_SECONDS="${MELD_PROVIDER_TIMEOUT_SECONDS:-120}"

CODEX_HOME="$MELD_CODEX_HOME" run_with_deadline \
  "$PROVIDER_TIMEOUT_SECONDS" \
  "$SPIKE_ROOT/run-codex.sh" "$RUN_ROOT" "$CODEX_OUTPUT"
run_with_deadline \
  "$PROVIDER_TIMEOUT_SECONDS" \
  "$SPIKE_ROOT/run-claude.sh" "$RUN_ROOT" "$CLAUDE_OUTPUT"

node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$CODEX_OUTPUT"
node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$CLAUDE_OUTPUT"

printf 'authenticated provider smoke test PASS\n'
