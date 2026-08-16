# tldraw Trial Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a disposable, feature-flagged tldraw trial that proves Meld can securely synchronize a Discovery Room canvas through its Fastify gateway before production user-flow work or license procurement proceeds.

**Architecture:** The web app obtains a short-lived room ticket from an authenticated Next route, then connects `@tldraw/sync` to a separate `/canvas/:roomId` WebSocket route in the existing gateway. The gateway verifies the ticket, enforces editor or viewer access, obtains one PostgreSQL advisory lease per active room, and hosts an exact-version `TLSocketRoom` backed by `SQLiteSyncStorage`; the trial records evidence for persistence, concurrency, audit attribution, and remote undo behavior without introducing Meld's production semantic graph.

**Tech Stack:** Node 22.23.2, Next.js 16, React 19, Fastify 5, tldraw / `@tldraw/sync` / `@tldraw/sync-core` / `@tldraw/tlschema` 5.3.0, Node `DatabaseSync`, PostgreSQL advisory locks via `postgres` 3.4.9, Astryx 0.1.8, Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-09-collaborative-user-flow-canvas-design.md`

## Global Constraints

- This is the disposable Phase 0 technical spike authorized in Section 23.1, capped at two engineering days. It is not the first production increment.
- Pin `tldraw`, `@tldraw/sync`, `@tldraw/sync-core`, and `@tldraw/tlschema` to exactly `5.3.0`; client and server ship from one lockfile.
- Run every install, test, build, and probe with `PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`; the system shell currently resolves Node 20.
- Keep `MELD_USER_FLOW_TRIAL_ENABLED` off by default and fail closed when its configuration is incomplete. Never enable the trial when `NODE_ENV=production`.
- Preserve the tldraw watermark and use only trial-permitted behavior. A production license decision remains outside this plan by the user's instruction.
- Do not add `UserFlowGraph`, custom Meld shapes, AI generation, PRD links, journey lifecycle, PostgreSQL journaling, snapshots, recovery import, or production toolbar work.
- The stock tldraw schema and controls are trial instruments, not an expansion of the product scope in the approved design.
- A query-string WebSocket ticket must never be emitted in gateway request logs. The canvas WebSocket route uses `logLevel: "silent"`, and failures log only a reason code, room ID, and request ID.
- The ticket is derived from the current authenticated Supabase session, lasts 60 seconds, binds organization, room, user, role, and tldraw version, and is refreshed on every reconnect.
- Viewer protection is proved at the gateway by attempting a direct store mutation, not merely by hiding editing controls.
- Audit proof must associate the committed document clock and touched record IDs with gateway-authenticated session metadata. If tldraw 5.3.0 cannot make that association unambiguous under concurrent clients, record a technical no-go.
- SQLite must report `journal_mode=wal`, `synchronous=2` (`FULL`), and `foreign_keys=1`. A local filesystem result does not certify a future hosting volume; the same probe must pass on that volume before production implementation.
- All web chrome uses Astryx. No raw layout `<div>` or `<span>`, no hardcoded CSS colors or pixel values, and no Card-wrapped canvas.
- Web tests remain colocated. Trial browser coverage lives in `e2e/user-flow-trial.spec.ts` and runs through a dedicated Playwright configuration.

---

## File And Responsibility Map

| File | Responsibility |
| --- | --- |
| `packages/device-auth/src/canvas-session.ts` | Mint and verify short-lived signed canvas tickets without depending on browser or gateway code. |
| `apps/web/src/app/api/canvas-session/route.ts` | Authenticate the current user, resolve room access, and issue a room-bound ticket plus gateway URL. |
| `apps/gateway/src/canvas/mutation-audit-probe.ts` | Correlate authenticated per-record authorizer calls with one committed tldraw diff and fail on ambiguous overlap. |
| `apps/gateway/src/canvas/sqlite-canvas-room.ts` | Own one `DatabaseSync`, exact schema, `SQLiteSyncStorage`, `TLSocketRoom`, audit probe, and trial server-authored marker transaction. |
| `apps/gateway/src/canvas/canvas-authority.ts` | Hold and release one PostgreSQL session advisory lock for an organization/room key. |
| `apps/gateway/src/canvas/canvas-room-manager.ts` | Lazily create rooms, reject duplicate authority, evict idle rooms, and close every room on shutdown. |
| `apps/gateway/src/canvas/register-canvas-routes.ts` | Authenticate WebSocket and trial marker requests and connect them to the manager. |
| `apps/web/src/features/user-flow/components/user-flow-trial-tab.tsx` | Client-only dynamic-loading boundary for the canvas SDK. |
| `apps/web/src/features/user-flow/components/user-flow-trial-canvas.tsx` | Call `useSync`, render connection state and stock tldraw, and expose a trial-only editor handle to Playwright. |
| `apps/gateway/src/canvas/e2e-main.ts` | Start only the canvas gateway for browser evidence without starting the connector task runtime. |
| `scripts/canvas-trial/verify-volume.mjs` | Prove file fsync, atomic rename, directory fsync, and SQLite PRAGMAs on a supplied data directory. |
| `e2e/user-flow-trial.spec.ts` | Prove two-editor convergence, direct viewer rejection, persistence, authenticated audit correlation, and remote undo isolation. |
| `docs/design/reports/2026-08-10-tldraw-trial-spike.md` | Record commands, observations, limitations, and the technical go/no-go result. |

---

### Task 1: Pin The SDK And Add Signed Canvas Tickets

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/gateway/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/device-auth/src/canvas-session.ts`
- Create: `packages/device-auth/src/canvas-session.test.ts`
- Modify: `packages/device-auth/src/index.ts`

