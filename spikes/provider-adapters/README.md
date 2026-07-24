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

The live harness is intentionally fail-closed. It requires:

- an isolated Codex home, never the user's normal `~/.codex`;
- browser authentication performed directly by the user with `codex login`;
- an existing Claude subscription login;
- no API key, proxy, Bedrock, Vertex, or Foundry routing variables; and
- an explicit invocation after the policy gate is resolved.

The isolated Codex login would be created without copying `auth.json`:

```bash
export MELD_CODEX_HOME="$HOME/Library/Application Support/Meld/spike-codex-home"
mkdir -p "$MELD_CODEX_HOME"
CODEX_HOME="$MELD_CODEX_HOME" codex login
```

Then, only after provider authorization:

```bash
MELD_PROVIDER_TIMEOUT_SECONDS=120 \
  bash spikes/provider-adapters/smoke-test.sh
```

Each child receives an allowlisted environment built with `env -i`. The Codex
runner ignores user configuration and rules, disables shell, agents, web
search, and MCP, and uses an ephemeral read-only run. The Claude runner enables
safe mode, loads no setting sources, disables slash commands, built-in tools,
and MCP, and persists no session. The assertion rejects sentinel disclosure,
tool events, malformed JSONL, and any result that is not an object with
non-empty `title` and `problem` strings.

## Observed package evidence

On 2026-07-25, both exact packages installed and executed successfully under a
temporary private npm prefix:

| Provider | Package | Exact version | npm integrity |
| --- | --- | --- | --- |
| Codex | `@openai/codex` | `0.145.0` | `sha512-/PSPSFujjjmiyVFvG2yu/grOFhsWdokTH8t2KGWhXSo/M5n/dIDsnbsnO82/7bLtIoDuzQf7ATBUMWqPWQINlQ==` |
| Claude | `@anthropic-ai/claude-code` | `2.1.219` | `sha512-6PVBrRsKHFi0gzv5bCabVL+XSqI3F8AR6ekFx4gpzdE5a9XotqewolID0PbcdD9IyWVYCIDET4GDCcUdA89i3Q==` |

These versions are candidate technical floors, not approved production floors.
The policy gate prevents either provider from being marked supported.
