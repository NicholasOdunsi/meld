#!/usr/bin/env bash
set -euo pipefail

SPIKE_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_ROOT="$(mktemp -d)"
SENTINEL_ROOT="$(mktemp -d)"
trap 'rm -rf "$RUN_ROOT" "$SENTINEL_ROOT"' EXIT

MAX_OUTPUT_BYTES=1048576
PINNED_CODEX_VERSION=0.145.0
PINNED_CLAUDE_VERSION=2.1.219

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
      my $pid;
      my $reaped = 0;
      my $cleaned = 0;
      my $cancel_signal = 0;

      sub reap_leader {
        return if !$pid || $reaped;
        my $waited = waitpid($pid, WNOHANG);
        $reaped = 1 if $waited == $pid;
      }

      sub cleanup_group {
        return if $cleaned;
        $cleaned = 1;
        return if !$pid;

        kill "TERM", -$pid;
        my $term_deadline = time() + 0.2;
        while (time() < $term_deadline) {
          reap_leader();
          Time::HiRes::sleep(0.02);
        }
        kill "KILL", -$pid;
        my $kill_deadline = time() + 0.5;
        while (!$reaped && time() < $kill_deadline) {
          reap_leader();
          Time::HiRes::sleep(0.02);
        }
      }

      $SIG{INT} = sub { $cancel_signal = 2 };
      $SIG{HUP} = sub { $cancel_signal = 1 };
      $SIG{TERM} = sub { $cancel_signal = 15 };
      END { cleanup_group() }

      pipe(my $ready_read, my $ready_write) or exit 125;
      $pid = fork();
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
        exit 125;
      }
      if (my $pid_file = $ENV{MELD_SUPERVISOR_PID_FILE}) {
        open(my $pid_handle, ">", $pid_file) or exit 125;
        print {$pid_handle} "$$\n";
        close $pid_handle;
      }

      my $deadline = time() + $timeout;
      while (time() < $deadline) {
        exit(128 + $cancel_signal) if $cancel_signal;
        my $waited = waitpid($pid, WNOHANG);
        if ($waited == $pid) {
          $reaped = 1;
          my $status = $?;
          cleanup_group();
          exit(128 + ($status & 127)) if $status & 127;
          exit($status >> 8);
        }
        Time::HiRes::sleep(0.02);
      }

      cleanup_group();
      exit 124;
    ' \
    "$seconds" "$@"
}

cap_stream() {
  local max_bytes="$1"
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
  ' "$max_bytes"
}

run_capped_with_deadline() {
  local output_path="$1"
  local seconds="$2"
  shift 2
  local command_status
  local cap_status
  local pipeline_status

  set +e
  run_with_deadline "$seconds" "$@" |
    cap_stream "$MAX_OUTPUT_BYTES" > "$output_path"
  pipeline_status=("${PIPESTATUS[@]}")
  command_status="${pipeline_status[0]}"
  cap_status="${pipeline_status[1]}"
  set -e
  if [ "$cap_status" -ne 0 ]; then
    return "$cap_status"
  fi
  return "$command_status"
}

