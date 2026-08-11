# Codex Room-Reply Schema Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Codex room replies by removing an unsupported JSON Schema keyword without weakening persisted web-source validation.

**Architecture:** The provider-facing room-reply schema will describe source URLs as strings that both managed clients accept. The shared `WebSourceSchema` remains the authoritative boundary and continues to enforce valid HTTP(S) URLs after provider output is returned.

**Tech Stack:** TypeScript, Zod, Vitest, managed Codex CLI 0.146.0

## Global Constraints

- Keep one shared room-reply property definition for Codex and Claude.
- Do not change database, gateway, UI, attachment extraction, fallback, or adapter behavior.
- Preserve HTTP/HTTPS validation in `packages/contracts/src/ai.ts`.

---

### Task 1: Make the room-reply schema Codex-compatible

**Files:**
- Modify: `apps/connector/src/tasks/product-agent-prompt.ts:228-244`
- Test: `apps/connector/src/tasks/product-agent-prompt.test.ts:145-174`

**Interfaces:**
- Consumes: `ROOM_REPLY_RESPONSE_SCHEMA_STRICT` and `ROOM_REPLY_RESPONSE_SCHEMA_LENIENT` from `product-agent-prompt.ts`.
- Produces: Provider schemas whose `webSources.items.properties.url` value is exactly `{ type: "string" }`.

- [x] **Step 1: Write the failing schema compatibility test**

Add this assertion to the strict structured-output suite:

```ts
it("uses only Codex-supported keywords for web-source URLs", () => {
  const properties = ROOM_REPLY_RESPONSE_SCHEMA_STRICT.properties as Record<
    string,
    Record<string, unknown>
  >;
  const webSources = properties.webSources;
  const items = webSources.items as Record<string, unknown>;
  const sourceProperties = items.properties as Record<string, unknown>;

  expect(sourceProperties.url).toEqual({ type: "string" });
});
```

- [x] **Step 2: Run the focused test and verify the regression is reproduced**

Run:

```bash
pnpm --filter @meld/connector test -- product-agent-prompt
```

Expected: FAIL because the URL schema also contains `format: "uri"`.

- [x] **Step 3: Remove the unsupported provider keyword**

Change the URL property in `ROOM_REPLY_PROPERTIES` to:

```ts
url: { type: "string" },
```

Do not change `WebSourceSchema`; its `z.url()` and HTTP/HTTPS refinement remain the persisted-result validation boundary.

- [x] **Step 4: Run focused and package verification**

Run:

```bash
pnpm --filter @meld/connector test -- product-agent-prompt codex-adapter provider-adapter
pnpm --filter @meld/contracts test -- ai
pnpm --filter @meld/connector typecheck
```

Expected: all commands PASS.

- [x] **Step 5: Replay the installed Codex path**

Build the connector, replace the local installed bundle under `~/Library/Application Support/Meld/connector/current/`, restart the LaunchAgent, then submit the captured HTML-brief context through `TaskExecutor` using managed Codex 0.146.0 and `gpt-5.5`.

Expected: Codex exits successfully, emits an `agent_message`, and `TaskExecutor` returns a completed `room_reply` envelope instead of `malformed_output`.

- [x] **Step 6: Commit the implementation**

```bash
git add apps/connector/src/tasks/product-agent-prompt.ts \
  apps/connector/src/tasks/product-agent-prompt.test.ts
git commit -m "fix(connector): restore Codex room replies"
```