**Interfaces:**
- Produces: `TLDRAW_TRIAL_VERSION`, `CanvasSessionClaims`, `mintCanvasSessionTicket(input, secret, now?)`, and `verifyCanvasSessionTicket(ticket, secret, expectedRoomId, now?)` from `@meld/device-auth`.
- Ticket claims are `{ version: 1; organizationId; roomId; userId; userName; access: "view" | "edit"; clientVersion: "5.3.0"; expiresAt; nonce }`.
- Tasks 2 and 4 consume the ticket API. Tasks 3 through 6 consume the pinned packages.

- [ ] **Step 1: Add the failing ticket tests**

Create `packages/device-auth/src/canvas-session.test.ts` with tests that use a fixed clock and assert:

```ts
import { describe, expect, it } from "vitest";
import {
  mintCanvasSessionTicket,
  TLDRAW_TRIAL_VERSION,
  verifyCanvasSessionTicket,
} from "./canvas-session";

const NOW = new Date("2026-08-10T10:00:00.000Z");
const SECRET = "a-32-byte-minimum-canvas-ticket-secret";
const INPUT = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  roomId: "40000000-0000-4000-8000-000000000001",
  userId: "10000000-0000-4000-8000-000000000001",
  userName: "Owner Example",
  access: "edit" as const,
};

describe("canvas session tickets", () => {
  it("round-trips trusted claims with a sixty-second lifetime", () => {
    const ticket = mintCanvasSessionTicket(INPUT, SECRET, NOW);
    expect(
      verifyCanvasSessionTicket(ticket, SECRET, INPUT.roomId, NOW),
    ).toMatchObject({
      ...INPUT,
      version: 1,
      clientVersion: TLDRAW_TRIAL_VERSION,
      expiresAt: 1_786_356_060,
    });
  });

  it("rejects tampering, another room, expiry, and another SDK version", () => {
    const ticket = mintCanvasSessionTicket(INPUT, SECRET, NOW);
    expect(() =>
      verifyCanvasSessionTicket(`${ticket}x`, SECRET, INPUT.roomId, NOW),
    ).toThrow("Invalid canvas session ticket");
    expect(() =>
      verifyCanvasSessionTicket(
        ticket,
        SECRET,
        "40000000-0000-4000-8000-000000000002",
        NOW,
      ),
    ).toThrow("Invalid canvas session ticket");
    expect(() =>
      verifyCanvasSessionTicket(
        ticket,
        SECRET,
        INPUT.roomId,
        new Date("2026-08-10T10:01:01.000Z"),
      ),
    ).toThrow("Expired canvas session ticket");
  });

  it("requires a secret of at least thirty-two UTF-8 bytes", () => {
    expect(() => mintCanvasSessionTicket(INPUT, "short", NOW)).toThrow(
      "Canvas session secret must be at least 32 bytes",
    );
  });
});
```

- [ ] **Step 2: Run the ticket test and confirm the missing module failure**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/device-auth exec vitest run src/canvas-session.test.ts
```

Expected: FAIL because `./canvas-session` does not exist.

- [ ] **Step 3: Implement the signed ticket**

Create `packages/device-auth/src/canvas-session.ts`. Use `createHmac("sha256", secret)`, `randomBytes(16).toString("base64url")`, and `timingSafeEqual`. Serialize the JSON payload as base64url and sign exactly that encoded payload. Verification must:

1. Split on one `.` only.
2. Calculate and timing-safely compare a 32-byte signature even when the supplied signature is malformed.
3. Parse JSON only after signature validation.
4. Validate every UUID with the existing UUID pattern, `userName` as 1-200 characters, role as `view` or `edit`, `version === 1`, and `clientVersion === "5.3.0"`.
5. Match `expectedRoomId` and reject when `expiresAt <= Math.floor(now.getTime() / 1000)`.

The public surface is exact:

```ts
export const TLDRAW_TRIAL_VERSION = "5.3.0" as const;

export interface CanvasSessionClaims {
  version: 1;
  organizationId: string;
  roomId: string;
  userId: string;
  userName: string;
  access: "view" | "edit";
  clientVersion: typeof TLDRAW_TRIAL_VERSION;
  expiresAt: number;
  nonce: string;
}

export function mintCanvasSessionTicket(
  input: Omit<
    CanvasSessionClaims,
    "version" | "clientVersion" | "expiresAt" | "nonce"
  >,
  secret: string,
  now = new Date(),
): string;

