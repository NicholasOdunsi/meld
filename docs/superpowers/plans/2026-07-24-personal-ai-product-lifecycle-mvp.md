# Personal-AI Product Lifecycle MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-first collaborative product-discovery MVP that turns a Discovery Room conversation into an accepted full PRD and an explicitly created Define/Design Feature Room, using only the initiating user's personal Codex or Claude subscription.

**Architecture:** Use a pnpm monorepo with a Next.js App Router web application, Supabase Auth/Postgres/Storage/Realtime, a separately deployed Fastify WebSocket gateway, shared Zod contracts, and a TypeScript connector installed with a Node-free HTTPS bootstrap. The bootstrap installs a pinned private Node runtime and connector under the user's Library directory, registers a per-user LaunchAgent, and exits; the paired background process then claims durable user-owned tasks over an outbound WebSocket, invokes an official subscription-authenticated CLI in a content-only configuration, and streams structured results back.

**Tech Stack:** Node.js 20.9+ for repository development, pnpm/Corepack, TypeScript, Next.js App Router, React, Astryx Core 0.1.8, Astryx Neutral Theme 0.1.8, Astryx CLI 0.1.8, Tiptap, Zod, Supabase, Fastify, WebSocket, Vitest, Testing Library, Playwright, POSIX shell, macOS `launchd`/`launchctl`, macOS Keychain `security`, GitHub Actions.

## Global Constraints

- The platform must never own, store, or use an OpenAI or Anthropic API key.
- There is no managed-credit, paid-API, teammate-subscription, or silent provider fallback.
- Every AI task belongs to the initiating user and runs only on that user's paired device.
- AI runs only after an explicit mention or action.
- AI context is scoped to the current Discovery Room unless the user explicitly adds other permitted context.
- Provider credentials remain inside the official Codex or Claude client.
- The connector is content-only: no repository, arbitrary folder, shell, or local-secret access.
- Both Codex and Claude personal subscriptions are supported.
- macOS 13 or later is the first connector target.
- Primary installation must work when Node, npm, npx, Homebrew, and Xcode are absent.
- The installer must not require `sudo`, change shell startup files, modify a system Node installation, or depend on the user's `PATH`.
- The connector must use its pinned private Node runtime even when the user already has Node.
- The connector must run as a per-user LaunchAgent and continue after Terminal closes and after login restart.
- Provider installation must be an explicit **Install for me** action, remain under Meld's application-support directory, and end in the provider's official browser login.
- Offline tasks queue durably and revalidate access immediately before execution.
- PRD acceptance applies to the whole document; edits after acceptance create a new unaccepted version.
- PRD acceptance never creates a Feature Room automatically.
- Missing flows, prototypes, and open answers create warnings, not blockers.
- Feature Rooms implement Define and Design only.
- Stage transitions are manual and restricted to the Feature Room owner or organization admin.
- Web UI must follow the generated root `AGENTS.md` Astryx conventions.
- Import `@astryxdesign/core/reset.css`, `@astryxdesign/core/astryx.css`, and the prebuilt Neutral theme CSS once at the application root.
- Use Astryx shells and layout components; do not use raw layout `<div>` elements, Tailwind utilities, `@apply`, or hand-rolled layout CSS.
- Use component props first and Astryx `var(--color-*|--spacing-*|--radius-*|--duration-*)` tokens for any necessary custom styling; never use raw hex colors or hardcoded CSS pixel values.
- Use rows for dense data and reserve cards for widgets, galleries, and settings groups.
- Use `StatusDot` or `Token` for status; use `Badge` only for counts and enumerated states.
- The MVP is not a native `.app` or `.pkg`; its shell/runtime distribution does not require an Apple Developer account.
- Every bootstrap, runtime, connector, and managed-provider download must be version-pinned and checksum-verified before activation.
- Use test-driven development, tenant isolation, least privilege, and frequent task-level commits.

## Delivery Milestones

1. **Provider safety gate:** Prove subscription authentication, structured output, and content-only execution for both CLIs.
2. **Collaborative discovery:** Ship authentication, organizations, Discovery Rooms, messages, and attachments without AI.
3. **Personal AI connection:** Ship durable tasks, Node-free bootstrap onboarding, pairing, the per-user LaunchAgent, and both provider adapters.
4. **PRD workflow:** Ship Product Agent conversation, full PRD generation, revision, acceptance, and history.
5. **Feature handoff:** Ship artifacts, explicit feature conversion, Define, Design, readiness warnings, and manual transitions.
6. **Launch hardening:** Pass security, usability, observability, and end-to-end launch gates.

## macOS Installation and Apple Account Boundary

- The private MVP uses a small POSIX-shell bootstrap, a private official Node runtime, JavaScript connector files, and a per-user LaunchAgent. It does not ship a native `.app`, executable bundle, kernel/system extension, or installer package.
- This MVP path requires no Apple Developer account, Xcode installation, administrator access, or Gatekeeper bypass.
- Install only under `~/Library/Application Support/Meld/`, `~/Library/Caches/Meld/`, and `~/Library/LaunchAgents/com.meld.connector.plist`.
- Publish the bootstrap over HTTPS. Pin exact artifact versions, verify the official Node `SHASUMS256.txt`, verify Meld release SHA-256 checksums, stage updates in a new version directory, run a health check, and switch the `current` symlink atomically.
- Do not mutate `/usr/local`, `/opt/homebrew`, `/Library`, shell profiles, or the user's global npm configuration.
- Revisit Developer ID signing and notarization only if a later release introduces a native standalone executable, `.pkg`, or `.app`.

## File and Responsibility Map

### Repository root

- `package.json` — shared scripts and pinned package-manager declaration.
- `pnpm-workspace.yaml` — JavaScript workspace boundaries.
- `turbo.json` — build, typecheck, lint, and test task graph.
- `.nvmrc` — Node runtime floor.
- `.env.example` — documented non-secret environment names.
- `vitest.workspace.ts` — workspace test discovery.
- `playwright.config.ts` — browser test configuration.
- `.github/workflows/ci.yml` — web, gateway, contract, migration, and connector CI.

### Web application

- `apps/web/src/app/` — routes and layouts.
- `apps/web/src/app/astryx-provider.tsx` — Neutral theme provider.
- `apps/web/src/ui/` — Astryx-composed application shells and shared product patterns.
- `apps/web/src/features/auth/` — Supabase SSR authentication.
- `apps/web/src/features/workspaces/` — organizations, membership, and invitations.
- `apps/web/src/features/discovery/` — Discovery Room conversation and evidence.
- `apps/web/src/features/prd/` — PRD editor, versions, diffs, revision chat, and acceptance.
- `apps/web/src/features/features/` — feature conversion and Define/Design views.
- `apps/web/src/features/ai/` — agent actions, task state, device state, and provider selection.
- `apps/web/src/lib/supabase/` — browser, server, and admin Supabase clients.
- `apps/web/src/lib/repositories/` — server-side domain repositories.
- `apps/web/src/app/api/` — pairing, task creation, PRD, and feature route handlers.

### Design-system guidance

- `AGENTS.md` — generated Astryx conventions that apply to every UI task.
- `docs/ui/astryx-component-map.md` — approved mapping from product surfaces to Astryx templates, blocks, and components.
- `scripts/check-astryx-conventions.mjs` — CI guard against raw layout elements, Tailwind utilities, unapproved CSS, and hardcoded visual values.

### Gateway

- `apps/gateway/src/server.ts` — Fastify process startup and health endpoint.
- `apps/gateway/src/auth/device-auth.ts` — device bearer-token verification.
- `apps/gateway/src/tasks/task-repository.ts` — transactional claim and state updates.
- `apps/gateway/src/ws/device-session.ts` — one authenticated outbound device session.
- `apps/gateway/src/ws/protocol-handler.ts` — shared protocol message handling.

### Shared packages

- `packages/contracts/src/ai.ts` — provider, task, context, event, and result schemas.
- `packages/contracts/src/prd.ts` — full PRD schema and section keys.
- `packages/contracts/src/ws.ts` — WebSocket envelope schemas.
- `packages/contracts/src/index.ts` — public exports.
- `packages/test-support/` — factories and deterministic fixtures.

### Database

- `supabase/config.toml` — local Supabase configuration.
- `supabase/migrations/` — schema, RLS, functions, triggers, and Realtime publication.
- `supabase/seed.sql` — local test fixtures only.
- `supabase/tests/` — pgTAP authorization and state-transition tests.

### macOS connector

- `apps/connector/install/install.sh` — Node-free bootstrap, artifact verification, atomic activation, LaunchAgent registration, and pairing.
- `apps/connector/src/cli.ts` — local `status`, `pause`, `resume`, `update`, `doctor`, and `uninstall` commands.
- `apps/connector/src/agent.ts` — persistent LaunchAgent entry point.
- `apps/connector/src/config/paths.ts` — application-support, cache, LaunchAgent, and task-workspace paths.
- `apps/connector/src/pairing/` — single-use device pairing and Keychain credential storage.
- `apps/connector/src/launchd/` — property-list generation, bootstrap, kickstart, bootout, and health checks.
- `apps/connector/src/transport/` — reconnecting authenticated WebSocket client.
- `apps/connector/src/tasks/` — local task lifecycle, durable acknowledgement cursor, and cancellation.
- `apps/connector/src/providers/` — provider protocol, detection, managed installation, Codex adapter, and Claude adapter.
- `apps/connector/src/security/` — child environment, content-only workspace, checksum verification, and redacted logs.
- `apps/connector/test/` — Vitest suites, fake gateway, fake provider processes, and temporary-home fixtures.

### Provider feasibility

- `spikes/provider-adapters/` — disposable but committed go/no-go harness and evidence.
- `docs/provider-compatibility.md` — dated provider behavior, policy links, supported versions, and release decision.

---

### Task 1: Prove Personal-Subscription Provider Safety

**Files:**
- Create: `spikes/provider-adapters/README.md`
- Create: `spikes/provider-adapters/context.json`
- Create: `spikes/provider-adapters/run-codex.sh`
- Create: `spikes/provider-adapters/run-claude.sh`
- Create: `spikes/provider-adapters/assert-safe-output.mjs`
- Create: `spikes/provider-adapters/smoke-test.sh`
- Create: `docs/provider-compatibility.md`

**Interfaces:**
- Consumes: An already authenticated local `codex` or `claude` executable.
- Produces: JSONL output containing text/result events only; exact package, semver, and integrity records for managed installation; a documented supported-version floor; and an explicit go/no-go record for each provider.

- [ ] **Step 1: Create the harmless context fixture and an out-of-scope sentinel**

```json
{
  "taskId": "00000000-0000-0000-0000-000000000001",
  "kind": "prd_generate",
  "instruction": "Return JSON with keys title and problem. Do not inspect the computer.",
  "messages": [
    {
      "author": "Ada",
      "text": "Freelance designers lose track of client feedback across chat tools."
    }
  ]
}
```

`smoke-test.sh` must create the sentinel outside the working directory:

```bash
SPIKE_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_ROOT="$(mktemp -d)"
SENTINEL_ROOT="$(mktemp -d)"
trap 'rm -rf "$RUN_ROOT" "$SENTINEL_ROOT"' EXIT
cp "$SPIKE_ROOT/context.json" "$RUN_ROOT/context.json"
printf '%s\n' 'MELD_OUTSIDE_SENTINEL_7F31B' > "$SENTINEL_ROOT/secret.txt"
```

- [ ] **Step 2: Write the output assertion before the runners**

```js
// spikes/provider-adapters/assert-safe-output.mjs
import { readFileSync } from "node:fs";

const [provider, outputPath] = process.argv.slice(2);
const raw = readFileSync(outputPath, "utf8");
if (raw.includes("MELD_OUTSIDE_SENTINEL_7F31B")) {
  throw new Error(`${provider} exposed an out-of-scope file`);
}

const events = raw
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const forbidden = events.filter((event) =>
  ["tool_use", "command_execution", "file_read", "mcp_tool_call"].includes(
    event.type ?? event.item?.type,
  ),
);
if (forbidden.length > 0) {
  throw new Error(`${provider} emitted forbidden tool events`);
}

const text = raw.match(/"title"|"problem"/);
if (!text) throw new Error(`${provider} did not return the requested PRD JSON`);
```

- [ ] **Step 3: Run the assertion to verify it fails without output**

Run:

```bash
node spikes/provider-adapters/assert-safe-output.mjs codex /dev/null
```

Expected: FAIL with `codex did not return the requested PRD JSON`.

- [ ] **Step 4: Add the Codex content-only runner**

```bash
#!/usr/bin/env bash
set -euo pipefail

TASK_DIR="$1"
OUTPUT_PATH="$2"

(
  cd "$TASK_DIR"
  codex exec \
    --json \
    --sandbox read-only \
    --ask-for-approval never \
    --skip-git-repo-check \
    --config 'features.shell_tool=false' \
    --config 'agents.enabled=false' \
    --config 'web_search="disabled"' \
    --config 'mcp_servers={}' \
    "$(jq -c . context.json)"
) > "$OUTPUT_PATH"
```

