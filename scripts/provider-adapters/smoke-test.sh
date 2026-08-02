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

install_fake_environment_provider() {
  local target="$1"
  local staged="$RUN_ROOT/fake-provider-body.sh"

  /usr/bin/tail -n +2 "$SPIKE_ROOT/fake-stdin-provider.sh" > "$staged"
  {
    printf '%s\n' \
      '#!/bin/sh' \
      'set -eu' \
      'if /usr/bin/env | /usr/bin/grep -Eq '"'"'^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_USE_BEDROCK|CLAUDE_CODE_USE_VERTEX|CLAUDE_CODE_USE_FOUNDRY|AWS_[A-Z0-9_]*|GOOGLE_[A-Z0-9_]*|GCP_[A-Z0-9_]*|GCLOUD_[A-Z0-9_]*|AZURE_[A-Z0-9_]*)='"'"'; then' \
      '  printf "forbidden provider credential or routing variable leaked\n" >&2' \
      '  exit 91' \
      'fi' \
      '[ "${LANG:-}" = "C.UTF-8" ] && [ "${LC_ALL:-}" = "C.UTF-8" ] || {' \
      '  printf "locale allowlist changed\n" >&2' \
      '  exit 92' \
      '}' \
      'case "${HOME:-}" in' \
      '  */Library/Application\ Support/Meld/spike-codex-home | */Library/Application\ Support/Meld/spike-claude-home) ;;' \
      '  *) printf "isolated HOME allowlist changed\n" >&2; exit 93 ;;' \
      'esac' \
      'case "${PATH:-}" in' \
      '  */Library/Application\ Support/Meld/providers/*/*/bin:/usr/bin:/bin) ;;' \
      '  *) printf "managed PATH allowlist changed\n" >&2; exit 94 ;;' \
      'esac' \
      '[ -d "${TMPDIR:-}" ] || {' \
      '  printf "task TMPDIR allowlist changed\n" >&2' \
      '  exit 95' \
      '}'
    /bin/cat "$staged"
  } > "$target"
  /bin/chmod 700 "$target"
}

