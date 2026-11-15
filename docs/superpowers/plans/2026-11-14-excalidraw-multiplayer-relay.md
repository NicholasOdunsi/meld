# Excalidraw Multiplayer Relay Implementation Plan (deferred)

> **Status: deferred by the owner on 2026-11-14. Do not start until they ask.** It was split out of the spike plan so nothing is lost. Prerequisites: spike Tasks 1-5 and 7 of `2026-11-14-excalidraw-canvas-spike.md` are done and the spike's decision was GO. Re-check the Excalidraw version and the router/worker code before starting, since both may have moved.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let several people edit the same Excalidraw board live, with cursors, late join, reconnect and persistence.

**Architecture:** A Cloudflare Durable Object per board holds the current scene and screen revisions, merges element diffs by Excalidraw's own version rule, and broadcasts changes and cursors. The browser client reconciles remote elements into the scene with `reconcileElements`.

**Tech Stack:** Cloudflare Workers + Durable Objects, `wrangler dev`, Excalidraw 0.18.1, Vitest, Playwright.

## Global Constraints

- Viewers are read-only; the relay rejects their writes.
- Cursor and presence data is broadcast, never stored.
- Reuse the signed short-lived canvas session (`mintCanvasSessionTicket`). Spike shortcut: its `clientVersion` still says tldraw; renaming is a follow-up.
- Dev-only ticket route; no production boards, schema or records are touched.
- Do not remove the existing tldraw `CanvasRoom`.
- Application controls use Astryx components and tokens (see `AGENTS.md`).
- Every `*.test.ts(x)` sits beside the module it covers.
- Use Node 22.23.2. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## Task R1: Relay core (merge rules, access, persistence)

**Files:**
- Create: `apps/gateway-worker/src/board-room-core.ts`, `apps/gateway-worker/src/board-room-core.test.ts`

**Interfaces:**
- Produces:
  - `BoardElement = { id: string; version: number; versionNonce: number; isDeleted?: boolean; [key: string]: unknown }`, `BoardScreen = { id: string; rev: number; html: string }`.
  - `BoardStorage = { loadAll(): Promise<{ elements: BoardElement[]; screens: BoardScreen[] }>; putElements(elements: BoardElement[]): Promise<void>; putScreen(screen: BoardScreen): Promise<void> }`.
  - `BoardPeer = { send(message: string): void; name: string; access: "view" | "edit"; color: string }`.
  - `class BoardRoomCore { constructor(storage: BoardStorage); connect(sessionId: string, peer: BoardPeer): void; receive(sessionId: string, raw: string): Promise<void>; disconnect(sessionId: string): void; idle(): Promise<void> }`.
  - `LIMITS`, `isNewer(incoming, existing): boolean`, `colorFor(sessionId): string`.
  - Wire protocol, client → server: `{t:"elements",elements}`, `{t:"screen",id,rev,html}`, `{t:"pointer",x,y,tool,button}`. Server → client: `{t:"init",elements,screens,peers:[{id,name}]}`, `{t:"elements",from,elements}`, `{t:"screen",from,id,rev,html}`, `{t:"pointer",from,name,color,x,y,tool,button}`, `{t:"peer-joined",id,name}`, `{t:"peer-left",id}`, `{t:"error",code}` with codes `read_only | too_large | invalid`.

