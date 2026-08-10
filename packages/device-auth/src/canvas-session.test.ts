import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CANVAS_SESSION_LIFETIME_SECONDS,
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

function signPayload(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret)
    .update(encodedPayload, "ascii")
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function readPayload(ticket: string): Record<string, unknown> {
  const [encodedPayload] = ticket.split(".");
  return JSON.parse(
    Buffer.from(encodedPayload!, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

describe("canvas session tickets", () => {
  it("round-trips trusted claims with a sixty-second lifetime", () => {
    const ticket = mintCanvasSessionTicket(INPUT, SECRET, NOW);

    expect(
      verifyCanvasSessionTicket(ticket, SECRET, INPUT.roomId, NOW),
    ).toMatchObject({
      ...INPUT,
      version: 1,
      clientVersion: TLDRAW_TRIAL_VERSION,
      expiresAt: 1_786_356_000 + CANVAS_SESSION_LIFETIME_SECONDS,
    });
  });

  it("rejects tampering, another room, expiry, and another SDK version", () => {
    const ticket = mintCanvasSessionTicket(INPUT, SECRET, NOW);

    expect(() =>
      verifyCanvasSessionTicket(`${ticket}x`, SECRET, INPUT.roomId, NOW),
    ).toThrow("Invalid canvas session ticket");
    const [encodedPayload, encodedSignature] = ticket.split(".");
    expect(() =>
      verifyCanvasSessionTicket(
        `${encodedPayload}.${encodedSignature}*`,
        SECRET,
        INPUT.roomId,
        NOW,
      ),
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

    const claims = readPayload(ticket);
    expect(() =>
      verifyCanvasSessionTicket(
        signPayload({ ...claims, clientVersion: "5.3.1" }, SECRET),
        SECRET,
        INPUT.roomId,
        NOW,
      ),
    ).toThrow("Invalid canvas session ticket");
    expect(() =>
      verifyCanvasSessionTicket(
        signPayload({ ...claims, version: 2 }, SECRET),
        SECRET,
        INPUT.roomId,
        NOW,
      ),
    ).toThrow("Invalid canvas session ticket");
    expect(() =>
      verifyCanvasSessionTicket(
        signPayload({ ...claims, access: "admin" }, SECRET),
        SECRET,
        INPUT.roomId,
        NOW,
      ),
    ).toThrow("Invalid canvas session ticket");
  });

  it("requires a secret of at least thirty-two UTF-8 bytes", () => {
    expect(() => mintCanvasSessionTicket(INPUT, "short", NOW)).toThrow(
      "Canvas session secret must be at least 32 bytes",
    );
  });

  it("rejects tickets larger than eight kilobytes", () => {
    expect(() =>
      verifyCanvasSessionTicket("a".repeat(8_193), SECRET, INPUT.roomId, NOW),
    ).toThrow("Invalid canvas session ticket");
  });
});