The runner must use a connector-specific `CODEX_HOME` during the actual spike so user plugins, MCP servers, rules, and project instructions cannot add tools. Authenticate that isolated home using `codex login`; do not copy an existing `auth.json`.

- [ ] **Step 5: Add the Claude content-only runner**

```bash
#!/usr/bin/env bash
set -euo pipefail

TASK_DIR="$1"
OUTPUT_PATH="$2"
DENIED_TOOLS="Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit"

(
  cd "$TASK_DIR"
  claude -p \
    --output-format stream-json \
    --permission-mode plan \
    --max-turns 1 \
    --disallowedTools "$DENIED_TOOLS" \
    "$(jq -c . context.json)"
) > "$OUTPUT_PATH"
```

Run Claude with `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and provider-routing variables explicitly removed from the child environment so an API-billed credential cannot take precedence over the subscription login.

- [ ] **Step 6: Complete the smoke harness**

```bash
CODEX_OUTPUT="$RUN_ROOT/codex.jsonl"
CLAUDE_OUTPUT="$RUN_ROOT/claude.jsonl"

env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN \
  "$SPIKE_ROOT/run-codex.sh" "$RUN_ROOT" "$CODEX_OUTPUT"
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN \
  "$SPIKE_ROOT/run-claude.sh" "$RUN_ROOT" "$CLAUDE_OUTPUT"

node "$SPIKE_ROOT/assert-safe-output.mjs" codex "$CODEX_OUTPUT"
node "$SPIKE_ROOT/assert-safe-output.mjs" claude "$CLAUDE_OUTPUT"
```

Run:

```bash
bash spikes/provider-adapters/smoke-test.sh
```

Expected: PASS for both authenticated subscription clients, with no tool event and no sentinel disclosure.

- [ ] **Step 7: Record the release gate**

`docs/provider-compatibility.md` must record:

```markdown
# Provider Compatibility

The compatibility table has one Codex row and one Claude row. Each row records:
provider, package name, exact observed semver, npm integrity, subscription-login
result, structured-output result, tool-isolation result, API-environment result,
managed-install policy result, and the final Go or No-go decision. Do not commit
the table until every cell contains observed evidence rather than example text.

## Policy evidence

- OpenAI authentication: https://learn.chatgpt.com/docs/auth
- OpenAI CLI: https://learn.chatgpt.com/docs/developer-commands?surface=cli
- Claude subscription: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Claude CLI: https://docs.anthropic.com/en/docs/claude-code/cli-usage

## Gate

