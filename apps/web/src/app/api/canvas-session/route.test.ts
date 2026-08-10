import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getDiscoveryRoomPageData: vi.fn(),
  mintCanvasSessionTicket: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/discovery/queries", () => ({
  getDiscoveryRoomPageData: mocks.getDiscoveryRoomPageData,
}));

vi.mock("@meld/device-auth", () => ({
  CANVAS_SESSION_LIFETIME_SECONDS: 60,
  mintCanvasSessionTicket: mocks.mintCanvasSessionTicket,
}));

import { POST } from "./route";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const ADMIN_ID = "10000000-0000-4000-8000-000000000002";
const EDITOR_ID = "10000000-0000-4000-8000-000000000003";
const VIEWER_ID = "10000000-0000-4000-8000-000000000004";
const OUTSIDER_ID = "10000000-0000-4000-8000-000000000005";
const SECRET = "a-32-byte-minimum-canvas-ticket-secret";
const GATEWAY_URL = "ws://127.0.0.1:8788";

function request(body: unknown = { organizationId: ORGANIZATION_ID, roomId: ROOM_ID }) {
  return new Request("http://localhost/api/canvas-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function seedRoom({
  userId,
  isAdmin = false,
  access,
}: {
  userId: string;
  isAdmin?: boolean;
  access?: "view" | "edit";
}) {
  mocks.getDiscoveryRoomPageData.mockResolvedValue({
    room: {
      id: ROOM_ID,
      organizationId: ORGANIZATION_ID,
      name: "Canvas trial",
      ownerId: OWNER_ID,
      createdAt: "2026-08-10T10:00:00.000Z",
    },
    currentUser: {
      id: userId,
      email: `${userId}@example.com`,
      name: "Room Member",
    },
    participants: access
      ? [
          {
            roomId: ROOM_ID,
            userId,
            access,
            email: `${userId}@example.com`,
          },
        ]
      : [],
    messages: [],
    hasPrd: false,
    isCurrentUserOrgAdmin: isAdmin,
    realtimeMode: "development-poll",
  });
}

describe("POST /api/canvas-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MELD_USER_FLOW_TRIAL_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", SECRET);
    vi.stubEnv("MELD_CANVAS_WS_URL", GATEWAY_URL);
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: OWNER_ID } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
    });
    mocks.mintCanvasSessionTicket.mockReturnValue("signed-ticket");
  });

  it.each([
    ["missing session", null, 401],
    ["unknown room", { sub: OWNER_ID }, 404],
  ])("rejects %s", async (_case, claims, status) => {
    mocks.getClaims.mockResolvedValue({
      data: { claims },
      error: claims ? null : new Error("missing"),
    });
    if (status === 404) {
      mocks.getDiscoveryRoomPageData.mockResolvedValue(null);
    }

    const response = await POST(request());

    expect(response.status).toBe(status);
    expect(mocks.mintCanvasSessionTicket).not.toHaveBeenCalled();
  });

  it.each([
    ["owner", OWNER_ID, false, undefined, "edit"],
    ["organization admin", ADMIN_ID, true, undefined, "edit"],
    ["editor", EDITOR_ID, false, "edit", "edit"],
    ["viewer", VIEWER_ID, false, "view", "view"],
  ] as const)(
    "issues trusted %s access",
    async (_case, userId, isAdmin, participantAccess, access) => {
      seedRoom({
        userId,
        isAdmin,
        access: participantAccess,
      });

      const response = await POST(request());

      expect(response.status).toBe(201);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        ticket: "signed-ticket",
        gatewayUrl: GATEWAY_URL,
        access,
        expiresAt: expect.any(Number),
      });
      expect(mocks.mintCanvasSessionTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          roomId: ROOM_ID,
          userId,
          access,
        }),
        SECRET,
        expect.any(Date),
      );
    },
  );

  it("rejects a strict schema violation", async () => {
    const response = await POST(
      request({
        organizationId: ORGANIZATION_ID,
        roomId: ROOM_ID,
        access: "edit",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.getDiscoveryRoomPageData).not.toHaveBeenCalled();
    expect(mocks.mintCanvasSessionTicket).not.toHaveBeenCalled();
  });

  it("rejects malformed UUIDs", async () => {
    const response = await POST(
      request({ organizationId: "not-a-uuid", roomId: ROOM_ID }),
    );

    expect(response.status).toBe(400);
    expect(mocks.getDiscoveryRoomPageData).not.toHaveBeenCalled();
  });

  it("rejects a room member without a participant record", async () => {
    seedRoom({ userId: OUTSIDER_ID });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.mintCanvasSessionTicket).not.toHaveBeenCalled();
  });

  it("fails closed when the trial or its configuration is absent", async () => {
    vi.stubEnv("MELD_USER_FLOW_TRIAL_ENABLED", "false");
    expect((await POST(request())).status).toBe(404);

    vi.stubEnv("MELD_USER_FLOW_TRIAL_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request())).status).toBe(404);

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", "");
    seedRoom({ userId: OWNER_ID });
    expect((await POST(request())).status).toBe(503);

    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", SECRET);
    vi.stubEnv("MELD_CANVAS_WS_URL", "");
    expect((await POST(request())).status).toBe(503);
  });
});