export function verifyCanvasSessionTicket(
  ticket: string,
  secret: string,
  expectedRoomId: string,
  now = new Date(),
): CanvasSessionClaims;
```

Export all four names from `packages/device-auth/src/index.ts`.

- [ ] **Step 4: Install exact SDK dependencies**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web add tldraw@5.3.0 @tldraw/sync@5.3.0 @tldraw/tlschema@5.3.0
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway add @tldraw/sync-core@5.3.0 @tldraw/tlschema@5.3.0 postgres@3.4.9
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway add -D @types/node@22.20.1
```

Then run `pnpm list --depth 0` in both workspaces and confirm every named tldraw package prints `5.3.0`.

- [ ] **Step 5: Run package verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/device-auth test
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/device-auth typecheck
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway typecheck
```

Expected: all pass; gateway compilation recognizes `node:sqlite`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/gateway/package.json pnpm-lock.yaml packages/device-auth/src
git commit -m "spike(canvas): pin tldraw and sign room tickets"
```

---

### Task 2: Issue Tickets From The Authenticated Room

**Files:**
- Create: `apps/web/src/app/api/canvas-session/route.ts`
- Create: `apps/web/src/app/api/canvas-session/route.test.ts`

**Interfaces:**
- Consumes: `getDiscoveryRoomPageData`, the current Supabase claims, and `mintCanvasSessionTicket` from Task 1.
- Produces: `POST /api/canvas-session` accepting `{ organizationId, roomId }` and returning `{ ticket, gatewayUrl, access, expiresAt }` with `Cache-Control: no-store`.
- Task 5 calls this endpoint from `useSync` on every connection attempt.

- [ ] **Step 1: Write the route tests**

Mock `createClient`, `getDiscoveryRoomPageData`, and `mintCanvasSessionTicket`. Cover these exact outcomes in `route.test.ts`:

```ts
it.each([
  ["missing session", null, 401],
  ["unknown room", { sub: OWNER_ID }, 404],
])("rejects %s", async (_case, claims, status) => {
  mocks.getClaims.mockResolvedValue({
    data: { claims },
    error: claims ? null : new Error("missing"),
  });
  if (status === 404) mocks.getRoom.mockResolvedValue(null);
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(mocks.mintTicket).not.toHaveBeenCalled();
});

it.each([
  ["owner", OWNER_ID, false, "edit"],
  ["organization admin", ADMIN_ID, true, "edit"],
  ["editor", EDITOR_ID, false, "edit"],
  ["viewer", VIEWER_ID, false, "view"],
])("issues trusted %s access", async (_case, userId, isAdmin, access) => {
  seedRoom({ userId, isAdmin });
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.mintTicket).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      roomId: ROOM_ID,
      userId,
      access,
    }),
    "a-32-byte-minimum-canvas-ticket-secret",
  );
});

it("fails closed when the trial or its configuration is absent", async () => {
  delete process.env.MELD_USER_FLOW_TRIAL_ENABLED;
  const response = await POST(request());
  expect(response.status).toBe(404);
});
```

Also assert `400` for malformed UUIDs, `403` when the current user is absent from an otherwise returned room and is neither owner nor admin, and `503` when the secret or WebSocket URL is absent.

- [ ] **Step 2: Run the route test and confirm failure**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web exec vitest run src/app/api/canvas-session/route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route**

Implement `POST` with a strict Zod body schema. Return `404` immediately unless both `MELD_USER_FLOW_TRIAL_ENABLED === "true"` and `NODE_ENV !== "production"`. Authenticate with the same `createClient(responseHeaders)` and `supabase.auth.getClaims()` pattern used by `apps/web/src/app/api/ai/tasks/route.ts`.

Resolve access with this precedence:

```ts
const participant = data.participants.find(
  (candidate) => candidate.userId === data.currentUser.id,
);
const access =
  data.room.ownerId === data.currentUser.id ||
  data.isCurrentUserOrgAdmin ||
  participant?.access === "edit"
    ? "edit"
    : participant?.access === "view"
      ? "view"
      : null;
```

Issue the ticket using server-known `data.currentUser.id` and `data.currentUser.name`. Never accept name, access, expiry, or gateway URL from the request. Return the WebSocket base from `MELD_CANVAS_WS_URL`, without putting the ticket into that value; Task 5 appends the encoded ticket.