run_fake_provider_contracts() {
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
  local codex_auth_output="$RUN_ROOT/codex-auth-status.txt"
  local claude_auth_output="$RUN_ROOT/claude-auth-status.json"
  local fake_home="$RUN_ROOT/fake-home"
  local symlink_home="$RUN_ROOT/symlink-home"
  local policy_root="$RUN_ROOT/policy-root"
  local codex_home
  local claude_home
  local fake_codex_bin
  local fake_claude_bin
  local fake_codex_bin_dir
  local fake_claude_bin_dir
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
  local mode_error
  local mode_status
  local classification_error
  local classification_status
  local policy_boundary_calls
  local technical_status

  deadline_definitions="$(
    grep -c '^run_with_deadline() {' "$SPIKE_ROOT/smoke-test.sh"
  )"
  live_deadline_calls="$(
    grep -c '^  run_isolated_runner ' "$SPIKE_ROOT/smoke-test.sh"
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

  mkdir -p \
    "$fake_home/Library/Application Support/Meld/spike-codex-home" \
    "$fake_home/Library/Application Support/Meld/spike-claude-home"
  mkdir -p \
    "$fake_home/Library/Application Support/Meld/providers/codex/$PINNED_CODEX_VERSION/bin" \
    "$fake_home/Library/Application Support/Meld/providers/claude/$PINNED_CLAUDE_VERSION/bin"
  fake_home="$(cd -P "$fake_home" && pwd -P)"
  codex_home="$fake_home/Library/Application Support/Meld/spike-codex-home"
  claude_home="$fake_home/Library/Application Support/Meld/spike-claude-home"
  fake_codex_bin="$fake_home/Library/Application Support/Meld/providers/codex/$PINNED_CODEX_VERSION/bin/codex"
  fake_claude_bin="$fake_home/Library/Application Support/Meld/providers/claude/$PINNED_CLAUDE_VERSION/bin/claude"
  fake_codex_bin_dir="${fake_codex_bin%/codex}"
  fake_claude_bin_dir="${fake_claude_bin%/claude}"
  /bin/cp /usr/bin/true "$fake_codex_bin"
  /bin/cp /usr/bin/true "$fake_claude_bin"
  HOME="$fake_home" "$SPIKE_ROOT/run-codex.sh" --validate-home "$codex_home" \
    >/dev/null
  HOME="$fake_home" "$SPIKE_ROOT/run-codex.sh" --validate-binary \
    "$fake_codex_bin" >/dev/null
  HOME="$fake_home" "$SPIKE_ROOT/run-claude.sh" --validate-home \
    "$claude_home" >/dev/null
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
  for invalid_home in \
    "$claude_home/" \
    "$claude_home/../spike-claude-home" \
    "$fake_home/.claude"; do
    if HOME="$fake_home" "$SPIKE_ROOT/run-claude.sh" --validate-home \
      "$invalid_home" >/dev/null 2>&1; then
      printf 'Claude home validation accepted unsafe path: %s\n' "$invalid_home" >&2
      exit 1
    fi
  done

  mkdir -p \
    "$symlink_home/Library/Application Support/Meld/real-codex-home" \
    "$symlink_home/Library/Application Support/Meld/real-claude-home"
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
  ln -s \
    "$symlink_home/Library/Application Support/Meld/real-claude-home" \
    "$symlink_home/Library/Application Support/Meld/spike-claude-home"
  if HOME="$symlink_home" "$SPIKE_ROOT/run-claude.sh" --validate-home \
    "$symlink_home/Library/Application Support/Meld/spike-claude-home" \
    >/dev/null 2>&1; then
    printf 'Claude home validation accepted a symlink target\n' >&2
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
  policy_boundary_calls="$(
    awk '
      /^TASK_DIR=/ { in_runner = 1 }
      in_runner && /^check_managed_policy "" \|\| exit \$\?/ { count += 1 }
      END { print count + 0 }
    ' "$SPIKE_ROOT/run-claude.sh"
  )"
  if [ "$policy_boundary_calls" -ne 1 ]; then
    printf 'Claude runner boundary must enforce managed-policy preflight\n' >&2
    exit 1
  fi

  install_fake_environment_provider "$fake_codex_bin"
  install_fake_environment_provider "$fake_claude_bin"
  OPENAI_API_KEY="must-not-leak" \
    CODEX_ACCESS_TOKEN="must-not-leak" \
    AWS_ACCESS_KEY_ID="must-not-leak" \
    CLAUDE_CODE_USE_VERTEX=1 \
    run_with_deadline 3 \
    /usr/bin/env -i \
      HOME="$codex_home" \
      PATH="$fake_codex_bin_dir:/usr/bin:/bin" \
      TMPDIR="$RUN_ROOT" \
      LANG="C.UTF-8" \
      LC_ALL="C.UTF-8" \
      "$SPIKE_ROOT/run-codex.sh" "$RUN_ROOT" "$stdin_codex_output"
  ANTHROPIC_API_KEY="must-not-leak" \
    ANTHROPIC_AUTH_TOKEN="must-not-leak" \
    CLAUDE_CODE_OAUTH_TOKEN="must-not-leak" \
    AZURE_API_KEY="must-not-leak" \
    run_with_deadline 3 \
    /usr/bin/env -i \
      HOME="$claude_home" \
      PATH="$fake_claude_bin_dir:/usr/bin:/bin" \
      TMPDIR="$RUN_ROOT" \
      LANG="C.UTF-8" \
      LC_ALL="C.UTF-8" \
      "$SPIKE_ROOT/run-claude.sh" "$RUN_ROOT" "$stdin_claude_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$stdin_codex_output"
  node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$stdin_claude_output"

  /bin/cp "$SPIKE_ROOT/fake-overflow-provider.sh" "$fake_codex_bin"
  set +e
  run_with_deadline 3 \
    /usr/bin/env -i \
      HOME="$codex_home" \
      PATH="$fake_codex_bin_dir:/usr/bin:/bin" \
      TMPDIR="$RUN_ROOT" \
      LANG="C.UTF-8" \
      LC_ALL="C.UTF-8" \
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

  set +e
  mode_error="$("$SPIKE_ROOT/smoke-test.sh" 2>&1)"
  mode_status=$?
  set -e
  if [ "$mode_status" -ne 64 ] ||
    [ "$mode_error" != \
      "usage: smoke-test.sh --self-test | --live codex|claude" ]; then
    printf 'missing mode did not fail with the documented usage contract\n' >&2
    exit 1
  fi

  set +e
  mode_error="$("$SPIKE_ROOT/smoke-test.sh" --live unsupported 2>&1)"
  mode_status=$?
  set -e
  if [ "$mode_status" -ne 64 ] ||
    [ "$mode_error" != "unsupported provider: unsupported" ]; then
    printf 'unsupported live provider did not fail with status 64\n' >&2
    exit 1
  fi

  set +e
  mode_error="$(
    unset MELD_CODEX_HOME MELD_CODEX_BIN
    "$SPIKE_ROOT/smoke-test.sh" --live codex 2>&1
  )"
  mode_status=$?
  set -e
  if [ "$mode_status" -ne 67 ] ||
    [ "$mode_error" != \
      "live_blocked: set MELD_CODEX_HOME and MELD_CODEX_BIN for an isolated subscription login" ]; then
    printf 'Codex live mode did not stop before an unconfigured login\n' >&2
    exit 1
  fi

  set +e
  mode_error="$(
    unset MELD_CLAUDE_HOME MELD_CLAUDE_BIN
    "$SPIKE_ROOT/smoke-test.sh" --live claude 2>&1
  )"
  mode_status=$?
  set -e
  if [ "$mode_status" -ne 67 ] ||
    [ "$mode_error" != \
      "live_blocked: set MELD_CLAUDE_HOME and MELD_CLAUDE_BIN for an isolated subscription login" ]; then
    printf 'Claude live mode did not stop before an unconfigured login\n' >&2
    exit 1
  fi

  printf '%s\n' 'Not logged in' > "$codex_auth_output"
  set +e
  classification_error="$(
    classify_codex_auth_status "$codex_auth_output" 1 2>&1
  )"
  classification_status=$?
  set -e
  if [ "$classification_status" -ne 67 ] ||
    [ "$classification_error" != \
      'live_blocked: isolated Codex HOME is not authenticated with ChatGPT' ]; then
    printf 'Codex incomplete login classification changed\n' >&2
    exit 1
  fi

  printf '%s\n' 'Logged in using an API key' > "$codex_auth_output"
  set +e
  classification_error="$(
    classify_codex_auth_status "$codex_auth_output" 0 2>&1
  )"
  classification_status=$?
  set -e
  if [ "$classification_status" -ne 1 ] ||
    [ "$classification_error" != \
      'failed: Codex reported API-key or cloud-provider authentication' ]; then
    printf 'Codex API authentication was not classified as failed\n' >&2
    exit 1
  fi

  for technical_status in 124 75 70; do
    : > "$codex_auth_output"
    set +e
    classification_error="$(
      classify_codex_auth_status \
        "$codex_auth_output" "$technical_status" 2>&1
    )"
    classification_status=$?
    set -e
    if [ "$classification_status" -ne 1 ] ||
      [ "$classification_error" != \
        "failed: Codex authentication status command failed (status $technical_status)" ]; then
      printf 'Codex auth command failure was not classified as failed: %s\n' \
        "$technical_status" >&2
      exit 1
    fi
  done

  printf '%s\n' 'unexpected authentication output' > "$codex_auth_output"
  set +e
  classification_error="$(
    classify_codex_auth_status "$codex_auth_output" 0 2>&1
  )"
  classification_status=$?
  set -e
  if [ "$classification_status" -ne 1 ] ||
    [ "$classification_error" != \
      'failed: Codex authentication status returned an unrecognized response' ]; then
    printf 'Malformed Codex auth response was not classified as failed\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"loggedIn":false,"authMethod":"none","subscriptionType":null}' \
    > "$claude_auth_output"
  set +e
  classification_error="$(
    classify_claude_auth_status "$claude_auth_output" 0 2>&1
  )"
  classification_status=$?
  set -e
  if [ "$classification_status" -ne 67 ] ||
    [ "$classification_error" != \
      'live_blocked: isolated Claude HOME lacks a subscription session' ]; then
    printf 'Claude incomplete login classification changed\n' >&2
    exit 1
  fi

  printf '%s\n' \
    '{"loggedIn":true,"authMethod":"api_key","subscriptionType":"pro"}' \
    > "$claude_auth_output"
  set +e
  classification_error="$(
    classify_claude_auth_status "$claude_auth_output" 0 2>&1
  )"
  classification_status=$?
  set -e
  if [ "$classification_status" -ne 1 ] ||
    [ "$classification_error" != \
      'failed: Claude reported non-subscription or unsupported authentication' ]; then
    printf 'Claude API authentication was not classified as failed\n' >&2
    exit 1
  fi

  printf '%s\n' '{"loggedIn":' > "$claude_auth_output"
  set +e
  classification_error="$(
    classify_claude_auth_status "$claude_auth_output" 0 2>&1
  )"
  classification_status=$?
  set -e
  if [ "$classification_status" -ne 1 ] ||
    [ "$classification_error" != \
      'failed: Claude authentication status returned malformed JSON' ]; then
    printf 'Malformed Claude auth JSON was not classified as failed\n' >&2
    exit 1
  fi

  for technical_status in 124 75 70; do
    : > "$claude_auth_output"
    set +e
    classification_error="$(
      classify_claude_auth_status \
        "$claude_auth_output" "$technical_status" 2>&1
    )"
    classification_status=$?
    set -e
    if [ "$classification_status" -ne 1 ] ||
      [ "$classification_error" != \
        "failed: Claude authentication status command failed (status $technical_status)" ]; then
      printf 'Claude auth command failure was not classified as failed: %s\n' \
        "$technical_status" >&2
      exit 1
    fi
  done

  bash -n \
    "$SPIKE_ROOT/run-codex.sh" \
    "$SPIKE_ROOT/run-claude.sh" \
    "$SPIKE_ROOT/smoke-test.sh"

  # The Node live-smoke harness shares this self-test: its own --self-test drives
  # both fake providers through the full staged pipeline, and its unit tests pin
  # the mode gating, the status classification, and the status-only output.
  node "$SPIKE_ROOT/live-smoke.mjs" --self-test
  node --test "$SPIKE_ROOT/live-smoke.test.mjs"

  printf 'provider adapter self-test PASS\n'
}