run_self_test() {
  local valid_codex_output="$RUN_ROOT/valid-codex.jsonl"
  local valid_claude_output="$RUN_ROOT/valid-claude.jsonl"
  local unknown_codex_output="$RUN_ROOT/unknown-codex.jsonl"
  local unknown_claude_output="$RUN_ROOT/unknown-claude.jsonl"
  local incomplete_output="$RUN_ROOT/incomplete.jsonl"
  local error_output="$RUN_ROOT/error.jsonl"
  local duplicate_output="$RUN_ROOT/duplicate.jsonl"
  local whitespace_output="$RUN_ROOT/whitespace.jsonl"
  local numbered_output="$RUN_ROOT/numbered.jsonl"
  local structured_output="$RUN_ROOT/structured.jsonl"
  local oversized_output="$RUN_ROOT/oversized.jsonl"
  local stdin_codex_output="$RUN_ROOT/stdin-codex.jsonl"
  local stdin_claude_output="$RUN_ROOT/stdin-claude.jsonl"
  local capped_preflight_output="$RUN_ROOT/capped-preflight.txt"
  local sentinel_output="$RUN_ROOT/sentinel.jsonl"
  local fake_home="$RUN_ROOT/fake-home"
  local symlink_home="$RUN_ROOT/symlink-home"
  local policy_root="$RUN_ROOT/policy-root"
  local codex_home
  local fake_codex_bin
  local fake_claude_bin
  local timeout_pid_file="$RUN_ROOT/timeout-child.pid"
  local cancel_pid_file="$RUN_ROOT/cancel-child.pid"
  local supervisor_pid_file="$RUN_ROOT/supervisor.pid"
  local normal_exit_pid_file="$RUN_ROOT/normal-exit-child.pid"
  local timeout_status
  local cancel_status
  local normal_exit_status
  local overflow_status
  local child_pid
  local supervisor_pid
  local invocation_pid
  local started_at
  local elapsed
  local deadline_definitions
  local live_deadline_calls
  local numbered_error
  local empty_error
  local empty_status

  deadline_definitions="$(
    grep -c '^run_with_deadline() {' "$SPIKE_ROOT/smoke-test.sh"
  )"
  live_deadline_calls="$(
    awk '
      /^CODEX_OUTPUT=/ { in_live_calls = 1 }
      in_live_calls && /run_with_deadline/ { count += 1 }
      END { print count + 0 }
    ' "$SPIKE_ROOT/smoke-test.sh"
  )"
  if ! declare -F run_with_deadline >/dev/null ||
    [ "$deadline_definitions" -ne 1 ] ||
    [ "$live_deadline_calls" -ne 2 ]; then
    printf 'deadline implementation must be defined once and serve both live providers\n' >&2
    exit 1
  fi

  set +e
  empty_error="$(
    node "$SPIKE_ROOT/assert-safe-output.mjs" codex /dev/null 2>&1
  )"
  empty_status=$?
  set -e
  if [ "$empty_status" -eq 0 ] ||
    [ "$empty_error" != "codex did not return the requested PRD JSON" ]; then
    printf 'empty-output contract changed (status=%s stderr=%s)\n' \
      "$empty_status" "$empty_error" >&2
    exit 1
  fi

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
    '{"type":"system","subtype":"init","tools":[],"mcp_servers":[]}' \
    '{"type":"result","subtype":"success","is_error":false,"structured_output":{"type":"prd","title":"Feedback hub","problem":"Feedback is fragmented."}}' \
    > "$structured_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$structured_output"

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

  printf '%s\n' \
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"incomplete\",\"problem\":\"missing terminal\"}"}}' \
    > "$incomplete_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$incomplete_output" >/dev/null 2>&1; then
    printf 'Codex assertion accepted an incomplete turn\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"one\",\"problem\":\"one\"}"}}' \
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"two\",\"problem\":\"two\"}"}}' \
    '{"type":"turn.completed"}' \
    > "$duplicate_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$duplicate_output" >/dev/null 2>&1; then
    printf 'Codex assertion accepted duplicate authoritative results\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"   \",\"problem\":\"problem\"}"}}' \
    '{"type":"turn.completed"}' \
    > "$whitespace_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$whitespace_output" >/dev/null 2>&1; then
    printf 'Codex assertion accepted a whitespace-only title\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"type":"assistant","message":{"type":"message","role":"assistant","content":[{"type":"text","text":"{\"title\":\"incomplete\",\"problem\":\"missing result\"}"}]}}' \
    > "$incomplete_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$incomplete_output" >/dev/null 2>&1; then
    printf 'Claude assertion accepted an incomplete response\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"type":"result","subtype":"error","is_error":true,"result":"{\"title\":\"bad\",\"problem\":\"bad\"}"}' \
    > "$error_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$error_output" >/dev/null 2>&1; then
    printf 'Claude assertion accepted an error result\n' >&2
    exit 1
  fi

  printf '\n\n%s\n' '{"type":' > "$numbered_output"
  numbered_error="$(
    node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$numbered_output" 2>&1 ||
      true
  )"
  if ! printf '%s\n' "$numbered_error" | grep -F 'line 3' >/dev/null; then
    printf 'JSONL validator did not preserve original line numbers\n' >&2
    exit 1
  fi

  mkdir -p "$fake_home/Library/Application Support/Meld/spike-codex-home"
  mkdir -p \
    "$fake_home/Library/Application Support/Meld/providers/codex/$PINNED_CODEX_VERSION/bin" \
    "$fake_home/Library/Application Support/Meld/providers/claude/$PINNED_CLAUDE_VERSION/bin"
  fake_home="$(cd -P "$fake_home" && pwd -P)"
  codex_home="$fake_home/Library/Application Support/Meld/spike-codex-home"
  fake_codex_bin="$fake_home/Library/Application Support/Meld/providers/codex/$PINNED_CODEX_VERSION/bin/codex"
  fake_claude_bin="$fake_home/Library/Application Support/Meld/providers/claude/$PINNED_CLAUDE_VERSION/bin/claude"
  /bin/cp /usr/bin/true "$fake_codex_bin"
  /bin/cp /usr/bin/true "$fake_claude_bin"
  HOME="$fake_home" "$SPIKE_ROOT/run-codex.sh" --validate-home "$codex_home" \
    >/dev/null
  HOME="$fake_home" "$SPIKE_ROOT/run-codex.sh" --validate-binary \
    "$fake_codex_bin" >/dev/null
  HOME="$fake_home" "$SPIKE_ROOT/run-claude.sh" --validate-binary \
    "$fake_claude_bin" >/dev/null
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

  mkdir -p "$policy_root/Library/Application Support/ClaudeCode"
  printf '%s\n' '{}' \
    > "$policy_root/Library/Application Support/ClaudeCode/managed-settings.json"
  if "$SPIKE_ROOT/run-claude.sh" --check-managed-policy "$policy_root" \
    >/dev/null 2>&1; then
    printf 'Claude policy preflight accepted managed-settings.json\n' >&2
    exit 1
  fi

  /bin/cp "$SPIKE_ROOT/fake-stdin-provider.sh" "$fake_codex_bin"
  /bin/cp "$SPIKE_ROOT/fake-stdin-provider.sh" "$fake_claude_bin"
  HOME="$fake_home" \
    CODEX_HOME="$codex_home" \
    MELD_CODEX_BIN="$fake_codex_bin" \
    run_with_deadline 3 \
    "$SPIKE_ROOT/run-codex.sh" "$RUN_ROOT" "$stdin_codex_output"
  HOME="$fake_home" \
    MELD_CLAUDE_BIN="$fake_claude_bin" \
    run_with_deadline 3 \
    "$SPIKE_ROOT/run-claude.sh" "$RUN_ROOT" "$stdin_claude_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$stdin_codex_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$stdin_claude_output"

  /bin/cp "$SPIKE_ROOT/fake-overflow-provider.sh" "$fake_codex_bin"
  set +e
  HOME="$fake_home" \
    CODEX_HOME="$codex_home" \
    MELD_CODEX_BIN="$fake_codex_bin" \
    run_with_deadline 3 \
    "$SPIKE_ROOT/run-codex.sh" "$RUN_ROOT" "$oversized_output"
  overflow_status=$?
  set -e
  if [ "$overflow_status" -ne 75 ] ||
    [ "$(wc -c < "$oversized_output")" -gt "$MAX_OUTPUT_BYTES" ]; then
    printf 'provider output cap failed (status=%s bytes=%s)\n' \
      "$overflow_status" "$(wc -c < "$oversized_output")" >&2
    exit 1
  fi
  printf '%*s' "$((MAX_OUTPUT_BYTES + 1))" '' > "$oversized_output"
  if node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$oversized_output" \
    >/dev/null 2>&1; then
    printf 'validator read oversized provider output\n' >&2
    exit 1
  fi

  for invalid_timeout in 0 -1 abc 1.5; do
    if run_with_deadline "$invalid_timeout" /usr/bin/true >/dev/null 2>&1; then
      printf 'deadline accepted invalid timeout: %s\n' "$invalid_timeout" >&2
      exit 1
    fi
  done
  run_capped_with_deadline "$capped_preflight_output" 2 \
    /usr/bin/printf 'preflight'
  if [ "$(cat "$capped_preflight_output")" != "preflight" ]; then
    printf 'capped preflight did not preserve bounded output\n' >&2
    exit 1
  fi

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

  set +e
  MELD_SUPERVISOR_PID_FILE="$supervisor_pid_file" \
    run_with_deadline 30 /bin/sh -c \
      'trap "" INT TERM HUP; sleep 30 & printf "%s\n" "$!" > "$1"; wait' \
      cancel-child "$cancel_pid_file" &
  invocation_pid=$!
  set -e
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if [ -s "$supervisor_pid_file" ] && [ -s "$cancel_pid_file" ]; then
      break
    fi
    sleep 0.05
  done
  if [ ! -s "$supervisor_pid_file" ] || [ ! -s "$cancel_pid_file" ]; then
    printf 'cancellation fixture did not start\n' >&2
    exit 1
  fi
  supervisor_pid="$(cat "$supervisor_pid_file")"
  kill -TERM "$supervisor_pid"
  set +e
  wait "$invocation_pid"
  cancel_status=$?
  set -e
  child_pid="$(cat "$cancel_pid_file")"
  if [ "$cancel_status" -eq 0 ] || kill -0 "$child_pid" 2>/dev/null; then
    printf 'cancellation did not kill and reap provider group (status=%s)\n' \
      "$cancel_status" >&2
    exit 1
  fi

  set +e
  run_with_deadline 5 /bin/sh -c \
    'trap "" TERM; sleep 30 & printf "%s\n" "$!" > "$1"; exit 0' \
    normal-exit-child "$normal_exit_pid_file"
  normal_exit_status=$?
  set -e
  child_pid="$(cat "$normal_exit_pid_file")"
  if [ "$normal_exit_status" -ne 0 ] || kill -0 "$child_pid" 2>/dev/null; then
    printf 'normal parent exit left a provider descendant (status=%s)\n' \
      "$normal_exit_status" >&2
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