Implementation proceeds only for providers marked Go. A provider is No-go if
subscription execution becomes API-billed, tool execution cannot be disabled,
out-of-scope files are observable, the exact release cannot be installed under
a private npm prefix, or current provider terms prohibit managed installation
or third-party orchestration.
```

Collect the package evidence with:

```bash
npm view @openai/codex version dist.integrity --json
npm view @anthropic-ai/claude-code version dist.integrity --json
```

Stop the plan and revise the approved design if either provider is No-go; the MVP requirement is to support both.

- [ ] **Step 8: Commit**

```bash
git add spikes/provider-adapters docs/provider-compatibility.md
git commit -m "test: prove personal AI provider isolation"
```

---

### Task 2: Scaffold the Monorepo and Shared Contracts

**Files:**
- Modify: `package.json`
- Preserve: `AGENTS.md`
- Preserve: `pnpm-lock.yaml`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `vitest.workspace.ts`
- Create: `apps/web/**`
- Create: `apps/gateway/package.json`
- Create: `apps/gateway/src/server.ts`
- Create: `apps/gateway/src/server.test.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/ai.ts`
- Create: `packages/contracts/src/prd.ts`
- Create: `packages/contracts/src/ws.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Consumes: The approved design and provider gate from Task 1.
- Produces: `ProviderSchema`, `AITaskSchema`, `AIContextPackageSchema`, `PRDDocumentSchema`, `DeviceToServerMessageSchema`, and `ServerToDeviceMessageSchema`.

- [ ] **Step 1: Write contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  AIContextPackageSchema,
  PRDDocumentSchema,
  ServerToDeviceMessageSchema,
} from "./index";

describe("shared contracts", () => {
  it("rejects a context package without an initiating user", () => {
    const result = AIContextPackageSchema.safeParse({
      taskId: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      kind: "prd_generate",
      instruction: "Draft the PRD",
      messages: [],
      attachments: [],
    });
    expect(result.success).toBe(false);
  });

  it("requires every PRD section", () => {
    const result = PRDDocumentSchema.safeParse({ title: "Incomplete" });
    expect(result.success).toBe(false);
  });

  it("parses a task available message", () => {
    expect(
      ServerToDeviceMessageSchema.parse({
        type: "task.available",
        taskId: crypto.randomUUID(),
      }).type,
    ).toBe("task.available");
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
corepack enable
pnpm test --filter @meld/contracts
```

Expected: FAIL because the workspace and schemas do not exist.

- [ ] **Step 3: Scaffold the workspace**

Use `pnpm create next-app@latest apps/web --ts --no-tailwind --eslint --app --src-dir --use-pnpm --import-alias "@/*"` and add root scripts without removing the already installed Astryx packages:

```json
{
  "name": "meld",
  "private": true,
  "packageManager": "pnpm@10.28.1",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "test": "turbo test",
    "typecheck": "turbo typecheck"
  },
  "dependencies": {
    "@astryxdesign/core": "^0.1.8",
    "@astryxdesign/theme-neutral": "^0.1.8"
  },
  "devDependencies": {
    "@astryxdesign/cli": "^0.1.8",
    "turbo": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Set `.nvmrc` to `20.9` and define workspace globs for `apps/*` and `packages/*`. Do not add Tailwind, PostCSS utility plugins, or a global application stylesheet.

- [ ] **Step 4: Implement the contract schemas**

```ts
// packages/contracts/src/ai.ts
import { z } from "zod";

export const ProviderSchema = z.enum(["codex", "claude"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const AITaskKindSchema = z.enum([
  "room_reply",
  "prd_generate",
  "prd_revise",
  "stage_readiness",
]);

export const AITaskStatusSchema = z.enum([
  "queued",
  "waiting_for_device",
  "ready_to_run",
  "running",
  "needs_reauthentication",
  "usage_limit_reached",
  "needs_review",
  "completed",
  "cancelled",
  "failed",
]);

export const AIContextPackageSchema = z.object({
  taskId: z.string().uuid(),
  initiatingUserId: z.string().uuid(),
  organizationId: z.string().uuid(),
  roomId: z.string().uuid(),
  kind: AITaskKindSchema,
  instruction: z.string().min(1).max(20_000),
  messages: z.array(
    z.object({
      id: z.string().uuid(),
      authorName: z.string(),
      text: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
  attachments: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      mimeType: z.string(),
      extractedText: z.string().max(100_000).nullable(),
      userCaption: z.string().max(2_000).nullable(),
    }),
  ),
  currentPrd: z.unknown().nullable(),
});
```

Define all PRD section keys explicitly in `prd.ts`:

```ts
export const PRDDocumentSchema = z.object({
  title: z.string().min(1),
  executiveSummary: z.string(),
  problemAndEvidence: z.string(),
  targetUsersAndUseCases: z.string(),
  goalsNonGoalsAndMetrics: z.string(),
  proposedSolution: z.string(),
  userJourneys: z.string(),
  functionalRequirements: z.array(z.string()),
  nonFunctionalRequirements: z.array(z.string()),
  uxStatesAndEdgeCases: z.array(z.string()),
  dependenciesAndConstraints: z.array(z.string()),
  risksAndMitigations: z.array(
    z.object({ risk: z.string(), mitigation: z.string() }),
  ),
  mvpScope: z.object({
    included: z.array(z.string()),
    excluded: z.array(z.string()),
  }),
  acceptanceCriteria: z.array(z.string()),
  openQuestions: z.array(z.string()),
  decisionHistory: z.array(
    z.object({
      decision: z.string(),
      rationale: z.string(),
      sourceMessageIds: z.array(z.string().uuid()),
    }),
  ),
});
export type PRDDocument = z.infer<typeof PRDDocumentSchema>;
```

- [ ] **Step 5: Define transport errors, results, and every WebSocket frame**

```ts
// packages/contracts/src/ws.ts
export const TaskErrorCodeSchema = z.enum([
  "authentication_required",
  "usage_limit_reached",
  "provider_unavailable",
  "connector_outdated",
  "permission_changed",
  "security_boundary_violated",
  "malformed_output",
  "cancelled",
  "unknown",
]);

export const AIResultEnvelopeSchema = z.object({
  kind: AITaskKindSchema,
  payload: z.unknown(),
  partial: z.boolean().default(false),
});

export const ServerToDeviceMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.accepted"), heartbeatSeconds: z.number().int().positive() }),
  z.object({ type: z.literal("task.available"), taskId: z.string().uuid() }),
  z.object({
    type: z.literal("task.payload"),
    taskId: z.string().uuid(),
    provider: ProviderSchema,
    context: AIContextPackageSchema,
  }),
  z.object({ type: z.literal("task.cancel"), taskId: z.string().uuid() }),
  z.object({
    type: z.literal("task.event_ack"),
    taskId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
  }),
]);

export const DeviceToServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heartbeat"), connectorVersion: z.string() }),
  z.object({
    type: z.literal("provider.status"),
    providers: z.array(
      z.object({
        provider: ProviderSchema,
        version: z.string().nullable(),
        authentication: z.enum(["authenticated", "signed_out", "unknown"]),
        compatibility: z.enum(["supported", "outdated", "unavailable"]),
      }),
    ),
  }),
  z.object({ type: z.literal("task.claim"), taskId: z.string().uuid() }),
  z.object({
    type: z.literal("task.event"),
    taskId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    event: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("task.complete"),
    taskId: z.string().uuid(),
    result: AIResultEnvelopeSchema,
  }),
  z.object({ type: z.literal("task.cancelled"), taskId: z.string().uuid() }),
  z.object({
    type: z.literal("task.fail"),
    taskId: z.string().uuid(),
    code: TaskErrorCodeSchema,
    message: z.string().max(2_000),
  }),
]);
```

- [ ] **Step 6: Add gateway health test and implementation**

```ts
// apps/gateway/src/server.test.ts
import { expect, it } from "vitest";
import { buildServer } from "./server";

it("reports gateway health", async () => {
  const server = buildServer();
  const response = await server.inject({ method: "GET", url: "/health" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: "ok" });
});
```

```ts
// apps/gateway/src/server.ts
import Fastify from "fastify";

export function buildServer() {
  const server = Fastify({ logger: true });
  server.get("/health", async () => ({ status: "ok" }));
  return server;
}
```

- [ ] **Step 7: Run workspace checks**

Run:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all checks PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .nvmrc .env.example \
  vitest.workspace.ts apps packages pnpm-lock.yaml
git commit -m "chore: scaffold Meld application workspace"
```

---

### Task 2A: Establish the Astryx Design-System Foundation

**Files:**
- Preserve: `AGENTS.md`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/layout.tsx`
- Delete: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/astryx-provider.tsx`
- Create: `apps/web/src/ui/app-frame.tsx`
- Create: `apps/web/src/ui/app-frame.test.tsx`
- Create: `docs/ui/astryx-component-map.md`
- Create: `scripts/check-astryx-conventions.mjs`
- Create: `scripts/check-astryx-conventions.test.mjs`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: generated `AGENTS.md`, Astryx Core 0.1.8, Neutral Theme 0.1.8, and CLI 0.1.8.
- Produces: `AstryxProvider`, `AppFrame`, an approved surface-to-component map, and a CI convention check used by every later UI task.

- [ ] **Step 1: Write the convention-check tests**

```js
// scripts/check-astryx-conventions.test.mjs
import assert from "node:assert/strict";
import { checkSource } from "./check-astryx-conventions.mjs";

assert.deepEqual(checkSource(`export const Good = () => <VStack gap={4} />`), []);
assert.match(checkSource(`export const Bad = () => <div />`)[0], /raw <div>/);
assert.match(
  checkSource(`export const Bad = () => <Stack className="p-4 bg-white" />`)[0],
  /utility class/,
);
assert.match(
  checkSource(`export const Bad = () => <Stack style={{color: "#fff"}} />`)[0],
  /hardcoded color/,
);
assert.match(
  checkSource(`export const Bad = () => <Stack style={{width: "16px"}} />`)[0],
  /hardcoded pixel/,
);
```

- [ ] **Step 2: Run the check test to verify it fails**

Run:

```bash
node --test scripts/check-astryx-conventions.test.mjs
```

Expected: FAIL because `check-astryx-conventions.mjs` does not exist.

- [ ] **Step 3: Move browser packages to the web workspace and retain the CLI at root**

Run:

```bash
pnpm --filter web add @astryxdesign/core@0.1.8 @astryxdesign/theme-neutral@0.1.8
pnpm remove -w @astryxdesign/core @astryxdesign/theme-neutral
pnpm add -Dw @astryxdesign/cli@0.1.8
```

The final dependency ownership is:

- root dev dependency: `@astryxdesign/cli`
- `apps/web` runtime dependencies: `@astryxdesign/core`, `@astryxdesign/theme-neutral`

- [ ] **Step 4: Capture the Astryx surface map before writing page UI**

Run:

```bash
pnpm exec astryx build "collaborative product discovery platform with Discovery Rooms, full PRD editor, inbox, feature Define and Design stages, and AI connector status"
pnpm exec astryx template ai-chat --skeleton
pnpm exec astryx template editor --skeleton
pnpm exec astryx component AppShell
pnpm exec astryx component SideNav
pnpm exec astryx component StatusDot
pnpm exec astryx component Token
```

Record this approved map in `docs/ui/astryx-component-map.md`:

| Product surface | Astryx starting point | Container policy |
|---|---|---|
| Application frame | `AppShell` + `SideNav` + `Layout` | Side nav `256`; content flex; optional inspector `380` |
| Discovery conversation | `ai-chat` template + chat-message blocks | Message stream and rows; never cards |
| Attachment composer | `ChatComposerDrawerAttachments` | Tokens and thumbnail row |
| PRD review | `editor` template + `LayoutPanel` | Continuous document with revision inspector |
| Discovery/Feature lists | `List`/`Item` or `Table` | Edge-to-edge dense rows |
| Connector/task state | `StatusDot` with visible text | Status dot, never decorative badge |
| Metadata and removable context | `Token` | Short labels; badge only for counts |
| Forms/settings | `Section` + form components | Cards only for coherent settings groups |
| Errors and persistent warnings | `Banner` | Visible until resolved or dismissed |
| Save/transition confirmation | `useToast` | Non-blocking confirmation only |

The responsive contract is:

```text
> 1024: SideNav 256 | content | optional inspector 380
<= 1024: inspector overlays content
<= 768: SideNav collapses into AppShell mobile navigation
```

- [ ] **Step 5: Add the prebuilt Neutral theme at the application root**

```tsx
// apps/web/src/app/astryx-provider.tsx
"use client";

import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import type { ReactNode } from "react";

export function AstryxProvider({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="system">
      {children}
    </Theme>
  );
}
```

Import global design-system CSS exactly once in `apps/web/src/app/layout.tsx`:

```tsx
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import { AstryxProvider } from "./astryx-provider";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AstryxProvider>{children}</AstryxProvider>
      </body>
    </html>
  );
}
```

Delete the generated `globals.css`; no Tailwind or application-wide hand-written CSS replaces it.

- [ ] **Step 6: Create the shared application frame**

```tsx
// apps/web/src/ui/app-frame.tsx
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav } from "@astryxdesign/core/SideNav";
import type { ReactNode } from "react";

export function AppFrame({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppShell
      height="fill"
      variant="section"
      contentPadding={0}
      sideNav={
        <SideNav
          collapsible
          resizable={{
            defaultWidth: 256,
            minWidth: 220,
            maxWidth: 320,
            autoSaveId: "meld-side-nav",
          }}
        >
          {navigation}
        </SideNav>
      }
    >
      {children}
    </AppShell>
  );
}
```

The root frame contains the responsive-contract comment from the component map. Later pages compose Astryx components inside `AppFrame`; they do not create another `AppShell`.

```tsx
// apps/web/src/ui/app-frame.test.tsx
import { render, screen } from "@testing-library/react";
import { AppFrame } from "./app-frame";

it("provides one application main region and navigation", () => {
  render(
    <AppFrame navigation={<a href="/discovery">Discovery</a>}>
      <h1>Home</h1>
    </AppFrame>,
  );
  expect(screen.getByRole("main")).toBeVisible();
  expect(screen.getByRole("link", { name: "Discovery" })).toBeVisible();
});
```

- [ ] **Step 7: Implement the convention checker**

```js
// scripts/check-astryx-conventions.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export function checkSource(source) {
  const failures = [];
  if (/<div(?:\s|>)/.test(source)) failures.push("raw <div> layout");
  if (/className=(?:["'`])[^"'`]*(?:\bp-\d|\bm-\d|\bflex\b|\bgrid\b|\bbg-|\btext-)/.test(source)) {
    failures.push("utility class");
  }
  if (/#[0-9a-f]{3,8}\b/i.test(source)) failures.push("hardcoded color");
  if (/style=\{\{[\s\S]*?["'`]\d+(?:\.\d+)?px["'`]/.test(source)) {
    failures.push("hardcoded pixel");
  }
  if (/@apply\b|tailwindcss/.test(source)) failures.push("Tailwind compiler usage");
  return failures;
}

export function checkTree(root) {
  const failures = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) failures.push(...checkTree(path));
    else if ([".tsx", ".ts", ".css"].includes(extname(path))) {
      for (const failure of checkSource(readFileSync(path, "utf8"))) {
        failures.push(`${path}: ${failure}`);
      }
    }
  }
  return failures;
}
```

Add a CLI entry point that prints every failure and exits `1`. Add root script `"check:astryx": "node scripts/check-astryx-conventions.mjs apps/web/src"` and run it in CI before browser tests.

- [ ] **Step 8: Run design-system tests**

Run:

```bash
pnpm --filter web add -D @testing-library/react @testing-library/jest-dom jsdom
node --test scripts/check-astryx-conventions.test.mjs
pnpm check:astryx
pnpm --filter web test -- app-frame
pnpm --filter web typecheck
```

Expected: PASS with the Neutral theme applied, exactly one `AppShell`, no raw layout `<div>`, no Tailwind utilities, and no hardcoded visual values.

- [ ] **Step 9: Commit**

```bash
git add AGENTS.md package.json pnpm-lock.yaml apps/web docs/ui \
  scripts/check-astryx-conventions.mjs scripts/check-astryx-conventions.test.mjs \
  .github/workflows/ci.yml
git commit -m "feat: establish Astryx design system"
```

---

### Task 3: Add Supabase Schema, Authentication, and Tenant Isolation

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202607240001_core.sql`
- Create: `supabase/migrations/202607240002_rls.sql`
- Create: `supabase/tests/tenant_isolation.test.sql`
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/proxy.ts`
- Create: `apps/web/src/features/auth/actions.ts`
- Create: `apps/web/src/app/(auth)/sign-in/page.tsx`
- Create: `apps/web/src/app/auth/callback/route.ts`
- Create: `apps/web/src/proxy.ts`
- Test: `apps/web/src/features/auth/actions.test.ts`

**Interfaces:**
- Consumes: Supabase project URL and publishable key.
- Produces: authenticated user sessions plus RLS-protected `organizations`, `memberships`, `products`, and `invitations`.

- [ ] **Step 1: Write tenant-isolation tests**

```sql
begin;
select plan(3);

select tests.create_supabase_user('owner_a');
select tests.create_supabase_user('member_b');

select tests.authenticate_as('owner_a');
insert into organizations (id, name, created_by)
values ('10000000-0000-0000-0000-000000000001', 'Org A', auth.uid());

select is(
  (select count(*)::int from organizations),
  1,
  'owner sees their organization'
);

select tests.authenticate_as('member_b');
select is(
  (select count(*)::int from organizations),
  0,
  'unrelated user cannot see organization'
);

select throws_ok(
  $$ update organizations set name = 'Stolen' where id =
     '10000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'unrelated user cannot update organization'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the database test to verify it fails**

Run:

```bash
supabase start
supabase test db supabase/tests/tenant_isolation.test.sql
```

Expected: FAIL because the tables and policies do not exist.

- [ ] **Step 3: Create the core schema**

The first migration must create UUID primary keys and timestamps for:

```sql
create type membership_role as enum ('admin', 'member');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table memberships (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role membership_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
```

Add an `after insert` trigger that makes `created_by` an admin member of a new organization.

- [ ] **Step 4: Add RLS helper functions and policies**

```sql
create function is_org_member(target_org uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where organization_id = target_org and user_id = auth.uid()
  );
$$;

create function is_org_admin(target_org uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where organization_id = target_org
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;
```

Enable RLS on every tenant-owned table. Members may select their organizations and products; only admins may update organizations or manage memberships.

- [ ] **Step 5: Implement Supabase SSR authentication**

Run the Astryx discovery commands before writing the sign-in page:

```bash
pnpm exec astryx build "simple email and Google sign-in page with magic-link confirmation, validation errors, and loading state"
pnpm exec astryx component FormLayout
pnpm exec astryx component TextInput
pnpm exec astryx component Button
pnpm exec astryx component Banner
```

Use `@supabase/ssr` cookie clients. The proxy must refresh sessions but never perform authorization by itself:

```ts
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

Implement Google OAuth and email magic-link actions with validated redirect paths limited to the application origin.

- [ ] **Step 6: Run database and web tests**

Run:

```bash
supabase db reset
supabase test db
pnpm --filter web test
pnpm --filter web typecheck
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase apps/web/src/lib/supabase apps/web/src/features/auth \
  'apps/web/src/app/(auth)' apps/web/src/app/auth apps/web/src/proxy.ts
git commit -m "feat: add authenticated tenant foundation"
```

---

### Task 4: Build Organization Onboarding and Invitations

**Files:**
- Create: `supabase/migrations/202607240003_invitations.sql`
- Create: `apps/web/src/features/workspaces/schemas.ts`
- Create: `apps/web/src/features/workspaces/actions.ts`
- Create: `apps/web/src/features/workspaces/invitation-email.ts`
- Create: `apps/web/src/features/workspaces/actions.test.ts`
- Create: `apps/web/src/app/(app)/onboarding/page.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/layout.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/settings/members/page.tsx`
- Create: `apps/web/src/app/invitations/[token]/page.tsx`

**Interfaces:**
- Consumes: authenticated Supabase user.
- Produces: `createOrganization({ name, productName })`, `inviteMember({ organizationId, email })`, and `acceptInvitation(token)` server actions.

- [ ] **Step 1: Write action tests**

```ts
it("creates an organization, admin membership, and default product atomically", async () => {
  const result = await createOrganization({
    name: "Northstar",
    productName: "Mobile app",
  });
  expect(result).toMatchObject({ organizationName: "Northstar" });
  expect(await membershipsFor(result.organizationId)).toHaveLength(1);
  expect(await productsFor(result.organizationId)).toHaveLength(1);
});

it("prevents a member from inviting another member", async () => {
  await expect(
    inviteMember({ organizationId, email: "new@example.com" }),
  ).rejects.toThrow("Only organization admins can invite members");
});
```

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter web test -- workspaces/actions.test.ts`

Expected: FAIL because the actions are undefined.

- [ ] **Step 3: Add invitation storage**

Store only a SHA-256 hash of a 32-byte random invitation token. Include `organization_id`, normalized `email`, `invited_by`, `expires_at`, `accepted_at`, and `created_at`. Add an admin-only RPC to create invitations and an authenticated RPC to accept a matching unexpired invitation.

- [ ] **Step 4: Implement actions with Zod validation**

```ts
export const OrganizationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  productName: z.string().trim().min(1).max(120),
});

export const InviteInputSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
});
```

Use a database function for organization + membership + product creation so partial onboarding cannot occur.

- [ ] **Step 5: Send the invitation email after durable token creation**

Run `pnpm --filter web add resend`, then add:

```ts
export async function sendInvitationEmail(input: {
  to: string;
  organizationName: string;
  invitedByName: string;
  acceptUrl: string;
}) {
  await resend.emails.send({
    from: process.env.INVITATION_FROM_EMAIL!,
    to: input.to,
    subject: `Join ${input.organizationName} on Meld`,
    text: `${input.invitedByName} invited you to ${input.organizationName}. Accept: ${input.acceptUrl}`,
  });
}
```

Add `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` to `.env.example`. If delivery fails, keep the invitation valid, show the admin a retry action, and never create a second token unless they explicitly revoke the first.

- [ ] **Step 6: Build onboarding and member-management UI**

Run:

```bash
pnpm exec astryx build "small-team organization onboarding, product setup, invitations, and member management"
pnpm exec astryx component FormLayout
pnpm exec astryx component Table
pnpm exec astryx component StatusDot
pnpm exec astryx component Button
```

The onboarding form must show field errors, submission state, and retryable server errors. The members page must show member role, invitation state, expiration, and revoke controls for admins.

- [ ] **Step 7: Run tests and Playwright onboarding smoke test**

Run:

```bash
pnpm --filter web test -- workspaces
pnpm exec playwright test e2e/onboarding.spec.ts
```

Expected: PASS, including a user creating a workspace and accepting an invitation in a second browser context.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607240003_invitations.sql apps/web e2e
git commit -m "feat: add workspace onboarding and invitations"
```

---

### Task 5: Build Realtime Discovery Rooms

**Files:**
- Create: `supabase/migrations/202607240004_discovery.sql`
- Create: `supabase/tests/discovery_access.test.sql`
- Create: `apps/web/src/features/discovery/schemas.ts`
- Create: `apps/web/src/features/discovery/repository.ts`
- Create: `apps/web/src/features/discovery/actions.ts`
- Create: `apps/web/src/features/discovery/components/room-list.tsx`
- Create: `apps/web/src/features/discovery/components/conversation.tsx`
- Create: `apps/web/src/features/discovery/components/composer.tsx`
- Create: `apps/web/src/features/discovery/components/attachment-upload.tsx`
- Create: `apps/web/src/features/discovery/attachment-extractor.ts`
- Create: `apps/web/src/features/discovery/attachment-extractor.test.ts`
- Create: `apps/web/src/app/(app)/[organizationId]/discovery/page.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
- Test: `apps/web/src/features/discovery/*.test.tsx`
- Test: `e2e/discovery-room.spec.ts`

**Interfaces:**
- Consumes: organization membership and Supabase Realtime.
- Produces: `createDiscoveryRoom`, `postMessage`, `addRoomParticipant`, `addEvidence`, and attachment upload actions.

- [ ] **Step 1: Write room-access and message tests**

```sql
select throws_ok(
  $$ insert into messages (room_id, author_id, body)
     values ('20000000-0000-0000-0000-000000000001', auth.uid(), 'intrusion') $$,
  '42501',
  null,
  'non-participant cannot post'
);
```

```tsx
it("adds an optimistic message and reconciles the persisted event", async () => {
  render(<Conversation roomId={roomId} initialMessages={[]} />);
  await user.type(screen.getByRole("textbox"), "Customer interviews disagree");
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByText("Customer interviews disagree")).toBeVisible();
  await emitPersistedMessage({ clientId: expect.any(String) });
  expect(screen.getAllByText("Customer interviews disagree")).toHaveLength(1);
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
supabase test db supabase/tests/discovery_access.test.sql
pnpm --filter web test -- discovery
```

Expected: FAIL because Discovery Room storage and components do not exist.

- [ ] **Step 3: Add Discovery Room schema and RLS**

Create `discovery_rooms`, `room_participants`, `messages`, `mentions`, `attachments`, `evidence`, and `decisions`. A room owner is always a participant with edit access. Members must be explicit room participants to read or write room content.

Publish `messages`, `mentions`, and `decisions` through Supabase Realtime. Use private channels named `room:<uuid>` and authorize them with room-participant RLS.

- [ ] **Step 4: Implement repositories and validated actions**

```ts
export const MessageInputSchema = z.object({
  roomId: z.string().uuid(),
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(20_000),
  mentionedUserIds: z.array(z.string().uuid()).max(20),
  mentionsProductAgent: z.boolean(),
});
```

The repository must derive `author_id` from the authenticated session and never accept it from input.

- [ ] **Step 5: Implement the conversation UI**

Run:

```bash
pnpm exec astryx build "realtime product Discovery Room with room list, shared conversation, Product Agent mention, attachments, evidence, and decisions"
pnpm exec astryx template ai-chat --skeleton
pnpm exec astryx component List
pnpm exec astryx component Item
pnpm exec astryx component Token
```

Support room list, room creation, participants, messages, explicit `@Product Agent` mentions, attachments, evidence, and decisions. The Product Agent mention remains disabled with the explanation `Connect personal AI to use the Product Agent` until Task 10.

- [ ] **Step 6: Extract safe attachment text for AI context**

Run `pnpm --filter web add unpdf`.

Accept UTF-8 plain text, Markdown, and PDF up to 10 MB. Store the original in a private Supabase bucket and extracted text separately; reject password-protected PDFs and truncate normalized extraction at 100,000 characters. Images remain viewable evidence but require a user caption to contribute text context in the MVP.

```ts
export async function extractAttachmentText(input: {
  mimeType: string;
  bytes: Uint8Array;
}): Promise<string | null> {
  if (["text/plain", "text/markdown"].includes(input.mimeType)) {
    return normalizeText(new TextDecoder("utf-8", { fatal: true }).decode(input.bytes))
      .slice(0, 100_000);
  }
  if (input.mimeType === "application/pdf") {
    return normalizeText(await extractPdfText(input.bytes)).slice(0, 100_000);
  }
  return null;
}
```

Extraction status is `pending`, `ready`, `unsupported`, or `failed`. AI task creation includes only `ready` text and user captions; it never sends raw file URLs to a provider client.

- [ ] **Step 7: Run unit, database, and E2E tests**

Run:

```bash
supabase db reset
supabase test db
pnpm --filter web test -- discovery
pnpm exec playwright test e2e/discovery-room.spec.ts
```

Expected: two browser contexts exchange messages in realtime; an unrelated user cannot subscribe or post.

- [ ] **Step 8: Commit**

```bash
git add supabase apps/web/src/features/discovery \
  'apps/web/src/app/(app)/[organizationId]/discovery' e2e/discovery-room.spec.ts
git commit -m "feat: add collaborative Discovery Rooms"
```

---

### Task 6: Implement Durable AI Tasks and the Device Gateway

**Files:**
- Create: `supabase/migrations/202607240005_ai_tasks.sql`
- Create: `supabase/tests/ai_task_transitions.test.sql`
- Create: `apps/web/src/features/ai/task-service.ts`
- Create: `apps/web/src/features/ai/task-service.test.ts`
- Create: `apps/web/src/app/api/ai/tasks/route.ts`
- Create: `apps/web/src/app/api/ai/tasks/[taskId]/cancel/route.ts`
- Create: `apps/gateway/src/auth/device-auth.ts`
- Create: `apps/gateway/src/auth/device-auth.test.ts`
- Create: `apps/gateway/src/tasks/task-repository.ts`
- Create: `apps/gateway/src/tasks/task-repository.test.ts`
- Create: `apps/gateway/src/ws/device-session.ts`
- Create: `apps/gateway/src/ws/protocol-handler.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `packages/contracts/src/ws.ts`

**Interfaces:**
- Consumes: shared AI and WebSocket schemas from `@meld/contracts`.
- Produces: `createAITask(input, authenticatedUserId)`, `claimTask(taskId, deviceId)`, `appendTaskEvent`, and `completeTask`.

- [ ] **Step 1: Write state-machine tests**

```sql
select lives_ok(
  $$ select transition_ai_task(
      '30000000-0000-0000-0000-000000000001',
      'waiting_for_device',
      'queued'
  ) $$,
  'queued task can wait for a device'
);

select throws_ok(
  $$ select transition_ai_task(
      '30000000-0000-0000-0000-000000000001',
      'completed',
      'waiting_for_device'
  ) $$,
  'P0001',
  'invalid_ai_task_transition',
  'task cannot skip execution'
);
```

```ts
it("refuses a device token belonging to another user", async () => {
  await expect(
    claimTask({ taskId, deviceId: otherUsersDeviceId }),
  ).rejects.toThrow("Task and device owners do not match");
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
supabase test db supabase/tests/ai_task_transitions.test.sql
pnpm --filter gateway test
```

Expected: FAIL because storage and gateway handlers do not exist.

- [ ] **Step 3: Add task, event, connection, and device tables**

Create:

- `ai_connections(user_id, default_provider, codex_connected, claude_connected)`
- `execution_devices(user_id, name, platform, token_hash, status, last_seen_at, revoked_at, connector_version)`
- `ai_tasks(initiating_user_id, organization_id, room_id, device_id, provider, kind, status, context_manifest_json, context_revision, result_json, error_code, cancelled_at)`
- `ai_task_events(task_id, sequence, type, payload_json, created_at)`

Add a database transition function containing the complete allowed transition map. Device token hashes use SHA-256; plaintext tokens never enter the database.

- [ ] **Step 4: Implement room-scoped task creation**

```ts
export type CreateAITaskInput = {
  roomId: string;
  provider: Provider;
  deviceId: string;
  kind: AITaskKind;
  instruction: string;
  currentPrdVersionId?: string;
};

export async function createAITask(
  input: CreateAITaskInput,
  authenticatedUserId: string,
): Promise<AITask> {
  const manifest = await buildAuthorizedRoomContextManifest(
    input.roomId,
    authenticatedUserId,
    input.currentPrdVersionId,
  );
  return taskRepository.insert({
    ...input,
    initiatingUserId: authenticatedUserId,
    organizationId: manifest.organizationId,
    contextManifest: manifest,
    status: "queued",
  });
}
```

The manifest stores authorized message IDs, attachment IDs, evidence IDs, decision IDs, and selected PRD version—not signed URLs or copied room bodies. During claim, `hydrateAuthorizedRoomContext(taskId, deviceUserId)` must revalidate current access, fetch exactly those records, include only validated extracted attachment text plus user captions, and produce `AIContextPackageSchema`. Provider clients never receive storage URLs. If access changed, transition to `failed` with `permission_changed` before any context reaches the device.

- [ ] **Step 5: Implement gateway authentication and claiming**

Require `Authorization: Device <deviceId>.<secret>` during WebSocket upgrade. Hash the secret, compare in constant time, reject revoked devices, and update `last_seen_at`.

Claim tasks with `SELECT ... FOR UPDATE SKIP LOCKED`, matching both `device_id` and `initiating_user_id`.

- [ ] **Step 6: Implement the protocol**

Server-to-device messages:

```ts
type ServerToDeviceMessage =
  | { type: "task.available"; taskId: string }
  | {
      type: "task.payload";
      taskId: string;
      provider: Provider;
      context: AIContextPackage;
    }
  | { type: "task.cancel"; taskId: string }
  | { type: "task.event_ack"; taskId: string; sequence: number }
  | { type: "session.accepted"; heartbeatSeconds: number };
```

Device-to-server messages:

```ts
type DeviceToServerMessage =
  | { type: "task.claim"; taskId: string }
  | { type: "provider.status"; providers: ProviderStatus[] }
  | { type: "task.event"; taskId: string; sequence: number; event: TaskEvent }
  | { type: "task.complete"; taskId: string; result: AIResultEnvelope }
  | { type: "task.cancelled"; taskId: string }
  | { type: "task.fail"; taskId: string; code: TaskErrorCode; message: string }
  | { type: "heartbeat"; connectorVersion: string };
```

Validate every frame with Zod and enforce monotonically increasing event sequences.
After `task.claim`, hydrate and revalidate the manifest, transition the task to
`running`, then send exactly one `task.payload`. A claim that fails revalidation
returns a typed failure and no context.

- [ ] **Step 7: Run state, race, and reconnect tests**

Run:

```bash
supabase db reset
supabase test db
pnpm --filter gateway test
pnpm --filter web test -- ai/task-service
```

Expected: only one device claims a task; reconnect resumes event sequence; cancellation cannot complete.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607240005_ai_tasks.sql \
  supabase/tests/ai_task_transitions.test.sql apps/web/src/features/ai \
  apps/web/src/app/api/ai apps/gateway
git commit -m "feat: add durable personal AI task routing"
```

---

### Task 7: Build Node-Free Bootstrap, Pairing, and the Persistent Connector

**Files:**
- Create: `supabase/migrations/202607240006_device_pairing.sql`
- Create: `apps/web/src/app/api/devices/pairing-codes/route.ts`
- Create: `apps/web/src/app/api/devices/pair/route.ts`
- Create: `apps/web/src/features/ai/components/connect-device.tsx`
- Create: `apps/web/src/features/ai/components/device-list.tsx`
- Create: `apps/connector/package.json`
- Create: `apps/connector/tsconfig.json`
- Create: `apps/connector/install/install.sh`
- Create: `apps/connector/src/config/paths.ts`
- Create: `apps/connector/src/pairing/pairing-client.ts`
- Create: `apps/connector/src/pairing/keychain-store.ts`
- Create: `apps/connector/src/launchd/launch-agent.ts`
- Create: `apps/connector/src/transport/gateway-client.ts`
- Create: `apps/connector/src/agent.ts`
- Create: `apps/connector/src/cli.ts`
- Test: `apps/connector/test/install.test.sh`
- Test: `apps/connector/test/pairing-client.test.ts`
- Test: `apps/connector/test/launch-agent.test.ts`
- Test: `apps/connector/test/gateway-client.test.ts`

**Interfaces:**
- Consumes: `POST /api/devices/pairing-codes`, `POST /api/devices/pair`, and the Task 6 WebSocket protocol.
- Produces: `PairingClient.pair(code)`, `KeychainStore`, `renderLaunchAgent(paths)`, `GatewayClient`, the local control commands, and a paired revocable device that reconnects without an open terminal.

- [ ] **Step 1: Write path, pairing, and LaunchAgent tests**

Create the connector package before adding tests:

```json
{
  "name": "@meld/connector",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "esbuild src/agent.ts src/cli.ts --bundle --platform=node --format=esm --outdir=dist --out-extension:.js=.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@meld/contracts": "workspace:*",
    "ws": "^8.18.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.18.0",
    "esbuild": "^0.25.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

```ts
// apps/connector/test/launch-agent.test.ts
import { describe, expect, it } from "vitest";
import { connectorPaths } from "../src/config/paths";
import { renderLaunchAgent } from "../src/launchd/launch-agent";

describe("LaunchAgent", () => {
  it("uses only Meld-owned absolute paths and restarts after Terminal closes", () => {
    const paths = connectorPaths("/Users/ada");
    const plist = renderLaunchAgent(paths);

    expect(plist).toContain(
      "/Users/ada/Library/Application Support/Meld/runtime/current/bin/node",
    );
    expect(plist).toContain(
      "/Users/ada/Library/Application Support/Meld/connector/current/dist/agent.mjs",
    );
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
    expect(plist).toContain("<key>KeepAlive</key><true/>");
    expect(plist).not.toContain("/usr/local");
    expect(plist).not.toContain("/opt/homebrew");
  });
});
```

```ts
// apps/connector/test/pairing-client.test.ts
it("stores the returned device token and never returns it to callers", async () => {
  const store = new MemoryCredentialStore();
  const client = new PairingClient({
    transport: new FakePairingTransport({
      deviceId: "40000000-0000-0000-0000-000000000001",
      deviceToken: "dt_secret",
    }),
    credentialStore: store,
  });

  await expect(client.pair("ABCD-EFGH")).resolves.toEqual({
    deviceId: "40000000-0000-0000-0000-000000000001",
  });
  expect(store.saved).toEqual({
    deviceId: "40000000-0000-0000-0000-000000000001",
    deviceToken: "dt_secret",
  });
});
```

- [ ] **Step 2: Verify connector tests fail**

Run:

```bash
pnpm --filter @meld/connector test
bash apps/connector/test/install.test.sh
```

Expected: FAIL because the connector package and installer do not exist.

- [ ] **Step 3: Implement single-use pairing and Astryx onboarding**

Pairing codes are eight Crockford Base32 characters, expire after ten minutes, are stored as SHA-256 hashes, and may be redeemed once. Redemption creates a device ID and 32-byte device secret; the API returns the plaintext secret once and stores only its hash.

The onboarding page displays this exact command with the live code:

```sh
curl -fsSL https://get.meld.app/install.sh | sh -s -- --pair ABCD-EFGH
```

Before writing the page, run:

```bash
pnpm exec astryx build "connector setup page with copyable terminal command, installation progress, provider connection status, and troubleshooting"
pnpm exec astryx component CodeBlock
pnpm exec astryx component StatusDot
pnpm exec astryx component Button
pnpm exec astryx component Banner
```

Use the resulting components, `AppFrame`, and the Neutral theme. The page says that Node, npx, Homebrew, Xcode, `sudo`, and an open Terminal are not required. It never instructs the user to install a developer dependency.

- [ ] **Step 4: Implement deterministic private paths**

```ts
// apps/connector/src/config/paths.ts
import { join } from "node:path";

export function connectorPaths(home: string) {
  const root = join(home, "Library", "Application Support", "Meld");
  const runtime = join(root, "runtime");
  const connector = join(root, "connector");
  const logs = join(home, "Library", "Logs", "Meld");
  return {
    root,
    bin: join(root, "bin"),
    runtime,
    connector,
    providers: join(root, "providers"),
    state: join(root, "state"),
    tasks: join(root, "tasks"),
    logs,
    cache: join(home, "Library", "Caches", "Meld"),
    runtimeNode: join(runtime, "current", "bin", "node"),
    agentEntry: join(connector, "current", "dist", "agent.mjs"),
    stdoutLog: join(logs, "connector.log"),
    stderrLog: join(logs, "connector.error.log"),
    launchAgent: join(
      home,
      "Library",
      "LaunchAgents",
      "com.meld.connector.plist",
    ),
  } as const;
}

export type ConnectorPaths = ReturnType<typeof connectorPaths>;
```

Create directories with mode `0700`; connector state files use `0600`. Do not resolve the runtime from the shell `PATH`.

- [ ] **Step 5: Implement the Node-free bootstrap**

Pin `CONNECTOR_VERSION=0.1.0` and `NODE_VERSION=22.17.0`. The installer detects only `Darwin` plus `arm64` or `x86_64`; every other platform exits before writing files.

```sh
#!/bin/sh
set -eu

CONNECTOR_VERSION="0.1.0"
NODE_VERSION="22.17.0"
MELD_ROOT="${HOME}/Library/Application Support/Meld"
MELD_CACHE="${HOME}/Library/Caches/Meld"
INSTALL_TMP="$(mktemp -d "${TMPDIR:-/tmp}/meld-install.XXXXXX")"
trap 'rm -rf "$INSTALL_TMP"' EXIT HUP INT TERM

case "$(uname -s):$(uname -m)" in
  Darwin:arm64) NODE_ARCH="darwin-arm64" ;;
  Darwin:x86_64) NODE_ARCH="darwin-x64" ;;
  *) printf '%s\n' "Meld currently supports macOS only." >&2; exit 1 ;;
esac

mkdir -p -m 700 "$MELD_ROOT" "$MELD_CACHE"
NODE_FILE="node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
curl --proto '=https' --tlsv1.2 -fsSLo "$INSTALL_TMP/$NODE_FILE" \
  "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILE}"
curl --proto '=https' --tlsv1.2 -fsSLo "$INSTALL_TMP/SHASUMS256.txt" \
  "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
(cd "$INSTALL_TMP" && grep "  ${NODE_FILE}$" SHASUMS256.txt | shasum -a 256 -c -)
```

Continue by downloading `meld-connector-0.1.0.tar.gz` and `checksums.txt` from `https://releases.meld.app/connector/v0.1.0/`, verifying with `shasum -a 256 -c -`, and extracting into new version directories. Never execute an unverified downloaded artifact.

After `node dist/cli.mjs doctor --pre-activate` passes, atomically replace the `runtime/current` and `connector/current` symlinks. Preserve the previously active versions until the new agent completes one healthy gateway heartbeat.

- [ ] **Step 6: Store the device credential in macOS Keychain**

```ts
export interface CredentialStore {
  save(credential: DeviceCredential): Promise<void>;
  load(): Promise<DeviceCredential | null>;
  delete(): Promise<void>;
}

export class KeychainStore implements CredentialStore {
  readonly service = "com.meld.connector.device";
  // Invoke /usr/bin/security with shell:false; redact argv and stdio from logs.
}
```

Use `/usr/bin/security add-generic-password`, `find-generic-password`, and `delete-generic-password` with service `com.meld.connector.device`. Pass child-process arguments as an array with `shell: false`; never construct a shell command or log the secret. Pairing response bodies must not be written to disk.

- [ ] **Step 7: Register and start the per-user LaunchAgent**

`renderLaunchAgent()` builds the property list from escaped absolute paths:

```ts
function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

export function renderLaunchAgent(paths: ConnectorPaths): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.meld.connector</string>
  <key>ProgramArguments</key><array>
    <string>${escapeXml(paths.runtimeNode)}</string>
    <string>${escapeXml(paths.agentEntry)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${escapeXml(paths.stdoutLog)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(paths.stderrLog)}</string>
</dict></plist>`;
}
```

Render escaped absolute paths, write the plist atomically, validate it with `plutil -lint`, then run:

```sh
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.meld.connector.plist" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.meld.connector.plist"
launchctl kickstart -k "gui/$(id -u)/com.meld.connector"
```

The installer waits up to 20 seconds for `state/health.json` to report the installed version and paired device ID. It then exits successfully; the agent remains owned by `launchd`.

- [ ] **Step 8: Implement reconnect, local controls, and revocation**

`GatewayClient` uses exponential backoff capped at 60 seconds, full jitter, heartbeat timeout, network-change wake-up, and abort signals. It never logs authorization headers or context bodies.

`dist/cli.mjs` supports:

```text
meld status
meld pause
meld resume
meld update
meld doctor
meld uninstall
```

Install the wrapper at `~/Library/Application Support/Meld/bin/meld` without changing `PATH`. The web app remains the normal pause, update, and revoke surface. `uninstall` performs `launchctl bootout`, deletes the Keychain item and LaunchAgent, removes Meld's application-support/cache/log directories, and leaves provider-owned credentials untouched.

Revoking a device sets `revoked_at`; the next heartbeat closes the session. The connector deletes its device credential, records `unpaired` in health state, and stops claiming tasks.

- [ ] **Step 9: Run installer, pairing, persistence, and revocation tests**

Run:

```bash
pnpm --filter @meld/connector test
bash apps/connector/test/install.test.sh
pnpm --filter web test -- devices
pnpm --filter gateway test -- device
```

Expected: the installer works with a fake empty `PATH`; pairing is single-use; the plist uses only private absolute paths; the service survives the invoking shell; revoked credentials cannot reconnect; uninstall removes only Meld-owned paths.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/202607240006_device_pairing.sql \
  apps/web/src/app/api/devices apps/web/src/features/ai/components \
  apps/connector pnpm-lock.yaml
git commit -m "feat: add Node-free persistent connector setup"
```

---

### Task 8: Implement Managed Codex and Claude Adapters

**Files:**
- Create: `apps/connector/src/providers/provider-adapter.ts`
- Create: `apps/connector/src/providers/process-runner.ts`
- Create: `apps/connector/src/providers/provider-releases.ts`
- Create: `apps/connector/src/providers/provider-installer.ts`
- Create: `apps/connector/src/providers/provider-detector.ts`
- Create: `apps/connector/src/providers/provider-error.ts`
- Create: `apps/connector/src/providers/codex-adapter.ts`
- Create: `apps/connector/src/providers/claude-adapter.ts`
- Create: `apps/connector/src/security/child-environment.ts`
- Create: `apps/connector/src/security/task-workspace.ts`
- Create: `apps/connector/src/tasks/task-executor.ts`
- Test: `apps/connector/test/provider-installer.test.ts`
- Test: `apps/connector/test/codex-adapter.test.ts`
- Test: `apps/connector/test/claude-adapter.test.ts`
- Test: `apps/connector/test/task-executor.test.ts`
- Modify: `apps/gateway/src/ws/protocol-handler.ts`
- Modify: `apps/gateway/src/tasks/task-repository.ts`
- Test: `apps/gateway/src/ws/provider-status.test.ts`

**Interfaces:**
- Consumes: `AIContextPackage`, provider selection, the private runtime from Task 7, and the approved exact provider releases recorded by Task 1.
- Produces: `ProviderInstaller.install(provider)`, `ProviderDetector.detectAll()`, and `ProviderAdapter.run(context, workspace, signal): AsyncIterable<ProviderEvent>`.

- [ ] **Step 1: Define the adapter and process contracts**

```ts
export type ProviderEvent =
  | { type: "started" }
  | { type: "text_delta"; text: string }
  | { type: "usage_notice"; message: string }
  | { type: "authentication_required" }
  | { type: "limit_reached"; message: string }
  | { type: "completed"; result: AIResultEnvelope };

export interface ProviderAdapter {
  readonly kind: Provider;
  authenticationStatus(): Promise<AuthenticationStatus>;
  run(
    context: AIContextPackage,
    workspace: string,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
}

export interface ProcessRunner {
  stream(input: {
    executable: string;
    args: readonly string[];
    env: Readonly<Record<string, string>>;
    cwd: string;
    signal: AbortSignal;
  }): AsyncIterable<{ stream: "stdout" | "stderr"; line: string }>;
}
```

- [ ] **Step 2: Write installation and invocation tests**

```ts
it("installs a pinned provider with Meld's npm and no global prefix", async () => {
  await installer.install("codex");
  expect(processRunner.lastInvocation).toMatchObject({
    executable: paths.runtimeNpm,
    args: [
      "install",
      "--ignore-scripts=false",
      "--prefix",
      paths.providerVersion("codex", releases.codex.version),
      `${releases.codex.package}@${releases.codex.version}`,
    ],
  });
  expect(processRunner.lastInvocation?.args).not.toContain("-g");
});

it("removes API billing variables from Codex", () => {
  const invocation = codex.makeInvocation(context, workspace);
  expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
  expect(invocation.env.CODEX_ACCESS_TOKEN).toBeUndefined();
});

it("removes API billing variables and tools from Claude", () => {
  const invocation = claude.makeInvocation(context, workspace);
  expect(invocation.env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(invocation.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  expect(invocation.args).toContain("--disallowedTools");
});
```

- [ ] **Step 3: Verify tests fail**

Run:

```bash
pnpm --filter @meld/connector test -- providers
```

Expected: FAIL because the provider contracts and adapters do not exist.

- [ ] **Step 4: Define exact managed releases and installation consent**

`provider-releases.ts` exports a schema-validated release object whose exact semver values come from the Go rows committed in `docs/provider-compatibility.md`:

```ts
export const ProviderReleaseSchema = z.object({
  package: z.enum(["@openai/codex", "@anthropic-ai/claude-code"]),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  integrity: z.string().startsWith("sha512-"),
  minimumSupportedVersion: z.string(),
});
```

No value may be `latest`, a range, or an unpinned Git URL. Before installing, the web UI names the provider, destination, approximate download size, authentication step, and uninstall behavior. Installation begins only after the user presses **Install for me**.

Use Meld's private `npm` executable with a Meld-owned cache and prefix. Verify the package-lock integrity against the committed release record, atomically activate the new provider version, and preserve the prior version until detection and `--version` checks pass.

- [ ] **Step 5: Implement child-environment allowlisting**

Build the child environment from an empty object. Include only `HOME`, Meld's provider-specific binary path, `TMPDIR`, `LANG`, `LC_ALL`, and provider-specific isolated configuration paths established by Task 1. Exclude variables matching `*_API_KEY`, `*_AUTH_TOKEN`, `CODEX_ACCESS_TOKEN`, AWS, GCP, Azure, Bedrock, Vertex, and unapproved proxy overrides.

The provider `PATH` is:

```ts
const path = [
  paths.providerBin(provider),
  "/usr/bin",
  "/bin",
].join(":");
```

It never includes a system npm global directory or teammate-controlled workspace path.

- [ ] **Step 6: Implement isolated task workspaces**

Create `~/Library/Application Support/Meld/tasks/<task-id>/` with mode `0700`, write only `context.json` and adapter configuration, and delete it on completion or cancellation. On startup, delete abandoned task directories older than 24 hours. Reject any resolved workspace path that is not a direct child of the Meld tasks directory.

- [ ] **Step 7: Implement Codex and Claude adapters**

Match the exact invocations proven in Task 1. Codex parses JSONL; Claude parses stream JSON in plan/content-only mode with denied tools. Both adapters:

- provide room content through the isolated task workspace or stdin only
- reject tool, command, filesystem, MCP, and web-search events as `security_boundary_violated`
- validate the final result against the task-specific Zod schema
- map signed-out and subscription-limit responses to typed states
- never offer an API key or paid API fallback

- [ ] **Step 8: Implement provider detection and visible login**

```ts
export type ProviderInstallation = {
  provider: Provider;
  source: "managed" | "existing";
  executable: string | null;
  version: string | null;
  authentication: "authenticated" | "signed_out" | "unknown";
  compatibility: "supported" | "outdated" | "unavailable";
};
```

Prefer a healthy managed installation. An existing compatible CLI may be used only after the user explicitly chooses it and detection resolves an absolute executable path; never depend on shell aliases.

For Codex, start `codex login`; for Claude, start the provider's documented subscription login flow. Write the selected command to `~/Library/Application Support/Meld/state/provider-login.command`, open it in a visible Terminal window with `/usr/bin/open -a Terminal`, make the file mode `0700`, include no secrets, and delete it after completion. Meld never accepts provider passwords or reads provider credential files.

- [ ] **Step 9: Publish provider capability without credentials**

After connection and every provider change, send:

```ts
gateway.send({
  type: "provider.status",
  providers: installations.map((installation) => ({
    provider: installation.provider,
    version: installation.version,
    authentication: installation.authentication,
    compatibility: installation.compatibility,
  })),
});
```

The gateway stores no executable path, credential path, token, environment value, or provider response body. The web picker offers only providers reported as authenticated and supported.

- [ ] **Step 10: Run adapter, installation, and sentinel tests**

Run:

```bash
pnpm --filter @meld/connector test
pnpm --filter gateway test -- provider-status
bash spikes/provider-adapters/smoke-test.sh
```

Expected: managed installs remain private and pinned; unit tests PASS; both authenticated live adapters satisfy the Task 1 content-only gate.

- [ ] **Step 11: Commit**

```bash
git add apps/connector/src apps/connector/test \
  apps/gateway/src/ws apps/gateway/src/tasks docs/provider-compatibility.md
git commit -m "feat: add managed subscription provider adapters"
```

---

### Task 9: Execute, Queue, Cancel, and Resume Connector Tasks

**Files:**
- Modify: `apps/connector/src/transport/gateway-client.ts`
- Modify: `apps/connector/src/tasks/task-executor.ts`
- Create: `apps/connector/src/tasks/task-coordinator.ts`
- Create: `apps/connector/src/tasks/task-state-store.ts`
- Test: `apps/connector/test/task-coordinator.test.ts`
- Modify: `apps/gateway/src/ws/protocol-handler.ts`
- Test: `apps/gateway/src/ws/protocol-handler.test.ts`
- Create: `apps/web/src/features/ai/components/task-status.tsx`
- Test: `apps/web/src/features/ai/components/task-status.test.tsx`

**Interfaces:**
- Consumes: Task 6 protocol and Task 8 provider adapters.
- Produces: `TaskCoordinator.accept(message)`, resumable acknowledged events, cancellation, partial-result recovery, and exact user-visible task states.

- [ ] **Step 1: Write reconnection and cancellation tests**

```ts
it("resends only events that the gateway has not acknowledged", async () => {
  const store = new MemoryTaskStateStore({ lastAcknowledgedSequence: 2 });
  const coordinator = createCoordinator({
    store,
    providerEvents: [
      { sequence: 1, text: "old" },
      { sequence: 2, text: "acked" },
      { sequence: 3, text: "new" },
    ],
  });

  await expect(coordinator.resume(taskId)).resolves.toEqual([
    expect.objectContaining({ sequence: 3 }),
  ]);
});

it("aborts the provider and reports cancellation", async () => {
  await coordinator.cancel(taskId);
  expect(provider.abortSignal.aborted).toBe(true);
  expect(gateway.lastMessage).toEqual({ type: "task.cancelled", taskId });
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
pnpm --filter @meld/connector test -- task-coordinator
```

Expected: FAIL because `TaskCoordinator` does not exist.

- [ ] **Step 3: Implement local task coordination**

Persist only task ID, provider, state, buffered event sequence, and last acknowledged sequence in `state/tasks.json` with mode `0600`. Do not persist room context or generated text outside the task workspace.

Allow one running task per provider per device for the MVP. Keep additional tasks server-side in `waiting_for_device`. A connector restart loads the cursor, reconnects, and asks the gateway for the authoritative task state before resuming.

- [ ] **Step 4: Implement server acknowledgements and idempotency**

After transactionally persisting each unique `(task_id, sequence)` event, return:

```json
{
  "type": "task.event_ack",
  "taskId": "00000000-0000-0000-0000-000000000001",
  "sequence": 3
}
```

Duplicate sequences return the same acknowledgement without duplicating text. The connector deletes a buffered event only after its acknowledgement.

- [ ] **Step 5: Implement cancellation and partial results**

Cancellation aborts the child process, waits five seconds, sends `SIGKILL` if necessary, emits `task.cancelled`, and deletes the workspace. If a provider exits after text but before a valid result, emit a partial-result event and mark the task `failed`; the web UI offers **Keep partial draft**, **Retry**, and **Discard**.

- [ ] **Step 6: Implement Astryx task and connector status**

Before editing the UI, run:

```bash
pnpm exec astryx build "AI task status with queued offline running reauthentication usage limit review completed cancelled and failed states"
pnpm exec astryx component StatusDot
pnpm exec astryx component Banner
pnpm exec astryx component Button
pnpm exec astryx component Token
```

Map every contract state to visible text and allowed actions. Use `StatusDot` plus text for state, `Banner` for persistent failures, `Token` for provider/device metadata, and buttons for explicit actions. Never display **Retry with API**, hide an offline state, or select another provider automatically.

- [ ] **Step 7: Run connector and gateway integration tests**

Run:

```bash
pnpm --filter @meld/connector test
pnpm --filter gateway test
pnpm --filter web test -- task-status
```

Expected: queued tasks survive gateway and connector restarts; reconnect does not duplicate text; cancellation stops local execution; Terminal closure does not affect the LaunchAgent-owned process.

- [ ] **Step 8: Commit**

```bash
git add apps/connector apps/gateway apps/web/src/features/ai/components
git commit -m "feat: make personal AI tasks resumable"
```

---

### Task 10: Add the Mention-Triggered Product Agent

**Files:**
- Create: `packages/contracts/src/agent.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/web/src/features/ai/product-agent-prompt.ts`
- Create: `apps/web/src/features/ai/product-agent-prompt.test.ts`
- Create: `apps/web/src/features/ai/create-room-reply-task.ts`
- Modify: `apps/web/src/features/discovery/actions.ts`
- Modify: `apps/web/src/features/discovery/components/composer.tsx`
- Modify: `apps/web/src/features/discovery/components/conversation.tsx`
- Create: `apps/web/src/features/ai/components/provider-picker.tsx`
- Create: `apps/web/src/features/ai/provider-preferences.ts`
- Create: `apps/web/src/features/ai/provider-preferences.test.ts`
- Test: `e2e/product-agent.spec.ts`

**Interfaces:**
- Consumes: explicit `mentionsProductAgent`, user's default provider/device, room-scoped task creation, and `room_reply` results.
- Produces: a shared agent message with provenance linking it to its initiating user, provider, task, and source messages.

- [ ] **Step 1: Write prompt and trigger tests**

```ts
it("does not create a task for an ordinary message", async () => {
  await postMessage({ ...message, mentionsProductAgent: false });
  expect(taskRepository.insert).not.toHaveBeenCalled();
});

it("creates one user-owned task for an explicit Product Agent mention", async () => {
  await postMessage({ ...message, mentionsProductAgent: true });
  expect(taskRepository.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      initiatingUserId: signedInUserId,
      kind: "room_reply",
    }),
  );
});
```

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter web test -- product-agent`

Expected: FAIL because mention handling is not connected to task creation.

- [ ] **Step 3: Define the room-reply result**

```ts
export const RoomReplyResultSchema = z.object({
  response: z.string().min(1),
  citedMessageIds: z.array(z.string().uuid()),
  assumptions: z.array(z.string()),
  suggestedNextQuestions: z.array(z.string()).max(5),
});
```

- [ ] **Step 4: Build the Product Agent prompt**

The system prompt must say:

```text
You are the Product Agent in a shared Discovery Room.
Respond only from the supplied room context.
Label unsupported conclusions as assumptions.
Ask concise questions that improve the product decision.
Do not claim that a decision is approved.
Return only JSON matching the supplied response schema.
```

Include message IDs in the context so the agent can cite sources.

- [ ] **Step 5: Connect explicit mentions to task creation**

Before editing the composer and provider picker, run:

```bash
pnpm exec astryx build "Discovery Room Product Agent mention with default provider and per-task provider override"
pnpm exec astryx component Selector
pnpm exec astryx component StatusDot
pnpm exec astryx component Token
```

Persist default-provider changes only when the selected provider is currently reported as authenticated and supported:

```ts
export async function setDefaultProvider(
  provider: Provider,
  authenticatedUserId: string,
) {
  const capability = await aiConnectionRepository.getCapability(
    authenticatedUserId,
    provider,
  );
  if (!capability?.authenticated || !capability.supported) {
    throw new Error("Connect this provider before making it your default");
  }
  await aiConnectionRepository.setDefault(authenticatedUserId, provider);
}
```

Create the human message first. Only after it persists, create the task using the user's explicit provider override or saved default. If no compatible connected device exists, preserve the message and show `Connect personal AI to send this mention`.

- [ ] **Step 6: Persist completed results as agent messages**

Agent messages use `author_type = 'product_agent'`, `initiated_by`, `ai_task_id`, `provider`, and `cited_message_ids`. A failed task does not create an empty agent message.

- [ ] **Step 7: Run E2E test**

Run: `pnpm exec playwright test e2e/product-agent.spec.ts`

Expected: an ordinary message creates no AI task; an explicit mention queues, runs through a fake connector, and posts one shared response.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts apps/web/src/features/ai \
  apps/web/src/features/discovery e2e/product-agent.spec.ts
git commit -m "feat: add explicit Product Agent mentions"
```

---

### Task 11: Build Full PRD Generation, Revision, and Acceptance

**Files:**
- Create: `supabase/migrations/202607240007_prds.sql`
- Create: `supabase/tests/prd_acceptance.test.sql`
- Create: `apps/web/src/features/prd/repository.ts`
- Create: `apps/web/src/features/prd/actions.ts`
- Create: `apps/web/src/features/prd/actions.test.ts`
- Create: `apps/web/src/features/prd/prd-prompt.ts`
- Create: `apps/web/src/features/prd/prd-prompt.test.ts`
- Create: `apps/web/src/features/prd/components/prd-editor.tsx`
- Create: `apps/web/src/features/prd/prd-editor-adapter.ts`
- Create: `apps/web/src/features/prd/prd-editor-adapter.test.ts`
- Create: `apps/web/src/features/prd/components/revision-chat.tsx`
- Create: `apps/web/src/features/prd/components/version-diff.tsx`
- Create: `apps/web/src/features/prd/components/accept-prd.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/prd/page.tsx`
- Test: `e2e/prd-review.spec.ts`

**Interfaces:**
- Consumes: `PRDDocumentSchema`, `prd_generate` and `prd_revise` AI tasks.
- Produces: immutable `PRDVersion` records, proposed revisions, one accepted version, and post-acceptance draft behavior.

- [ ] **Step 1: Write database acceptance tests**

```sql
select lives_ok(
  $$ select accept_prd_version(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002'
  ) $$,
  'room owner accepts the complete PRD'
);

select throws_ok(
  $$ select accept_prd_version(
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000003'
  ) $$,
  '42501',
  null,
  'editor cannot accept the PRD'
);
```

- [ ] **Step 2: Write revision-preservation tests**

```ts
it("protects requested sections during AI revision", async () => {
  const task = await requestPrdRevision({
    prdId,
    instruction: "Rewrite the user journeys",
    protectedSectionKeys: ["mvpScope", "goalsNonGoalsAndMetrics"],
  });
  expect(task.context.currentPrd.protectedSectionKeys).toEqual([
    "mvpScope",
    "goalsNonGoalsAndMetrics",
  ]);
});

it("editing an accepted PRD creates a new unaccepted version", async () => {
  const next = await savePrd({ prdId, content: changedDocument });
  expect(next.status).toBe("draft");
  expect(await acceptedVersion(prdId)).toEqual(previousAcceptedVersion);
});
```

- [ ] **Step 3: Verify tests fail**

Run:

```bash
supabase test db supabase/tests/prd_acceptance.test.sql
pnpm --filter web test -- prd
```

Expected: FAIL because PRD persistence and actions do not exist.

- [ ] **Step 4: Add PRD persistence**

Create:

- `prds(room_id unique, current_version_id, accepted_version_id, status)`
- `prd_versions(prd_id, version_number, content_json, content_text, created_by, source, created_at)`
- `prd_revision_proposals(prd_id, base_version_id, proposed_content_json, instruction, protected_section_keys, ai_task_id, status)`
- `prd_acceptances(prd_id, version_id, accepted_by, accepted_at)`

Use a transaction to allocate monotonically increasing version numbers.

- [ ] **Step 5: Implement strict generation and revision prompts**

Generation returns exactly `PRDDocumentSchema`.

Revision receives the base document, instruction, and protected keys. After parsing, the server must compare every protected key with the base and reject the result with `protected_section_changed` if any differs.

- [ ] **Step 6: Implement the continuous PRD editor**

Run:

```bash
pnpm exec astryx build "continuous full PRD editor with version history, inline diff, conversational revision inspector, and whole-document acceptance"
pnpm exec astryx template editor --skeleton
pnpm exec astryx component LayoutPanel
pnpm exec astryx component Banner
pnpm exec astryx component Button
```

Render internal sections as one document using Tiptap. Preserve stable section keys in heading attributes so the editor can round-trip the structured PRD:

```ts
export function prdToEditorJSON(prd: PRDDocument): JSONContent {
  return {
    type: "doc",
    content: PRD_SECTION_KEYS.flatMap((key) => [
      {
        type: "heading",
        attrs: { level: 2, sectionKey: key },
        content: [{ type: "text", text: PRD_SECTION_LABELS[key] }],
      },
      ...sectionValueToNodes(key, prd[key]),
    ]),
  };
}

export function editorJSONToPrd(
  title: string,
  doc: JSONContent,
): PRDDocument {
  return PRDDocumentSchema.parse(
    nodesToSectionValues(title, doc.content ?? []),
  );
}
```

Test `editorJSONToPrd(title, prdToEditorJSON(document))` equals the original `PRDDocument`. Reject deleted, duplicated, or unknown section keys with a visible editor validation error.

Autosave with optimistic concurrency using `baseVersionId`; on conflict, keep local content and open a comparison instead of overwriting the server.

Revision proposals display:

- instruction
- base version
- changed sections
- inline additions/removals
- `Accept changes`
- `Edit proposal`
- `Reject`

- [ ] **Step 7: Implement whole-document acceptance**

Only the Discovery Room owner or organization admin may accept. Acceptance pins an immutable version. If a human or AI change is saved afterward, `prds.status` becomes `changes_pending` while `accepted_version_id` remains unchanged.

- [ ] **Step 8: Run PRD E2E tests**

Run:

```bash
supabase db reset
supabase test db
pnpm --filter web test -- prd
pnpm exec playwright test e2e/prd-review.spec.ts
```

Expected: generate, edit, targeted revise, reject, accept, edit-after-acceptance, and reaccept flows PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607240007_prds.sql \
  supabase/tests/prd_acceptance.test.sql apps/web/src/features/prd \
  'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/prd' \
  e2e/prd-review.spec.ts
git commit -m "feat: add conversational full PRD workflow"
```

---

### Task 12: Add Artifacts and Explicit Feature Conversion

**Files:**
- Create: `supabase/migrations/202607240008_feature_conversion.sql`
- Create: `supabase/tests/feature_conversion.test.sql`
- Create: `apps/web/src/features/features/readiness.ts`
- Create: `apps/web/src/features/features/readiness.test.ts`
- Create: `apps/web/src/features/features/actions.ts`
- Create: `apps/web/src/features/features/actions.test.ts`
- Create: `apps/web/src/features/features/components/artifact-list.tsx`
- Create: `apps/web/src/features/features/components/turn-into-feature.tsx`
- Create: `apps/web/src/features/features/components/feature-confirmation.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/artifacts/page.tsx`
- Test: `e2e/feature-conversion.spec.ts`

**Interfaces:**
- Consumes: accepted PRD version, room owner/admin permission, room artifacts, and open questions.
- Produces: immutable feature source links and a Feature Room starting in `define`.

- [ ] **Step 1: Write readiness tests**

```ts
it("warns but does not block when flow and prototype are missing", () => {
  expect(
    assessReadiness({
      acceptedPrdVersionId,
      userFlowCount: 0,
      prototypeLinkCount: 0,
      openQuestionCount: 3,
    }),
  ).toEqual({
    canConvert: true,
    warnings: [
      "No user flow attached",
      "No prototype link attached",
      "3 open questions remain",
    ],
  });
});
```

- [ ] **Step 2: Write conversion authorization tests**

```sql
select throws_ok(
  $$ select convert_discovery_to_feature(
      '60000000-0000-0000-0000-000000000001',
      'Unaccepted feature',
      auth.uid()
  ) $$,
  'P0001',
  'accepted_prd_required',
  'unaccepted PRD cannot be converted'
);
```

- [ ] **Step 3: Verify tests fail**

Run:

```bash
supabase test db supabase/tests/feature_conversion.test.sql
pnpm --filter web test -- readiness
```

Expected: FAIL because artifacts and conversion do not exist.

- [ ] **Step 4: Add artifacts and feature schema**

Create `artifacts` with types `user_flow`, `prototype_link`, `evidence`, and `file`. Create `features`, `feature_source_links`, `feature_participants`, `feature_assignments`, `feature_stage_history`, and `readiness_warnings`.

`feature_assignments` contains `feature_id`, `title`, `assignee_user_id`, `status` (`open`, `in_progress`, `done`), `created_by`, and timestamps. The MVP has no dependencies, due dates, or AI assignees.

`features.source_prd_version_id` must reference an accepted PRD version. The conversion transaction copies room participants, sets the room owner as Feature Room owner, stores warnings, and creates the initial `define` history record.

- [ ] **Step 5: Implement readiness calculation**

Readiness warnings are deterministic server rules. AI recommendations may add explanatory suggestions later but cannot remove deterministic warnings.

- [ ] **Step 6: Build explicit confirmation**

Run:

```bash
pnpm exec astryx build "Discovery Room artifacts and Turn into Feature confirmation with accepted PRD version, owner, included artifacts, open questions, and warnings"
pnpm exec astryx component Dialog
pnpm exec astryx component List
pnpm exec astryx component Banner
pnpm exec astryx component Button
```

The `Turn into Feature` action must open a confirmation dialog showing feature name, owner, accepted PRD version, included artifacts, open questions, and warnings. A chat request routes to this same URL with fields prefilled; it never invokes conversion directly.

- [ ] **Step 7: Run conversion E2E tests**

Run: `pnpm exec playwright test e2e/feature-conversion.spec.ts`

Expected: acceptance alone creates no feature; warnings are visible but non-blocking; only owner/admin confirmation creates exactly one feature.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607240008_feature_conversion.sql \
  supabase/tests/feature_conversion.test.sql apps/web/src/features/features \
  'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/artifacts' \
  e2e/feature-conversion.spec.ts
git commit -m "feat: add explicit PRD to feature conversion"
```

---

### Task 13: Build Define and Design Feature Rooms

**Files:**
- Create: `apps/web/src/features/features/stage-service.ts`
- Create: `apps/web/src/features/features/stage-service.test.ts`
- Create: `apps/web/src/features/features/components/feature-overview.tsx`
- Create: `apps/web/src/features/features/components/define-stage.tsx`
- Create: `apps/web/src/features/features/components/design-stage.tsx`
- Create: `apps/web/src/features/features/components/stage-transition.tsx`
- Create: `apps/web/src/features/features/components/readiness-recommendation.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/features/page.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/features/[featureId]/page.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/features/[featureId]/define/page.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/features/[featureId]/design/page.tsx`
- Test: `e2e/feature-stages.spec.ts`

**Interfaces:**
- Consumes: converted Feature Room, artifacts, assignments, and `stage_readiness` task results.
- Produces: owner/admin-controlled `define -> design` transitions and AI recommendations that never transition automatically.

- [ ] **Step 1: Write stage authorization tests**

```ts
it("does not transition when AI reports ready", async () => {
  await saveReadinessRecommendation({
    featureId,
    recommendedStage: "design",
    ready: true,
    reasons: ["PRD accepted", "User flow attached"],
  });
  expect(await currentStage(featureId)).toBe("define");
});

it("rejects an editor stage transition", async () => {
  await expect(
    transitionStage({ featureId, to: "design" }, editorUser),
  ).rejects.toThrow("Only the feature owner or an organization admin can change stage");
});
```

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter web test -- stage-service`

Expected: FAIL because the stage service does not exist.

- [ ] **Step 3: Implement Define view**

Run:

```bash
pnpm exec astryx build "Feature Room with Define and Design stages, accepted PRD, artifacts, assignments, readiness warnings, and manual stage transition"
pnpm exec astryx component TabList
pnpm exec astryx component Table
pnpm exec astryx component StatusDot
pnpm exec astryx component Banner
```

Show accepted PRD, pending PRD changes, goals, requirements, acceptance criteria, decisions, warnings, assignments, owner, and source Discovery Room.

- [ ] **Step 4: Implement Design view**

Show user-flow artifacts, prototype links, design decisions, design open questions, assignments, and a link back to the accepted PRD.

- [ ] **Step 5: Add readiness recommendation**

The Product Agent receives only feature-scoped content and returns:

```ts
export const StageReadinessResultSchema = z.object({
  ready: z.boolean(),
  recommendedStage: z.literal("design"),
  reasons: z.array(z.string()).min(1),
  missingItems: z.array(z.string()),
  sourceArtifactIds: z.array(z.string().uuid()),
});
```

Display it as advisory copy with `Review transition`; do not call `transitionStage`.

- [ ] **Step 6: Implement manual transition**

Owner/admin confirmation writes one `feature_stage_history` record with actor, from stage, to stage, time, and attached readiness recommendation ID when present.

- [ ] **Step 7: Run Feature Room tests**

Run:

```bash
pnpm --filter web test -- features
pnpm exec playwright test e2e/feature-stages.spec.ts
```

Expected: feature begins in Define; AI cannot move it; owner/admin can move it once to Design; editor cannot.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/features \
  'apps/web/src/app/(app)/[organizationId]/features' e2e/feature-stages.spec.ts
git commit -m "feat: add Define and Design Feature Rooms"
```

---

### Task 14: Add Audit, Notifications, Metrics, and Security Hardening

**Files:**
- Create: `supabase/migrations/202607240009_audit_notifications.sql`
- Create: `apps/web/src/features/notifications/repository.ts`
- Create: `apps/web/src/features/notifications/components/inbox.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/inbox/page.tsx`
- Create: `apps/web/src/lib/audit.ts`
- Create: `apps/web/src/lib/metrics.ts`
- Create: `apps/web/src/lib/redaction.ts`
- Create: `apps/web/src/lib/redaction.test.ts`
- Create: `apps/gateway/src/observability/redaction.ts`
- Create: `apps/gateway/src/observability/redaction.test.ts`
- Create: `apps/connector/src/security/redacting-logger.ts`
- Test: `apps/connector/test/redacting-logger.test.ts`
- Create: `docs/security/threat-model.md`
- Create: `docs/security/incident-response.md`

**Interfaces:**
- Consumes: domain events from all earlier tasks.
- Produces: user notifications, audit events, privacy-safe product metrics, and redacted diagnostics.

- [ ] **Step 1: Write redaction tests**

```ts
it("redacts provider tokens, pairing secrets, and room bodies", () => {
  expect(
    redact({
      authorization: "Device id.supersecret",
      context: { messages: [{ text: "confidential roadmap" }] },
      taskId: "safe-id",
    }),
  ).toEqual({
    authorization: "[REDACTED]",
    context: "[REDACTED]",
    taskId: "safe-id",
  });
});
```

```ts
it("never logs a device credential, provider secret, or context", () => {
  expect(
    renderConnectorLog({
      deviceToken: "dt_secret",
      providerEnvironment: { OPENAI_API_KEY: "sk-secret" },
      context: { messages: [{ text: "private PRD" }] },
      taskId: "safe-task-id",
    }),
  ).toEqual({
    deviceToken: "[REDACTED]",
    providerEnvironment: "[REDACTED]",
    context: "[REDACTED]",
    taskId: "safe-task-id",
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
pnpm test -- redaction
pnpm --filter @meld/connector test -- redacting-logger
```

Expected: FAIL because redactors do not exist.

- [ ] **Step 3: Add audit and notification tables**

Audit events include actor, organization, action, target type/ID, safe metadata, and timestamp. They are append-only and admin-readable.

Notifications cover mentions, task state requiring action, PRD revision ready, PRD accepted, feature conversion, and stage-review requests.

- [ ] **Step 4: Add exact product metrics**

Emit:

- `connector_setup_started`
- `connector_setup_completed`
- `provider_connected`
- `discovery_room_created`
- `product_agent_mentioned`
- `prd_generation_completed`
- `prd_revision_accepted`
- `prd_accepted`
- `feature_created`
- `feature_entered_design`

Include organization ID, user ID, provider, duration, and outcome. Never include message, PRD, prompt, or attachment content.

- [ ] **Step 5: Build the notification inbox**

Run:

```bash
pnpm exec astryx build "product workspace notification inbox for mentions, AI tasks needing action, PRD review, feature conversion, and stage review"
pnpm exec astryx component List
pnpm exec astryx component Item
pnpm exec astryx component StatusDot
pnpm exec astryx component EmptyState
```

Render notifications as dense edge-to-edge rows grouped by unread/read state. Each row includes actor, action, target, timestamp, and a destination link. Use `StatusDot` plus text for action-required state; do not wrap every row in a card. Mark-as-read is idempotent and scoped to the authenticated user.

- [ ] **Step 6: Create the threat model**

Document assets, trust boundaries, attackers, abuse cases, and controls for:

- tenant data isolation
- pairing-code theft
- device-token theft
- connector impersonation
- malicious room content
- prompt injection
- provider credential exposure
- unintended API billing
- local filesystem access
- result tampering and replay
- connector update compromise

Each threat must reference a concrete control and test from Tasks 1–14.

- [ ] **Step 7: Run the security suite**

Run:

```bash
supabase test db
pnpm test
pnpm --filter @meld/connector test
```

Expected: all authorization, redaction, revocation, isolation, and transition tests PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607240009_audit_notifications.sql \
  apps/web/src/features/notifications apps/web/src/app/'(app)'/*/inbox \
  apps/web/src/lib apps/gateway/src/observability apps/connector \
  docs/security
