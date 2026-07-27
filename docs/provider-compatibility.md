# Provider compatibility

Evidence refreshed on 2026-07-25 on macOS arm64. An unrun live test is never
reported as passing.

| Provider | Package | Exact observed semver | npm integrity | Deterministic and install evidence | Controlled live evidence | Technical readiness |
| --- | --- | --- | --- | --- | --- | --- |
| Codex | `@openai/codex` | `0.145.0` | `sha512-/PSPSFujjjmiyVFvG2yu/grOFhsWdokTH8t2KGWhXSo/M5n/dIDsnbsnO82/7bLtIoDuzQf7ATBUMWqPWQINlQ==` | PASS: exact npm release previously installed and executed under a private prefix. Current deterministic tests pass canonical managed-path and isolated-home checks, empty-environment execution, stdin-only context, content-only event validation, output limits, sentinel isolation, and process-group cleanup. | UNRUN: no controlled account completed the visible login in the isolated Meld Codex home. No inference or billing-path check was sent. | `live_blocked` (`static_ready` prerequisites pass) |
| Claude | `@anthropic-ai/claude-code` | `2.1.219` | `sha512-6PVBrRsKHFi0gzv5bCabVL+XSqI3F8AR6ekFx4gpzdE5a9XotqewolID0PbcdD9IyWVYCIDET4GDCcUdA89i3Q==` | PASS: exact npm release previously installed and executed under a private prefix. Current deterministic tests pass canonical managed-path and isolated-home checks, managed-policy rejection, empty-environment execution, stdin-only context, content-only event validation, output limits, sentinel isolation, and process-group cleanup. | UNRUN: no controlled account completed the visible login in the isolated Meld Claude home. No inference or billing-path check was sent. | `live_blocked` (`static_ready` prerequisites pass) |

## Readiness semantics

- `static_ready`: pinned install and deterministic isolation contracts pass.
- `live_blocked`: static checks pass but an isolated subscription login has not
  completed, so no inference was sent.
- `launch_ready`: the pinned managed client passed isolated login, content-only
  live inference, structured output, sentinel isolation, and billing-path checks.
- `failed`: an observed technical or billing-path requirement failed.

Static readiness allows downstream implementation with fake provider processes.
Public launch still requires `launch_ready` for both Codex and Claude.

## Pinned package evidence

The registry queries were rerun on 2026-07-25:

```bash
npm view @openai/codex version dist.integrity --json
npm view @anthropic-ai/claude-code version dist.integrity --json
```

They returned the exact versions and integrity values shown in the table. These
are pins, not `latest`, semver ranges, or example hashes. Any pin change requires
a fresh private install, exact `--version` check, deterministic suite, and
controlled live evidence.

## Policy position

Primary sources were retrieved again on 2026-07-25.

Anthropic's June 2026 [Agent SDK subscription update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
says its announced change is paused and that Claude Agent SDK, `claude -p`, and
third-party app usage currently continue to draw from subscription usage
limits. Anthropic's [legal-and-compliance authentication guidance](https://code.claude.com/docs/en/legal-and-compliance)
simultaneously says developers building products should use API-key or supported
cloud authentication and that third-party developers may not offer Claude.ai
login or route Free, Pro, or Max credentials for users. Those statements create
an unresolved documentation conflict for Meld's user-owned, local
subscription-authenticated orchestration model.

[Conductor's Claude subscription update](https://www.conductor.build/blog/claude-subscription-update)
states that the announced subscription changes were delayed and that it
continues to support Claude-plan use while working with Anthropic. This is
useful ecosystem evidence, not Anthropic authorization for Meld.

The product owner has decided that Codex and Claude remain enabled MVP
capabilities, with no Claude release flag. Meld will seek Anthropic
clarification and recheck all primary sources before public launch. The
documentation conflict does not stop unrelated implementation, while the
technical launch gate still requires `launch_ready` for both providers.

This record is technical and product evidence, not legal advice.

## Additional provider evidence

- [OpenAI authentication](https://learn.chatgpt.com/docs/auth) distinguishes
  ChatGPT subscription access from API-key access and documents `codex login`.
- [OpenAI CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
  document non-interactive `codex exec` and JSONL output.
- [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) include
  restrictions on programmatic extraction. The reviewed provider documentation
  does not conclusively resolve Meld's user-triggered local orchestration model.
- [Claude subscription guidance](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
  documents subscription login and warns that API-key configuration can select
  an API-billed path.
- [Claude CLI reference](https://code.claude.com/docs/en/cli-usage)
  documents stream JSON, tool controls, and strict MCP behavior.
- [Claude settings](https://code.claude.com/docs/en/configuration) document managed
  settings sources that CLI flags cannot override.

## Technical observations

- Baseline environment: Node `22.20.0`, npm `11.6.2`, jq `1.7.1-apple`, Codex
  `0.145.0`, and a previously observed local Claude client `2.1.185`.
- The managed Claude candidate remains the separately verified registry/private
  prefix release `2.1.219`; the older local client is not accepted by live mode.
- `smoke-test.sh --self-test` proves explicit mode parsing and deterministic
  fake Codex/Claude contracts. It rejects empty, duplicate, malformed,
  whitespace-only, incomplete, error, oversized, unknown-tool, and
  sentinel-disclosure output.
- The same suite proves canonical isolated homes, exact managed paths,
  environment stripping, stdin-only task context, Claude managed-policy
  rejection, bounded preflight/output streams, and TERM-resistant descendant
  cleanup on timeout, cancellation, and normal parent exit.
- `smoke-test.sh --live codex` and `--live claude` are separate controlled
  paths. Each checks the exact managed executable and pinned `--version` before
  authentication or inference.
- A live authentication report that selects API-key, Bedrock, Vertex, Foundry,
  AWS, GCP, or Azure routing is `failed`, never a subscription success.
- No live inference was sent during this refresh because controlled isolated
  subscription accounts were not explicitly available.

## Launch gate

Both providers stay enabled for implementation and fake-provider testing.
Public launch requires a fresh `launch_ready` result for both exact pins,
including isolated official login, content-only inference, structured output,
sentinel isolation, and confirmation that usage followed the subscription
rather than API-key or cloud-provider billing.
