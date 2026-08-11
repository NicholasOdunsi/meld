# Codex Room-Reply Schema Compatibility

**Status:** Approved

## Problem

Every Codex room reply currently fails before generation because the provider-facing JSON Schema describes `webSources[].url` with `format: "uri"`. The pinned Codex client forwards that schema to OpenAI structured output, which rejects `uri` as an unsupported format and returns `invalid_json_schema`. Meld then correctly settles the task as `malformed_output`. Claude accepts the same keyword, which is why the provider behavior differs.

The existing prose fallback does not apply: schema validation fails before the model can produce either structured output or prose.

## Design

Remove `format: "uri"` from `webSources[].url` in the provider-facing room-reply schema. Use a plain JSON Schema string there for both providers.

This does not weaken Meld's persisted result boundary. `WebSourceSchema` remains authoritative after generation and continues to require a valid URL with an HTTP or HTTPS protocol. The provider schema guides output shape; it does not replace contract validation.

Keep one shared room-reply property definition rather than branching the URL property by provider. A Claude-only format hint would duplicate construction without adding a security or data-integrity guarantee.

## Error Handling

The existing adapter classification remains unchanged. Provider schema failures still become `malformed_output`; this change removes the known incompatible keyword rather than masking schema errors or treating them as successful replies.

## Testing

- Assert that the provider-facing room-reply schema uses a plain string for `webSources[].url` and contains no `format: "uri"` keyword.
- Keep the contract tests proving persisted web sources reject non-HTTP(S) URLs.
- Run the focused Product Agent prompt and Codex adapter suites.
- Replay the real installed Codex path with the same extracted HTML brief and confirm it produces a completed room reply.

## Scope

No database, gateway, UI, attachment extraction, provider fallback, or Claude adapter behavior changes are included.