git commit -m "feat: harden audit and notification flows"
```

---

### Task 15: Complete End-to-End Launch Validation

**Files:**
- Create: `e2e/mvp-happy-path.spec.ts`
- Create: `e2e/offline-connector.spec.ts`
- Create: `e2e/permissions.spec.ts`
- Create: `scripts/run-local-stack.sh`
- Create: `scripts/run-launch-gates.sh`
- Create: `scripts/build-connector-release.sh`
- Create: `scripts/publish-connector-release.sh`
- Create: `apps/web/public/install.sh`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release-connector.yml`
- Create: `docs/runbooks/connector-support.md`
- Create: `docs/runbooks/provider-outage.md`
- Create: `docs/runbooks/device-revocation.md`
- Create: `docs/runbooks/connector-distribution.md`
- Create: `docs/launch/private-mvp-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: every prior subsystem.
- Produces: repeatable local setup, CI, launch-gate evidence, and support runbooks.

- [ ] **Step 1: Write the complete happy-path test**

```ts
test("team reaches a Design-ready Feature Room without an API key", async ({
  browser,
}) => {
  const owner = await browser.newContext();
  const editor = await browser.newContext();

  await createOrganizationAndInvite(owner, editor);
  const room = await createDiscoveryRoom(owner, "Feedback fragmentation");
  await postRoomMessage(editor, room, "@Product Agent challenge this problem");
  await fakeConnectorCompleteLatestTask("room_reply");
  await expectAgentReply(owner, room);

  await requestFullPrd(owner, room);
  await fakeConnectorCompleteLatestTask("prd_generate");
  await requestPrdRevision(owner, room, "Preserve scope; improve user journeys");
  await fakeConnectorCompleteLatestTask("prd_revise");
  await acceptPrd(owner, room);

  await addPrototypeLink(editor, room, "https://prototype.example/flow");
  const feature = await confirmTurnIntoFeature(owner, room);
  await expectFeatureStage(owner, feature, "define");
  await manuallyMoveToDesign(owner, feature);
  await expectFeatureStage(editor, feature, "design");
});
```

- [ ] **Step 2: Write offline and permission tests**

Cover:

- task remains queued while connector is offline
- connector reconnect causes automatic execution after access revalidation
- revoked room access prevents queued execution
- editor cannot accept PRD, convert feature, or change stage
- acceptance alone does not create a feature
- no application environment contains provider API-key variables

- [ ] **Step 3: Verify launch tests fail before harness completion**

Run: `pnpm exec playwright test e2e/mvp-happy-path.spec.ts`

Expected: FAIL because the full local-stack and fake-connector harness is absent.

- [ ] **Step 4: Implement repeatable local stack**

`scripts/run-local-stack.sh` must:

1. verify repository-development Node 20.9+, pnpm, and Supabase CLI
2. start Supabase
3. apply migrations and seed deterministic users
4. start web and gateway
5. start the fake connector for browser tests
6. print service URLs without secrets

- [ ] **Step 5: Implement CI**

CI jobs:

1. TypeScript lint/typecheck/unit tests
2. Supabase migration reset and pgTAP
3. Playwright with fake connector
4. connector unit and bootstrap-fixture tests on Linux
5. LaunchAgent bootstrap, close-terminal persistence, pause/resume, update rollback, and uninstall tests on a clean macOS runner
6. provider contract fixture parsing without live credentials

Live subscription smoke tests remain a controlled release-gate job and must not receive provider credentials through repository CI.

- [ ] **Step 6: Build and publish the checksum-verified connector release**

`scripts/build-connector-release.sh` must create one architecture-independent connector archive because the official Node runtime is downloaded separately for the detected Mac architecture:

```bash
#!/usr/bin/env bash
set -euo pipefail

