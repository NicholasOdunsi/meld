# Personal-AI Product Lifecycle MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-first collaborative product-discovery MVP that turns a Discovery Room conversation into an accepted full PRD and an explicitly created Define/Design Feature Room, using only the initiating user's personal Codex or Claude subscription.

**Architecture:** Use a pnpm monorepo with a Next.js App Router web application, Supabase Auth/Postgres/Storage/Realtime, a separately deployed Fastify WebSocket gateway, shared Zod contracts, and a signed Swift macOS connector. The server stores durable user-owned AI tasks; the paired connector claims them over an outbound WebSocket, invokes an official subscription-authenticated CLI in a content-only configuration, and streams structured results back.

**Tech Stack:** Node.js 20.9+, pnpm/Corepack, TypeScript, Next.js App Router, React, Tailwind CSS, Tiptap, Zod, Supabase, Fastify, WebSocket, Vitest, Testing Library, Playwright, Swift 6, SwiftUI, ServiceManagement `SMAppService`, XCTest, XcodeGen, GitHub Actions.

## Global Constraints

- The platform must never own, store, or use an OpenAI or Anthropic API key.
- There is no managed-credit, paid-API, teammate-subscription, or silent provider fallback.
- Every AI task belongs to the initiating user and runs only on that user's paired device.
- AI runs only after an explicit mention or action.
- AI context is scoped to the current Discovery Room unless the user explicitly adds other permitted context.
- Provider credentials remain inside the official Codex or Claude client.
- The connector is content-only: no repository, arbitrary folder, shell, or local-secret access.
- Both Codex and Claude personal subscriptions are supported.
- macOS 13 or later is the first connector target because `SMAppService` is required.
- Offline tasks queue durably and revalidate access immediately before execution.
- PRD acceptance applies to the whole document; edits after acceptance create a new unaccepted version.
- PRD acceptance never creates a Feature Room automatically.
- Missing flows, prototypes, and open answers create warnings, not blockers.
- Feature Rooms implement Define and Design only.
- Stage transitions are manual and restricted to the Feature Room owner or organization admin.
- Use test-driven development, tenant isolation, least privilege, and frequent task-level commits.

## Delivery Milestones

1. **Provider safety gate:** Prove subscription authentication, structured output, and content-only execution for both CLIs.
2. **Collaborative discovery:** Ship authentication, organizations, Discovery Rooms, messages, and attachments without AI.
3. **Personal AI connection:** Ship durable tasks, pairing, the macOS background connector, and both provider adapters.
4. **PRD workflow:** Ship Product Agent conversation, full PRD generation, revision, acceptance, and history.
5. **Feature handoff:** Ship artifacts, explicit feature conversion, Define, Design, readiness warnings, and manual transitions.
6. **Launch hardening:** Pass security, usability, observability, and end-to-end launch gates.

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
- `apps/web/src/features/auth/` — Supabase SSR authentication.
- `apps/web/src/features/workspaces/` — organizations, membership, and invitations.
- `apps/web/src/features/discovery/` — Discovery Room conversation and evidence.
- `apps/web/src/features/prd/` — PRD editor, versions, diffs, revision chat, and acceptance.
- `apps/web/src/features/features/` — feature conversion and Define/Design views.
- `apps/web/src/features/ai/` — agent actions, task state, device state, and provider selection.
- `apps/web/src/lib/supabase/` — browser, server, and admin Supabase clients.
- `apps/web/src/lib/repositories/` — server-side domain repositories.
- `apps/web/src/app/api/` — pairing, task creation, PRD, and feature route handlers.

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

- `apps/connector-macos/project.yml` — XcodeGen project definition and signing settings.
- `apps/connector-macos/Sources/App/` — setup and menu-bar status UI.
- `apps/connector-macos/Sources/Agent/` — launch agent entry point.
- `apps/connector-macos/Sources/Core/Pairing/` — device pairing and Keychain token storage.
- `apps/connector-macos/Sources/Core/Transport/` — reconnecting WebSocket client.
- `apps/connector-macos/Sources/Core/Tasks/` — local task lifecycle and cancellation.
- `apps/connector-macos/Sources/Core/Providers/` — provider protocol, Codex adapter, and Claude adapter.
- `apps/connector-macos/Sources/Core/Security/` — isolated working directory and environment construction.
- `apps/connector-macos/Resources/` — launch-agent property list and application assets.
- `apps/connector-macos/Tests/` — XCTest suites and fake processes.

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
- Produces: JSONL output containing text/result events only, a documented supported-version floor, and an explicit go/no-go record for each provider.

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

