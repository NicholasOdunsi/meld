import { describe, expect, it, vi } from "vitest";
import {
  CanvasSessionError,
  CanvasSessionResponseSchema,
  getCanvasGatewayUri,
  requestCanvasSession,
} from "./canvas-session";

describe("CanvasSessionResponseSchema", () => {
  it("rejects response fields that were not signed by the server", () => {
    expect(
      CanvasSessionResponseSchema.safeParse({
        ticket: "signed",
        gatewayUrl: "ws://127.0.0.1:8787",
        access: "view",
        expiresAt: 100,
        roomId: "client-supplied",
      }).success,
    ).toBe(false);
  });
});

describe("requestCanvasSession", () => {
  it.each([401, 403, 404, 503])("maps HTTP %s to a typed error", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));

    await expect(
      requestCanvasSession({ organizationId: "org", roomId: "room" }),
    ).rejects.toMatchObject({
      status,
      name: "CanvasSessionError",
    } satisfies Partial<CanvasSessionError>);
  });

  it("posts the room identity and returns the strict response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ticket: "signed",
        gatewayUrl: "ws://127.0.0.1:8787/",
        access: "edit",
        expiresAt: 100,
      }), { status: 201, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestCanvasSession({ organizationId: "org", roomId: "room" }),
    ).resolves.toMatchObject({ access: "edit" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/canvas-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ organizationId: "org", roomId: "room" }),
      }),
    );
  });

  it("requires the API's 201 session response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ticket: "signed",
      gatewayUrl: "ws://127.0.0.1:8787",
      access: "edit",
      expiresAt: 100,
    })));
    await expect(
      requestCanvasSession({ organizationId: "org", roomId: "room" }),
    ).rejects.toMatchObject({ status: 200 });
  });
});

it("builds a gateway room URI without exposing the room in the ticket", () => {
  expect(
    getCanvasGatewayUri("ws://gateway.example/", "room/id", "ticket value"),
  ).toBe("ws://gateway.example/canvas/room%2Fid?ticket=ticket%20value");
});