require_live_dependencies() {
  local dependency

  for dependency in node jq; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
      printf 'missing dependency: %s\n' "$dependency" >&2
      return 69
    fi
  done
}

run_sanitized_provider_command() {
  local output_path="$1"
  local seconds="$2"
  local isolated_home="$3"
  local managed_bin_dir="$4"
  local executable="$5"
  shift 5

  run_capped_with_deadline "$output_path" "$seconds" \
    /usr/bin/env -i \
      HOME="$isolated_home" \
      PATH="$managed_bin_dir:/usr/bin:/bin" \
      TMPDIR="$RUN_ROOT" \
      LANG="C.UTF-8" \
      LC_ALL="C.UTF-8" \
      "$executable" "$@"
}

run_isolated_runner() {
  local seconds="$1"
  local isolated_home="$2"
  local managed_bin_dir="$3"
  local runner="$4"
  local output_path="$5"

  run_with_deadline "$seconds" \
    /usr/bin/env -i \
      HOME="$isolated_home" \
      PATH="$managed_bin_dir:/usr/bin:/bin" \
      TMPDIR="$RUN_ROOT" \
      LANG="C.UTF-8" \
      LC_ALL="C.UTF-8" \
      "$runner" "$RUN_ROOT" "$output_path"
}

classify_codex_auth_status() {
  local output_path="$1"
  local command_status="$2"

  if grep -Eiq \
    'logged in using (an )?(api key|bedrock|vertex|foundry|aws|gcp|azure)' \
    "$output_path"; then
    printf 'failed: Codex reported API-key or cloud-provider authentication\n' >&2
    return 1
  fi
  if [ "$command_status" -eq 0 ] &&
    grep -F 'Logged in using ChatGPT' "$output_path" >/dev/null; then
    return 0
  fi
  if [ "$command_status" -le 1 ] &&
    grep -Eiq \
      '(^|[[:space:]:])(not logged in|not authenticated)([[:space:].]|$)' \
      "$output_path"; then
    printf 'live_blocked: isolated Codex HOME is not authenticated with ChatGPT\n' >&2
    return 67
  fi
  if [ "$command_status" -ne 0 ]; then
    printf 'failed: Codex authentication status command failed (status %s)\n' \
      "$command_status" >&2
    return 1
  fi

  printf 'failed: Codex authentication status returned an unrecognized response\n' >&2
  return 1
}