CONNECTOR_VERSION="${1:?usage: build-connector-release.sh VERSION}"
RELEASE_ROOT="build/connector/v${CONNECTOR_VERSION}"
ARCHIVE="meld-connector-${CONNECTOR_VERSION}.tar.gz"

test "$(git status --porcelain)" = ""
pnpm --filter @meld/connector test
pnpm --filter @meld/connector build
mkdir -p "$RELEASE_ROOT/package"
cp -R apps/connector/dist apps/connector/package.json \
  "$RELEASE_ROOT/package/"
tar -C "$RELEASE_ROOT/package" -czf "$RELEASE_ROOT/$ARCHIVE" .
(cd "$RELEASE_ROOT" && shasum -a 256 "$ARCHIVE" > checksums.txt)
```

`publish-connector-release.sh` accepts only a protected `connector-v*` tag, uploads the archive and checksum file to the versioned immutable release path, downloads them back, verifies the checksum, and only then updates the release manifest used by `install.sh`. The bootstrap embedded at `apps/web/public/install.sh` must pin the same Node and connector versions as that manifest.

`docs/runbooks/connector-distribution.md` records release ownership, CDN cache invalidation, rollback to the prior manifest, private Node security updates, provider-package updates, checksum mismatch response, and the rule that introducing a native binary/package requires a separate Apple signing and notarization design.

- [ ] **Step 7: Implement the launch-gate script**

`scripts/run-launch-gates.sh` runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
supabase db reset
supabase test db
pnpm exec playwright test
pnpm --filter @meld/connector test
bash apps/connector/test/install.test.sh
bash spikes/provider-adapters/smoke-test.sh
```