for dependency in node jq; do
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

if [ -z "${MELD_CODEX_BIN:-}" ] || [ -z "${MELD_CLAUDE_BIN:-}" ]; then
  printf 'Set MELD_CODEX_BIN and MELD_CLAUDE_BIN to pinned managed executables\n' >&2
  exit 67
fi

MELD_CODEX_HOME="$(
  "$SPIKE_ROOT/run-codex.sh" --validate-home "$MELD_CODEX_HOME"
)" || exit $?
MELD_CODEX_BIN="$(
  "$SPIKE_ROOT/run-codex.sh" --validate-binary "$MELD_CODEX_BIN"
)" || exit $?
MELD_CLAUDE_BIN="$(
  "$SPIKE_ROOT/run-claude.sh" --validate-binary "$MELD_CLAUDE_BIN"
)" || exit $?
"$SPIKE_ROOT/run-claude.sh" --check-managed-policy "" || exit $?

CODEX_VERSION_OUTPUT="$RUN_ROOT/codex-version.txt"
CLAUDE_VERSION_OUTPUT="$RUN_ROOT/claude-version.txt"
CODEX_AUTH_OUTPUT="$RUN_ROOT/codex-auth.txt"
CLAUDE_AUTH_OUTPUT="$RUN_ROOT/claude-auth.json"

