import { randomBytes } from "node:crypto";
import { hashToken } from "./tokens";

// The shelf's upload-only credential. The prefix makes a leaked token easy to
// recognise in a log or a paste and keeps it visually distinct from device
// credentials (`<uuid>.<secret>`), which this parser deliberately rejects.
export const CAPTURE_TOKEN_PREFIX = "orion_cap_";
const TOKEN_PATTERN = /^orion_cap_[A-Za-z0-9_-]{43}$/;
const SECRET_BYTES = 32;

export function mintCaptureToken(): { token: string; tokenHash: string } {
  const token = `${CAPTURE_TOKEN_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
  return { token, tokenHash: hashToken(token) };
}

export function parseCaptureAuthorization(header: string | null | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  return TOKEN_PATTERN.test(token) ? token : null;
}
