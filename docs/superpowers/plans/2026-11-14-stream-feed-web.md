# Stream Feed (web side of step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside the Orion Mac app, make the room page feed a project's chat to the native app over the bridge (messages, whether Orion is busy, model choices) and accept "send this message" from the app, without drawing any chat UI itself.

**Architecture:** A pure function turns the room's messages, task statuses and agent readiness into a `StreamSnapshot`. A headless client component, `NativeStreamBridge`, keeps that snapshot fresh (the same realtime subscription and task-status poller `Conversation` uses) and posts it to the app as bridge message `stream`. The same component registers `window.__orionStream.post(...)`, which runs the existing `postMessage` server action as the signed-in person, so no new server endpoint, database function or permission path exists. In the Mac app (user agent token `OrionFrame/2`) the room page drops its tab bar, room header and tab strip and mounts the bridge; browsers see the page exactly as today.

**Tech Stack:** TypeScript, Next.js (app router, server actions), React 19, Vitest (+ Testing Library, jsdom). Run from `apps/web`: `pnpm test <path>`, `pnpm typecheck`, `pnpm lint`.

Spec: `docs/superpowers/specs/2026-11-14-project-stream-and-stars-design.md` (Part C: "Header and frame", "Stream (native, fed by the page)").
Companion plan (Swift side): `docs/superpowers/plans/2026-11-14-native-project-screen.md`. This plan must land first; the Swift plan consumes the exact wire shape defined in Task 1.

## Global Constraints

- **No new server endpoints, no new SQL, no new service-role access.** Everything runs through existing server actions.
- Bridge messages are versioned `v: 1`, posted with `postToNative` from `apps/web/src/features/native/bridge.ts`. Unknown message types are ignored by the app, so adding `stream` is safe for older app builds.
- Only the `OrionFrame/2` user agent switches the room page into feed mode. `OrionFrame/1` (older Mac builds) and browsers keep the current page unchanged.
- Text only in step 1. Attachments are not supported from the native composer yet.
- Every message sent from the native composer addresses Orion: `mentionsProductAgent: true`, `agentKind: "product"`, no human mentions.
- Wire shape field names are exactly those in Task 1; do not rename them.
- The room page keeps rendering the selected surface (Canvas, PRD, Prototype…) in feed mode; only its header, tab strip and project tabs are removed.

## File Structure

| File | Responsibility |
|---|---|
| Create `apps/web/src/features/rooms/reconcile-message.ts` | `reconcileMessage` moved out of `conversation.tsx` so the feed and `Conversation` share it |
| Modify `apps/web/src/features/rooms/components/conversation.tsx` | Import `reconcileMessage` instead of defining it |
| Modify `apps/web/src/features/native/bridge.ts` | `StreamSnapshot` types, `stream` message, `registerStreamHandler` |
| Create `apps/web/src/features/native/stream-snapshot.ts` | Pure `buildStreamSnapshot` |
| Create `apps/web/src/features/native/native-stream-bridge.tsx` | Headless component: keeps state fresh, posts snapshots, registers `post` |
| Modify `apps/web/src/features/native/user-agent.ts` | `isOrionFrameV2UserAgent` |
| Modify `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` | Feed mode |
| Tests next to each new file | `*.test.ts(x)` |

---

### Task 1: Wire shape and snapshot builder

**Files:**
- Create: `apps/web/src/features/rooms/reconcile-message.ts`
- Create: `apps/web/src/features/rooms/reconcile-message.test.ts`
- Modify: `apps/web/src/features/rooms/components/conversation.tsx` (remove the local `reconcileMessage` at ~line 433, add an import)
- Modify: `apps/web/src/features/native/bridge.ts`
- Create: `apps/web/src/features/native/stream-snapshot.ts`
- Test: `apps/web/src/features/native/stream-snapshot.test.ts`

**Interfaces:**
- Produces (exact names the Swift plan relies on):
  - `StreamMessageRow = { id: string; authorKind: "human" | "orion"; authorId: string | null; authorName: string; text: string; createdAt: string; replyToId: string | null; delivery: "sending" | "persisted" | "failed" }`
  - `StreamModelChoice = { provider: string; models: string[]; defaultModel: string | null }`
  - `StreamSend = { canSend: true } | { canSend: false; reason: string }`
  - `StreamSnapshot = { roomId: string; projectId: string; currentUserId: string; currentUserName: string; orionBusy: boolean; send: StreamSend; defaultProvider: string | null; choices: StreamModelChoice[]; messages: StreamMessageRow[] }`
  - `NativeMessage` gains `| ({ v: 1; type: "stream" } & StreamSnapshot)`
  - `reconcileMessage(messages: RoomMessage[], incoming: RoomMessage): RoomMessage[]`
  - `buildStreamSnapshot(input: StreamSnapshotInput): StreamSnapshot` where `StreamSnapshotInput = { roomId: string; projectId: string; currentUser: { id: string; name: string }; participants: { userId: string; email: string }[]; messages: RoomMessage[]; taskStatuses: RoomTaskStatus[]; readiness: AgentReadiness }`

- [ ] **Step 1: Move `reconcileMessage` and test it**

Create `apps/web/src/features/rooms/reconcile-message.ts` by moving the function body from `conversation.tsx` verbatim:

```ts
import type { RoomMessage } from "./repository";

// Upsert by id or clientId. A Realtime INSERT echo carries no attachments --
// files link to the message over a separate write that lands after the
// insert -- so keep the attachments already resolved locally rather than
// letting the echo blank them.
export function reconcileMessage(
  messages: RoomMessage[],
  incoming: RoomMessage,
): RoomMessage[] {
  const existing = messages.find(
    (message) =>
      message.clientId === incoming.clientId || message.id === incoming.id,
  );
  const resolved =
    incoming.attachments.length === 0 &&
    existing &&
    existing.attachments.length > 0
      ? { ...incoming, attachments: existing.attachments }
      : incoming;
  const withoutDuplicate = messages.filter(
    (message) =>
      message.clientId !== incoming.clientId && message.id !== incoming.id,
  );
  return [...withoutDuplicate, resolved].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}
```

In `conversation.tsx` delete the local `function reconcileMessage(...) {...}` (the whole function) and add to the imports near `import type { RoomMessage } from "../repository";`:

```ts
import { reconcileMessage } from "../reconcile-message";
```

Create `apps/web/src/features/rooms/reconcile-message.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reconcileMessage } from "./reconcile-message";
import type { RoomMessage } from "./repository";

function message(overrides: Partial<RoomMessage>): RoomMessage {
  return {
    id: "m1",
    roomId: "r1",
    clientId: "c1",
    authorType: "human",
    authorId: "u1",
    initiatedBy: null,
    aiTaskId: null,
    provider: null,
    body: "hello",
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposedAction: null,
    kind: "conversation",
    prdContext: null,
    prdChange: null,
    attachments: [],
    createdAt: "2026-11-14T10:00:00.000Z",
    delivery: "persisted",
    ...overrides,
  };
}

describe("reconcileMessage", () => {
  it("appends a new message in time order", () => {
    const first = message({ id: "m1", clientId: "c1", createdAt: "2026-11-14T10:00:00.000Z" });
    const second = message({ id: "m2", clientId: "c2", createdAt: "2026-11-14T10:01:00.000Z" });
    expect(reconcileMessage([second], first).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("replaces an optimistic copy that shares the clientId", () => {
    const sending = message({ id: "temp", clientId: "c1", delivery: "sending" });
    const persisted = message({ id: "m1", clientId: "c1", delivery: "persisted" });
    const result = reconcileMessage([sending], persisted);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "m1", delivery: "persisted" });
  });

  it("keeps resolved attachments when a realtime echo has none", () => {
    const attachment = { id: "a1" } as RoomMessage["attachments"][number];
    const existing = message({ attachments: [attachment] });
    const echo = message({ attachments: [] });
    expect(reconcileMessage([existing], echo)[0].attachments).toEqual([attachment]);
  });
});
```

- [ ] **Step 2: Run the moved-function tests and the conversation tests**

Run (from `apps/web`): `pnpm test src/features/rooms/reconcile-message.test.ts src/features/rooms/components/conversation.test.tsx`
Expected: PASS. (If `conversation.test.tsx` fails for a reason unrelated to the import, stop and report; do not edit it.)

- [ ] **Step 3: Write the failing snapshot tests**