- [ ] **Step 1: Write the failing tests** — `board-room-core.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { BoardRoomCore, LIMITS, isNewer, type BoardElement, type BoardPeer, type BoardScreen, type BoardStorage } from "./board-room-core";

function memoryStorage(seed?: { elements?: BoardElement[]; screens?: BoardScreen[] }): BoardStorage & { elements: Map<string, BoardElement>; screens: Map<string, BoardScreen> } {
  const elements = new Map((seed?.elements ?? []).map((e) => [e.id, e]));
  const screens = new Map((seed?.screens ?? []).map((s) => [s.id, s]));
  return {
    elements, screens,
    loadAll: async () => ({ elements: [...elements.values()], screens: [...screens.values()] }),
    putElements: async (list) => { for (const e of list) elements.set(e.id, e); },
    putScreen: async (s) => { screens.set(s.id, s); },
  };
}

function peer(access: "edit" | "view" = "edit", name = "P") {
  const received: Record<string, unknown>[] = [];
  const value: BoardPeer = { send: (m) => received.push(JSON.parse(m)), name, access, color: "tomato" };
  return { value, received };
}
const el = (id: string, version: number, versionNonce = 1, extra: Record<string, unknown> = {}): BoardElement => ({ id, version, versionNonce, ...extra });
const send = (core: BoardRoomCore, id: string, message: unknown) => core.receive(id, JSON.stringify(message));

describe("isNewer", () => {
  it("prefers the higher version and breaks ties with the lower nonce", () => {
    expect(isNewer(el("a", 2), el("a", 1))).toBe(true);
    expect(isNewer(el("a", 1), el("a", 2))).toBe(false);
    expect(isNewer(el("a", 2, 5), el("a", 2, 9))).toBe(true);
    expect(isNewer(el("a", 2, 9), el("a", 2, 5))).toBe(false);
    expect(isNewer(el("a", 2, 5), el("a", 2, 5))).toBe(false);
  });
});

describe("BoardRoomCore", () => {
  it("sends the stored board to a joining client", async () => {
    const core = new BoardRoomCore(memoryStorage({ elements: [el("a", 1)], screens: [{ id: "s", rev: 1, html: "<p>x</p>" }] }));
    const a = peer();
    core.connect("A", a.value);
    await core.idle();
    expect(a.received[0]).toMatchObject({ t: "init", elements: [{ id: "a" }], screens: [{ id: "s" }], peers: [{ id: "A", name: "P" }] });
  });

  it("stores accepted elements and broadcasts them to others only", async () => {
    const storage = memoryStorage();
    const core = new BoardRoomCore(storage);
    const a = peer(), b = peer("edit", "Bea");
    core.connect("A", a.value); core.connect("B", b.value);
    await send(core, "A", { t: "elements", elements: [el("x", 1)] });
    expect(storage.elements.get("x")).toBeDefined();
    expect(b.received.at(-1)).toMatchObject({ t: "elements", from: "A", elements: [{ id: "x" }] });
    expect(a.received.some((m) => m.t === "elements")).toBe(false);
  });

  it("drops stale elements and does not broadcast them", async () => {
    const core = new BoardRoomCore(memoryStorage({ elements: [el("x", 5, 1, { v: "new" })] }));
    const a = peer(), b = peer();
    core.connect("A", a.value); core.connect("B", b.value);
    await send(core, "A", { t: "elements", elements: [el("x", 3, 1, { v: "old" })] });
    expect(b.received.some((m) => m.t === "elements")).toBe(false);
  });

  it("rejects writes from a viewer and stores nothing", async () => {
    const storage = memoryStorage();
    const core = new BoardRoomCore(storage);
    const viewer = peer("view");
    core.connect("V", viewer.value);
    await send(core, "V", { t: "elements", elements: [el("x", 1)] });
    await send(core, "V", { t: "screen", id: "s", rev: 1, html: "<p>x</p>" });
    expect(storage.elements.size).toBe(0);
    expect(storage.screens.size).toBe(0);
    expect(viewer.received.filter((m) => m.t === "error")).toEqual([{ t: "error", code: "read_only" }, { t: "error", code: "read_only" }]);
  });

  it("lets a viewer send cursor movement", async () => {
    const core = new BoardRoomCore(memoryStorage());
    const viewer = peer("view", "Vic"), a = peer();
    core.connect("V", viewer.value); core.connect("A", a.value);
    await send(core, "V", { t: "pointer", x: 1, y: 2, tool: "pointer", button: "up" });
    expect(a.received.at(-1)).toMatchObject({ t: "pointer", from: "V", name: "Vic", x: 1, y: 2 });
  });

  it("keeps cursor positions out of storage", async () => {
    const storage = memoryStorage();
    const core = new BoardRoomCore(storage);
    core.connect("A", peer().value);
    await send(core, "A", { t: "pointer", x: 1, y: 2, tool: "pointer", button: "up" });
    expect(storage.elements.size + storage.screens.size).toBe(0);
  });

  it("accepts a screen only with a higher revision", async () => {
    const storage = memoryStorage({ screens: [{ id: "s", rev: 2, html: "<p>two</p>" }] });
    const core = new BoardRoomCore(storage);
    const a = peer(), b = peer();
    core.connect("A", a.value); core.connect("B", b.value);
    await send(core, "A", { t: "screen", id: "s", rev: 2, html: "<p>same</p>" });
    expect(storage.screens.get("s")?.html).toBe("<p>two</p>");
    await send(core, "A", { t: "screen", id: "s", rev: 3, html: "<p>three</p>" });
    expect(storage.screens.get("s")?.html).toBe("<p>three</p>");
    expect(b.received.at(-1)).toMatchObject({ t: "screen", id: "s", rev: 3 });
  });

  it("rejects oversized, malformed and invalid messages", async () => {
    const core = new BoardRoomCore(memoryStorage());
    const a = peer();
    core.connect("A", a.value);
    await core.receive("A", "x".repeat(LIMITS.maxMessageBytes + 1));
    await core.receive("A", "not json");
    await send(core, "A", { t: "elements", elements: [{ id: 5 }] });
    await send(core, "A", { t: "screen", id: "Bad Id", rev: 1, html: "<p>x</p>" });
    await send(core, "A", { t: "screen", id: "ok", rev: 1, html: "x".repeat(LIMITS.maxScreenHtmlBytes + 1) });
    await send(core, "A", { t: "mystery" });
    expect(a.received.filter((m) => m.t === "error").map((m) => m.code)).toEqual(["too_large", "invalid", "invalid", "invalid", "too_large", "invalid"]);
  });

  it("stops accepting new elements at the cap but still updates existing ones", async () => {
    const seed = Array.from({ length: LIMITS.maxElements }, (_, i) => el(`e${i}`, 1));
    const storage = memoryStorage({ elements: seed });
    const core = new BoardRoomCore(storage);
    core.connect("A", peer().value);
    await send(core, "A", { t: "elements", elements: [el("extra", 1), el("e0", 2)] });
    expect(storage.elements.has("extra")).toBe(false);
    expect(storage.elements.get("e0")?.version).toBe(2);
  });

  it("announces joins and leaves, and survives a restart through storage", async () => {
    const storage = memoryStorage();
    const first = new BoardRoomCore(storage);
    const a = peer(), b = peer("edit", "Bea");
    first.connect("A", a.value);
    first.connect("B", b.value);
    await first.idle();
    expect(a.received.at(-1)).toEqual({ t: "peer-joined", id: "B", name: "Bea" });
    first.disconnect("B");
    expect(a.received.at(-1)).toEqual({ t: "peer-left", id: "B" });
    await send(first, "A", { t: "elements", elements: [el("x", 1)] });
    const second = new BoardRoomCore(storage);
    const c = peer();
    second.connect("C", c.value);
    await second.idle();
    expect(c.received[0]).toMatchObject({ t: "init", elements: [{ id: "x" }] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/gateway-worker exec vitest run src/board-room-core.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `board-room-core.ts`

```ts
export interface BoardElement {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  [key: string]: unknown;
}
export interface BoardScreen { id: string; rev: number; html: string }
export interface BoardStorage {
  loadAll(): Promise<{ elements: BoardElement[]; screens: BoardScreen[] }>;
  putElements(elements: BoardElement[]): Promise<void>;
  putScreen(screen: BoardScreen): Promise<void>;
}
export interface BoardPeer {
  send(message: string): void;
  name: string;
  access: "view" | "edit";
  color: string;
}

export const LIMITS = {
  maxElements: 5000,
  maxBatch: 500,
  maxScreenHtmlBytes: 512 * 1024,
  maxMessageBytes: 6 * 1024 * 1024,
} as const;