- [ ] **Step 4: Run the focused route tests and web typecheck**

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web exec vitest run src/app/api/canvas-session/route.test.ts
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/canvas-session
git commit -m "spike(canvas): issue authenticated room tickets"
```

---

### Task 3: Prove SQLite Persistence And Audit Correlation

**Files:**
- Create: `apps/gateway/src/canvas/mutation-audit-probe.ts`
- Create: `apps/gateway/src/canvas/mutation-audit-probe.test.ts`
- Create: `apps/gateway/src/canvas/sqlite-canvas-room.ts`
- Create: `apps/gateway/src/canvas/sqlite-canvas-room.test.ts`

**Interfaces:**
- Produces: `CanvasSessionMeta`, `CanvasAuditEvent`, `MutationAuditProbe`, and `SqliteCanvasRoom`.
- `CanvasSessionMeta` is `{ organizationId; roomId; userId; userName; access; clientVersion }` and always comes from a verified ticket.
- `SqliteCanvasRoom.connect({ sessionId, socket, meta })`, `insertServerMarker(label)`, `getSnapshot()`, `getAuditEvents()`, `getAuditFailures()`, `getNumActiveSessions()`, and `close()` are consumed by Task 4.

- [ ] **Step 1: Test the audit state machine before using tldraw hooks**

The tests must prove one message can touch several records, presence-only messages produce no event, a committed diff records sorted unique IDs, and overlapping authenticated mutations fail closed:

```ts
const probe = new MutationAuditProbe();
probe.beginMessage(EDITOR_A);
probe.recordWrite(EDITOR_A, "shape:a");
probe.recordWrite(EDITOR_A, "binding:a");
probe.commit({
  documentClock: 7,
  touchedRecordIds: ["binding:a", "shape:a"],
});

expect(probe.events()).toEqual([
  {
    organizationId: ORGANIZATION_ID,
    roomId: ROOM_ID,
    actorId: EDITOR_A.userId,
    sessionId: EDITOR_A.sessionId,
    clientVersion: "5.3.0",
    documentClock: 7,
    origin: "client",
    touchedRecordIds: ["binding:a", "shape:a"],
  },
]);

probe.beginMessage(EDITOR_A);
probe.recordWrite(EDITOR_A, "shape:b");
probe.beginMessage(EDITOR_B);
expect(probe.failures()).toContainEqual(
  expect.objectContaining({ code: "ambiguous_actor_overlap" }),
);
```

`recordWrite` must compare the authorizer's authenticated session with the active message. `commit` must compare the diff IDs with the authorizer IDs. Any mismatch records a failure and produces no successful audit event.

- [ ] **Step 2: Run the audit test and confirm failure**

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway exec vitest run src/canvas/mutation-audit-probe.test.ts
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the audit probe**

Use an in-memory trial sink. `beginMessage` is called by `onAfterReceiveMessage`, `recordWrite` by authorizers for every document-scoped schema type, and `commit` by `onCommittedChanges`. Extract touched IDs from `diff.puts` keys plus `diff.deletes`. The class must expose copies, not its mutable arrays:

```ts
export class MutationAuditProbe {
  beginMessage(meta: CanvasSessionMeta & { sessionId: string }): void;
  recordWrite(
    meta: CanvasSessionMeta & { sessionId: string },
    recordId: string,
  ): void;
  commit(input: {
    documentClock: number;
    touchedRecordIds: readonly string[];
  }): void;
  events(): readonly CanvasAuditEvent[];
  failures(): readonly CanvasAuditFailure[];
}
```

Presence messages replace an untouched active message without error. A new message arriving after `recordWrite` but before `commit`, mixed authenticated sessions, or an authorizer/diff ID mismatch records a named failure.

- [ ] **Step 4: Add SQLite room tests**

Create a temporary directory with `mkdtemp`, open a room, and assert:

```ts
expect(room.pragmas()).toEqual({
  journalMode: "wal",
  synchronous: 2,
  foreignKeys: 1,
});
```

Use `room.insertServerMarker("Persisted by the gateway")`, close it, reopen the same path, and assert the snapshot still contains exactly one shape whose text is that label. Also assert the insert returns `{ documentClock, recordId }` and that it creates no client-origin audit event.

- [ ] **Step 5: Implement `SqliteCanvasRoom`**

Open `DatabaseSync(databasePath)`, then execute:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
```

Construct one `NodeSqliteWrapper`, one `SQLiteSyncStorage`, one `createTLSchema()` result, and one `TLSocketRoom<UnknownRecord, CanvasSessionMeta>`. Build `authorizeRecord` dynamically from schema types whose `scope === "document"`; each function calls `auditProbe.recordWrite` with the authenticated `session.meta` and `next?.id ?? prev.id`, then returns `next ?? prev`.

Wire hooks exactly:

```ts
onAfterReceiveMessage: ({ meta, sessionId }) => {
  auditProbe.beginMessage({ ...meta, sessionId });
},
onCommittedChanges: ({ diff, documentClock }) => {
  auditProbe.commit({
    documentClock,
    touchedRecordIds: [
      ...Object.keys(diff.puts),
      ...diff.deletes,
    ],
  });
},
```

`connect` calls `handleSocketConnect` with `isReadonly: meta.access === "view"`; do not trust an access value supplied separately from `meta`.

`insertServerMarker` uses `storage.transaction(..., { id: "trial:server-marker", emitChanges: "always" })` to add one valid stock `geo` shape beneath the first persisted page. Generate the ID server-side, use a valid fractional index, and return the transaction's resulting clock and record ID. The method itself writes a separate `origin: "server"` evidence event because tldraw documents that `onCommittedChanges` fires only for client pushes.

`close()` first closes `TLSocketRoom`, then the SQLite database, and is idempotent.