Create `apps/web/src/features/native/stream-snapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { RoomMessage } from "@/features/rooms/repository";
import { buildStreamSnapshot } from "./stream-snapshot";

function message(overrides: Partial<RoomMessage>): RoomMessage {
  return {
    id: "m1",
    roomId: "r1",
    clientId: "c1",
    authorType: "human",
    authorId: "u1",
    initiatedBy: null,
    aiTaskId: null,
    provider: null,
    body: "hello",
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposedAction: null,
    kind: "conversation",
    prdContext: null,
    prdChange: null,
    attachments: [],
    createdAt: "2026-11-14T10:00:00.000Z",
    delivery: "persisted",
    ...overrides,
  };
}

function task(overrides: Partial<RoomTaskStatus>): RoomTaskStatus {
  return {
    taskId: "t1",
    sourceMessageId: "m1",
    initiatingUserId: "u1",
    provider: "claude",
    kind: "room_reply",
    agentKind: "product",
    status: "completed",
    createdAt: "2026-11-14T10:00:01.000Z",
    updatedAt: "2026-11-14T10:00:02.000Z",
    ...overrides,
  };
}

const ready: AgentReadiness = {
  ready: true,
  defaultProvider: "claude",
  defaultDeviceId: "d1",
  providers: [
    { provider: "claude", deviceId: "d1", deviceName: "Mac", models: ["sonnet", "opus"], defaultModel: "sonnet" },
    { provider: "codex", deviceId: "d1", deviceName: "Mac" },
  ],
};

const base = {
  roomId: "r1",
  projectId: "p1",
  currentUser: { id: "u1", name: "Odunsi" },
  participants: [{ userId: "u1", email: "odunsi@example.com" }],
  messages: [] as RoomMessage[],
  taskStatuses: [] as RoomTaskStatus[],
  readiness: ready,
};

describe("buildStreamSnapshot", () => {
  it("names the signed-in person from the current user and Orion for agent messages", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [
        message({ id: "m1", body: "Compare checkouts" }),
        message({
          id: "m2",
          clientId: "c2",
          authorType: "product_agent",
          authorId: null,
          aiTaskId: "t1",
          body: "Pulled 6 references.",
          createdAt: "2026-11-14T10:01:00.000Z",
        }),
      ],
      taskStatuses: [task({ taskId: "t1", sourceMessageId: "m1" })],
    });
    expect(snapshot.messages).toEqual([
      {
        id: "m1",
        authorKind: "human",
        authorId: "u1",
        authorName: "Odunsi",
        text: "Compare checkouts",
        createdAt: "2026-11-14T10:00:00.000Z",
        replyToId: null,
        delivery: "persisted",
      },
      {
        id: "m2",
        authorKind: "orion",
        authorId: null,
        authorName: "Orion",
        text: "Pulled 6 references.",
        createdAt: "2026-11-14T10:01:00.000Z",
        replyToId: "m1",
        delivery: "persisted",
      },
    ]);
  });

  it("names another human from their email and never leaves a name empty", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      participants: [...base.participants, { userId: "u2", email: "ini@example.com" }],
      messages: [
        message({ id: "m1", authorId: "u2" }),
        message({ id: "m2", clientId: "c2", authorId: "u3", createdAt: "2026-11-14T10:01:00.000Z" }),
      ],
    });
    expect(snapshot.messages.map((row) => row.authorName)).toEqual(["ini", "Someone"]);
  });

  it("leaves replyToId null when the agent message has no known task", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [message({ id: "m2", authorType: "product_agent", authorId: null, aiTaskId: "gone" })],
    });
    expect(snapshot.messages[0].replyToId).toBeNull();
  });

  it("is busy while a task is still moving and idle once every task is terminal", () => {
    expect(buildStreamSnapshot({ ...base, taskStatuses: [task({ status: "running" })] }).orionBusy).toBe(true);
    expect(buildStreamSnapshot({ ...base, taskStatuses: [task({ status: "queued" })] }).orionBusy).toBe(true);
    expect(buildStreamSnapshot({ ...base, taskStatuses: [task({ status: "completed" })] }).orionBusy).toBe(false);
    expect(buildStreamSnapshot({ ...base, taskStatuses: [] }).orionBusy).toBe(false);
  });

  it("lists model choices from a ready device", () => {
    const snapshot = buildStreamSnapshot(base);
    expect(snapshot.send).toEqual({ canSend: true });
    expect(snapshot.defaultProvider).toBe("claude");
    expect(snapshot.choices).toEqual([
      { provider: "claude", models: ["sonnet", "opus"], defaultModel: "sonnet" },
      { provider: "codex", models: [], defaultModel: null },
    ]);
  });

  it.each([
    ["no_device", "Connect a device so Orion can answer."],
    ["offline", "Your connected device is offline."],
    ["signed_out", "Sign in to your AI tool on your device, then try again."],
    ["unsupported", "Your AI tool's version isn't supported yet."],
  ] as const)("explains why it cannot send when readiness is %s", (reason, text) => {
    const snapshot = buildStreamSnapshot({ ...base, readiness: { ready: false, reason } });
    expect(snapshot.send).toEqual({ canSend: false, reason: text });
    expect(snapshot.choices).toEqual([]);
    expect(snapshot.defaultProvider).toBeNull();
  });

  it("copies the room, project and current user through", () => {
    const snapshot = buildStreamSnapshot(base);
    expect(snapshot).toMatchObject({
      roomId: "r1",
      projectId: "p1",
      currentUserId: "u1",
      currentUserName: "Odunsi",
    });
  });
});
```

- [ ] **Step 4: Run to verify the tests fail**

Run: `pnpm test src/features/native/stream-snapshot.test.ts`
Expected: FAIL with a missing-module error for `./stream-snapshot`.

- [ ] **Step 5: Add the wire types to `bridge.ts`**

In `apps/web/src/features/native/bridge.ts`:

1. Extend the `NativeMessage` union with a new final member so it reads:

```ts
export type NativeMessage =
  | { v: 1; type: "ready"; workspaceId: string | null }
  | { v: 1; type: "notify"; title: string; body: string; path: string }
  | { v: 1; type: "shelfConnectCode"; code: string }
  | { v: 1; type: "shelfConnectFailed"; message: string }
  | ({ v: 1; type: "frame" } & FrameSnapshot)
  | ({ v: 1; type: "stream" } & StreamSnapshot);
```

2. Directly below the `FrameSnapshot` type add:

```ts
// One chat line for the native stream.
export type StreamMessageRow = {
  id: string;
  authorKind: "human" | "orion";
  authorId: string | null;
  authorName: string;
  text: string;
  createdAt: string;
  // For an Orion reply: the message it answers (drives the quoted-reply line).
  replyToId: string | null;
  delivery: "sending" | "persisted" | "failed";
};

export type StreamModelChoice = {
  provider: string;
  models: string[];
  defaultModel: string | null;
};

export type StreamSend = { canSend: true } | { canSend: false; reason: string };

// What the native project screen needs to draw one project's chat. Posted
// whenever the room's messages, Orion's task state or readiness change.
export type StreamSnapshot = {
  roomId: string;
  projectId: string;
  currentUserId: string;
  currentUserName: string;
  orionBusy: boolean;
  send: StreamSend;
  defaultProvider: string | null;
  choices: StreamModelChoice[];
  messages: StreamMessageRow[];
};

// What the native composer can ask the page to do. Registered separately from
// FrameHandlers (window.__orionStream) so the two registrations never replace
// each other.
export type StreamHandlers = {
  post: (input: {
    roomId: string;
    body: string;
    providerOverride?: string;
    modelOverride?: string;
  }) => Promise<FrameResult>;
};
```