const SCREEN_ID = /^[a-z][a-z0-9_-]{0,63}$/;
const COLORS = ["tomato", "royalblue", "seagreen", "darkorange", "mediumvioletred", "teal", "goldenrod", "slateblue"];

// Excalidraw's own reconciliation rule: higher version wins, ties go to the
// lower nonce, so every client converges on the same element.
export function isNewer(incoming: BoardElement, existing: BoardElement): boolean {
  if (incoming.version !== existing.version) return incoming.version > existing.version;
  return incoming.versionNonce < existing.versionNonce;
}

export function colorFor(sessionId: string): string {
  let hash = 0;
  for (const char of sessionId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length]!;
}

function isElement(value: unknown): value is BoardElement {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" && e.id.length > 0 && e.id.length <= 200 &&
    Number.isInteger(e.version) && Number.isInteger(e.versionNonce)
  );
}

export class BoardRoomCore {
  private readonly elements = new Map<string, BoardElement>();
  private readonly screens = new Map<string, BoardScreen>();
  private readonly peers = new Map<string, BoardPeer>();
  private tail: Promise<void>;

  constructor(private readonly storage: BoardStorage) {
    this.tail = storage.loadAll().then((all) => {
      for (const element of all.elements) this.elements.set(element.id, element);
      for (const screen of all.screens) this.screens.set(screen.id, screen);
    });
  }

  // Resolves when everything queued so far has been processed.
  idle(): Promise<void> {
    return this.tail;
  }

  private enqueue(job: () => Promise<void> | void): Promise<void> {
    this.tail = this.tail.then(job).catch(() => undefined);
    return this.tail;
  }

  connect(sessionId: string, peer: BoardPeer): void {
    this.peers.set(sessionId, peer);
    void this.enqueue(() => {
      peer.send(JSON.stringify({
        t: "init",
        elements: [...this.elements.values()],
        screens: [...this.screens.values()],
        peers: [...this.peers].map(([id, p]) => ({ id, name: p.name })),
      }));
      this.broadcast(sessionId, { t: "peer-joined", id: sessionId, name: peer.name });
    });
  }

  disconnect(sessionId: string): void {
    if (!this.peers.delete(sessionId)) return;
    this.broadcast(sessionId, { t: "peer-left", id: sessionId });
  }

  receive(sessionId: string, raw: string): Promise<void> {
    return this.enqueue(() => this.handle(sessionId, raw));
  }

  private broadcast(exceptId: string, message: unknown): void {
    const text = JSON.stringify(message);
    for (const [id, peer] of this.peers) if (id !== exceptId) peer.send(text);
  }

  private fail(peer: BoardPeer, code: "read_only" | "too_large" | "invalid"): void {
    peer.send(JSON.stringify({ t: "error", code }));
  }

  private async handle(sessionId: string, raw: string): Promise<void> {
    const peer = this.peers.get(sessionId);
    if (!peer) return;
    if (raw.length > LIMITS.maxMessageBytes) return this.fail(peer, "too_large");
    let message: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return this.fail(peer, "invalid");
      message = parsed as Record<string, unknown>;
    } catch {
      return this.fail(peer, "invalid");
    }

    if (message.t === "pointer") {
      const { x, y } = message;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return this.fail(peer, "invalid");
      this.broadcast(sessionId, {
        t: "pointer", from: sessionId, name: peer.name, color: peer.color, x, y,
        tool: message.tool === "laser" ? "laser" : "pointer",
        button: message.button === "down" ? "down" : "up",
      });
      return;
    }

    if (message.t === "elements") {
      if (peer.access !== "edit") return this.fail(peer, "read_only");
      const list = message.elements;
      if (!Array.isArray(list) || list.length > LIMITS.maxBatch || !list.every(isElement)) return this.fail(peer, "invalid");
      const accepted: BoardElement[] = [];
      for (const element of list) {
        const existing = this.elements.get(element.id);
        if (!existing && this.elements.size >= LIMITS.maxElements) continue;
        if (existing && !isNewer(element, existing)) continue;
        this.elements.set(element.id, element);
        accepted.push(element);
      }
      if (accepted.length === 0) return;
      await this.storage.putElements(accepted);
      this.broadcast(sessionId, { t: "elements", from: sessionId, elements: accepted });
      return;
    }

    if (message.t === "screen") {
      if (peer.access !== "edit") return this.fail(peer, "read_only");
      const { id, rev, html } = message;
      if (typeof id !== "string" || !SCREEN_ID.test(id) || !Number.isInteger(rev) || (rev as number) < 1 || typeof html !== "string") return this.fail(peer, "invalid");
      if (html.length > LIMITS.maxScreenHtmlBytes) return this.fail(peer, "too_large");
      const existing = this.screens.get(id);
      if (existing && existing.rev >= (rev as number)) return;
      const screen: BoardScreen = { id, rev: rev as number, html };
      this.screens.set(id, screen);
      await this.storage.putScreen(screen);
      this.broadcast(sessionId, { t: "screen", from: sessionId, ...screen });
      return;
    }