- [ ] **Step 6: Run focused gateway tests**

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway exec vitest run src/canvas/mutation-audit-probe.test.ts src/canvas/sqlite-canvas-room.test.ts
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway typecheck
```

Expected: PASS. Treat an audit correlation failure as a spike failure rather than weakening the assertion.

- [ ] **Step 7: Commit**

```bash
git add apps/gateway/src/canvas/mutation-audit-probe.ts apps/gateway/src/canvas/mutation-audit-probe.test.ts apps/gateway/src/canvas/sqlite-canvas-room.ts apps/gateway/src/canvas/sqlite-canvas-room.test.ts
git commit -m "spike(canvas): persist sync rooms and probe audit attribution"
```

---

### Task 4: Add Single-Authority Canvas Routes To The Gateway

**Files:**
- Create: `apps/gateway/src/canvas/canvas-authority.ts`
- Create: `apps/gateway/src/canvas/canvas-authority.integration.test.ts`
- Create: `apps/gateway/src/canvas/canvas-room-manager.ts`
- Create: `apps/gateway/src/canvas/canvas-room-manager.test.ts`
- Create: `apps/gateway/src/canvas/register-canvas-routes.ts`
- Create: `apps/gateway/src/canvas/register-canvas-routes.test.ts`
- Modify: `apps/gateway/src/config.ts`
- Modify: `apps/gateway/src/config.test.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/src/server.test.ts`
- Modify: `apps/gateway/src/main.ts`
- Modify: `apps/gateway/src/main.test.ts`

**Interfaces:**
- `CanvasAuthorityLeaseFactory.acquire(organizationId, roomId)` returns `CanvasAuthorityLease | null`; a lease exposes idempotent `release()`.
- `CanvasRoomManager.getOrCreate(organizationId, roomId)`, `connect(...)`, `insertServerMarker(...)`, `evidence(roomId)`, `beginShutdown()`, and `closeAll()` are used by the route plugin and E2E harness.
- `registerCanvasRoutes(server, { enabled, sessionSecret, roomManager })` is called by the existing `buildServer`.

- [ ] **Step 1: Test the PostgreSQL authority lease**

Add an integration test using `GATEWAY_DATABASE_URL` and two independent `postgres()` clients. Assert the first factory acquires `organizationId/roomId`, the second returns `null`, a different room succeeds, and the second acquires the original room only after the first lease releases.

Use a dedicated reserved connection for the lifetime of each lease and this SQL key:

```sql
SELECT pg_try_advisory_lock(
  hashtextextended(${organizationId || ':' || roomId}, 0)
) AS acquired;
```

Release with `pg_advisory_unlock` on the same reserved connection before `reserved.release()`.

- [ ] **Step 2: Run the integration test and confirm failure**

With local Supabase running, run:

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" GATEWAY_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" pnpm --filter @meld/gateway test:integration -- src/canvas/canvas-authority.integration.test.ts
```

Expected: FAIL because `canvas-authority.ts` is absent.

- [ ] **Step 3: Implement the lease and room manager**

`CanvasRoomManager` keeps a map keyed by `${organizationId}:${roomId}`. Creation order is strict: acquire lease, create the data directory recursively, open `SqliteCanvasRoom`, then publish the map entry. On any error, close the room if opened and release the lease.

When `SqliteCanvasRoom` reports zero sessions, start the configured idle timer. A reconnect cancels it. Eviction closes SQLite before releasing the advisory lease. `closeAll()` prevents new rooms, closes every room, releases every lease, and awaits all releases.

The trial defaults are `20` active rooms and `120_000` idle milliseconds. Exceeding the room count throws `canvas_capacity_reached`; a held advisory lock throws `room_authority_unavailable`.

- [ ] **Step 4: Test route authentication and enforcement**

Build a Fastify instance with `@fastify/websocket`, a fake manager, and `registerCanvasRoutes`. Tests must assert:

- disabled trial returns `404`;
- missing, malformed, expired, wrong-room, and wrong-version tickets return `401` before manager access;
- `sessionId` is required and limited to 200 characters;
- an editor ticket reaches `connect` with `access: "edit"`;
- a viewer ticket reaches `connect` with `access: "view"`;
- `room_authority_unavailable` returns a retryable `503` upgrade failure;
- the WebSocket route is configured with `logLevel: "silent"`;
- `POST /canvas/:roomId/trial/server-marker` accepts `Authorization: Canvas <ticket>`, rejects a viewer with `403`, and never accepts a query token.
- `GET /canvas/:roomId/trial/evidence` accepts an editor `Authorization: Canvas <ticket>` header and returns only counts, clocks, actor/session IDs, touched record IDs, and named audit failures; it never returns the ticket or raw sync frames.

- [ ] **Step 5: Implement and register the routes**

Decorate the Fastify request with verified canvas claims and the prepared room. In WebSocket `preValidation`, verify `request.query.ticket` and call `roomManager.getOrCreate`; in the handler call `room.connect` synchronously so tldraw installs socket listeners before any frame can be dropped.

Extend `GatewayConfig` with:

```ts
canvasTrialEnabled: boolean;
canvasSessionSecret?: string;
canvasDataDir?: string;
databaseUrl?: string;
canvasIdleEvictionMs: number;
```

Map `MELD_USER_FLOW_TRIAL_ENABLED`, `MELD_CANVAS_SESSION_SECRET`, `MELD_CANVAS_DATA_DIR`, `GATEWAY_DATABASE_URL`, and `MELD_CANVAS_IDLE_EVICTION_MS`. When enabled, reject `NODE_ENV=production` and require the three string settings.

Extend `buildServer` options with an optional `canvasRoomManager`; register routes only when the manager exists. In `startGateway`, construct the PostgreSQL client, lease factory, and manager when the flag is enabled. Shutdown order is: call `canvasRoomManager.beginShutdown()` so new canvas validations fail, close all canvas rooms and release their leases, close the Fastify server, then close the PostgreSQL client. Preserve the existing connector registry, watchdog, and sweeper behavior.

- [ ] **Step 6: Run gateway verification**

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway exec vitest run src/config.test.ts src/canvas/canvas-room-manager.test.ts src/canvas/register-canvas-routes.test.ts src/server.test.ts src/main.test.ts
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" GATEWAY_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" pnpm --filter @meld/gateway test:integration -- src/canvas/canvas-authority.integration.test.ts
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/gateway/src/canvas apps/gateway/src/config.ts apps/gateway/src/config.test.ts apps/gateway/src/server.ts apps/gateway/src/server.test.ts apps/gateway/src/main.ts apps/gateway/src/main.test.ts
git commit -m "spike(canvas): host authorized tldraw rooms in the gateway"
```

---

### Task 5: Render The Trial In A User Flows Tab

**Files:**
- Create: `apps/web/src/features/user-flow/components/user-flow-trial-tab.tsx`
- Create: `apps/web/src/features/user-flow/components/user-flow-trial-tab.test.tsx`
- Create: `apps/web/src/features/user-flow/components/user-flow-trial-canvas.tsx`
- Create: `apps/web/src/features/user-flow/components/user-flow-trial-canvas.test.tsx`
- Modify: `apps/web/src/features/prd/components/room-tabs.ts`
- Modify: `apps/web/src/features/prd/components/room-tab-strip.tsx`
- Modify: `apps/web/src/features/prd/components/room-tab-strip.test.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx`

**Interfaces:**
- `UserFlowTrialTab` receives `{ organizationId; roomId; currentUserId; currentUserName; access }`.
- `UserFlowTrialCanvas` calls Task 2's endpoint and passes a remote store to `<Tldraw>`.
- `RoomTab` becomes `"conversation" | "prd" | "user-flows"`; `parseRoomTab(raw, hasPrd, userFlowsEnabled)` accepts the third value only while enabled.

- [ ] **Step 1: Extend tab parsing and strip tests**

Add assertions that `parseRoomTab("user-flows", true, true)` returns `"user-flows"`, the same input with the flag false returns `"conversation"`, and the visible strip adds a `User Flows` link with `?tab=user-flows` only while enabled. Keep all existing PRD progressive-visibility behavior unchanged.

- [ ] **Step 2: Run the tab tests and confirm failure**

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web exec vitest run src/features/prd/components/room-tab-strip.test.tsx
```

Expected: FAIL because `user-flows` is not a `RoomTab`.

- [ ] **Step 3: Implement the tab and page branch**

Use a Boxicons flow or branch icon already available from `@boxicons/react`; verify its exact export before import. Add `showUserFlows` to `RoomTabStrip` and render a normal Astryx `Tab`, not a custom button.

The room page computes:

```ts
const userFlowsEnabled =
  process.env.MELD_USER_FLOW_TRIAL_ENABLED === "true" &&
  process.env.NODE_ENV !== "production";
```

Pass that value into both `parseRoomTab` calls and `RoomTabStrip`. Render `UserFlowTrialTab` for the new active tab and calculate `access` from the same owner/admin/editor precedence used by the ticket route. Do not fetch messages, the current PRD, PRD history, or agent readiness for this branch.

- [ ] **Step 4: Test the canvas connection states**

Mock `@tldraw/sync` and `tldraw`. Cover:

- `loading` renders an Astryx `Spinner` and `Connecting`;
- `error` renders a concise `Connection failed` status without leaking the ticket or raw URL;
- `synced-remote` renders `Tldraw` with the remote store;
- viewer access passes `isReadonly` through the server ticket only and sets the client editor to read-only as a usability guard;
- the async `uri` function POSTs `{ organizationId, roomId }`, URL-encodes the returned ticket, and rejects non-201 responses;
- the SDK receives a reactive `TLUserStore` built from server-rendered identity props and `licenseKey` only when `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` supplies one.

- [ ] **Step 5: Implement the dynamic boundary and canvas**

`user-flow-trial-tab.tsx` is a client component that uses `next/dynamic` with `ssr: false`. Its loading state uses `Center`, `Stack`, `Spinner`, and `Text` from Astryx.

