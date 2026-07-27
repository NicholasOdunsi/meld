# Personal-subscription provider safety spike

This directory tests whether Meld can invoke official Codex and Claude clients
with a user's subscription while exposing only supplied conversation content.
It does not copy credentials, accept API keys, or grant either client local
tools.

## Readiness result

As of 2026-07-25, both provider adapters are `static_ready`: their exact pinned
packages and deterministic content-only isolation contracts pass. Both remain
`live_blocked` because no controlled account has completed an isolated login,
so no live inference was sent.

Static readiness allows downstream development against fake provider processes.
Public launch still requires `launch_ready` evidence for both Codex and Claude.
Both providers remain enabled MVP capabilities; neither is behind a release
flag. See `docs/provider-compatibility.md` for the readiness and policy record.

## Deterministic checks

Run the assertion and shell checks without either provider CLI or any inference:

```bash
bash scripts/provider-adapters/smoke-test.sh --self-test
```

The self-test covers both provider event allowlists; empty, duplicate,
malformed, oversized, unknown-tool, and sentinel-disclosure output; canonical
isolated homes and managed binaries; stdin-only context; an empty child
environment with credential and cloud-routing variables removed; strict CLI
mode parsing; managed-policy rejection; and process-group cleanup on timeout,
cancellation, and normal parent exit.

The only accepted entry points are:

```text
smoke-test.sh --self-test
smoke-test.sh --live codex
smoke-test.sh --live claude
```

A live run is always provider-specific. It refuses aliases, symlinks, unexpected
paths, and versions other than the pins below.

## Controlled live checks

Do not run these commands with a personal or production account. Use a
controlled isolated subscription account and perform the provider's visible
official login directly. Never copy `~/.codex`, `~/.claude`, `auth.json`, OAuth
tokens, or another provider home.

Prepare the isolated homes and exact managed executable paths:

```bash
PHYSICAL_HOME="$(cd -P "$HOME" && pwd -P)"
export MELD_CODEX_HOME="$PHYSICAL_HOME/Library/Application Support/Meld/spike-codex-home"
export MELD_CLAUDE_HOME="$PHYSICAL_HOME/Library/Application Support/Meld/spike-claude-home"
export MELD_CODEX_BIN="$PHYSICAL_HOME/Library/Application Support/Meld/providers/codex/0.145.0/bin/codex"
export MELD_CLAUDE_BIN="$PHYSICAL_HOME/Library/Application Support/Meld/providers/claude/2.1.219/bin/claude"
mkdir -p "$MELD_CODEX_HOME" "$MELD_CLAUDE_HOME"
```

Authenticate each isolated client through its official browser flow. The
managed binary directory is the only provider directory placed on `PATH`:

```bash
LOGIN_TMP="$(mktemp -d)"
env -i \
  HOME="$MELD_CODEX_HOME" \
  PATH="${MELD_CODEX_BIN%/codex}:/usr/bin:/bin" \
  TMPDIR="$LOGIN_TMP" \
  LANG="C.UTF-8" \
  LC_ALL="C.UTF-8" \
  "$MELD_CODEX_BIN" login

env -i \
  HOME="$MELD_CLAUDE_HOME" \
  PATH="${MELD_CLAUDE_BIN%/claude}:/usr/bin:/bin" \
  TMPDIR="$LOGIN_TMP" \
  LANG="C.UTF-8" \
  LC_ALL="C.UTF-8" \
  "$MELD_CLAUDE_BIN" login
```

Then run only the provider whose controlled account is ready:

```bash
MELD_PROVIDER_TIMEOUT_SECONDS=120 \
  bash scripts/provider-adapters/smoke-test.sh --live codex

MELD_PROVIDER_TIMEOUT_SECONDS=120 \
  bash scripts/provider-adapters/smoke-test.sh --live claude
```

Each runner starts from `env -i` and receives only its isolated `HOME`, the
managed provider bin plus `/usr/bin:/bin` on `PATH`, the task `TMPDIR`, and fixed
`LANG`/`LC_ALL` values. API keys, access tokens, subscription OAuth environment
tokens, and Bedrock, Vertex, Foundry, AWS, GCP, and Azure routing variables are
not inherited. Authentication that reports an API-key or cloud-provider billing
path fails the live test.

The Codex runner uses `codex exec --json`, ignores user configuration and
project rules, and disables shell, agents, web search, and MCP. The Claude
runner uses `claude -p` with stream JSON, one turn, empty allowed tools plus the
supported deny list, strict MCP configuration, no inherited setting sources,
and no session persistence. Claude's documented managed settings cannot be
overridden by CLI flags, so the harness rejects known file and MDM sources
before a live run.

Both runners read context from stdin, never argv. Provider output is capped at
1 MiB while streaming and before validation. The validator requires exactly one
trimmed PRD result followed by a successful terminal event. Timeout,
cancellation, normal completion, and supervisor exit all terminate and reap the
provider process group.

## Observed package evidence

Registry evidence refreshed on 2026-07-25:

| Provider | Package | Exact version | npm integrity |
| --- | --- | --- | --- |
| Codex | `@openai/codex` | `0.145.0` | `sha512-/PSPSFujjjmiyVFvG2yu/grOFhsWdokTH8t2KGWhXSo/M5n/dIDsnbsnO82/7bLtIoDuzQf7ATBUMWqPWQINlQ==` |
| Claude | `@anthropic-ai/claude-code` | `2.1.219` | `sha512-6PVBrRsKHFi0gzv5bCabVL+XSqI3F8AR6ekFx4gpzdE5a9XotqewolID0PbcdD9IyWVYCIDET4GDCcUdA89i3Q==` |

These exact values are the managed installation candidates consumed by the
downstream installer. A later pin requires fresh registry, install, version,
deterministic, and controlled-live evidence.