classify_claude_auth_status() {
  local output_path="$1"
  local command_status="$2"

  if [ "$command_status" -ne 0 ]; then
    printf 'failed: Claude authentication status command failed (status %s)\n' \
      "$command_status" >&2
    return 1
  fi
  if ! jq -e \
    'type == "object" and ((.loggedIn | type) == "boolean")' \
    "$output_path" >/dev/null 2>&1; then
    printf 'failed: Claude authentication status returned malformed JSON\n' >&2
    return 1
  fi
  if jq -e '.loggedIn == false' "$output_path" >/dev/null; then
    printf 'live_blocked: isolated Claude HOME lacks a subscription session\n' >&2
    return 67
  fi
  if jq -e '
      .loggedIn == true and
      .subscriptionType != null and
      ((.authMethod // "") | ascii_downcase |
        test("api.?key|bedrock|vertex|foundry|aws|gcp|azure") | not) and
      ((.apiProvider // "") | ascii_downcase |
        test("bedrock|vertex|foundry|aws|gcp|azure") | not)
    ' "$output_path" >/dev/null; then
    return 0
  fi

  printf 'failed: Claude reported non-subscription or unsupported authentication\n' >&2
  return 1
}

run_live_codex() {
  local provider_timeout_seconds="${MELD_PROVIDER_TIMEOUT_SECONDS:-120}"
  local isolated_home
  local managed_binary
  local managed_bin_dir
  local version_output="$RUN_ROOT/codex-version.txt"
  local auth_output="$RUN_ROOT/codex-auth.txt"
  local provider_output="$RUN_ROOT/codex.jsonl"
  local auth_status

  require_live_dependencies || return $?
  validate_timeout "$provider_timeout_seconds" || return $?
  if [ -z "${MELD_CODEX_HOME:-}" ] || [ -z "${MELD_CODEX_BIN:-}" ]; then
    printf '%s\n' \
      'live_blocked: set MELD_CODEX_HOME and MELD_CODEX_BIN for an isolated subscription login' >&2
    return 67
  fi
  isolated_home="$(
    "$SPIKE_ROOT/run-codex.sh" --validate-home "$MELD_CODEX_HOME"
  )" || return $?
  managed_binary="$(
    "$SPIKE_ROOT/run-codex.sh" --validate-binary "$MELD_CODEX_BIN"
  )" || return $?
  managed_bin_dir="${managed_binary%/codex}"

  run_sanitized_provider_command "$version_output" \
    "$provider_timeout_seconds" "$isolated_home" "$managed_bin_dir" \
    "$managed_binary" --version || {
      printf 'failed: managed Codex version preflight failed\n' >&2
      return 68
    }
  if [ "$(tr -d '\r\n' < "$version_output")" != \
    "codex-cli $PINNED_CODEX_VERSION" ]; then
    printf 'failed: managed Codex binary version does not match pinned evidence\n' >&2
    return 68
  fi

  if run_sanitized_provider_command "$auth_output" \
    "$provider_timeout_seconds" "$isolated_home" "$managed_bin_dir" \
    "$managed_binary" login status; then
    auth_status=0
  else
    auth_status=$?
  fi
  classify_codex_auth_status "$auth_output" "$auth_status" || return $?

  run_isolated_runner "$provider_timeout_seconds" "$isolated_home" \
    "$managed_bin_dir" "$SPIKE_ROOT/run-codex.sh" "$provider_output" || {
      printf 'failed: Codex content-only inference failed\n' >&2
      return 1
    }
  node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$provider_output" || {
    printf 'failed: Codex structured output or isolation validation failed\n' >&2
    return 1
  }
  printf 'Codex launch_ready live test PASS\n'
}