| Provider | CLI version | Subscription login | Structured output | No tool events | No API env vars | Decision |
|---|---:|---|---|---|---|---|
| Codex | output of `codex --version` | Pass/Fail | Pass/Fail | Pass/Fail | Pass/Fail | Go/No-go |
| Claude | output of `claude --version` | Pass/Fail | Pass/Fail | Pass/Fail | Pass/Fail | Go/No-go |

## Policy evidence

- OpenAI authentication: https://learn.chatgpt.com/docs/auth
- OpenAI CLI: https://learn.chatgpt.com/docs/developer-commands?surface=cli
- Claude subscription: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Claude CLI: https://docs.anthropic.com/en/docs/claude-code/cli-usage

## Gate

Implementation proceeds only for providers marked Go. A provider is No-go if
subscription execution becomes API-billed, tool execution cannot be disabled,
out-of-scope files are observable, or current provider terms prohibit the flow.
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
- Create: `package.json`
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

Use `pnpm create next-app@latest apps/web --ts --tailwind --eslint --app --src-dir --use-pnpm --import-alias "@/*"` and add root scripts:

```json
{
  "name": "meld",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "test": "turbo test",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Set `.nvmrc` to `20.9` and define workspace globs for `apps/*` and `packages/*`.

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

### Task 7: Build Pairing and the Persistent macOS Connector

**Files:**
- Create: `supabase/migrations/202607240006_device_pairing.sql`
- Create: `apps/web/src/app/api/devices/pairing-codes/route.ts`
- Create: `apps/web/src/app/api/devices/pair/route.ts`
- Create: `apps/web/src/features/ai/components/connect-device.tsx`
- Create: `apps/web/src/features/ai/components/device-list.tsx`
- Create: `apps/connector-macos/project.yml`
- Create: `apps/connector-macos/Sources/App/MeldConnectorApp.swift`
- Create: `apps/connector-macos/Sources/App/ConnectionView.swift`
- Create: `apps/connector-macos/Sources/Agent/main.swift`
- Create: `apps/connector-macos/Sources/Core/Pairing/PairingClient.swift`
- Create: `apps/connector-macos/Sources/Core/Pairing/DeviceTokenStore.swift`
- Create: `apps/connector-macos/Sources/Core/Transport/GatewayClient.swift`
- Create: `apps/connector-macos/Resources/com.meld.connector.agent.plist`
- Test: `apps/connector-macos/Tests/PairingClientTests.swift`
- Test: `apps/connector-macos/Tests/GatewayClientTests.swift`

**Interfaces:**
- Consumes: `POST /api/devices/pairing-codes`, `POST /api/devices/pair`, and the Task 6 WebSocket protocol.
- Produces: a paired, revocable macOS device that reconnects at login without an open terminal.

- [ ] **Step 1: Write pairing tests**

```swift
func testPairingStoresReturnedDeviceTokenInKeychain() async throws {
    let transport = FakeHTTPTransport(response: .pairSuccess(
        deviceID: "40000000-0000-0000-0000-000000000001",
        deviceToken: "dt_secret"
    ))
    let store = InMemoryDeviceTokenStore()
    let client = PairingClient(transport: transport, tokenStore: store)

    try await client.pair(code: "ABCD-EFGH")

    XCTAssertEqual(
        store.saved,
        DeviceCredential(
            deviceID: "40000000-0000-0000-0000-000000000001",
            token: "dt_secret"
        )
    )
}
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd apps/connector-macos
xcodegen generate
xcodebuild test -scheme MeldConnector -destination 'platform=macOS'
```

Expected: FAIL because the connector project and types do not exist.

- [ ] **Step 3: Implement single-use pairing**

Pairing codes are eight Crockford Base32 characters, expire after ten minutes, are stored as SHA-256 hashes, and may be redeemed once. Redemption creates a device ID plus a 32-byte device secret; the API returns the plaintext secret once and stores only its hash.

The web UI generates a `meld://pair?code=ABCD-EFGH` link and also displays the code for manual entry.

- [ ] **Step 4: Implement Keychain credential storage**

```swift
protocol DeviceTokenStoring {
    func save(_ credential: DeviceCredential) throws
    func load() throws -> DeviceCredential?
    func delete() throws
}
```

Use Keychain service `com.meld.connector.device` with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.

- [ ] **Step 5: Implement the reconnecting WebSocket**

```swift
actor GatewayClient {
    private var retryAttempt = 0

    func connect(using credential: DeviceCredential) async {
        while !Task.isCancelled {
            do {
                try await openAndConsume(using: credential)
                retryAttempt = 0
            } catch {
                let delay = min(pow(2.0, Double(retryAttempt)), 60.0)
                retryAttempt += 1
                try? await Task.sleep(for: .seconds(delay))
            }
        }
    }
}
```

Add jitter, network-change wake-up, heartbeat handling, and cancellation. Never log the credential or context body.

- [ ] **Step 6: Register the background agent**

Define the agent inside the signed application bundle and register it with:

```swift
let service = SMAppService.agent(
    plistName: "com.meld.connector.agent.plist"
)
try service.register()
```

The menu-bar UI must show `Connected`, `Waiting for network`, `Needs sign-in`, `Update required`, `Paused`, and `Disconnected`, with pause, reconnect, and disconnect actions.

- [ ] **Step 7: Add revocation behavior**

Revoking a device in the web app sets `revoked_at`; the next heartbeat closes the session. The connector deletes its local device token and returns to pairing.

- [ ] **Step 8: Run connector, pairing, and revocation tests**

Run:

```bash
xcodebuild test -scheme MeldConnector -destination 'platform=macOS'
pnpm --filter web test -- devices
pnpm --filter gateway test -- device
```

Expected: pairing is single-use; login-agent registration is observable; revoked credentials cannot reconnect.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607240006_device_pairing.sql \
  apps/web/src/app/api/devices apps/web/src/features/ai/components \
  apps/connector-macos
git commit -m "feat: add persistent macOS connector pairing"
```

---

### Task 8: Implement Production Codex and Claude Adapters

**Files:**
- Create: `apps/connector-macos/Sources/Core/Providers/ProviderAdapter.swift`
- Create: `apps/connector-macos/Sources/Core/Providers/ProcessRunning.swift`
- Create: `apps/connector-macos/Sources/Core/Providers/CodexAdapter.swift`
- Create: `apps/connector-macos/Sources/Core/Providers/ClaudeAdapter.swift`
- Create: `apps/connector-macos/Sources/Core/Providers/ProviderDetector.swift`
- Create: `apps/connector-macos/Sources/Core/Providers/ProviderError.swift`
- Create: `apps/connector-macos/Sources/Core/Security/TaskWorkspace.swift`
- Create: `apps/connector-macos/Sources/Core/Security/ChildEnvironment.swift`
- Create: `apps/connector-macos/Sources/Core/Tasks/TaskExecutor.swift`
- Test: `apps/connector-macos/Tests/CodexAdapterTests.swift`
- Test: `apps/connector-macos/Tests/ClaudeAdapterTests.swift`
- Test: `apps/connector-macos/Tests/TaskExecutorTests.swift`
- Modify: `apps/gateway/src/ws/protocol-handler.ts`
- Modify: `apps/gateway/src/tasks/task-repository.ts`
- Test: `apps/gateway/src/ws/provider-status.test.ts`

**Interfaces:**
- Consumes: `AIContextPackage` and provider selection.
- Produces: `AsyncThrowingStream<ProviderEvent, Error>` ending in a validated `AIResult`.

- [ ] **Step 1: Define adapter contract and fake process**

```swift
enum ProviderKind: String, Codable {
    case codex
    case claude
}

protocol ProviderAdapter {
    var kind: ProviderKind { get }
    func authenticationStatus() async -> AuthenticationStatus
    func run(
        context: AIContextPackage,
        workspace: URL
    ) -> AsyncThrowingStream<ProviderEvent, Error>
    func cancel(taskID: UUID) async
}

protocol ProcessRunning {
    func stream(
        executable: URL,
        arguments: [String],
        environment: [String: String],
        currentDirectory: URL
    ) -> AsyncThrowingStream<ProcessLine, Error>
}
```

- [ ] **Step 2: Write command-construction tests**

```swift
func testCodexDisablesToolsAndWebSearch() throws {
    let invocation = CodexAdapter.makeInvocation(context: fixture, workspace: temp)
    XCTAssertTrue(invocation.arguments.contains("features.shell_tool=false"))
    XCTAssertTrue(invocation.arguments.contains("web_search=\"disabled\""))
    XCTAssertNil(invocation.environment["OPENAI_API_KEY"])
}

func testClaudeDeniesToolsAndRemovesAPIBillingVariables() throws {
    let invocation = ClaudeAdapter.makeInvocation(context: fixture, workspace: temp)
    XCTAssertTrue(invocation.arguments.contains("--disallowedTools"))
    XCTAssertNil(invocation.environment["ANTHROPIC_API_KEY"])
    XCTAssertNil(invocation.environment["ANTHROPIC_AUTH_TOKEN"])
}
```

- [ ] **Step 3: Verify tests fail**

Run:

```bash
xcodebuild test -scheme MeldConnector -destination 'platform=macOS' \
  -only-testing:MeldConnectorTests/CodexAdapterTests \
  -only-testing:MeldConnectorTests/ClaudeAdapterTests
```

Expected: FAIL because adapters do not exist.

- [ ] **Step 4: Implement child environment allowlisting**

Start from an empty environment and copy only:

- `HOME`
- `PATH`
- `TMPDIR`
- `LANG`
- `LC_ALL`
- provider-specific isolated home variables required by the successful Task 1 gate

Explicitly exclude all variables matching `*_API_KEY`, `*_AUTH_TOKEN`, AWS, GCP, Azure, Bedrock, Vertex, and proxy overrides not approved by connector settings.

- [ ] **Step 5: Implement task workspaces**

Create `~/Library/Application Support/MeldConnector/Tasks/<task-id>/` with mode `0700`, write only `context.json` and adapter configuration, and delete the directory on completion or cancellation. On startup, remove abandoned task directories older than 24 hours.

- [ ] **Step 6: Implement Codex adapter**

Match the Task 1 verified invocation. Parse JSONL into:

```swift
enum ProviderEvent {
    case started
    case textDelta(String)
    case usageNotice(String)
    case authenticationRequired
    case limitReached(String)
    case completed(AIResult)
}
```

Reject any emitted tool/command/file event as `ProviderError.securityBoundaryViolated`.

- [ ] **Step 7: Implement Claude adapter**

Match the Task 1 verified invocation using plan mode, one turn, denied tools, and stream JSON. Reject tool-use events and map authentication and usage-limit messages to typed errors without offering API credits.

- [ ] **Step 8: Implement provider detection and sign-in guidance**

Detection returns executable path, version, authentication state, and compatibility:

```swift
struct ProviderInstallation: Equatable {
    let kind: ProviderKind
    let executable: URL?
    let version: String?
    let authentication: AuthenticationStatus
    let compatibility: CompatibilityStatus
}
```

If missing, open the provider's official installation documentation. If signed out, launch the official login flow in a visible terminal window; the connector never accepts provider passwords.

- [ ] **Step 9: Publish provider capability without credentials**

After connection and after any detected provider change, send:

```json
{
  "type": "provider.status",
  "providers": [
    {
      "provider": "codex",
      "version": "version string",
      "authentication": "authenticated",
      "compatibility": "supported"
    }
  ]
}
```

The gateway updates `ai_connections` and device capability metadata. It stores no executable path, credential path, token, or environment value. Web provider selection must offer only providers reported as both `authenticated` and `supported`.

- [ ] **Step 10: Run adapter and sentinel tests**

Run:

```bash
xcodebuild test -scheme MeldConnector -destination 'platform=macOS'
bash spikes/provider-adapters/smoke-test.sh
```

Expected: unit tests PASS and both live adapters still satisfy the Task 1 gate.

- [ ] **Step 11: Commit**

```bash
git add apps/connector-macos/Sources/Core apps/connector-macos/Tests \
  apps/gateway/src/ws apps/gateway/src/tasks
git commit -m "feat: add subscription-backed provider adapters"
```

---

### Task 9: Execute, Queue, Cancel, and Resume Connector Tasks

**Files:**
- Modify: `apps/connector-macos/Sources/Core/Transport/GatewayClient.swift`
- Modify: `apps/connector-macos/Sources/Core/Tasks/TaskExecutor.swift`
- Create: `apps/connector-macos/Sources/Core/Tasks/TaskCoordinator.swift`
- Create: `apps/connector-macos/Sources/Core/Tasks/TaskStateStore.swift`
- Test: `apps/connector-macos/Tests/TaskCoordinatorTests.swift`
- Modify: `apps/gateway/src/ws/protocol-handler.ts`
- Test: `apps/gateway/src/ws/protocol-handler.test.ts`
- Create: `apps/web/src/features/ai/components/task-status.tsx`
- Test: `apps/web/src/features/ai/components/task-status.test.tsx`

**Interfaces:**
- Consumes: Task 6 protocol and Task 8 provider adapters.
- Produces: reliable end-to-end task state, progress, cancellation, reconnection, and partial-result behavior.

- [ ] **Step 1: Write reconnection and cancellation tests**

```swift
func testReconnectResendsOnlyUnacknowledgedEvents() async throws {
    let store = InMemoryTaskStateStore(lastAcknowledgedSequence: 2)
    let coordinator = TaskCoordinator(store: store, provider: FakeProvider(events: [
        .delta(sequence: 1, text: "old"),
        .delta(sequence: 2, text: "acked"),
        .delta(sequence: 3, text: "new")
    ]))

    let sent = try await coordinator.resume(taskID: taskID)
    XCTAssertEqual(sent.map(\.sequence), [3])
}

func testCancelStopsProviderAndReportsCancelled() async throws {
    await coordinator.cancel(taskID: taskID)
    XCTAssertEqual(provider.cancelledTaskID, taskID)
    XCTAssertEqual(gateway.lastMessage?.type, "task.cancelled")
}
```

- [ ] **Step 2: Verify tests fail**

Run: `xcodebuild test -scheme MeldConnector -destination 'platform=macOS' -only-testing:MeldConnectorTests/TaskCoordinatorTests`

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement local task coordination**

Persist only task ID, provider, current state, and last acknowledged event sequence. Do not persist room context or generated text outside the task workspace.

Allow one running task per provider per device for the MVP. Keep additional tasks server-side in `waiting_for_device`.

- [ ] **Step 4: Implement server acknowledgements**

After persisting each `task.event`, return:

```json
{
  "type": "task.event_ack",
  "taskId": "uuid",
  "sequence": 3
}
```

The connector deletes buffered event 3 only after receiving the acknowledgement.

- [ ] **Step 5: Implement cancellation and partial results**

Cancellation terminates the child process, emits `cancelled`, and deletes the task workspace. If a provider exits after producing text but before a valid result, emit `partial_result` and mark the task `failed`; the web UI offers `Keep partial draft`, `Retry`, and `Discard`.

- [ ] **Step 6: Implement user-visible task status**

Map every contract state to exact copy and allowed actions. Never display `Retry with API` or automatically select the other provider.

- [ ] **Step 7: Run connector and gateway integration tests**

Run:

```bash
xcodebuild test -scheme MeldConnector -destination 'platform=macOS'
pnpm --filter gateway test
pnpm --filter web test -- task-status
```

Expected: queued tasks survive gateway restart; reconnect does not duplicate text; cancellation stops local execution.

- [ ] **Step 8: Commit**

```bash
git add apps/connector-macos apps/gateway apps/web/src/features/ai/components
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
- Create: `apps/connector-macos/Sources/Core/Security/RedactingLogger.swift`
- Test: `apps/connector-macos/Tests/RedactingLoggerTests.swift`
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

```swift
func testLoggerNeverWritesContextOrCredential() {
    let output = RedactingLogger.render([
        "deviceToken": "dt_secret",
        "context": "private PRD",
        "taskID": taskID.uuidString
    ])
    XCTAssertFalse(output.contains("dt_secret"))
    XCTAssertFalse(output.contains("private PRD"))
    XCTAssertTrue(output.contains(taskID.uuidString))
}
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
pnpm test -- redaction
xcodebuild test -scheme MeldConnector -destination 'platform=macOS' \
  -only-testing:MeldConnectorTests/RedactingLoggerTests
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

- [ ] **Step 5: Create the threat model**

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

- [ ] **Step 6: Run the security suite**

Run:

```bash
supabase test db
pnpm test
xcodebuild test -scheme MeldConnector -destination 'platform=macOS'
```

Expected: all authorization, redaction, revocation, isolation, and transition tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607240009_audit_notifications.sql \
  apps/web/src/features/notifications apps/web/src/app/'(app)'/*/inbox \
  apps/web/src/lib apps/gateway/src/observability apps/connector-macos \
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
- Create: `.github/workflows/ci.yml`
- Create: `docs/runbooks/connector-support.md`
- Create: `docs/runbooks/provider-outage.md`
- Create: `docs/runbooks/device-revocation.md`
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