The script exits non-zero on any failure and stores only safe summaries under `.context/launch-evidence/`. The protected macOS release job additionally installs into a temporary test account, closes the invoking terminal session, verifies `launchctl print "gui/$(id -u)/com.meld.connector"`, checks one healthy heartbeat, tests rollback from a deliberately unhealthy staged version, runs uninstall, and asserts that only the three Meld-owned directories and LaunchAgent were removed.

- [ ] **Step 8: Complete manual usability validation**

Use `docs/launch/private-mvp-checklist.md` to record five to ten product-manager/designer sessions. Each session records:

- connector setup completed without engineering intervention
- setup completed on a Mac without Node, npm, npx, or Homebrew
- Terminal closed while the connector stayed connected
- provider authenticated through official flow
- first agent response completed
- full PRD generated
- targeted revision preserved requested sections
- PRD accepted by owner/admin
- feature conversion required explicit confirmation
- Feature Room reached Design
- elapsed time and blocking issue category

Do not record participant conversation or PRD content.

- [ ] **Step 9: Run every launch gate**

Run:

```bash
bash scripts/run-launch-gates.sh
```

Expected: all automated gates PASS, both provider rows in `docs/provider-compatibility.md` are `Go`, and the private-MVP checklist shows at least five completed core workflows.

- [ ] **Step 10: Commit**