    this.fail(peer, "invalid");
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @meld/gateway-worker exec vitest run src/board-room-core.test.ts`
Expected: PASS (all tests). The `too_large` test builds a 6 MB string; that is intentional.

- [ ] **Step 5: Commit**

```bash
git add apps/gateway-worker/src/board-room-core.ts apps/gateway-worker/src/board-room-core.test.ts
git commit -m "feat(gateway): add board relay core with merge rules and access checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task R2: Durable Object, route and wrangler binding

**Files:**
- Create: `apps/gateway-worker/src/board-room.ts`
- Modify: `apps/gateway-worker/src/router.ts`, `router.test.ts`, `index.ts`, `env.ts`, `apps/gateway-worker/wrangler.jsonc`, `apps/gateway-worker/worker-configuration.d.ts` (regenerated)

**Interfaces:**
- Consumes: `BoardRoomCore`, `BoardStorage`, `BoardPeer`, `colorFor` (Task R1); `CANVAS_HEADER`, `CanvasConnect` (router).
- Produces: `RouterDeps.forwardToBoard(request: Request, connect: CanvasConnect): Promise<Response>`; route `GET /board/:boardId?ticket=…&sessionId=…` (WebSocket upgrade); Durable Object class `BoardRoom` bound as `BOARD_ROOM`.

- [ ] **Step 1: Update the router test** — `router.test.ts`

In `deps()` add `forwardToBoard: vi.fn(async () => new Response("board")),` after `forwardToCanvas`. Then add inside `describe("route", …)`:

```ts
  describe("/board/:id", () => {
    const ticket = (room = ROOM) =>
      mintCanvasSessionTicket({ workspaceId: WORKSPACE, roomId: room, userId: USER, userName: "Ada", access: "edit" }, SECRET);

    it("requires a websocket upgrade", async () => {
      const res = await route(new Request(`https://g/board/${ROOM}`), deps());
      expect(res.status).toBe(426);
    });

    it("rejects a missing, invalid or other-board ticket", async () => {
      const d = deps();
      for (const query of [`?sessionId=s`, `?ticket=bad&sessionId=s`, `?ticket=${ticket("44444444-4444-4444-8444-444444444444")}&sessionId=s`]) {
        const res = await route(new Request(`https://g/board/${ROOM}${query}`, { headers: upgrade }), d);
        expect(res.status).toBe(401);
      }
      expect(d.forwardToBoard).not.toHaveBeenCalled();
    });

    it("forwards a valid ticket with its claims and session id", async () => {
      const d = deps();
      const res = await route(new Request(`https://g/board/${ROOM}?ticket=${ticket()}&sessionId=abc`, { headers: upgrade }), d);
      expect(await res.text()).toBe("board");
      expect(d.forwardToBoard).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ sessionId: "abc", claims: expect.objectContaining({ roomId: ROOM, access: "edit" }) }));
      expect(d.forwardToCanvas).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/gateway-worker exec vitest run src/router.test.ts`
Expected: FAIL (type error / 404 for `/board`).

- [ ] **Step 3: Update the router** — in `router.ts`

Add to `RouterDeps`: `forwardToBoard(request: Request, connect: CanvasConnect): Promise<Response>;`

Replace the `CANVAS_PATH` handling block with a shared helper. The finished section is:

```ts
const CANVAS_PATH = /^\/canvas\/([^/]+)$/;
const BOARD_PATH = /^\/board\/([^/]+)$/;
```

and, inside `route`, replace the existing `const canvas = CANVAS_PATH.exec(...)` block with:

```ts
  const canvas = CANVAS_PATH.exec(url.pathname);
  if (canvas) {
    const connect = authorizeRoom(request, url, decodeURIComponent(canvas[1]!), deps);
    return connect instanceof Response ? connect : deps.forwardToCanvas(request, connect);
  }

  const board = BOARD_PATH.exec(url.pathname);
  if (board) {
    const connect = authorizeRoom(request, url, decodeURIComponent(board[1]!), deps);
    return connect instanceof Response ? connect : deps.forwardToBoard(request, connect);
  }
```

and add above `route`:

```ts
// Shared by the tldraw room and the Excalidraw board relay: a websocket upgrade
// with a ticket signed for exactly this room.
function authorizeRoom(request: Request, url: URL, roomId: string, deps: RouterDeps): CanvasConnect | Response {
  if (!isUpgrade(request)) return json({ error: "Upgrade Required" }, 426);
  let claims: CanvasSessionClaims;
  try {
    claims = verifyCanvasSessionTicket(url.searchParams.get("ticket") ?? "", deps.canvasSecret, roomId, deps.now?.() ?? new Date());
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (sessionId.length < 1 || sessionId.length > 200) return json({ error: "Unauthorized" }, 401);
  return { claims, sessionId };
}
```

- [ ] **Step 4: Write the Durable Object** — `board-room.ts`

```ts
import { DurableObject } from "cloudflare:workers";
import { BoardRoomCore, colorFor, type BoardElement, type BoardScreen, type BoardStorage } from "./board-room-core";
import type { Env } from "./env";
import { CANVAS_HEADER, type CanvasConnect } from "./router";

const BATCH = 100; // put() accepts at most 128 keys

function durableStorage(storage: DurableObjectStorage): BoardStorage {
  return {
    async loadAll() {
      const elements = await storage.list<BoardElement>({ prefix: "el:" });
      const screens = await storage.list<BoardScreen>({ prefix: "screen:" });
      return { elements: [...elements.values()], screens: [...screens.values()] };
    },
    async putElements(elements) {
      for (let index = 0; index < elements.length; index += BATCH) {
        const entries: Record<string, BoardElement> = {};
        for (const element of elements.slice(index, index + BATCH)) entries[`el:${element.id}`] = element;
        await storage.put(entries);
      }
    },
    async putScreen(screen) {
      await storage.put(`screen:${screen.id}`, screen);
    },
  };
}

// One Durable Object per board. Sessions live in memory (not hibernated), the
// same trade-off the existing tldraw CanvasRoom makes.
export class BoardRoom extends DurableObject<Env> {
  private readonly core: BoardRoomCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new BoardRoomCore(durableStorage(ctx.storage));
  }

  async fetch(request: Request): Promise<Response> {
    const connect = JSON.parse(request.headers.get(CANVAS_HEADER) ?? "null") as CanvasConnect | null;
    if (!connect) return new Response("Bad Request", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    const { sessionId, claims } = connect;
    this.core.connect(sessionId, {
      send: (message) => { try { server.send(message); } catch { /* peer already gone */ } },
      name: claims.userName,
      access: claims.access,
      color: colorFor(sessionId),
    });
    server.addEventListener("message", (event) => {
      if (typeof event.data === "string") void this.core.receive(sessionId, event.data);
    });
    const leave = () => this.core.disconnect(sessionId);
    server.addEventListener("close", leave);
    server.addEventListener("error", leave);
    return new Response(null, { status: 101, webSocket: client });
  }
}
```

- [ ] **Step 5: Wire it up**

`env.ts`: add `BOARD_ROOM: DurableObjectNamespace;` after `CANVAS_ROOM`.

`index.ts`: add `export { BoardRoom } from "./board-room";` and, inside the `route(...)` deps after `forwardToCanvas`:

```ts
      forwardToBoard: (req, connect) =>
        env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(`${connect.claims.workspaceId}:${connect.claims.roomId}`))
          .fetch(withHeader(req, CANVAS_HEADER, connect)),