`user-flow-trial-canvas.tsx` imports `tldraw/tldraw.css` inside this feature boundary and uses:

```tsx
const remote = useSync({
  uri: async () => {
    const response = await fetch("/api/canvas-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId, roomId }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Canvas session unavailable");
    const session = CanvasSessionResponseSchema.parse(await response.json());
    return `${session.gatewayUrl}/canvas/${roomId}?ticket=${encodeURIComponent(session.ticket)}`;
  },
  assets: inlineBase64AssetStore,
  users,
});
```

Define `CanvasSessionResponseSchema` in the same module as a strict Zod object containing a non-empty ticket, a `ws:` or `wss:` gateway URL, `view | edit` access, and integer expiry. Construct `users` once with `useMemo`, `computed`, `createUserId`, and `UserRecordType.create`; use tldraw's documented `coral` user color because SDK records do not accept Meld CSS tokens:

```ts
const users = useMemo<TLUserStore>(
  () => ({
    currentUser: computed(`canvas-user:${currentUserId}`, () =>
      UserRecordType.create({
        id: createUserId(currentUserId),
        name: currentUserName,
        color: "coral",
      }),
    ),
  }),
  [currentUserId, currentUserName],
);
```

Wrap the canvas in an Astryx `Layout` whose `LayoutContent` has `position: "relative"`, `width: "100%"`, `height: "100%"`, and a token-based minimum height. Use an unframed `LayoutHeader` for `StatusDot` plus `Synced`, `Connecting`, or `Offline`; do not put the canvas in a Card.

On editor mount, call `editor.updateInstanceState({ isReadonly: access === "view" })`. While the non-production trial flag is true, assign the editor to `window.__MELD_TLDRAW_TRIAL_EDITOR__` and remove it on unmount so Playwright can attempt direct mutations and inspect undo behavior. Declare that window property in the same module.

- [ ] **Step 6: Run web verification**

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web exec vitest run src/features/prd/components/room-tab-strip.test.tsx src/features/user-flow/components/user-flow-trial-tab.test.tsx src/features/user-flow/components/user-flow-trial-canvas.test.tsx 'src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx'
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm check:astryx
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/user-flow apps/web/src/features/prd/components/room-tabs.ts apps/web/src/features/prd/components/room-tab-strip.tsx apps/web/src/features/prd/components/room-tab-strip.test.tsx 'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx' 'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx'
git commit -m "spike(canvas): expose the tldraw trial in discovery rooms"
```

---

### Task 6: Run The Technical Gate And Publish Evidence

**Files:**
- Create: `apps/gateway/src/canvas/e2e-main.ts`
- Create: `playwright.canvas-trial.config.ts`
- Create: `e2e/user-flow-trial.spec.ts`
- Create: `scripts/canvas-trial/verify-volume.mjs`
- Create: `docs/design/reports/2026-08-10-tldraw-trial-spike.md`
- Modify: `package.json`

**Interfaces:**
- `e2e-main.ts` starts the same `registerCanvasRoutes` and `CanvasRoomManager` code used by the gateway, with a process-local lease used only for browser behavior tests.
- The Playwright test uses `window.__MELD_TLDRAW_TRIAL_EDITOR__` and the authenticated server-marker endpoint.
- The final report is the only output that declares the technical gate pass, conditional pass, or no-go.

- [ ] **Step 1: Add the volume probe**

`verify-volume.mjs` requires `MELD_CANVAS_DATA_DIR`. It must create the directory, write a random value to a temporary file, call `fs.fsyncSync(fileDescriptor)`, rename the file, call `fs.fsyncSync(directoryDescriptor)`, reopen and compare the value, then create a Node `DatabaseSync` file and assert the three PRAGMA values.

Print one JSON object and exit nonzero on any failed assertion:

```json
{"fileFsync":true,"atomicRename":true,"directoryFsync":true,"journalMode":"wal","synchronous":2,"foreignKeys":1}
```

Always delete only the probe files it created; never recursively delete the supplied directory.

- [ ] **Step 2: Add the isolated browser harness**

`e2e-main.ts` refuses `NODE_ENV=production`, listens on `127.0.0.1:8788`, uses the shared secret from its environment, and writes SQLite files beneath `.context/tldraw-trial-e2e`. It exposes `/health` plus the real canvas routes and closes the manager on `SIGINT`/`SIGTERM`.

`playwright.canvas-trial.config.ts` starts two servers:

1. Next on `127.0.0.1:3010` with the existing fake auth/discovery flags plus `MELD_USER_FLOW_TRIAL_ENABLED=true`, `MELD_CANVAS_SESSION_SECRET=a-32-byte-minimum-canvas-ticket-secret`, and `MELD_CANVAS_WS_URL=ws://127.0.0.1:8788`.
2. The canvas harness on `127.0.0.1:8788` with the same secret.

Use `testMatch: "user-flow-trial.spec.ts"`, Chromium, one worker, and no reuse of existing servers. Add root script:

```json
"test:e2e:canvas-trial": "playwright test --config playwright.canvas-trial.config.ts"
```

