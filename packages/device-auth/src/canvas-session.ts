import { Buffer } from "node:buffer";
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const TLDRAW_TRIAL_VERSION = "5.3.0" as const;

const CANVAS_SESSION_VERSION = 1 as const;
const CANVAS_SESSION_LIFETIME_SECONDS = 60;
const MAX_CANVAS_SESSION_TICKET_BYTES = 8_192;
const SHA256_BYTES = 32;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

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

type CanvasSessionInput = Omit<
  CanvasSessionClaims,
  "version" | "clientVersion" | "expiresAt" | "nonce"
>;

function invalidTicket(): Error {
  return new Error("Invalid canvas session ticket");
}

function assertSecret(secret: string): void {
  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < SHA256_BYTES
  ) {
    throw new Error("Canvas session secret must be at least 32 bytes");
  }
}

function assertDate(now: Date): number {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error("Canvas session clock must be a valid date");
  }

  return Math.floor(timestamp / 1000);
}

function assertInput(input: CanvasSessionInput): void {
  if (
    !input ||
    !UUID_PATTERN.test(input.organizationId) ||
    !UUID_PATTERN.test(input.roomId) ||
    !UUID_PATTERN.test(input.userId)
  ) {
    throw new Error("Invalid canvas session identity");
  }

  if (
    typeof input.userName !== "string" ||
    input.userName.length < 1 ||
    Array.from(input.userName).length > 200
  ) {
    throw new Error("Invalid canvas session user name");
  }

  if (input.access !== "view" && input.access !== "edit") {
    throw new Error("Invalid canvas session access");
  }
}

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(encodedPayload, "ascii")
    .digest();
}

function encodePayload(payload: CanvasSessionClaims): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeClaims(payload: unknown): CanvasSessionClaims | null {
  if (!isRecord(payload)) {
    return null;
  }

  const { organizationId, roomId, userId, userName, access } = payload;
  const { version, clientVersion, expiresAt, nonce } = payload;
  if (
    version !== CANVAS_SESSION_VERSION ||
    clientVersion !== TLDRAW_TRIAL_VERSION ||
    typeof organizationId !== "string" ||
    !UUID_PATTERN.test(organizationId) ||
    typeof roomId !== "string" ||
    !UUID_PATTERN.test(roomId) ||
    typeof userId !== "string" ||
    !UUID_PATTERN.test(userId) ||
    typeof userName !== "string" ||
    userName.length < 1 ||
    Array.from(userName).length > 200 ||
    (access !== "view" && access !== "edit") ||
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    typeof nonce !== "string" ||
    !/^([A-Za-z0-9_-]{22})$/.test(nonce)
  ) {
    return null;
  }

  return {
    version: CANVAS_SESSION_VERSION,
    organizationId,
    roomId,
    userId,
    userName,
    access,
    clientVersion: TLDRAW_TRIAL_VERSION,
    expiresAt,
    nonce,
  };
}

export function mintCanvasSessionTicket(
  input: CanvasSessionInput,
  secret: string,
  now = new Date(),
): string {
  assertSecret(secret);
  assertInput(input);

  const expiresAt = assertDate(now) + CANVAS_SESSION_LIFETIME_SECONDS;
  const payload: CanvasSessionClaims = {
    version: CANVAS_SESSION_VERSION,
    ...input,
    clientVersion: TLDRAW_TRIAL_VERSION,
    expiresAt,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = encodePayload(payload);
  const encodedSignature = sign(encodedPayload, secret).toString("base64url");

  return `${encodedPayload}.${encodedSignature}`;
}

export function verifyCanvasSessionTicket(
  ticket: string,
  secret: string,
  expectedRoomId: string,
  now = new Date(),
): CanvasSessionClaims {
  assertSecret(secret);
  if (
    typeof ticket !== "string" ||
    Buffer.byteLength(ticket, "utf8") > MAX_CANVAS_SESSION_TICKET_BYTES
  ) {
    throw invalidTicket();
  }

  const nowInSeconds = assertDate(now);

  const parts = ticket.split(".");
  if (parts.length !== 2) {
    throw invalidTicket();
  }

  const [encodedPayload, encodedSignature] = parts as [string, string];
  const expectedSignature = sign(encodedPayload, secret);
  const presentedSignature = BASE64URL_PATTERN.test(encodedSignature)
    ? Buffer.from(encodedSignature, "base64url")
    : Buffer.alloc(0);
  const normalizedPresentedSignature =
    presentedSignature.length === SHA256_BYTES
      ? presentedSignature
      : Buffer.alloc(SHA256_BYTES);
  const signatureMatches = timingSafeEqual(
    expectedSignature,
    normalizedPresentedSignature,
  );
  if (!signatureMatches || presentedSignature.length !== SHA256_BYTES) {
    throw invalidTicket();
  }

  let decodedPayload: unknown;
  try {
    decodedPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    throw invalidTicket();
  }

  const claims = decodeClaims(decodedPayload);
  if (!claims || claims.roomId !== expectedRoomId) {
    throw invalidTicket();
  }
  if (claims.expiresAt <= nowInSeconds) {
    throw new Error("Expired canvas session ticket");
  }

  return claims;
}
