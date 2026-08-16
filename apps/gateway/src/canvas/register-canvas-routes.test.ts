import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { mintCanvasSessionTicket } from "@meld/device-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanvasRoomManagerError,
  type CanvasRoomManager,
} from "./canvas-room-manager";
import { registerCanvasRoutes } from "./register-canvas-routes";

const SECRET = "a-32-byte-minimum-canvas-ticket-secret";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_ROOM_ID = "40000000-0000-4000-8000-000000000002";

function ticket(access: "view" | "edit" = "edit", roomId = ROOM_ID) {
  return mintCanvasSessionTicket(
    {
      workspaceId: WORKSPACE_ID,
      roomId,
      userId: USER_ID,
      userName: "Canvas Tester",
      access,
    },
    SECRET,
  );
}

function fakeRoom() {
  return {
    connect: vi.fn(),
  };
}

function fakeManager(overrides: Partial<Record<string, unknown>> = {}) {
  const room = fakeRoom();
  return {
    room,
    manager: ({
      getOrCreate: vi.fn().mockResolvedValue(room),
      connectExisting: vi.fn(),
      insertServerMarker: vi
        .fn()
        .mockResolvedValue({ documentClock: 3, recordId: "shape:server" }),
      evidence: vi.fn().mockReturnValue({
        roomId: ROOM_ID,
        activeSessions: 1,
        documentClock: 3,
        clientAuditCount: 1,
        serverAuditCount: 1,
        auditEvents: [
          {
            actorId: USER_ID,
            sessionId: "session-1",
            documentClock: 3,
            origin: "client",
            touchedRecordIds: ["shape:client"],
          },
        ],
        auditFailures: [],
      }),
      ...overrides,
    } as unknown as CanvasRoomManager),
  };
}

async function createServer(
  enabled: boolean,
  manager: CanvasRoomManager,
  secret = SECRET,
) {
  const server = Fastify({ logger: false });
  await server.register(websocket);
  await registerCanvasRoutes(server, {
    enabled,
    sessionSecret: secret,
    roomManager: manager,
  });
  await server.ready();
  return server;
}

const servers: Awaited<ReturnType<typeof createServer>>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("registerCanvasRoutes", () => {
  it("leaves the trial disabled when the feature flag is off", async () => {
    const { manager } = fakeManager();
    const server = await createServer(false, manager);
    servers.push(server);
    const response = await server.inject({
      method: "GET",
      url: `/canvas/${ROOM_ID}/trial/evidence`,
    });
    expect(response.statusCode).toBe(404);
    expect(manager.evidence).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-ticket"],
    ["expired", `${ticket()}x`],
    ["wrong room", ticket("edit", OTHER_ROOM_ID)],
    ["wrong version", "eyJ2ZXJzaW9uIjoyfQ.invalid"],
  ])("rejects %s WebSocket tickets before manager access", async (_name, supplied) => {
    const { manager } = fakeManager();
    const server = await createServer(true, manager);
    servers.push(server);
    const query = supplied ? `?ticket=${encodeURIComponent(supplied)}&sessionId=s-1` : "?sessionId=s-1";
    await expect(server.injectWS(`/canvas/${ROOM_ID}${query}`)).rejects.toThrow(
      "Unexpected server response: 401",
    );
    expect(manager.getOrCreate).not.toHaveBeenCalled();
  });

  it("requires a bounded session id and enforces the room authority", async () => {
    const { manager } = fakeManager();
    const server = await createServer(true, manager);
    servers.push(server);
    await expect(
      server.injectWS(
        `/canvas/${ROOM_ID}?ticket=${encodeURIComponent(ticket())}`,
      ),
    ).rejects.toThrow("Unexpected server response: 401");
    await expect(
      server.injectWS(
        `/canvas/${ROOM_ID}?ticket=${encodeURIComponent(ticket())}&sessionId=${"x".repeat(201)}`,
      ),
    ).rejects.toThrow("Unexpected server response: 401");

    const unavailable = fakeManager({
      getOrCreate: vi
        .fn()
        .mockRejectedValue(
          new CanvasRoomManagerError("room_authority_unavailable"),
        ),
    });
    const blocked = await createServer(true, unavailable.manager);
    servers.push(blocked);
    await expect(
      blocked.injectWS(
        `/canvas/${ROOM_ID}?ticket=${encodeURIComponent(ticket())}&sessionId=s-1`,
      ),
    ).rejects.toThrow("Unexpected server response: 503");
  });

  it("passes editor and viewer identity to the synchronizer", async () => {
    const { manager } = fakeManager();
    const connectExisting = manager.connectExisting as unknown as ReturnType<
      typeof vi.fn
    >;
    const server = await createServer(true, manager);
    servers.push(server);

    const editor = await server.injectWS(
      `/canvas/${ROOM_ID}?ticket=${encodeURIComponent(ticket("edit"))}&sessionId=editor-1`,
    );
    await vi.waitFor(() => expect(connectExisting).toHaveBeenCalledOnce());
    expect(connectExisting).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "editor-1",
        workspaceId: WORKSPACE_ID,
        roomId: ROOM_ID,
        meta: expect.objectContaining({ access: "edit", roomId: ROOM_ID }),
      }),
    );
    editor.close();

    const viewer = await server.injectWS(
      `/canvas/${ROOM_ID}?ticket=${encodeURIComponent(ticket("view"))}&sessionId=viewer-1`,
    );
    await vi.waitFor(() => expect(connectExisting).toHaveBeenCalledTimes(2));
    expect(connectExisting.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        sessionId: "viewer-1",
        meta: expect.objectContaining({ access: "view" }),
      }),
    );
    viewer.close();
  });

  it("accepts editor markers, rejects viewers, and never accepts query tickets", async () => {
    const { manager } = fakeManager();
    const server = await createServer(true, manager);
    servers.push(server);

    const created = await server.inject({
      method: "POST",
      url: `/canvas/${ROOM_ID}/trial/server-marker`,
      headers: { authorization: `Canvas ${ticket("edit")}` },
      payload: { label: "from test" },
    });
    expect(created.statusCode).toBe(201);
    expect(manager.insertServerMarker).toHaveBeenCalledWith(
      WORKSPACE_ID,
      ROOM_ID,
      "from test",
    );

    const viewer = await server.inject({
      method: "POST",
      url: `/canvas/${ROOM_ID}/trial/server-marker`,
      headers: { authorization: `Canvas ${ticket("view")}` },
    });
    expect(viewer.statusCode).toBe(403);

    const queryOnly = await server.inject({
      method: "POST",
      url: `/canvas/${ROOM_ID}/trial/server-marker?ticket=${encodeURIComponent(ticket("edit"))}`,
    });
    expect(queryOnly.statusCode).toBe(401);
  });

  it("returns redacted evidence only to editors", async () => {
    const { manager } = fakeManager();
    const server = await createServer(true, manager);
    servers.push(server);
    const response = await server.inject({
      method: "GET",
      url: `/canvas/${ROOM_ID}/trial/evidence`,
      headers: { authorization: `Canvas ${ticket("edit")}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        roomId: ROOM_ID,
        documentClock: 3,
        auditEvents: expect.any(Array),
        auditFailures: [],
      }),
    );
    expect(response.body).not.toContain("raw");
    expect(response.body).not.toContain(ticket("edit"));
  });
});
