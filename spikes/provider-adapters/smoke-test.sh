#!/usr/bin/env bash
set -euo pipefail

SPIKE_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_ROOT="$(mktemp -d)"
SENTINEL_ROOT="$(mktemp -d)"
trap 'rm -rf "$RUN_ROOT" "$SENTINEL_ROOT"' EXIT

cp "$SPIKE_ROOT/context.json" "$RUN_ROOT/context.json"
printf '%s\n' 'MELD_OUTSIDE_SENTINEL_7F31B' > "$SENTINEL_ROOT/secret.txt"

validate_timeout() {
  case "$1" in
    "" | *[!0-9]* | 0)
      printf 'timeout must be a positive integer number of seconds\n' >&2
      return 64
      ;;
  esac
}

run_with_deadline() {
  local seconds="$1"
  shift

  validate_timeout "$seconds" || return $?
  if [ "$#" -eq 0 ]; then
    printf 'run_with_deadline requires a command\n' >&2
    return 64
  fi

  /usr/bin/perl \
    -MPOSIX=:sys_wait_h,setsid \
    -MTime::HiRes=time,sleep \
    -e '
      my $timeout = shift @ARGV;
      pipe(my $ready_read, my $ready_write) or exit 125;
      my $pid = fork();
      defined $pid or exit 125;

      if ($pid == 0) {
        close $ready_read;
        POSIX::setsid() >= 0 or exit 125;
        print {$ready_write} "ready\n";
        close $ready_write;
        exec @ARGV;
        exit 127;
      }

      close $ready_write;
      my $ready = <$ready_read>;
      close $ready_read;
      if (!defined $ready) {
        kill "KILL", $pid;
        waitpid($pid, 0);
        exit 125;
      }

      my $deadline = time() + $timeout;
      while (time() < $deadline) {
        my $waited = waitpid($pid, WNOHANG);
        if ($waited == $pid) {
          my $status = $?;
          exit(128 + ($status & 127)) if $status & 127;
          exit($status >> 8);
        }
        Time::HiRes::sleep(0.02);
      }

      kill "TERM", -$pid;
      my $term_deadline = time() + 0.2;
      my $reaped = 0;
      while (time() < $term_deadline) {
        my $waited = waitpid($pid, WNOHANG);
        $reaped = 1 if $waited == $pid;
        Time::HiRes::sleep(0.02);
      }

      kill "KILL", -$pid;
      my $kill_deadline = time() + 0.5;
      while (!$reaped && time() < $kill_deadline) {
        my $waited = waitpid($pid, WNOHANG);
        $reaped = 1 if $waited == $pid;
        Time::HiRes::sleep(0.02);
      }
      exit 124;
    ' \
    "$seconds" "$@"
}

