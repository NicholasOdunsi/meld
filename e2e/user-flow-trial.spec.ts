import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { expect, test, type Page } from "@playwright/test";
import { mintCanvasSessionTicket } from "@meld/device-auth";
import {
  CANVAS_E2E_ORGANIZATION_ID,
  CANVAS_E2E_PROTOCOL_VERSION,
  CANVAS_E2E_ROOM_ID,
  CANVAS_E2E_SCHEMA,
  CANVAS_E2E_SECRET,
  startCanvasTrialGateway,
} from "../apps/gateway/src/canvas/e2e-main";
import { readGatewayConfig } from "../apps/gateway/src/config";

const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const EDITOR_ID = "10000000-0000-4000-8000-000000000002";
const VIEWER_ID = "10000000-0000-4000-8000-000000000003";
const ROOM_TWO_ID = "40000000-0000-4000-8000-000000000002";

declare global {
  interface Window {
    __MELD_TLDRAW_TRIAL_EDITOR__?: unknown;
  }
}

type CanvasMessage = {
  type?: string;
  action?: string | { rebaseWithDiff: Record<string, unknown> };
  clientClock?: number;
  diff?: Record<string, unknown>;
  isReadonly?: boolean;
  serverClock?: number;
  [key: string]: unknown;
};

interface TrialSocket {
  socket: WebSocket;
  sessionId: string;
  messages: CanvasMessage[];
  nextClientClock: number;
  connectMessage: CanvasMessage;
  waitForMessage(predicate: (message: CanvasMessage) => boolean): Promise<CanvasMessage>;
  push(diff: Record<string, unknown>): Promise<CanvasMessage>;
  close(): Promise<void>;
}

