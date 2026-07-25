# Provider Compatibility

Evidence collected on 2026-07-25 on macOS arm64. “Blocked” means the check was
not run because a required safe authentication state or clear provider
authorization was absent; it is not a successful result.

| Provider | Package | Exact observed semver | npm integrity | Subscription-login result | Structured-output result | Tool-isolation result | API-environment result | Managed-install policy result | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Codex | `@openai/codex` | `0.145.0` locally and from the registry | `sha512-/PSPSFujjjmiyVFvG2yu/grOFhsWdokTH8t2KGWhXSo/M5n/dIDsnbsnO82/7bLtIoDuzQf7ATBUMWqPWQINlQ==` | Default home reported “Logged in using ChatGPT”; fresh isolated `CODEX_HOME` reported “Not logged in.” Credentials were not copied and no browser login was initiated. | Blocked: no inference was made because the required isolated home was not authenticated. Deterministic validator tests require one result and terminal `turn.completed`. | Blocked live; harness disables shell, agents, web search, MCP, user config, and rules and rejects unknown item/event shapes and sentinel disclosure. | Static pass: runner uses an `env -i` allowlist, stdin-only context, supervised auth preflight, and a 1 MiB output cap. Live billing-path confirmation remains blocked. | Technical pass: exact npm release installed and ran under a temporary private prefix. Live harness now requires the canonical managed `0.145.0` binary and exact `--version`. Policy blocked: no primary source found explicitly authorizes Meld's third-party subscription orchestration. | **No-go pending written/explicit authorization and an isolated-login live pass.** |
| Claude | `@anthropic-ai/claude-code` | `2.1.185` local native client; `2.1.219` registry/private-prefix probe | `sha512-6PVBrRsKHFi0gzv5bCabVL+XSqI3F8AR6ekFx4gpzdE5a9XotqewolID0PbcdD9IyWVYCIDET4GDCcUdA89i3Q==` for `2.1.219` | Sanitized `claude auth status` reported `loggedIn: false`, `authMethod: none`; no login was initiated. | Blocked: no authenticated subscription session was available. Deterministic validator tests require exactly one successful, non-error terminal result. | Blocked live; current CLI supports no-tools/safe-mode flags, but official docs say managed settings still apply. Harness rejects documented file/MDM policy sources; server-managed policy absence is not proven. | Static pass: runner uses an `env -i` allowlist, stdin-only context, supervised auth preflight, and a 1 MiB output cap. | Technical pass: exact npm release installed and ran under a temporary private prefix. Live harness now requires the canonical managed `2.1.219` binary and exact `--version`. **Policy fail:** Anthropic prohibits third-party routing of Free, Pro, or Max credentials without prior approval. | **No-go.** |

## Version floor

The private-prefix installation candidates are Codex `0.145.0` and Claude
`2.1.219`, with the exact integrity values above. There is no production
supported-version floor while the policy and live-safety gates remain No-go.
Any later approval must re-run the harness against newly pinned releases rather
than treating these observations as permanent compatibility.

## Policy evidence

Primary provider sources retrieved 2026-07-25:

- [OpenAI authentication](https://learn.chatgpt.com/docs/auth) distinguishes
  ChatGPT subscription access from usage-billed API-key access, documents
  `codex login`, and says API-key usage is billed at API rates.
- [OpenAI CLI reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
  documents `codex exec` for scripted, non-interactive work and JSONL output.
- [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) prohibit
  automatically or programmatically extracting data or Output. The reviewed
  Codex documentation does not resolve whether a user-triggered third-party
  product like Meld is an authorized exception.
- [Claude subscription guidance](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
  documents Pro/Max login and warns that `ANTHROPIC_API_KEY` takes precedence
  and incurs API charges.
- [Claude CLI reference](https://code.claude.com/docs/en/cli-usage) documents
  stream JSON, tool restriction, empty tool sets, and strict MCP behavior.
- [Claude settings](https://code.claude.com/docs/en/configuration) documents
  the macOS `com.anthropic.claudecode` managed preferences domain and
  `/Library/Application Support/ClaudeCode/` managed settings, drop-ins, and
  MCP paths, and says managed settings cannot be overridden by CLI arguments.
- [Claude authentication](https://code.claude.com/docs/en/iam) documents
  credential precedence and says subscription `claude -p` usage draws from a
  separate monthly Agent SDK credit beginning 2026-06-15.
- [Claude legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
  explicitly says third-party developers must not offer Claude.ai login or
  route Free, Pro, or Max credentials on users' behalf and directs developers
  to API-key authentication unless previously approved.

No terms conclusion here is legal advice. The release decision deliberately
uses the conservative gate defined in the approved implementation plan.

## Technical observations

- Local tools: Node `22.20.0`, npm `11.6.2`, jq `1.7.1-apple`, Codex
  `0.145.0`, and Claude `2.1.185`.
- Registry evidence:
  `npm view @openai/codex@0.145.0 version dist.integrity --json` and
  `npm view @anthropic-ai/claude-code@2.1.219 version dist.integrity --json`.
- A temporary `npm install --prefix` followed by each private binary's
  `--version` succeeded for Codex `0.145.0` and Claude `2.1.219`.
- `node assert-safe-output.mjs codex /dev/null` failed with the required
  “codex did not return the requested PRD JSON” message before runner work.
- The self-test proves the assertion accepts only known Codex and Claude
  lifecycle/text/result shapes with one successful terminal result; rejects
  incomplete, duplicate, error, whitespace, oversized, unknown
  `computer_use`, and sentinel cases; preserves source line numbers; checks
  stdin-only context and canonical managed binaries; rejects managed Claude
  policy files; and kills TERM-resistant descendants on timeout,
  cancellation, and normal parent exit.
- No live inference request was sent. A fresh isolated Codex home lacked
  authentication, Claude had no active session, and copying credentials or
  switching to an API-funded path was prohibited.

## Gate

Implementation proceeds only for providers marked Go. A provider is No-go if
subscription execution becomes API-billed, tool execution cannot be disabled,
out-of-scope files are observable, the exact release cannot be installed under
a private npm prefix, or current provider terms prohibit managed installation
or third-party orchestration.

Both-provider support is an MVP requirement. The gate therefore fails, and the
personal-subscription connector design must not proceed unchanged. Resolve the
provider authorization model before implementing Task 2 or any downstream AI
connector work.