run_live_claude() {
  local provider_timeout_seconds="${MELD_PROVIDER_TIMEOUT_SECONDS:-120}"
  local isolated_home
  local managed_binary
  local managed_bin_dir
  local version_output="$RUN_ROOT/claude-version.txt"
  local auth_output="$RUN_ROOT/claude-auth.json"
  local provider_output="$RUN_ROOT/claude.jsonl"
  local auth_status

  require_live_dependencies || return $?
  validate_timeout "$provider_timeout_seconds" || return $?
  if [ -z "${MELD_CLAUDE_HOME:-}" ] || [ -z "${MELD_CLAUDE_BIN:-}" ]; then
    printf '%s\n' \
      'live_blocked: set MELD_CLAUDE_HOME and MELD_CLAUDE_BIN for an isolated subscription login' >&2
    return 67
  fi
  isolated_home="$(
    "$SPIKE_ROOT/run-claude.sh" --validate-home "$MELD_CLAUDE_HOME"
  )" || return $?
  managed_binary="$(
    "$SPIKE_ROOT/run-claude.sh" --validate-binary "$MELD_CLAUDE_BIN"
  )" || return $?
  managed_bin_dir="${managed_binary%/claude}"
  "$SPIKE_ROOT/run-claude.sh" --check-managed-policy "" || return $?

  run_sanitized_provider_command "$version_output" \
    "$provider_timeout_seconds" "$isolated_home" "$managed_bin_dir" \
    "$managed_binary" --version || {
      printf 'failed: managed Claude version preflight failed\n' >&2
      return 68
    }
  if [ "$(tr -d '\r\n' < "$version_output")" != \
    "$PINNED_CLAUDE_VERSION (Claude Code)" ]; then
    printf 'failed: managed Claude binary version does not match pinned evidence\n' >&2
    return 68
  fi

  if run_sanitized_provider_command "$auth_output" \
    "$provider_timeout_seconds" "$isolated_home" "$managed_bin_dir" \
    "$managed_binary" auth status; then
    auth_status=0
  else
    auth_status=$?
  fi
  classify_claude_auth_status "$auth_output" "$auth_status" || return $?

  run_isolated_runner "$provider_timeout_seconds" "$isolated_home" \
    "$managed_bin_dir" "$SPIKE_ROOT/run-claude.sh" "$provider_output" || {
      printf 'failed: Claude content-only inference failed\n' >&2
      return 1
    }
  node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$provider_output" || {
    printf 'failed: Claude structured output or isolation validation failed\n' >&2
    return 1
  }
  printf 'Claude launch_ready live test PASS\n'
}

case "${1:-}" in
  --self-test)
    if [ "$#" -ne 1 ]; then
      printf '%s\n' \
        'usage: smoke-test.sh --self-test | --live codex|claude' >&2
      exit 64
    fi
    run_fake_provider_contracts
    ;;
  --live)
    if [ "$#" -ne 2 ]; then
      printf '%s\n' 'usage: smoke-test.sh --live codex|claude' >&2
      exit 64
    fi
    provider="$2"
    case "$provider" in
      codex) run_live_codex ;;
      claude) run_live_claude ;;
      *)
        printf '%s\n' "unsupported provider: $provider" >&2
        exit 64
        ;;
    esac
    ;;
  *)
    printf '%s\n' \
      'usage: smoke-test.sh --self-test | --live codex|claude' >&2
    exit 64
    ;;
esac