function websocketUrl(baseUrl: string, roomId: string, ticket: string, sessionId: string): string {
  const url = new URL(`/canvas/${roomId}`, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  url.searchParams.set("sessionId", sessionId);
  return url.toString();
}

async function connectTrialSocket(input: {
  baseUrl: string;
  roomId?: string;
  ticket: string;
  sessionId: string;
}): Promise<TrialSocket> {
  const socket = new WebSocket(
    websocketUrl(
      input.baseUrl,
      input.roomId ?? CANVAS_E2E_ROOM_ID,
      input.ticket,
      input.sessionId,
    ),
  );
  const messages: CanvasMessage[] = [];
  let connected = false;
  let resolveConnect: ((message: CanvasMessage) => void) | undefined;
  const connectPromise = new Promise<CanvasMessage>((resolve) => {
    resolveConnect = resolve;
  });
  const waiters: Array<{
    predicate: (message: CanvasMessage) => boolean;
    resolve: (message: CanvasMessage) => void;
  }> = [];
  socket.on("message", (data) => {
    const envelope = JSON.parse(data.toString()) as CanvasMessage;
    const incoming =
      envelope.type === "data" && Array.isArray(envelope.data)
        ? (envelope.data as CanvasMessage[])
        : [envelope];
    for (const message of incoming) {
      const waiter = waiters.find((candidate) => candidate.predicate(message));
      if (waiter) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      } else {
        messages.push(message);
      }
      if (!connected && message.type === "connect") {
        connected = true;
        resolveConnect?.(message);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({
      type: "connect",
      connectRequestId: `e2e-${input.sessionId}`,
      schema: CANVAS_E2E_SCHEMA,
      protocolVersion: CANVAS_E2E_PROTOCOL_VERSION,
      lastServerClock: -1,
    }),
  );
  const connectMessage = await connectPromise;

  return {
    socket,
    sessionId: input.sessionId,
    messages,
    nextClientClock: 0,
    connectMessage,
    waitForMessage(predicate) {
      const existing = messages.find(predicate);
      if (existing) {
        messages.splice(messages.indexOf(existing), 1);
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for canvas message (${input.sessionId})`)), 5_000);
        waiters.push({
          predicate,
          resolve: (message) => {
            clearTimeout(timer);
            resolve(message);
          },
        });
      });
    },
    push(diff) {
      const clientClock = this.nextClientClock++;
      this.socket.send(JSON.stringify({ type: "push", clientClock, diff }));
      return this.waitForMessage(
        (message) =>
          message.type === "push_result" && message.clientClock === clientClock,
      );
    },
    close() {
      return new Promise((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        socket.once("close", () => resolve());
        socket.close();
      });
    },
  };
}

function pageRecord(
  name = "Trial start",
  id = "page:trial-page",
  index = "a1",
) {
  return {
    id,
    typeName: "page",
    name,
    index,
    meta: {},
  };
}

function canvasTicket(userId: string, userName: string, access: "edit" | "view", roomId = CANVAS_E2E_ROOM_ID) {
  return mintCanvasSessionTicket(
    {
      organizationId: CANVAS_E2E_ORGANIZATION_ID,
      roomId,
      userId,
      userName,
      access,
    },
    CANVAS_E2E_SECRET,
  );
}

async function fetchEvidence(baseUrl: string, ticket: string, roomId = CANVAS_E2E_ROOM_ID) {
  const response = await fetch(`${baseUrl}/canvas/${roomId}/trial/evidence`, {
    headers: { authorization: `Canvas ${ticket}` },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    activeSessions: number;
    documentClock: number;
    clientAuditCount: number;
    serverAuditCount: number;
    auditEvents: Array<{
      actorId: string;
      sessionId: string;
      documentClock: number;
      origin: "client" | "server";
      touchedRecordIds: string[];
    }>;
    auditFailures: Array<{ code: string }>;
  };
}

async function expectBrowserHealth(page: Page, baseUrl: string) {
  await page.goto(`${baseUrl}/health`);
  await expect(page.locator("body")).toContainText('"status":"ok"');
  await expect(page.locator("body")).toContainText('"tldraw":"5.3.0"');
}

test("real trial gateway proves collaboration, viewer protection, persistence, and evidence", async ({ page }) => {
  const dataDir = mkdtempSync(join(tmpdir(), "meld-canvas-e2e-persist-"));
  let runtime = await startCanvasTrialGateway({
    dataDir,
    secret: CANVAS_E2E_SECRET,
  });
  const sockets: TrialSocket[] = [];
  try {
    await expectBrowserHealth(page, runtime.baseUrl);
    const editorA = await connectTrialSocket({
      baseUrl: runtime.baseUrl,
      ticket: canvasTicket(OWNER_ID, "Owner", "edit"),
      sessionId: "editor-owner",
    });
    const editorB = await connectTrialSocket({
      baseUrl: runtime.baseUrl,
      ticket: canvasTicket(EDITOR_ID, "Editor", "edit"),
      sessionId: "editor-peer",
    });
    sockets.push(editorA, editorB);
    expect(editorA.connectMessage.isReadonly).toBe(false);
    expect(editorB.connectMessage.isReadonly).toBe(false);

    const pageId = "page:trial-page";
    const firstCommit = await editorA.push({
      [pageId]: ["put", pageRecord()],
    });
    expect(firstCommit.action).toBe("commit");
    const peerPatch = await editorB.waitForMessage(
      (message) => message.type === "patch" && Boolean(message.diff?.[pageId]),
    );
    expect(peerPatch.diff?.[pageId]).toEqual(["put", pageRecord()]);

    const secondCommit = await editorB.push({
      [pageId]: ["patch", { name: ["put", "Peer renamed the flow"] }],
    });
    expect(secondCommit.action).toBe("commit");
    const ownerPatch = await editorA.waitForMessage(
      (message) => message.type === "patch" && Boolean(message.diff?.[pageId]),
    );
    expect(ownerPatch.diff?.[pageId]).toEqual([
      "patch",
      { name: ["put", "Peer renamed the flow"] },
    ]);

    // Protocol-level patch round-trip only. This is not an Editor undo-stack
    // assertion; the Next-app gate remains the place for that coverage.
    const remotePatchRoundTrip = await editorA.push({
      [pageId]: ["patch", { name: ["put", "Trial start"] }],
    });
    expect(remotePatchRoundTrip.action).toBe("commit");
    const peerUndoPatch = await editorB.waitForMessage(
      (message) => message.type === "patch" && Boolean(message.diff?.[pageId]),
    );
    expect(peerUndoPatch.diff?.[pageId]).toEqual([
      "patch",
      { name: ["put", "Trial start"] },
    ]);

    const interleavedIds = ["page:interleaved"];
    for (let index = 0; index < 50; index += 1) {
      const id = interleavedIds[0]!;
      const editor = index % 2 === 0 ? editorA : editorB;
      const result = await editor.push({
        [id]: index === 0
          ? ["put", pageRecord(`Interleaved ${index}`, id)]
          : ["patch", { name: ["put", `Interleaved ${index}`] }],
      });
      expect(result.action).toBe("commit");
    }

    const viewer = await connectTrialSocket({
      baseUrl: runtime.baseUrl,
      ticket: canvasTicket(VIEWER_ID, "Viewer", "view"),
      sessionId: "viewer-readonly",
    });
    sockets.push(viewer);
    expect(viewer.connectMessage.isReadonly).toBe(true);
    const viewerResult = await viewer.push({
      [pageId]: ["patch", { name: ["put", "viewer must not write"] }],
    });
    expect(viewerResult.action).toBe("discard");

    const ownerTicket = canvasTicket(OWNER_ID, "Owner", "edit");
    const markerResponse = await fetch(
      `${runtime.baseUrl}/canvas/${CANVAS_E2E_ROOM_ID}/trial/server-marker`,
      {
        method: "POST",
        headers: {
          authorization: `Canvas ${ownerTicket}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "gateway marker" }),
      },
    );
    expect(markerResponse.status).toBe(201);

    const evidence = await fetchEvidence(runtime.baseUrl, ownerTicket);
    expect(evidence.activeSessions).toBe(3);
    expect(evidence.documentClock).toBeGreaterThan(0);
    expect(evidence.clientAuditCount).toBe(53);
    expect(evidence.serverAuditCount).toBe(1);
    expect(evidence.auditFailures).toHaveLength(0);
    const interleavedEvents = evidence.auditEvents.filter((event) =>
      event.touchedRecordIds.some((id) => interleavedIds.includes(id)),
    );
    expect(interleavedEvents).toHaveLength(50);
    expect(new Set(interleavedEvents.map((event) => event.documentClock)).size).toBe(50);
    expect(evidence.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: OWNER_ID,
          sessionId: "editor-owner",
          origin: "client",
          touchedRecordIds: expect.arrayContaining([pageId]),
        }),
        expect.objectContaining({
          actorId: EDITOR_ID,
          sessionId: "editor-peer",
          origin: "client",
          touchedRecordIds: expect.arrayContaining([pageId]),
        }),
        expect.objectContaining({
          actorId: "gateway",
          origin: "server",
          touchedRecordIds: expect.arrayContaining([expect.stringMatching(/^shape:/)]),
        }),
      ]),
    );
    expect(evidence.auditEvents.some((event) => event.actorId === VIEWER_ID)).toBe(false);
    expect(evidence.auditFailures.every((failure) => typeof failure.code === "string")).toBe(true);

    const isolatedEditor = await connectTrialSocket({
      baseUrl: runtime.baseUrl,
      roomId: ROOM_TWO_ID,
      ticket: canvasTicket(EDITOR_ID, "Editor", "edit", ROOM_TWO_ID),
      sessionId: "isolated-editor",
    });
    sockets.push(isolatedEditor);
    expect((await isolatedEditor.push({ [pageId]: ["put", pageRecord("Isolated flow")] })).action).toBe("commit");
    const roomTwoTicket = canvasTicket(EDITOR_ID, "Editor", "edit", ROOM_TWO_ID);
    const roomTwoEvidence = await fetchEvidence(runtime.baseUrl, roomTwoTicket, ROOM_TWO_ID);
    expect(roomTwoEvidence.auditEvents.some((event) => event.sessionId === "editor-owner")).toBe(false);

    for (const socket of sockets) await socket.close();
    sockets.length = 0;
    await runtime.close();
    runtime = await startCanvasTrialGateway({
      dataDir,
      secret: CANVAS_E2E_SECRET,
    });
    const restored = await connectTrialSocket({
      baseUrl: runtime.baseUrl,
      ticket: canvasTicket(OWNER_ID, "Owner", "edit"),
      sessionId: "restored-owner",
    });
    sockets.push(restored);
    expect(restored.connectMessage.diff?.[pageId]).toEqual([
      "put",
      expect.objectContaining({ name: "Trial start" }),
    ]);
    const restoredEvidence = await fetchEvidence(runtime.baseUrl, ownerTicket);
    expect(restoredEvidence.documentClock).toBeGreaterThanOrEqual(evidence.documentClock);
  } finally {
    for (const socket of sockets) await socket.close();
    await runtime.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("trial configuration is off by default and rejects production", () => {
  const baseEnv = {
    GATEWAY_SUPABASE_URL: "https://example.supabase.co",
    GATEWAY_SUPABASE_SERVICE_ROLE_KEY: "service-key",
    MELD_USER_FLOW_TRIAL_ENABLED: "false",
    NODE_ENV: "test",
  };
  expect(readGatewayConfig(baseEnv).canvasTrialEnabled).toBe(false);
  expect(() =>
    readGatewayConfig({
      ...baseEnv,
      MELD_USER_FLOW_TRIAL_ENABLED: "true",
      MELD_CANVAS_SESSION_SECRET: CANVAS_E2E_SECRET,
      MELD_CANVAS_DATA_DIR: "/tmp/meld-canvas-trial",
      GATEWAY_DATABASE_URL: "postgres://localhost/meld",
      NODE_ENV: "production",
    }),
  ).toThrow("MELD_USER_FLOW_TRIAL_ENABLED");
});

test("Next app user-flow canvas gate", async ({ browser, page }) => {
  const appBaseUrl = process.env.MELD_CANVAS_E2E_APP_BASE_URL;
  test.skip(
    !appBaseUrl,
    "Set MELD_CANVAS_E2E_APP_BASE_URL to run the authenticated Next app gate; gateway-only proof remains runnable without Supabase.",
  );
  const roomPath = `/${CANVAS_E2E_ORGANIZATION_ID}/discovery/${CANVAS_E2E_ROOM_ID}?tab=user-flows`;
  await page.goto(new URL(roomPath, appBaseUrl).toString());
  await expect(page.getByTestId("user-flow-trial-surface")).toBeVisible();
  await expect(page.getByTestId("user-flow-trial-canvas")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__MELD_TLDRAW_TRIAL_EDITOR__)))
    .toBe(true);

  const peer = await browser.newPage();
  try {
    await peer.goto(new URL(roomPath, appBaseUrl).toString());
    await expect(peer.getByTestId("user-flow-trial-surface")).toBeVisible();
    const sessionStatus = await page.evaluate(async ({ organizationId, roomId }) => {
      const response = await fetch("/api/canvas-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, roomId }),
      });
      return response.status;
    }, {
      organizationId: CANVAS_E2E_ORGANIZATION_ID,
      roomId: CANVAS_E2E_ROOM_ID,
    });
    expect(sessionStatus).toBe(201);
    await expect
      .poll(() => peer.evaluate(() => Boolean(window.__MELD_TLDRAW_TRIAL_EDITOR__)))
      .toBe(true);
  } finally {
    await peer.close();
  }
});

test("volume verifier proves fsync, atomic rename, and SQLite durability pragmas", () => {
  const volume = mkdtempSync(join(tmpdir(), "meld-canvas-volume-"));
  try {
    const output = execFileSync(
      process.execPath,
      ["scripts/canvas-trial/verify-volume.mjs", volume],
      { encoding: "utf8" },
    );
    const result = JSON.parse(output) as {
      passed: boolean;
      fsync: { file: boolean; atomicRename: boolean; directory: boolean };
      sqlite: { journalMode: string; synchronous: number; foreignKeys: number };
    };
    expect(result).toMatchObject({
      passed: true,
      fsync: { file: true, atomicRename: true, directory: true },
      sqlite: { journalMode: "wal", synchronous: 2, foreignKeys: 1 },
    });
  } finally {
    rmSync(volume, { recursive: true, force: true });
  }
});