```

`wrangler.jsonc`: add `{ "name": "BOARD_ROOM", "class_name": "BoardRoom" }` to `durable_objects.bindings`, and append `{ "tag": "v2", "new_sqlite_classes": ["BoardRoom"] }` to `migrations`.

Regenerate types: `pnpm --filter @meld/gateway-worker types`.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @meld/gateway-worker exec vitest run && pnpm --filter @meld/gateway-worker typecheck && pnpm --filter @meld/gateway-worker lint && pnpm --filter @meld/gateway-worker build`
Expected: all pass; the dry-run build lists `BOARD_ROOM`.

- [ ] **Step 7: Commit**

```bash
git add apps/gateway-worker
git commit -m "feat(gateway): add BoardRoom Durable Object and /board route

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task R3: Client sync, cursors, late join, reconnect, persistence

**Files:**
- Create: `board-sync-client.ts`, `board-sync-client.test.ts`, `board-sync-glue.ts`, `board-sync-glue.test.ts`, `use-board-sync.ts` (in `apps/web/src/features/canvas-excalidraw/`); `apps/web/src/app/api/dev/canvas-excalidraw/ticket/route.ts`, `route.test.ts`; `e2e/canvas-excalidraw-sync.spec.ts`
- Modify: `excalidraw-board.tsx`, `playwright.canvas-excalidraw.config.ts`

**Interfaces:**
- Consumes: Task R1 wire protocol; `Screen`, `ScreenStore`.
- Produces:
  - `WebSocketLike`, `class BoardSyncClient { constructor(opts: { connect(): Promise<WebSocketLike>; onMessage(m: ServerMessage): void; onStatus(s: "connecting" | "online" | "offline"): void; backoffMs?(attempt: number): number }); start(): void; stop(): void; send(message: ClientMessage): boolean; isOpen(): boolean; dropConnection(): void }`.
  - `ServerMessage`, `ClientMessage` types mirroring the Task 6 protocol.
  - `elementsToSend(elements, lastSent: Map<string, number>): BoardWireElement[]` (mutates `lastSent`), `toCollaborator(message)`.
  - `useBoardSync({ api, store, boardId, name, access }): { status; peers; sendElements(elements); sendPointer(pointer); sendScreen(screen) }`.
  - `POST /api/dev/canvas-excalidraw/ticket` body `{ boardId, name, access }` → `{ ticket, gatewayUrl }`.
  - Dev hook adds `window.__orionBoard.sync = { status(): string; peerCount(): number; drop(): void }`.

- [ ] **Step 1: Write the failing glue tests** — `board-sync-glue.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { elementsToSend, toCollaborator } from "./board-sync-glue";

const el = (id: string, version: number) => ({ id, version, versionNonce: 1 });

describe("elementsToSend", () => {
  it("returns only elements newer than what was last sent and records them", () => {
    const last = new Map([["a", 2]]);
    const out = elementsToSend([el("a", 2), el("b", 1), el("a", 3)] as never, last);
    expect(out.map((e) => `${e.id}@${e.version}`)).toEqual(["b@1", "a@3"]);
    expect(last.get("a")).toBe(3);
    expect(elementsToSend([el("a", 3), el("b", 1)] as never, last)).toEqual([]);
  });
});

describe("toCollaborator", () => {
  it("maps a pointer message to an Excalidraw collaborator", () => {
    const c = toCollaborator({ t: "pointer", from: "S1", name: "Bea", color: "teal", x: 3, y: 4, tool: "pointer", button: "down" });
    expect(c).toMatchObject({ username: "Bea", pointer: { x: 3, y: 4, tool: "pointer" }, button: "down", color: { background: "teal", stroke: "teal" }, id: "S1" });
  });
});
```

Run `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/board-sync-glue.test.ts` → FAIL. Implement — `board-sync-glue.ts`:

```ts
import type { Collaborator } from "@excalidraw/excalidraw/types";

export type BoardWireElement = { id: string; version: number; versionNonce: number; [key: string]: unknown };

export type PointerMessage = {
  t: "pointer"; from: string; name: string; color: string;
  x: number; y: number; tool: "pointer" | "laser"; button: "up" | "down";
};

// Elements whose version is newer than what we last told the relay about.
export function elementsToSend(
  elements: readonly { id: string; version: number }[],
  lastSent: Map<string, number>,
): BoardWireElement[] {
  const out: BoardWireElement[] = [];
  for (const element of elements) {
    if (element.version > (lastSent.get(element.id) ?? -1)) {
      lastSent.set(element.id, element.version);
      out.push(element as BoardWireElement);
    }
  }
  return out;
}

export function toCollaborator(message: PointerMessage): Collaborator {
  return {
    pointer: { x: message.x, y: message.y, tool: message.tool },
    button: message.button,
    username: message.name,
    color: { background: message.color, stroke: message.color },
    id: message.from,
  };
}
```

Run → PASS.

- [ ] **Step 2: Write the failing sync client test** — `board-sync-client.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardSyncClient, type WebSocketLike } from "./board-sync-client";

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const sockets: FakeSocket[] = [];
  const statuses: string[] = [];
  const messages: unknown[] = [];
  const client = new BoardSyncClient({
    connect: async () => { const s = new FakeSocket(); sockets.push(s); return s; },
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    backoffMs: () => 1000,
  });
  return { client, sockets, statuses, messages };
}