1. verify Node 20.9+, pnpm, Supabase CLI, Xcode, and XcodeGen
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
4. macOS connector build and XCTest on a macOS runner
5. provider contract fixture parsing without live credentials

Live subscription smoke tests remain a controlled release-gate job and must not receive provider credentials through repository CI.

- [ ] **Step 6: Implement the launch-gate script**

`scripts/run-launch-gates.sh` runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
supabase db reset
supabase test db
pnpm exec playwright test
xcodebuild test -scheme MeldConnector -destination 'platform=macOS'
bash spikes/provider-adapters/smoke-test.sh
```

The script exits non-zero on any failure and stores only safe summaries under `.context/launch-evidence/`.

- [ ] **Step 7: Complete manual usability validation**

Use `docs/launch/private-mvp-checklist.md` to record five to ten product-manager/designer sessions. Each session records:

- connector setup completed without engineering intervention
- provider authenticated through official flow
- first agent response completed
- full PRD generated
- targeted revision preserved requested sections
- PRD accepted by owner/admin
- feature conversion required explicit confirmation
- Feature Room reached Design
- elapsed time and blocking issue category

Do not record participant conversation or PRD content.

- [ ] **Step 8: Run every launch gate**

Run:

```bash
bash scripts/run-launch-gates.sh
```

Expected: all automated gates PASS, both provider rows in `docs/provider-compatibility.md` are `Go`, and the private-MVP checklist shows at least five completed core workflows.

- [ ] **Step 9: Commit**

```bash
git add e2e scripts .github/workflows/ci.yml docs/runbooks \
  docs/launch README.md
git commit -m "test: complete private MVP launch gates"
```

## Spec Coverage Matrix

| Approved requirement | Implemented by |
|---|---|
| Google/email authentication, organizations, invitations | Tasks 3–4 |
| Small-team owner/admin/editor/viewer permissions | Tasks 3–5, 11–13 |
| Shared Discovery Room conversation, attachments, evidence, decisions | Task 5 |
| Explicit Product Agent mentions only | Task 10 |
| Personal Codex and Claude subscriptions; no platform AI spend | Tasks 1, 7–10 |
| One persistent macOS connector with background startup | Task 7 |
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
- Apple `SMAppService`: https://developer.apple.com/documentation/servicemanagement/smappservice
- Apple background-process guidance: https://developer.apple.com/documentation/appkit/managing-ongoing-background-processes-in-your-mac
- OpenAI authentication: https://learn.chatgpt.com/docs/auth
- OpenAI CLI commands: https://learn.chatgpt.com/docs/developer-commands?surface=cli
- Claude subscription access: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Claude CLI reference: https://docs.anthropic.com/en/docs/claude-code/cli-usage