run_self_test() {
  local valid_codex_output="$RUN_ROOT/valid-codex.jsonl"
  local valid_claude_output="$RUN_ROOT/valid-claude.jsonl"
  local unknown_codex_output="$RUN_ROOT/unknown-codex.jsonl"
  local unknown_claude_output="$RUN_ROOT/unknown-claude.jsonl"
  local sentinel_output="$RUN_ROOT/sentinel.jsonl"
  local fake_home="$RUN_ROOT/fake-home"
  local symlink_home="$RUN_ROOT/symlink-home"
  local codex_home
  local timeout_pid_file="$RUN_ROOT/timeout-child.pid"
  local timeout_status
  local child_pid
  local started_at
  local elapsed

  printf '%s\n' \
    '{"type":"thread.started","thread_id":"thread-1"}' \
    '{"type":"turn.started"}' \
    '{"type":"item.completed","item":{"type":"reasoning","text":"Create the requested object."}}' \
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"Feedback hub\",\"problem\":\"Feedback is fragmented.\"}"}}' \
    '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":12}}' \
    > "$valid_codex_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$valid_codex_output"

  printf '%s\n' \
    '{"type":"system","subtype":"init","tools":[],"mcp_servers":[]}' \
    '{"type":"assistant","message":{"type":"message","role":"assistant","content":[{"type":"text","text":"```json\n{\"title\":\"Feedback hub\",\"problem\":\"Feedback is fragmented.\"}\n```"}]}}' \
    '{"type":"result","subtype":"success","is_error":false,"result":"{\"title\":\"Feedback hub\",\"problem\":\"Feedback is fragmented.\"}"}' \
    > "$valid_claude_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$valid_claude_output"

  printf '%s\n' \
    '{"type":"item.completed","item":{"type":"computer_use","action":"screenshot"}}' \
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"unsafe\",\"problem\":\"unsafe\"}"}}' \
    > "$unknown_codex_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$unknown_codex_output" >/dev/null 2>&1; then
    printf 'Codex assertion accepted an unknown computer_use item\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"type":"assistant","message":{"type":"message","role":"assistant","content":[{"type":"computer_use","action":"screenshot"},{"type":"text","text":"{\"title\":\"unsafe\",\"problem\":\"unsafe\"}"}]}}' \
    > "$unknown_claude_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$unknown_claude_output" >/dev/null 2>&1; then
    printf 'Claude assertion accepted an unknown computer_use content block\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"type":"result","subtype":"success","is_error":false,"result":"{\"title\":\"MELD_OUTSIDE_SENTINEL_7F31B\",\"problem\":\"leaked\"}"}' \
    > "$sentinel_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$sentinel_output" >/dev/null 2>&1; then
    printf 'assertion accepted the out-of-scope sentinel\n' >&2
    exit 1
  fi

  mkdir -p "$fake_home/Library/Application Support/Meld/spike-codex-home"
  fake_home="$(cd -P "$fake_home" && pwd -P)"
  codex_home="$fake_home/Library/Application Support/Meld/spike-codex-home"
  HOME="$fake_home" "$SPIKE_ROOT/run-codex.sh" --validate-home "$codex_home" \
    >/dev/null
  for invalid_home in \
    "$codex_home/" \
    "$codex_home/../spike-codex-home" \
    "$fake_home/.codex"; do
    if HOME="$fake_home" "$SPIKE_ROOT/run-codex.sh" --validate-home \
      "$invalid_home" >/dev/null 2>&1; then
      printf 'Codex home validation accepted unsafe path: %s\n' "$invalid_home" >&2
      exit 1
    fi
  done

  mkdir -p "$symlink_home/Library/Application Support/Meld/real-codex-home"
  symlink_home="$(cd -P "$symlink_home" && pwd -P)"
  ln -s \
    "$symlink_home/Library/Application Support/Meld/real-codex-home" \
    "$symlink_home/Library/Application Support/Meld/spike-codex-home"
  if HOME="$symlink_home" "$SPIKE_ROOT/run-codex.sh" --validate-home \
    "$symlink_home/Library/Application Support/Meld/spike-codex-home" \
    >/dev/null 2>&1; then
    printf 'Codex home validation accepted a symlink target\n' >&2
    exit 1
  fi

  for invalid_timeout in 0 -1 abc 1.5; do
    if run_with_deadline "$invalid_timeout" /usr/bin/true >/dev/null 2>&1; then
      printf 'deadline accepted invalid timeout: %s\n' "$invalid_timeout" >&2
      exit 1
    fi
  done

  started_at="$(date +%s)"
  set +e
  run_with_deadline 1 /bin/sh -c \
    'trap "" TERM; sleep 30 & printf "%s\n" "$!" > "$1"; wait' \
    timeout-child "$timeout_pid_file"
  timeout_status=$?
  set -e
  elapsed="$(( $(date +%s) - started_at ))"
  if [ "$timeout_status" -ne 124 ] || [ "$elapsed" -ge 5 ]; then
    printf 'deadline did not return 124 promptly (status=%s elapsed=%ss)\n' \
      "$timeout_status" "$elapsed" >&2
    exit 1
  fi
  child_pid="$(cat "$timeout_pid_file")"
  if kill -0 "$child_pid" 2>/dev/null; then
    printf 'deadline left provider descendant running: %s\n' "$child_pid" >&2
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

for dependency in node jq codex claude; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'missing dependency: %s\n' "$dependency" >&2
    exit 69
  fi
done

PROVIDER_TIMEOUT_SECONDS="${MELD_PROVIDER_TIMEOUT_SECONDS:-120}"
validate_timeout "$PROVIDER_TIMEOUT_SECONDS" || exit $?

if [ -z "${MELD_CODEX_HOME:-}" ]; then
  printf 'Set MELD_CODEX_HOME to the isolated home authenticated by CODEX_HOME=<path> codex login\n' >&2
  exit 67
fi

MELD_CODEX_HOME="$(
  "$SPIKE_ROOT/run-codex.sh" --validate-home "$MELD_CODEX_HOME"
)" || exit $?

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

CODEX_HOME="$MELD_CODEX_HOME" run_with_deadline \
  "$PROVIDER_TIMEOUT_SECONDS" \
  "$SPIKE_ROOT/run-codex.sh" "$RUN_ROOT" "$CODEX_OUTPUT"
run_with_deadline \
  "$PROVIDER_TIMEOUT_SECONDS" \
  "$SPIKE_ROOT/run-claude.sh" "$RUN_ROOT" "$CLAUDE_OUTPUT"

node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$CODEX_OUTPUT"
node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$CLAUDE_OUTPUT"

printf 'authenticated provider smoke test PASS\n'
