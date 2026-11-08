import { mintCanvasSessionTicket } from "@meld/device-auth";
import { describe, expect, it, vi } from "vitest";
import { route, type RouterDeps } from "./router";

const SECRET = "s".repeat(40);
const ROOM = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

function deps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return {
    authenticate: vi.fn(async (header) =>
      header === "Bearer good" ? { id: "device-1", userId: "user-1" } : null),
    canvasSecret: SECRET,
    forwardToHub: vi.fn(async () => new Response("hub")),
    forwardToCanvas: vi.fn(async () => new Response("canvas")),
    ...overrides,
  };
}

const upgrade = { Upgrade: "websocket" };

describe("route", () => {
  it("answers /health", async () => {
    const res = await route(new Request("https://g/health"), deps());
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("rejects /ws without a valid device token", async () => {
    const d = deps();
    const res = await route(new Request("https://g/ws", { headers: { ...upgrade, Authorization: "Bearer bad" } }), d);
    expect(res.status).toBe(401);
    expect(d.forwardToHub).not.toHaveBeenCalled();
  });

  it("requires a websocket upgrade on /ws", async () => {
    const res = await route(new Request("https://g/ws", { headers: { Authorization: "Bearer good" } }), deps());
    expect(res.status).toBe(426);
  });

  it("forwards an authenticated device to the hub", async () => {
    const d = deps();
    const res = await route(new Request("https://g/ws", { headers: { ...upgrade, Authorization: "Bearer good" } }), d);
    expect(await res.text()).toBe("hub");
    expect(d.forwardToHub).toHaveBeenCalledWith(expect.any(Request), { id: "device-1", userId: "user-1" });
  });

  it("rejects a canvas connection with a bad ticket", async () => {
    const res = await route(new Request(`https://g/canvas/${ROOM}?ticket=nope&sessionId=s1`, { headers: upgrade }), deps());
    expect(res.status).toBe(401);
  });

  it("rejects a canvas connection with a missing or oversized sessionId", async () => {
    const ticket = mintCanvasSessionTicket(
      { workspaceId: WORKSPACE, roomId: ROOM, userId: USER, userName: "N", access: "edit" },
      SECRET,
    );
    const base = `https://g/canvas/${ROOM}?ticket=${encodeURIComponent(ticket)}`;
    expect((await route(new Request(base, { headers: upgrade }), deps())).status).toBe(401);
    expect((await route(new Request(`${base}&sessionId=${"x".repeat(201)}`, { headers: upgrade }), deps())).status).toBe(401);
  });

  it("forwards a valid canvas connection with its claims", async () => {
    const ticket = mintCanvasSessionTicket(
      { workspaceId: WORKSPACE, roomId: ROOM, userId: USER, userName: "N", access: "view" },
      SECRET,
    );
    const d = deps();
    const res = await route(
      new Request(`https://g/canvas/${ROOM}?ticket=${encodeURIComponent(ticket)}&sessionId=s1`, { headers: upgrade }), d);
    expect(await res.text()).toBe("canvas");
    expect(d.forwardToCanvas).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ sessionId: "s1", claims: expect.objectContaining({ roomId: ROOM, access: "view" }) }),
    );
  });

  it("404s anything else", async () => {
    expect((await route(new Request("https://g/nope"), deps())).status).toBe(404);
  });
});