describe("BoardSyncClient", () => {
  it("goes online when the socket opens and delivers parsed messages", async () => {
    const { client, sockets, statuses, messages } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.onmessage?.({ data: JSON.stringify({ t: "peer-left", id: "x" }) });
    sockets[0]!.onmessage?.({ data: "not json" });
    expect(statuses).toEqual(["connecting", "online"]);
    expect(messages).toEqual([{ t: "peer-left", id: "x" }]);
  });

  it("only sends while open", async () => {
    const { client, sockets } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.send({ t: "pointer", x: 1, y: 2, tool: "pointer", button: "up" })).toBe(false);
    sockets[0]!.open();
    expect(client.send({ t: "pointer", x: 1, y: 2, tool: "pointer", button: "up" })).toBe(true);
    expect(sockets[0]!.sent).toHaveLength(1);
  });

  it("reconnects after the socket closes, and again after dropConnection", async () => {
    const { client, sockets, statuses } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.close();
    expect(statuses.at(-1)).toBe("offline");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    client.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(3);
  });

  it("does not reconnect after stop", async () => {
    const { client, sockets } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    client.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(1);
  });
});
```

Run → FAIL. Implement — `board-sync-client.ts`:

```ts
import type { PointerMessage, BoardWireElement } from "./board-sync-glue";

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

export type ClientMessage =
  | { t: "elements"; elements: BoardWireElement[] }
  | { t: "screen"; id: string; rev: number; html: string }
  | { t: "pointer"; x: number; y: number; tool: "pointer" | "laser"; button: "up" | "down" };

export type ServerMessage =
  | { t: "init"; elements: BoardWireElement[]; screens: { id: string; rev: number; html: string }[]; peers: { id: string; name: string }[] }
  | { t: "elements"; from: string; elements: BoardWireElement[] }
  | { t: "screen"; from: string; id: string; rev: number; html: string }
  | PointerMessage
  | { t: "peer-joined"; id: string; name: string }
  | { t: "peer-left"; id: string }
  | { t: "error"; code: string };

type Status = "connecting" | "online" | "offline";
const OPEN = 1;

export class BoardSyncClient {
  private socket: WebSocketLike | null = null;
  private stopped = true;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: {
    connect(): Promise<WebSocketLike>;
    onMessage(message: ServerMessage): void;
    onStatus(status: Status): void;
    backoffMs?(attempt: number): number;
  }) {}

  start(): void {
    this.stopped = false;
    void this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }

  isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || !this.isOpen()) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  // Test hook: behave as if the network dropped.
  dropConnection(): void {
    this.socket?.close();
  }

  private async open(): Promise<void> {
    this.opts.onStatus("connecting");
    let socket: WebSocketLike;
    try {
      socket = await this.opts.connect();
    } catch {
      return this.scheduleReconnect();
    }
    if (this.stopped) return socket.close();
    this.socket = socket;
    socket.onopen = () => { this.attempt = 0; this.opts.onStatus("online"); };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        this.opts.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch { /* ignore malformed */ }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.opts.onStatus("offline");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.opts.backoffMs ? this.opts.backoffMs(this.attempt) : Math.min(10_000, 500 * 2 ** this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => void this.open(), delay);
  }
}
```

Run → PASS.

- [ ] **Step 3: Write the failing ticket route test and implement** — `apps/web/src/app/api/dev/canvas-excalidraw/ticket/route.test.ts`

```ts
import { verifyCanvasSessionTicket } from "@meld/device-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const SECRET = "s".repeat(40);
const BOARD = "11111111-1111-4111-8111-111111111111";
const post = (payload: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(payload) }));

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/dev/canvas-excalidraw/ticket", () => {
  it("is not found outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await post({ boardId: BOARD, name: "A", access: "edit" })).status).toBe(404);
  });
  it("needs the session secret", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", "");
    expect((await post({ boardId: BOARD, name: "A", access: "edit" })).status).toBe(503);
  });
  it("rejects a bad body", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", SECRET);
    expect((await post({ boardId: "nope", name: "A", access: "edit" })).status).toBe(400);
  });
  it("mints a ticket for exactly that board with the asked access", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", SECRET);
    vi.stubEnv("MELD_CANVAS_WS_URL", "ws://127.0.0.1:8788");
    const json = await (await post({ boardId: BOARD, name: "Ada", access: "view" })).json();
    expect(json.gatewayUrl).toBe("ws://127.0.0.1:8788");
    const claims = verifyCanvasSessionTicket(json.ticket, SECRET, BOARD, new Date());
    expect(claims).toMatchObject({ roomId: BOARD, userName: "Ada", access: "view" });
  });
});
```

Run → FAIL. Implement — `ticket/route.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mintCanvasSessionTicket } from "@meld/device-auth";
import { z } from "zod";

// Fixed identity for the throwaway dev workspace; the board id is the room.
const DEV_WORKSPACE = "00000000-0000-4000-8000-000000000001";

const Body = z
  .object({
    boardId: z.string().uuid(),
    name: z.string().min(1).max(40),
    access: z.enum(["edit", "view"]),
  })
  .strict();

// Development-only: stands in for the real session route (delivery stage 3).
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Not found" }, { status: 404 });
  const secret = process.env.MELD_CANVAS_SESSION_SECRET;
  if (!secret) return Response.json({ error: "MELD_CANVAS_SESSION_SECRET is not set" }, { status: 503 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const ticket = mintCanvasSessionTicket(
    { workspaceId: DEV_WORKSPACE, roomId: body.data.boardId, userId: randomUUID(), userName: body.data.name, access: body.data.access },
    secret,
  );
  return Response.json({ ticket, gatewayUrl: process.env.MELD_CANVAS_WS_URL ?? "ws://127.0.0.1:8788" });
}
```

Run `pnpm --filter @meld/web exec vitest run src/app/api/dev/canvas-excalidraw/ticket` → PASS. (If the id `DEV_WORKSPACE` fails the UUID pattern in `assertInput`, use a v4 UUID such as `22222222-2222-4222-8222-222222222222`.)

- [ ] **Step 4: Write the hook** — `use-board-sync.ts`

```ts
"use client";

import { CaptureUpdateAction, reconcileElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Collaborator, ExcalidrawImperativeAPI, SocketId } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoardSyncClient, type ServerMessage } from "./board-sync-client";
import { elementsToSend, toCollaborator, type BoardWireElement } from "./board-sync-glue";
import type { Screen, ScreenStore } from "./screen-store";

