# Personal-subscription provider safety spike

This directory tests whether Meld can invoke official Codex and Claude clients
with a user's subscription while exposing only supplied conversation content.
It does not copy credentials, accept API keys, or grant either client local
tools.

## Release result

The technical harness is complete, but the release gate is **No-go** as of
2026-07-25. Anthropic explicitly disallows third-party products from routing
Free, Pro, or Max credentials without prior approval. OpenAI documents
non-interactive Codex use, but the current consumer terms and product
documentation do not clearly authorize a third-party product to extract
subscription-funded output. See `docs/provider-compatibility.md`.

Do not ship this integration until both providers give sufficiently clear
authorization for Meld's exact orchestration model.

## Safe local checks

Run the assertion and shell checks without making an inference request:

```bash
bash spikes/provider-adapters/smoke-test.sh --self-test
```

This self-test does not require either provider CLI. It exercises both
provider-specific event allowlists, unknown event rejection, canonical home
and binary validation, stdin-only context, output overflow, terminal-result
requirements, managed-policy rejection, and process-group cleanup on timeout,
cancellation, and normal parent exit.

The live harness is intentionally fail-closed. It requires:

- the exact physical, non-symlink
  `~/Library/Application Support/Meld/spike-codex-home` location, owned by the
  current user, never the user's normal `~/.codex` or a path alias;
- browser authentication performed directly by the user with `codex login`;
- an existing Claude subscription login;
- canonical, non-symlink managed binaries at
  `~/Library/Application Support/Meld/providers/codex/0.145.0/bin/codex` and
  `~/Library/Application Support/Meld/providers/claude/2.1.219/bin/claude`;
- no API key, proxy, Bedrock, Vertex, or Foundry routing variables; and
- an explicit invocation after the policy gate is resolved.

The isolated Codex login would be created without copying `auth.json`:

```bash
PHYSICAL_HOME="$(cd -P "$HOME" && pwd -P)"
export MELD_CODEX_HOME="$PHYSICAL_HOME/Library/Application Support/Meld/spike-codex-home"
mkdir -p "$MELD_CODEX_HOME"
CODEX_HOME="$MELD_CODEX_HOME" codex login
```

Then, only after provider authorization:

```bash
export MELD_CODEX_BIN="$PHYSICAL_HOME/Library/Application Support/Meld/providers/codex/0.145.0/bin/codex"
export MELD_CLAUDE_BIN="$PHYSICAL_HOME/Library/Application Support/Meld/providers/claude/2.1.219/bin/claude"
MELD_PROVIDER_TIMEOUT_SECONDS=120 \
  bash spikes/provider-adapters/smoke-test.sh
```

Each child receives an allowlisted environment built with `env -i`. The Codex
runner ignores user configuration and rules, disables shell, agents, web
search, and MCP, and uses an ephemeral read-only run. The Claude runner requests
safe mode and no user/project/local setting sources, disables slash commands,
built-in tools, and MCP, and persists no session. However, Claude documents
that admin-managed settings still apply in safe mode and cannot be overridden
by CLI flags. The harness therefore fails if it finds
`/Library/Application Support/ClaudeCode/managed-settings.json`,
`managed-settings.d/*.json`, `managed-mcp.json`, or the
`com.anthropic.claudecode` MDM preferences domain. Server-managed settings
cannot be proven absent by these filesystem checks, which remains another
reason not to treat the live gate as passed.

Both runners read room context from stdin, never argv. Authentication status
and exact pinned versions are checked through the same deadline supervisor
before inference. Provider output is capped at 1 MiB while streaming and again
before reading. The validator requires exactly one trimmed PRD result followed
by a successful terminal event. Live provider processes run in a new session;
timeout, cancellation, normal completion, and supervisor exit all send `TERM`
then `KILL` to the provider process group and reap the group leader.

## Observed package evidence

On 2026-07-25, both exact packages installed and executed successfully under a
temporary private npm prefix:

| Provider | Package | Exact version | npm integrity |
| --- | --- | --- | --- |
| Codex | `@openai/codex` | `0.145.0` | `sha512-/PSPSFujjjmiyVFvG2yu/grOFhsWdokTH8t2KGWhXSo/M5n/dIDsnbsnO82/7bLtIoDuzQf7ATBUMWqPWQINlQ==` |
| Claude | `@anthropic-ai/claude-code` | `2.1.219` | `sha512-6PVBrRsKHFi0gzv5bCabVL+XSqI3F8AR6ekFx4gpzdE5a9XotqewolID0PbcdD9IyWVYCIDET4GDCcUdA89i3Q==` |

These versions are candidate technical floors, not approved production floors.
The policy gate prevents either provider from being marked supported.