3. In `type BridgeWindow` add `__orionStream?: StreamHandlers;` and at the end of the file add:

```ts
export function registerStreamHandler(handlers: StreamHandlers): () => void {
  const target = bridgeWindow();
  if (!target) return () => {};
  target.__orionStream = handlers;
  return () => {
    if (target.__orionStream === handlers) delete target.__orionStream;
  };
}
```

- [ ] **Step 6: Implement the builder**

Create `apps/web/src/features/native/stream-snapshot.ts`:

```ts
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import {
  isTerminalTaskStatus,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import type { RoomMessage } from "@/features/rooms/repository";
import type {
  StreamMessageRow,
  StreamModelChoice,
  StreamSend,
  StreamSnapshot,
} from "./bridge";

export type StreamSnapshotInput = {
  roomId: string;
  projectId: string;
  currentUser: { id: string; name: string };
  participants: { userId: string; email: string }[];
  messages: RoomMessage[];
  taskStatuses: RoomTaskStatus[];
  readiness: AgentReadiness;
};

const NOT_READY_TEXT = {
  no_device: "Connect a device so Orion can answer.",
  offline: "Your connected device is offline.",
  signed_out: "Sign in to your AI tool on your device, then try again.",
  unsupported: "Your AI tool's version isn't supported yet.",
} as const;

function humanName(
  authorId: string | null,
  currentUser: { id: string; name: string },
  participants: { userId: string; email: string }[],
): string {
  if (authorId && authorId === currentUser.id) return currentUser.name;
  const email = participants.find((p) => p.userId === authorId)?.email;
  const local = email?.split("@")[0];
  return local ? local : "Someone";
}

export function buildStreamSnapshot(input: StreamSnapshotInput): StreamSnapshot {
  const sourceByTask = new Map(
    input.taskStatuses.map((task) => [task.taskId, task.sourceMessageId]),
  );
  const messages: StreamMessageRow[] = input.messages.map((message) => {
    const isOrion = message.authorType !== "human";
    return {
      id: message.id,
      authorKind: isOrion ? "orion" : "human",
      authorId: message.authorId,
      authorName: isOrion
        ? "Orion"
        : humanName(message.authorId, input.currentUser, input.participants),
      text: message.body,
      createdAt: message.createdAt,
      replyToId:
        isOrion && message.aiTaskId
          ? (sourceByTask.get(message.aiTaskId) ?? null)
          : null,
      delivery: message.delivery,
    };
  });

  let send: StreamSend;
  let choices: StreamModelChoice[] = [];
  let defaultProvider: string | null = null;
  if (input.readiness.ready) {
    send = { canSend: true };
    defaultProvider = input.readiness.defaultProvider;
    choices = input.readiness.providers.map((entry) => ({
      provider: entry.provider,
      models: entry.models ?? [],
      defaultModel: entry.defaultModel ?? null,
    }));
  } else {
    send = { canSend: false, reason: NOT_READY_TEXT[input.readiness.reason] };
  }

  return {
    roomId: input.roomId,
    projectId: input.projectId,
    currentUserId: input.currentUser.id,
    currentUserName: input.currentUser.name,
    orionBusy: input.taskStatuses.some((task) => !isTerminalTaskStatus(task.status)),
    send,
    defaultProvider,
    choices,
    messages,
  };
}
```

- [ ] **Step 7: Run the tests, the typecheck and lint**