type Status = "connecting" | "online" | "offline";
type RemoteElements = Parameters<typeof reconcileElements>[1];

const BATCH = 200;

export function useBoardSync(input: {
  api: ExcalidrawImperativeAPI | null;
  store: ScreenStore;
  boardId?: string;
  name: string;
  access: "edit" | "view";
}) {
  const { api, store, boardId, name, access } = input;
  const [status, setStatus] = useState<Status>("connecting");
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const client = useRef<BoardSyncClient | null>(null);
  const lastSent = useRef(new Map<string, number>());
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const live = useRef({ status, peers });
  live.current = { status, peers };

  useEffect(() => {
    if (!api || !boardId) return;
    const collaborators = new Map<SocketId, Collaborator>();
    lastSent.current = new Map();

    const applyRemote = (remote: BoardWireElement[]) => {
      const reconciled = reconcileElements(api.getSceneElementsIncludingDeleted(), remote as unknown as RemoteElements, api.getAppState());
      for (const element of remote) lastSent.current.set(element.id, element.version);
      api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
    };

    const pushLocal = () => {
      if (access !== "edit" || !client.current?.isOpen()) return;
      const changed = elementsToSend(api.getSceneElementsIncludingDeleted(), lastSent.current);
      for (let index = 0; index < changed.length; index += BATCH) {
        client.current.send({ t: "elements", elements: changed.slice(index, index + BATCH) });
      }
      for (const screen of store.all()) client.current.send({ t: "screen", ...screen });
    };

    const onMessage = (message: ServerMessage) => {
      switch (message.t) {
        case "init":
          for (const screen of message.screens) store.set(screen);
          lastSent.current = new Map();
          applyRemote(message.elements);
          setPeers(message.peers);
          pushLocal(); // anything made offline that the relay has not seen
          break;
        case "elements":
          applyRemote(message.elements);
          break;
        case "screen":
          store.set({ id: message.id, rev: message.rev, html: message.html });
          break;
        case "pointer":
          collaborators.set(message.from as SocketId, toCollaborator(message));
          api.updateScene({ collaborators: new Map(collaborators) });
          break;
        case "peer-joined":
          setPeers((current) => [...current.filter((p) => p.id !== message.id), { id: message.id, name: message.name }]);
          break;
        case "peer-left":
          collaborators.delete(message.id as SocketId);
          api.updateScene({ collaborators: new Map(collaborators) });
          setPeers((current) => current.filter((p) => p.id !== message.id));
          break;
        case "error":
          break;
      }
    };

    const sync = new BoardSyncClient({
      connect: async () => {
        const response = await fetch("/api/dev/canvas-excalidraw/ticket", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ boardId, name, access }),
        });
        if (!response.ok) throw new Error("ticket");
        const { ticket, gatewayUrl } = (await response.json()) as { ticket: string; gatewayUrl: string };
        const url = `${gatewayUrl}/board/${boardId}?ticket=${encodeURIComponent(ticket)}&sessionId=${sessionId}`;
        return new WebSocket(url);
      },
      onMessage,
      onStatus: setStatus,
    });
    client.current = sync;
    sync.start();
    window.__orionBoard = {
      ...window.__orionBoard!,
      sync: { status: () => live.current.status, peerCount: () => live.current.peers.length, drop: () => sync.dropConnection() },
    };
    return () => {
      sync.stop();
      client.current = null;
    };
  }, [api, store, boardId, name, access, sessionId]);

  return {
    status,
    peers,
    sendElements(elements: readonly ExcalidrawElement[]) {
      if (access !== "edit" || !client.current?.isOpen()) return;
      const changed = elementsToSend(elements, lastSent.current);
      for (let index = 0; index < changed.length; index += BATCH) {
        client.current.send({ t: "elements", elements: changed.slice(index, index + BATCH) });
      }
    },
    sendPointer(pointer: { x: number; y: number; tool: "pointer" | "laser" }, button: "up" | "down") {
      client.current?.send({ t: "pointer", ...pointer, button });
    },
    sendScreen(screen: Screen) {
      if (access === "edit") client.current?.send({ t: "screen", ...screen });
    },
  };
}
```

- [ ] **Step 5: Wire the board**

In `excalidraw-board.tsx`:
1. Extend the global type: `sync?: { status: () => string; peerCount: () => number; drop: () => void };` inside `__orionBoard`.
2. Accept `boardId`, `name` in props and call `const sync = useBoardSync({ api, store, boardId, name, access });`.
3. On the `<Excalidraw>` add:

```tsx
          isCollaborating={Boolean(boardId)}
          onPointerUpdate={(payload) => sync.sendPointer(payload.pointer, payload.button)}
```

and extend the existing `onChange` to also call `sync.sendElements(elements);`.
4. Keep a ref so callbacks that Excalidraw captures once (`onApi`, `addFixture`) always reach the current sync: right after `const sync = useBoardSync(...)` add `const syncRef = useRef(sync); syncRef.current = sync;` (import `useRef`). Define `sync` before `addFixture`. In `addFixture`, replace `for (const screen of FIXTURES[key].screens) store.set(screen);` with `for (const screen of FIXTURES[key].screens) { if (store.set(screen)) syncRef.current.sendScreen(screen); }`. In `buildScreen`, after `store.set({ id: screen.screenId, rev: 1, html: screen.html })` call `sync.sendScreen({ id: screen.screenId, rev: 1, html: screen.html })` and add `sync` to its dependency array.
5. Show status in the toolbar: `{boardId ? <Text type="label">{sync.status === "online" ? `Online · ${sync.peers.length} here` : sync.status}</Text> : <Text type="label">Local board</Text>}`.

- [ ] **Step 6: Run the unit tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw src/app/api/dev && pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx && pnpm check:test-colocation`
Expected: pass.