- [ ] **Step 3: Write browser acceptance tests**

Use the existing owner, teammate, and viewer fake users from `e2e/prd-edit-acceptance.spec.ts`. The spec must prove:

1. Owner and teammate open `?tab=user-flows`; owner creates a named geo shape through the editor handle; teammate observes the same record and both reach `synced-remote`.
2. Viewer calls `editor.store.put` directly with a valid shape record. The optimistic record is removed after server response and never appears in the owner's store.
3. The ticket endpoint response says `edit` for owner and `view` for viewer; the ticket value never appears in visible page text or captured gateway logs.
4. Owner creates local shape A, the authenticated `POST /canvas/:roomId/trial/server-marker` inserts shape B, and owner invokes undo once. Shape A is removed while shape B remains, proving the server transaction was received as remote history.
5. Two editors submit interleaved shape creates for 50 iterations. The manager's trial evidence endpoint returns no audit failures and one client audit row per committed document diff, each with a valid actor, session, clock, and touched ID set.
6. A gateway integration test closes one `CanvasRoomManager`, constructs a new manager over the same data directory, reconnects a sync client, and reads the records. The browser suite proves live reconnect and convergence; this manager test proves process-lifetime persistence deterministically without killing a Playwright-managed process.

- [ ] **Step 4: Run the complete gate**

Run in this order:

```bash
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm test:e2e:canvas-trial
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway test
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" GATEWAY_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" pnpm --filter @meld/gateway test:integration
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web test
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm check:astryx
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm check:test-colocation
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm typecheck
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm build
PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" MELD_CANVAS_DATA_DIR=".context/tldraw-trial-volume" node scripts/canvas-trial/verify-volume.mjs
```

Expected: every command passes and the volume probe prints the exact successful JSON shape from Step 1.

- [ ] **Step 5: Perform visual and interaction verification**

Capture Playwright screenshots at `1440x900` and `390x844`. Assert the canvas container has nonzero width and height, sample pixels within its center are not all the page background color, the tab strip and tldraw controls do not overlap, and every tab label fits its bounds. Exercise pan, zoom, select, create, and cursor presence on desktop; on mobile verify framing and navigation without claiming the production accessibility gate is complete.

- [ ] **Step 6: Write the evidence report**

Create `docs/design/reports/2026-08-10-tldraw-trial-spike.md` with this decision structure after the commands have run:

```markdown
# tldraw Trial Spike Report

Date: 2026-08-10
SDK: tldraw 5.3.0
Runtime: Node 22.23.2

## Decision

[GO only when every required local technical proof passed; otherwise NO-GO]

Production implementation remains blocked on the written commercial terms and a successful rerun of the volume probe on the intended host.

## Technical Evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Exact-version client/server sync | PASS or FAIL | Named test and observed version |
| Server-enforced viewer read-only | PASS or FAIL | Direct-store mutation test |
| Authenticated mutation audit | PASS or FAIL | Concurrent audit test and failure count |
| Server transaction excluded from local undo | PASS or FAIL | Named undo test |
| SQLite WAL/FULL/foreign keys | PASS or FAIL | Probe JSON and restart test |
| Single PostgreSQL room authority | PASS or FAIL | Advisory-lock integration test |
| Intended-volume fsync semantics | LOCAL ONLY or PASS or FAIL | Probe path and hosting evidence |

## Scope Boundaries

This spike does not implement the semantic user-flow model, AI generation, journey states, PRD links, production recovery, accessibility completion, load targets, or commercial approval.

## Failures And Follow-up

List only observed failures. When none occurred, state `No technical failures observed in the local spike.`
```

Replace every result choice with one actual value. Include command exit codes, the audit failure count, the SQLite reopen record count, and screenshot paths. A local-only volume result makes the overall decision conditional for hosting and cannot be represented as a full production GO.

- [ ] **Step 7: Final scope and quality review**

Run:

```bash
git diff --check
grep -R -n -E 'TODO|TBD|UserFlowGraph|UserFlowPatch' apps/gateway/src/canvas apps/web/src/features/user-flow scripts/canvas-trial e2e/user-flow-trial.spec.ts
git diff --stat origin/main...
```

Expected: `git diff --check` passes; the grep returns no implementation placeholders or production semantic contracts; the diff contains only the trial, tests, dependency pins, report, spec, and plan.

- [ ] **Step 8: Commit**

```bash
git add apps/gateway/src/canvas/e2e-main.ts playwright.canvas-trial.config.ts e2e/user-flow-trial.spec.ts scripts/canvas-trial/verify-volume.mjs docs/design/reports/2026-08-10-tldraw-trial-spike.md package.json
git commit -m "test(canvas): record the tldraw technical gate"
```

---

## Completion Gate

The spike is complete only when the report contains actual results for all seven technical gates. A failed or ambiguous audit correlation, viewer mutation that reaches another client, server-authored operation entering local undo, lost acknowledged SQLite state, or duplicate room authority is an immediate technical no-go. A local-only filesystem result allows continued local design work but does not authorize production implementation or deployment.