run_capped_with_deadline "$CODEX_VERSION_OUTPUT" \
  "$PROVIDER_TIMEOUT_SECONDS" "$MELD_CODEX_BIN" --version
run_capped_with_deadline "$CLAUDE_VERSION_OUTPUT" \
  "$PROVIDER_TIMEOUT_SECONDS" "$MELD_CLAUDE_BIN" --version
if [ "$(tr -d '\r\n' < "$CODEX_VERSION_OUTPUT")" != \
  "codex-cli $PINNED_CODEX_VERSION" ]; then
  printf 'managed Codex binary version does not match pinned evidence\n' >&2
  exit 68
fi
if [ "$(tr -d '\r\n' < "$CLAUDE_VERSION_OUTPUT")" != \
  "$PINNED_CLAUDE_VERSION (Claude Code)" ]; then
  printf 'managed Claude binary version does not match pinned evidence\n' >&2
  exit 68
fi

if ! run_capped_with_deadline "$CODEX_AUTH_OUTPUT" \
  "$PROVIDER_TIMEOUT_SECONDS" \
  /usr/bin/env -i \
    HOME="$HOME" \
    PATH="$PATH" \
    TMPDIR="${TMPDIR:-/tmp}" \
    LANG="${LANG:-C.UTF-8}" \
    SHELL="${SHELL:-/bin/sh}" \
    USER="${USER:-}" \
    CODEX_HOME="$MELD_CODEX_HOME" \
    "$MELD_CODEX_BIN" login status; then
  printf 'Codex authentication status preflight failed\n' >&2
  exit 67
fi
if ! grep -F 'Logged in using ChatGPT' "$CODEX_AUTH_OUTPUT" >/dev/null; then
  printf 'isolated Codex home is not authenticated with ChatGPT\n' >&2
  exit 67
fi

if ! run_capped_with_deadline "$CLAUDE_AUTH_OUTPUT" \
  "$PROVIDER_TIMEOUT_SECONDS" \
  /usr/bin/env -i \
    HOME="$HOME" \
    PATH="$PATH" \
    TMPDIR="${TMPDIR:-/tmp}" \
    LANG="${LANG:-C.UTF-8}" \
    SHELL="${SHELL:-/bin/sh}" \
    USER="${USER:-}" \
    "$MELD_CLAUDE_BIN" auth status; then
  printf 'Claude authentication status preflight failed\n' >&2
  exit 67
fi
if ! jq -e \
  '.loggedIn == true and .authMethod != "api_key" and .subscriptionType != null' \
  "$CLAUDE_AUTH_OUTPUT" >/dev/null; then
  printf 'Claude is not authenticated with a subscription session\n' >&2
  exit 67
fi

CODEX_OUTPUT="$RUN_ROOT/codex.jsonl"
CLAUDE_OUTPUT="$RUN_ROOT/claude.jsonl"

CODEX_HOME="$MELD_CODEX_HOME" \
  MELD_CODEX_BIN="$MELD_CODEX_BIN" \
  run_with_deadline \
  "$PROVIDER_TIMEOUT_SECONDS" \
  "$SPIKE_ROOT/run-codex.sh" "$RUN_ROOT" "$CODEX_OUTPUT"
MELD_CLAUDE_BIN="$MELD_CLAUDE_BIN" run_with_deadline \
  "$PROVIDER_TIMEOUT_SECONDS" \
  "$SPIKE_ROOT/run-claude.sh" "$RUN_ROOT" "$CLAUDE_OUTPUT"

node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$CODEX_OUTPUT"
node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$CLAUDE_OUTPUT"

printf 'authenticated provider smoke test PASS\n'