- [ ] **Step 7: Run two servers in the Playwright config** — replace `webServer` in `playwright.canvas-excalidraw.config.ts` with:

```ts
const SECRET = "playwright-board-secret-0123456789abcdef";
const relayPort = Number(process.env.MELD_E2E_RELAY_PORT ?? 8788);
```

(placed above `defineConfig`) and

```ts
  webServer: [
    {
      command: `pnpm --filter @meld/web exec next dev --hostname 127.0.0.1 --port ${port}`,
      url: `${baseURL}/dev/canvas-excalidraw`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        MELD_E2E_DIST_DIR: ".next-canvas-excalidraw",
        MELD_E2E_FAKE_WORKSPACES: "true",
        MELD_CANVAS_SESSION_SECRET: SECRET,
        MELD_CANVAS_WS_URL: `ws://127.0.0.1:${relayPort}`,
      },
    },
    {
      command:
        `pnpm --filter @meld/gateway-worker exec wrangler dev --ip 127.0.0.1 --port ${relayPort} ` +
        `--persist-to ../../.context/wrangler-e2e ` +
        `--var MELD_CANVAS_SESSION_SECRET:${SECRET} --var GATEWAY_SUPABASE_URL:http://127.0.0.1:9 ` +
        `--var GATEWAY_SUPABASE_SERVICE_ROLE_KEY:unused --var GATEWAY_HEARTBEAT_SECONDS:30 --var GATEWAY_POLL_INTERVAL_MS:1000`,
      url: `http://127.0.0.1:${relayPort}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
```

- [ ] **Step 8: Write the failing multiplayer spec** — `e2e/canvas-excalidraw-sync.spec.ts`

```ts
import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";

async function join(browser: Browser, baseURL: string, board: string, name: string, access = "edit"): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`/dev/canvas-excalidraw?board=${board}&name=${name}&access=${access}`);
  await expect(page.getByText(/Online/)).toBeVisible();
  return page;
}

const elementCount = (page: Page) => page.evaluate(() => window.__orionBoard!.api.getSceneElements().length);

async function drawRectangle(page: Page, id: string) {
  await page.evaluate((rectId) => {
    const { api, convert } = window.__orionBoard!;
    const added = convert([{ type: "rectangle", id: rectId, x: 20, y: 20, width: 100, height: 60 }]);
    api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...added] });
  }, id);
}

test("two people see each other's drawings, frames and cursors", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  const bea = await join(browser, baseURL!, board, "Bea");
  await expect(ada.getByText("Online · 2 here")).toBeVisible();

  await drawRectangle(ada, "from-ada");
  await expect.poll(() => elementCount(bea)).toBe(1);

  await ada.getByRole("button", { name: "Add sample screen" }).click();
  await expect(bea.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
  await expect(bea.frameLocator('iframe[data-orion-frame="welcome"]').locator("#js")).toHaveText("script ran");

  const box = (await ada.locator("canvas.excalidraw__canvas").first().boundingBox())!;
  await ada.mouse.move(box.x + 300, box.y + 300);
  await ada.mouse.move(box.x + 340, box.y + 320, { steps: 5 });
  await expect.poll(() => bea.evaluate(() => window.__orionBoard!.api.getAppState().collaborators.size)).toBeGreaterThan(0);
});

test("someone joining late sees the whole board", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  await drawRectangle(ada, "early");
  await ada.getByRole("button", { name: "Add sample screen" }).click();
  await expect.poll(() => elementCount(ada)).toBe(2);
  const cy = await join(browser, baseURL!, board, "Cy");
  await expect.poll(() => elementCount(cy)).toBe(2);
  await expect(cy.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
});

test("a dropped connection catches up after reconnecting", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  const bea = await join(browser, baseURL!, board, "Bea");
  await bea.evaluate(() => window.__orionBoard!.sync!.drop());
  await drawRectangle(ada, "while-away");
  await expect(bea.getByText("Online · 2 here")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => elementCount(bea), { timeout: 20_000 }).toBe(1);
  await drawRectangle(bea, "after-return");
  await expect.poll(() => elementCount(ada)).toBe(2);
});

test("a viewer cannot change the board", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  const vic = await join(browser, baseURL!, board, "Vic", "view");
  await drawRectangle(vic, "sneaky");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(await elementCount(ada)).toBe(0);
});

test("the board is still there after everyone leaves and someone reopens it", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  await drawRectangle(ada, "kept");
  await ada.getByRole("button", { name: "Add sample screen" }).click();
  await expect.poll(() => elementCount(ada)).toBe(2);
  await ada.context().close();
  const again = await join(browser, baseURL!, board, "Ada2");
  await expect.poll(() => elementCount(again)).toBe(2);
  await expect(again.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
});
```

- [ ] **Step 9: Run it**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts canvas-excalidraw-sync`
Expected: PASS. Failures here are findings; diagnose first. Common causes:
- Status never reads "Online": `wrangler dev` not reachable or the ticket route returns 503; check the two server logs.
- Elements echo forever: `lastSent` is not being updated for remote elements; check `applyRemote`.
- Cursors do not appear: `isCollaborating` must be true and `onPointerUpdate` must fire; verify with a `console.log` in the handler, then remove it.
- Reconnect test flaky: raise the poll timeout, but record the reconnect time in the report.

- [ ] **Step 10: Persistence across a relay restart (manual, record result)**

Run the sync spec's "kept" scenario by hand: open `/dev/canvas-excalidraw?board=<uuid>`, draw and add a sample screen, stop the `wrangler dev` process, start it again with the same `--persist-to ../../.context/wrangler-e2e`, reopen the same URL. Record in the report whether the board and screen came back from Durable Object storage.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src e2e/canvas-excalidraw-sync.spec.ts playwright.canvas-excalidraw.config.ts
git commit -m "feat(canvas): sync Excalidraw boards through the Durable Object relay

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