Run: `pnpm test src/features/native/stream-snapshot.test.ts src/features/rooms/reconcile-message.test.ts && pnpm typecheck && pnpm lint`
Expected: all PASS / no errors. (`isTerminalTaskStatus` is exported from `room-task-status.ts`; if that module's `server-only`-style imports break the vitest import, mock nothing: report it, since `conversation.tsx` already imports from it client-side.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/rooms apps/web/src/features/native
git commit -m "feat(web): stream snapshot builder and wire shape for the native app

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The headless stream bridge component

**Files:**
- Create: `apps/web/src/features/native/native-stream-bridge.tsx`
- Test: `apps/web/src/features/native/native-stream-bridge.test.tsx`

**Interfaces:**
- Consumes (Task 1): `buildStreamSnapshot`, `StreamSnapshot`, `registerStreamHandler`, `postToNative`, `reconcileMessage`.
- Produces: `NativeStreamBridge` with props `{ roomId: string; projectId: string; currentUser: { id: string; name: string }; participants: { userId: string; email: string }[]; initialMessages: RoomMessage[]; realtimeMode: "production" | "development-poll"; readiness: AgentReadiness }`. It renders `null`. Side effects: posts `{ v: 1, type: "stream", ...snapshot }` whenever the snapshot changes; registers `window.__orionStream.post`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/native/native-stream-bridge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import type { RoomMessage } from "@/features/rooms/repository";

const mocks = vi.hoisted(() => ({
  postMessage: vi.fn(),
  listRoomTaskStatuses: vi.fn(),
  onMessage: undefined as ((message: unknown) => void) | undefined,
  unsubscribe: vi.fn(),
}));

vi.mock("@/features/rooms/actions", () => ({
  postMessage: mocks.postMessage,
  listRoomTaskStatuses: mocks.listRoomTaskStatuses,
}));
vi.mock("@/features/rooms/room-message-subscription", () => ({
  subscribeToProductionRoom: (_roomId: string, onMessage: (message: unknown) => void) => {
    mocks.onMessage = onMessage;
    return mocks.unsubscribe;
  },
  subscribeToDevelopmentRoom: (_roomId: string, onMessage: (message: unknown) => void) => {
    mocks.onMessage = onMessage;
    return mocks.unsubscribe;
  },
}));

import type { StreamHandlers } from "./bridge";
import { NativeStreamBridge } from "./native-stream-bridge";

type TestWindow = Window & { webkit?: unknown; __orionStream?: StreamHandlers };

function message(overrides: Partial<RoomMessage>): RoomMessage {
  return {
    id: "m1",
    roomId: "r1",
    clientId: "c1",
    authorType: "human",
    authorId: "u1",
    initiatedBy: null,
    aiTaskId: null,
    provider: null,
    body: "hello",
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposedAction: null,
    kind: "conversation",
    prdContext: null,
    prdChange: null,
    attachments: [],
    createdAt: "2026-11-14T10:00:00.000Z",
    delivery: "persisted",
    ...overrides,
  };
}

const readiness: AgentReadiness = {
  ready: true,
  defaultProvider: "claude",
  defaultDeviceId: "d1",
  providers: [{ provider: "claude", deviceId: "d1", deviceName: "Mac", models: ["sonnet"], defaultModel: "sonnet" }],
};

const props = {
  roomId: "r1",
  projectId: "p1",
  currentUser: { id: "u1", name: "Odunsi" },
  participants: [{ userId: "u1", email: "odunsi@example.com" }],
  initialMessages: [message({})],
  realtimeMode: "production" as const,
  readiness,
};

describe("NativeStreamBridge", () => {
  let nativePost: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    nativePost = vi.fn();
    mocks.listRoomTaskStatuses.mockResolvedValue([]);
    (window as TestWindow).webkit = { messageHandlers: { orion: { postMessage: nativePost } } };
  });
  afterEach(() => {
    delete (window as TestWindow).webkit;
    vi.clearAllMocks();
  });

  const streamPosts = () =>
    nativePost.mock.calls.map((call) => call[0]).filter((m) => m.type === "stream");

  it("posts the stream snapshot on mount", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    const last = streamPosts().at(-1);
    expect(last).toMatchObject({
      v: 1,
      type: "stream",
      roomId: "r1",
      projectId: "p1",
      currentUserName: "Odunsi",
      send: { canSend: true },
    });
    expect(last.messages).toHaveLength(1);
    expect(last.messages[0]).toMatchObject({ id: "m1", authorName: "Odunsi", text: "hello" });
  });

  it("posts again when a realtime message arrives", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    await act(async () => {
      mocks.onMessage?.(
        message({
          id: "m2",
          clientId: "c2",
          authorType: "product_agent",
          authorId: null,
          aiTaskId: "t1",
          body: "On it.",
          createdAt: "2026-11-14T10:01:00.000Z",
        }),
      );
    });
    const last = streamPosts().at(-1);
    expect(last.messages.map((row: { id: string }) => row.id)).toEqual(["m1", "m2"]);
    expect(last.messages[1]).toMatchObject({ authorKind: "orion", authorName: "Orion" });
  });

  it("registers post, which sends a Product Agent message and reports ok", async () => {
    mocks.postMessage.mockResolvedValue({
      message: message({ id: "m3", clientId: "c3", body: "Hi Orion", createdAt: "2026-11-14T10:02:00.000Z" }),
      agentTask: { status: "queued", taskId: "t9" },
    });
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    let result: unknown;
    await act(async () => {
      result = await (window as TestWindow).__orionStream!.post({
        roomId: "r1",
        body: "Hi Orion",
        providerOverride: "claude",
        modelOverride: "sonnet",
      });
    });
    expect(result).toEqual({ status: "ok" });
    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "r1",
        body: "Hi Orion",
        mentionedUserIds: [],
        mentionsProductAgent: true,
        agentKind: "product",
        providerOverride: "claude",
        modelOverride: "sonnet",
        clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    );
    // The new message shows without waiting for realtime.
    expect(streamPosts().at(-1).messages.map((row: { id: string }) => row.id)).toContain("m3");
  });

  it("reports an error when Orion could not be asked to reply, but keeps the message", async () => {
    mocks.postMessage.mockResolvedValue({
      message: message({ id: "m4", clientId: "c4", body: "Hi", createdAt: "2026-11-14T10:03:00.000Z" }),
      agentTask: { status: "retryable_error", message: "We could not ask the agent to reply. Please try again." },
    });
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    let result: unknown;
    await act(async () => {
      result = await (window as TestWindow).__orionStream!.post({ roomId: "r1", body: "Hi" });
    });
    expect(result).toEqual({ status: "error", message: "We could not ask the agent to reply. Please try again." });
    expect(streamPosts().at(-1).messages.map((row: { id: string }) => row.id)).toContain("m4");
  });

  it("reports a plain error when sending throws", async () => {
    mocks.postMessage.mockRejectedValue(new Error("boom"));
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    let result: unknown;
    await act(async () => {
      result = await (window as TestWindow).__orionStream!.post({ roomId: "r1", body: "Hi" });
    });
    expect(result).toEqual({ status: "error", message: "Orion couldn't send that right now. Try again." });
  });

  it("ignores a post for a different room and an empty body", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    const post = (window as TestWindow).__orionStream!.post;
    await act(async () => {
      expect(await post({ roomId: "other", body: "x" })).toMatchObject({ status: "error" });
      expect(await post({ roomId: "r1", body: "   " })).toMatchObject({ status: "error" });
    });
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it("unsubscribes and unregisters on unmount", async () => {
    const { unmount } = render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
    expect((window as TestWindow).__orionStream).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `pnpm test src/features/native/native-stream-bridge.test.tsx`
Expected: FAIL with a missing-module error for `./native-stream-bridge`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/features/native/native-stream-bridge.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import {
  RoomTaskStatusPoller,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import { listRoomTaskStatuses, postMessage } from "@/features/rooms/actions";
import { reconcileMessage } from "@/features/rooms/reconcile-message";
import type { RoomMessage } from "@/features/rooms/repository";
import {
  subscribeToDevelopmentRoom,
  subscribeToProductionRoom,
} from "@/features/rooms/room-message-subscription";
import {
  postToNative,
  registerStreamHandler,
  type FrameResult,
} from "./bridge";
import { buildStreamSnapshot } from "./stream-snapshot";

const SEND_FAILED: FrameResult = {
  status: "error",
  message: "Orion couldn't send that right now. Try again.",
};

/**
 * Invisible. Inside the Orion Mac app the project's chat is drawn natively;
 * this keeps the room's messages and Orion's task state fresh (the same
 * realtime subscription and status poller the web chat uses), posts them to
 * the app, and sends what the native composer types as a Product Agent
 * message through the existing `postMessage` action.
 */
export function NativeStreamBridge({
  roomId,
  projectId,
  currentUser,
  participants,
  initialMessages,
  realtimeMode,
  readiness,
}: {
  roomId: string;
  projectId: string;
  currentUser: { id: string; name: string };
  participants: { userId: string; email: string }[];
  initialMessages: RoomMessage[];
  realtimeMode: "production" | "development-poll";
  readiness: AgentReadiness;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [taskStatuses, setTaskStatuses] = useState<RoomTaskStatus[]>([]);
  const pollerRef = useRef<RoomTaskStatusPoller | null>(null);

  const reconcile = useCallback((incoming: RoomMessage) => {
    setMessages((current) => reconcileMessage(current, incoming));
  }, []);

  useEffect(() => {
    const unsubscribe =
      realtimeMode === "development-poll"
        ? subscribeToDevelopmentRoom(roomId, reconcile, () => {})
        : subscribeToProductionRoom(roomId, reconcile);
    return unsubscribe;
  }, [realtimeMode, roomId, reconcile]);

  useEffect(() => {
    const poller = new RoomTaskStatusPoller({
      fetchStatuses: () => listRoomTaskStatuses(roomId),
      onStatuses: setTaskStatuses,
      // A failed read (for example revoked access) stops the poll; the chat
      // keeps working and replies still arrive over the subscription.
      onError: () => {},
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [roomId]);

  const snapshot = useMemo(
    () =>
      buildStreamSnapshot({
        roomId,
        projectId,
        currentUser,
        participants,
        messages,
        taskStatuses,
        readiness,
      }),
    [roomId, projectId, currentUser, participants, messages, taskStatuses, readiness],
  );

  useEffect(() => {
    postToNative({ v: 1, type: "stream", ...snapshot });
  }, [snapshot]);

  useEffect(() => {
    return registerStreamHandler({
      post: async (input) => {
        const body = input.body.trim();
        if (input.roomId !== roomId || body.length === 0) return SEND_FAILED;
        try {
          const result = await postMessage({
            roomId,
            clientId: crypto.randomUUID(),
            body,
            mentionedUserIds: [],
            mentionsProductAgent: true,
            agentKind: "product",
            providerOverride: input.providerOverride as never,
            modelOverride: input.modelOverride as never,
          });
          reconcile(result.message);
          pollerRef.current?.notifyQueued();
          if (result.agentTask.status === "retryable_error") {
            return { status: "error", message: result.agentTask.message };
          }
          return { status: "ok" };
        } catch {
          return SEND_FAILED;
        }
      },
    });
  }, [roomId, reconcile]);

  return null;
}
```

Note on the two `as never` casts: `providerOverride` / `modelOverride` are validated by `MessageInputSchema` inside `postMessage` (it throws on an unknown provider or model, which lands in the `catch` and answers `SEND_FAILED`); the app only ever sends values it received in `choices`.

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `pnpm test src/features/native/native-stream-bridge.test.tsx && pnpm typecheck && pnpm lint`
Expected: all PASS / no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/native/native-stream-bridge.tsx apps/web/src/features/native/native-stream-bridge.test.tsx
git commit -m "feat(web): headless stream bridge that feeds and drives the native chat

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Feed mode on the room page

**Files:**
- Modify: `apps/web/src/features/native/user-agent.ts`
- Modify: `apps/web/src/features/native/user-agent.test.ts`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`
- Test: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx` (extend the existing file)

**Interfaces:**
- Consumes (Task 2): `NativeStreamBridge` props.
- Produces: `isOrionFrameV2UserAgent(userAgent: string): boolean`; the room page in feed mode renders no `ProjectTabs`, `RoomHeader` or `RoomTabStrip`, still renders the selected surface, and mounts `NativeStreamBridge`.

- [ ] **Step 1: Write the failing user-agent tests**

Append to `apps/web/src/features/native/user-agent.test.ts`:

```ts
import { isOrionFrameV2UserAgent } from "./user-agent";

describe("isOrionFrameV2UserAgent", () => {
  it("recognises the app that draws the project chat natively", () => {
    expect(isOrionFrameV2UserAgent("Mozilla/5.0 AppleWebKit/605.1.15 OrionMac/1.2.0 OrionFrame/2")).toBe(true);
    expect(isOrionFrameV2UserAgent("Mozilla/5.0 OrionMac/1.9.0 OrionFrame/3")).toBe(true);
  });
  it.each([
    "Mozilla/5.0 AppleWebKit/605.1.15 OrionMac/1.1.0 OrionFrame/1",
    "Mozilla/5.0 Safari/605.1.15",
    "NotOrionFrame/2",
    "",
  ])("ignores %s", (ua) => {
    expect(isOrionFrameV2UserAgent(ua)).toBe(false);
  });
});
```

Move the new `import` line up to join the existing import at the top of the file (one import statement from `./user-agent`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/features/native/user-agent.test.ts`
Expected: FAIL (`isOrionFrameV2UserAgent` is not exported).

- [ ] **Step 3: Implement it**

Append to `apps/web/src/features/native/user-agent.ts`:

```ts
// Orion Mac 1.2+ also draws the project's chat natively (OrionFrame/2). The
// room page then feeds that chat over the bridge instead of drawing it.
const ORION_FRAME_V2 = /(?:^|\s)OrionFrame\/([2-9]|\d{2,})(?:\s|$)/;

export function isOrionFrameV2UserAgent(userAgent: string): boolean {
  return ORION_FRAME_V2.test(userAgent);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/features/native/user-agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing feed-mode tests**

In `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx`:

1. In the hoisted `mocks` object add two fields: `userAgent: "vitest",` and `streamBridge: vi.fn<(props: Record<string, unknown>) => ReactNode>(() => <div data-testid="stream-bridge" />),`.
2. Change the existing `next/headers` mock to read the mutable field:

```tsx
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": mocks.userAgent }),
}));
```

3. Add this mock next to the other component mocks:

```tsx
vi.mock("@/features/native/native-stream-bridge", () => ({
  NativeStreamBridge: mocks.streamBridge,
}));
```

4. Append these tests at the end of the file:

```tsx
async function renderFeedFixture(userAgent: string) {
  mocks.userAgent = userAgent;
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      projectId: "60000000-0000-4000-8000-000000000006",
      name: "Main",
      ownerId,
      stage: "discovery",
      createdAt: "2026-11-14T00:00:00.000Z",
      updatedAt: "2026-11-14T00:00:00.000Z",
    },
    currentUser: { id: ownerId, email: "owner@example.com", name: "Owner Example" },
    participants: [{ roomId, userId: ownerId, email: "owner@example.com", access: "edit" }],
    messages: [],
    hasPrd: false,
    hasUserFlow: false,
    decisionCount: 0,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({}),
    }),
  );
  return { roomId };
}

it("inside the Mac app (OrionFrame/2) feeds the native chat instead of drawing it", async () => {
  mocks.streamBridge.mockClear();
  mocks.conversation.mockClear();
  try {
    const { roomId } = await renderFeedFixture("Mozilla/5.0 OrionMac/1.2.0 OrionFrame/2");
    expect(screen.getByTestId("stream-bridge")).toBeInTheDocument();
    expect(mocks.streamBridge.mock.calls.at(-1)?.[0]).toMatchObject({
      roomId,
      projectId: "60000000-0000-4000-8000-000000000006",
      currentUser: { id: "10000000-0000-4000-8000-000000000001", name: "Owner Example" },
      participants: [{ userId: "10000000-0000-4000-8000-000000000001", email: "owner@example.com" }],
      initialMessages: [],
      realtimeMode: "production",
      readiness: READY_AGENT,
    });
    expect(screen.queryByTestId("room-header")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Room surfaces" })).not.toBeInTheDocument();
    expect(mocks.conversation).not.toHaveBeenCalled();
  } finally {
    mocks.userAgent = "vitest";
  }
});

it("keeps the page unchanged in a browser and in older Mac builds", async () => {
  for (const userAgent of ["Mozilla/5.0 Safari/605.1.15", "Mozilla/5.0 OrionMac/1.1.0 OrionFrame/1"]) {
    cleanup();
    mocks.streamBridge.mockClear();
    mocks.conversation.mockClear();
    try {
      await renderFeedFixture(userAgent);
      expect(screen.queryByTestId("stream-bridge")).not.toBeInTheDocument();
      expect(screen.getByTestId("room-header")).toBeInTheDocument();
      expect(screen.getByRole("tablist", { name: "Room surfaces" })).toBeInTheDocument();
      expect(mocks.conversation).toHaveBeenCalled();
    } finally {
      mocks.userAgent = "vitest";
    }
  }
});

it("still renders a non-chat surface inside the Mac app", async () => {
  mocks.userAgent = "Mozilla/5.0 OrionMac/1.2.0 OrionFrame/2";
  mocks.decisionsSurface.mockClear();
  // Reuse the fixture, then ask for the decisions surface through the query.
  try {
    const workspaceId = "30000000-0000-4000-8000-000000000003";
    const roomId = "40000000-0000-4000-8000-000000000004";
    const ownerId = "10000000-0000-4000-8000-000000000001";
    mocks.getRoomPageData.mockResolvedValue({
      room: { id: roomId, workspaceId, projectId: "p1", name: "Main", ownerId, stage: "discovery", createdAt: "x", updatedAt: "x" },
      currentUser: { id: ownerId, email: "owner@example.com", name: "Owner Example" },
      participants: [{ roomId, userId: ownerId, email: "owner@example.com", access: "edit" }],
      messages: [],
      hasPrd: false,
      hasUserFlow: false,
      decisionCount: 1,
      decisions: [],
      isCurrentUserWorkspaceAdmin: false,
      realtimeMode: "production",
    });
    mocks.listRoomDecisions.mockResolvedValue([]);
    cleanup();
    render(
      await RoomPage({
        params: Promise.resolve({ workspaceId, roomId }),
        searchParams: Promise.resolve({ tab: "decisions" }),
      }),
    );
    expect(mocks.decisionsSurface).toHaveBeenCalled();
    expect(screen.getByTestId("stream-bridge")).toBeInTheDocument();
  } finally {
    mocks.userAgent = "vitest";
  }
});
```

5. Add `cleanup` to the first import: `import { cleanup, render, screen } from "@testing-library/react";`.

- [ ] **Step 6: Run to verify the new tests fail**

Run: `pnpm test "src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx"`
Expected: the new feed-mode tests FAIL; existing tests still PASS.

- [ ] **Step 7: Implement feed mode in the page**

In `page.tsx`:

1. Import: `import { isOrionFrameUserAgent, isOrionFrameV2UserAgent } from "@/features/native/user-agent";` (replace the existing single import) and `import { NativeStreamBridge } from "@/features/native/native-stream-bridge";` and `import { getCurrentAgentReadiness } from "@/features/ai/current-agent-readiness";` (already imported; keep one import).
2. After the `requestHeaders` lookup compute:

```ts
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const feedMode = isOrionFrameV2UserAgent(userAgent);
  const showProjectTabs = !isOrionFrameUserAgent(userAgent);
```

(replace the existing `showProjectTabs` computation; it already reads the same header).
3. Compute readiness for the feed only in feed mode, next to the other parallel reads:

```ts
  const feedReadiness = feedMode
    ? await getCurrentAgentReadiness().catch(() => ({ ready: false as const, reason: "offline" as const }))
    : null;
```

4. In the returned JSX:
   - Wrap the `header={...}` prop value: `header={feedMode ? undefined : (<VStack ...>...</VStack>)}` (keep the existing tree unchanged inside the false branch).
   - Render `<RoomTabStrip ... />` only when `!feedMode`.
   - Directly after `<MarkRoomViewed roomId={roomId} />` add:

```tsx
      {feedMode && feedReadiness ? (
        <NativeStreamBridge
          roomId={roomId}
          projectId={data.room.projectId}
          currentUser={{ id: data.currentUser.id, name: data.currentUser.name }}
          participants={data.participants.map((p) => ({ userId: p.userId, email: p.email }))}
          initialMessages={data.messages}
          realtimeMode={data.realtimeMode}
          readiness={feedReadiness}
        />
      ) : null}
```

5. In feed mode, the conversation surface must not draw the web chat (the native app draws it). Where the page renders `activeSurface === "conversation"` (the `<Conversation .../>` + `<StageCoachingPanel .../>` fragment), render `null` instead when `feedMode` is true. Every other surface renders as today.

- [ ] **Step 8: Run the page tests, typecheck, lint, then the whole web suite**

Run: `pnpm test "src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx" && pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): room page feeds the native chat inside the Mac app

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review (against the spec)

- **Spec, "Bridge, page → app" (messages with author kind and name, time, source id; current person; busy; model choices):** `StreamSnapshot` + `buildStreamSnapshot` (Task 1).
- **Spec, "Bridge, app → page" (`postStreamMessage` through the existing `postMessage` action, ok/error result):** `window.__orionStream.post` in Task 2. The name differs from the spec's `postStreamMessage` on purpose (a separate global so it never replaces `__orionFrame`); the spec's wording is updated alongside this plan.
- **Spec, live updates from the page's realtime, no polling:** Task 2 reuses `subscribeToProductionRoom` / `subscribeToDevelopmentRoom`. The task-status poller is the existing one and only runs while a task is active.
- **Spec, "In the Mac app the room page renders only an invisible bridge (plus the selected surface), not the chat UI; in a browser exactly what it does today":** Task 3.
- **Not here (on purpose):** attachments from the native composer, stars, To-do/Artifacts data (later steps), and all Swift code (companion plan).
- **Type consistency:** `StreamSnapshot`, `StreamMessageRow`, `StreamModelChoice`, `StreamSend`, `StreamHandlers`, `registerStreamHandler`, `buildStreamSnapshot`, `reconcileMessage`, `isOrionFrameV2UserAgent`, `NativeStreamBridge` are named identically in every task.