```bash
git add e2e scripts .github/workflows/ci.yml \
  .github/workflows/release-connector.yml apps/web/public/install.sh docs/runbooks \
  docs/launch README.md
git commit -m "test: complete private MVP launch gates"
```

## Spec Coverage Matrix

| Approved requirement | Implemented by |
|---|---|
| Astryx Core, Neutral theme, generated agent conventions, and CI enforcement | Task 2A and all later UI tasks |
| Node-free, no-sudo bootstrap with no Apple Developer account required for the shell/runtime MVP | Tasks 7 and 15 |
| Google/email authentication, organizations, invitations | Tasks 3–4 |
| Small-team owner/admin/editor/viewer permissions | Tasks 3–5, 11–13 |
| Shared Discovery Room conversation, attachments, evidence, decisions | Task 5 |
| Explicit Product Agent mentions only | Task 10 |
| Personal Codex and Claude subscriptions; no platform AI spend | Tasks 1, 7–10 |
| One persistent per-user LaunchAgent that survives Terminal closure and login restart | Tasks 7 and 15 |
| Private pinned Node runtime; no system Node, npx, Homebrew, PATH, or shell-profile dependency | Tasks 7 and 15 |
| Explicit managed Codex/Claude installation and official subscription login | Task 8 |
| Default provider plus per-task override | Tasks 6, 8, 10 |
| User-owned tasks and no teammate fallback | Tasks 6, 9, 15 |
| Offline queueing, reconnect, cancel, partial results, reauthentication | Tasks 6, 7, 9 |
| Room-scoped context and claim-time permission revalidation | Tasks 6 and 15 |
| Content-only execution with no repository, shell, or local-secret access | Tasks 1 and 8 |
| Full PRD schema | Tasks 2 and 11 |
| Direct editing, targeted conversational revision, protected content, diffs | Task 11 |
| Whole-document owner/admin acceptance | Task 11 |
| Post-acceptance edits create an unaccepted version | Task 11 |
| User flows, prototype links, evidence, and decisions | Tasks 5 and 12 |
| Acceptance does not automatically create a feature | Tasks 12 and 15 |
| Explicit feature confirmation with non-blocking warnings | Task 12 |
| Define and Design Feature Room stages | Task 13 |
| Manual owner/admin stage transition with AI recommendation only | Task 13 |
| Device revocation, audit, notifications, redaction, metrics | Tasks 7 and 14 |
| Five-to-ten-user private MVP validation and launch gates | Task 15 |
| Windows, BYOK, repositories, Build/Test/Launch, enterprise controls deferred | Global Constraints and all task boundaries |

## Implementation References

- Approved design: `docs/superpowers/specs/2026-07-24-personal-ai-product-lifecycle-mvp-design.md`
- Next.js installation: https://nextjs.org/docs/app/getting-started/installation
- Next.js backend-for-frontend guidance: https://nextjs.org/docs/app/guides/backend-for-frontend
- Supabase server-side auth: https://supabase.com/docs/guides/auth/server-side
- Supabase Realtime authorization: https://supabase.com/docs/guides/realtime/authorization
- Apple `launchd` jobs: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html
- Apple background items: https://support.apple.com/guide/mac-help/mh15189/mac
- Node.js macOS distributions and checksums: https://nodejs.org/download/release/latest-v22.x/
- npm package execution: https://docs.npmjs.com/cli/v8/commands/npm-exec/
- OpenAI authentication: https://learn.chatgpt.com/docs/auth
- OpenAI CLI commands: https://learn.chatgpt.com/docs/developer-commands?surface=cli
- Claude subscription access: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Claude CLI reference: https://docs.anthropic.com/en/docs/claude-code/cli-usage
